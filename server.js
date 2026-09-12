import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGame, playTurn, botState } from './engine.js';

const games = new Map();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 16384) throw new Error('Solicitud demasiado grande.'); }
  return JSON.parse(data || '{}');
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
          }
        }
        const id = crypto.randomUUID(), game = createGame(config);
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
            let moves = input.moves, error = null;
            if (game.config[game.current].type === 'bot') {
              try {
                const response = await fetch(game.config[game.current].url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(botState(game)), signal: AbortSignal.timeout(5000), redirect: 'error' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                let content = '';
                for await (const chunk of response.body) { content += Buffer.from(chunk).toString(); if (content.length > 16384) throw new Error('Respuesta demasiado grande'); }
                moves = JSON.parse(content);
              } catch (err) { error = `El bot no entregó una jugada válida (${err.name === 'TimeoutError' || err.name === 'AbortError' ? 'tiempo límite de 5 segundos' : err.message}).`; }
            }
            playTurn(game, moves, error);
            return json(res, 200, { game });
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
