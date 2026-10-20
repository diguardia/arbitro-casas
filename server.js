import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGame, playTurn, botState, validateMove } from './engine.js';

const games = new Map();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 16384) throw new Error('Solicitud demasiado grande.'); }
  return JSON.parse(data || '{}');
}
const defaultProfiles = {
  A: { name: 'Bot A', colors: ['#244d3e', '#b7cf9c', '#f6f7f2'] },
  B: { name: 'Bot B', colors: ['#e5a768', '#f2cf49', '#493721'] },
};
function validProfile(value, player) {
  const rawName = typeof value?.name === 'string' ? value.name.trim().replace(/[&<>"']/g, '') : '';
  const name = rawName ? rawName.slice(0, 40) : defaultProfiles[player].name;
  const colors = Array.isArray(value?.colors) && value.colors.length === 3 && value.colors.every(color => /^#[0-9a-f]{6}$/i.test(color)) ? value.colors : defaultProfiles[player].colors;
  return { name, colors };
}
async function askBotProfile(moveUrl, player) {
  try {
    const url = new URL(moveUrl); url.pathname = url.pathname.replace(/\/move\/?$/, '/profile');
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (!response.ok) throw new Error();
    return validProfile(await response.json(), player);
  } catch { return defaultProfiles[player]; }
}
function botFailure(error) {
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return { code: 'timeout', title: 'El bot no respondió a tiempo', detail: 'Superó el límite de 5 segundos.' };
  if (error.code === 'http') return { code: 'http', title: `El bot respondió HTTP ${error.status}`, detail: 'El endpoint /move existe, pero rechazó la solicitud.' };
  if (error.code === 'invalid_json') return { code: 'invalid_json', title: 'El bot devolvió JSON inválido', detail: error.message };
  if (error.code === 'invalid_move') return { code: 'invalid_move', title: 'La respuesta no cumple el protocolo', detail: error.message };
  if (error.code === 'too_large') return { code: 'too_large', title: 'La respuesta del bot es demasiado grande', detail: 'El máximo permitido es 16 KB.' };
  return { code: 'connection', title: 'No se pudo conectar con el bot', detail: error.cause?.code || error.message || 'Revisá que esté levantado y que la URL sea pública.' };
}
async function callBot(game, player) {
  const started = Date.now();
  try {
    const state = botState({ ...game, current: player });
    const response = await fetch(game.config[player].url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state), signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) { const error = new Error(); error.code = 'http'; error.status = response.status; throw error; }
    let content = '';
    for await (const chunk of response.body) { content += Buffer.from(chunk).toString(); if (content.length > 16384) { const error = new Error(); error.code = 'too_large'; throw error; } }
    let moves;
    try { moves = JSON.parse(content); } catch { const error = new Error('La respuesta debe ser un objeto JSON.'); error.code = 'invalid_json'; throw error; }
    const invalid = validateMove({ ...game, current: player }, moves);
    if (invalid) { const error = new Error(invalid); error.code = 'invalid_move'; throw error; }
    return { moves, health: { status: 'ok', latency: Date.now() - started, checkedAt: new Date().toISOString() } };
  } catch (error) { return { error: botFailure(error), health: { status: 'error', ...botFailure(error), checkedAt: new Date().toISOString() } }; }
}
export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'POST' && path === '/api/games') {
        const config = await body(req);
        for (const p of ['A', 'B']) {
          if (!['human', 'bot'].includes(config[p]?.type)) throw new Error('Tipo de jugador inválido.');
          if (config[p].type === 'bot') {
            const url = new URL(config[p].url);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Usá una URL HTTP o HTTPS sin credenciales.');
            if (url.pathname === '/') url.pathname = '/move';
            config[p].url = url.href;
          } else {
            config[p].profile = { name: `Humano ${p}`, colors: defaultProfiles[p].colors };
            config[p].health = { status: 'ok', title: 'Jugador local' };
          }
        }
        await Promise.all(['A', 'B'].filter(p => config[p].type === 'bot').map(async p => { config[p].profile = await askBotProfile(config[p].url, p); }));
        const id = crypto.randomUUID(), game = createGame(config);
        const bots = ['A', 'B'].filter(p => config[p].type === 'bot');
        const checks = await Promise.all(bots.map(p => callBot(game, p)));
        const diagnostics = checks.map((check, index) => ({ player: bots[index], name: config[bots[index]].profile.name, url: config[bots[index]].url, ...check.health }));
        diagnostics.forEach(item => { config[item.player].health = item; });
        const failed = diagnostics.filter(item => item.status === 'error');
        if (failed.length) return json(res, 422, { error: 'No se puede iniciar: uno o más bots no están listos.', diagnostics: failed });
        games.set(id, { game, busy: false, touched: Date.now() });
        for (const [key, item] of games) if (Date.now() - item.touched > 86400000) games.delete(key);
        return json(res, 201, { id, game });
      }
      const match = path.match(/^\/api\/games\/([\w-]+)(\/turn)?$/);
      if (match) {
        const item = games.get(match[1]);
        if (!item) return json(res, 404, { error: 'Partida no encontrada. Iniciá una nueva partida.' });
        item.touched = Date.now();
        if (req.method === 'GET' && !match[2]) return json(res, 200, { game: item.game });
        if (req.method === 'POST' && match[2]) {
          if (item.busy) return json(res, 409, { error: 'Ya se está procesando este turno.' });
          item.busy = true;
          try {
            const input = await body(req), game = item.game;
            if (game.result || input.turn !== game.completed) return json(res, 409, { error: 'El turno ya cambió.', game });
            let moves = input.moves, error = null, incident = null;
            if (game.config[game.current].type === 'bot') {
              const botResult = await callBot(game, game.current);
              game.config[game.current].health = botResult.health;
              if (botResult.error) { incident = { player: game.current, ...botResult.error }; error = `${incident.title}: ${incident.detail}`; }
              else moves = botResult.moves;
            }
            playTurn(game, moves, error);
            return json(res, 200, { game, incident });
          } finally { item.busy = false; }
        }
      }
      const files = { '/': 'public/index.html', '/style.css': 'public/style.css', '/app.js': 'public/app.js', '/feedback.js': 'public/feedback.js', '/engine.js': 'engine.js' };
      if (req.method === 'GET' && files[path]) {
        const file = files[path], ext = file.slice(file.lastIndexOf('.'));
        res.writeHead(200, { 'Content-Type': `${types[ext]}; charset=utf-8` });
        return res.end(await readFile(new URL(file, import.meta.url)));
      }
      json(res, 404, { error: 'Ruta no encontrada.' });
    } catch (err) { json(res, 400, { error: err.message }); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3150;
  createServer().listen(port, '127.0.0.1', () => console.log(`Árbitro de casas: http://localhost:${port}`));
}
