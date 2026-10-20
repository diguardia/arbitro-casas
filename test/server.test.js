import { test, expect, afterEach } from '@jest/globals';
import http from 'node:http';
import { createServer } from '../server.js';
const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});
test('HTTP: creación, bots, turnos duplicados y derrota técnica', async () => {
  let received, postCount = 0;
  const bot = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify({ name: 'Bot de prueba', colors: ['#112233', '#445566', '#778899'] }));
    let text = ''; for await (const chunk of req) text += chunk; received = JSON.parse(text);
    res.end(JSON.stringify(postCount++ === 0 ? { A1: 'N' } : {}));
  });
  const app = createServer();
  servers.push(bot, app);
  await new Promise(resolve => bot.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const config = { A: { type: 'bot', url: `http://127.0.0.1:${bot.address().port}` }, B: { type: 'human' } };
  const response = await post('/api/games', config); expect(response.status).toBe(201);
  const { id, game: created } = await response.json();
  expect(created.config.A.profile).toEqual({ name: 'Bot de prueba', colors: ['#112233', '#445566', '#778899'] });
  expect(created.config.A.health.status).toBe('ok');
  for (let turn = 0; turn < 5; turn++) {
    const res = await post(`/api/games/${id}/turn`, { turn, moves: { B1: 'N' } });
    expect(res.status).toBe(200);
    const { game } = await res.json(); if (turn === 4) expect(game.result.winner).toBe('B');
  }
  expect(received.jugador).toBe('A'); expect(received.tablero.length).toBe(10);
  expect((await post(`/api/games/${id}/turn`, { turn: 0 })).status).toBe(409);
  expect((await fetch(base)).status).toBe(200);
  expect((await post('/api/games', { A: { type: 'bot', url: 'file:///tmp/a' }, B: { type: 'human' } })).status).toBe(400);
});

test('HTTP: bloquea el inicio y explica bots caídos o con protocolo inválido', async () => {
  const broken = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(req.method === 'GET' ? '{}' : '{mal json'); });
  const app = createServer(); servers.push(broken, app);
  await new Promise(resolve => broken.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${app.address().port}/api/games`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ A: { type: 'bot', url: `http://127.0.0.1:${broken.address().port}/move` }, B: { type: 'human' } }) });
  expect(response.status).toBe(422);
  const result = await response.json();
  expect(result.diagnostics[0]).toMatchObject({ player: 'A', status: 'error', code: 'invalid_json' });
  expect(result.diagnostics[0].title).toMatch(/JSON inválido/);
});
