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
  let received;
  const bot = http.createServer(async (req, res) => { let text = ''; for await (const chunk of req) text += chunk; received = JSON.parse(text); res.setHeader('Content-Type', 'application/json'); res.end('{}'); });
  const app = createServer();
  servers.push(bot, app);
  await new Promise(resolve => bot.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const config = { A: { type: 'bot', url: `http://127.0.0.1:${bot.address().port}` }, B: { type: 'human' } };
  const response = await post('/api/games', config); expect(response.status).toBe(201);
  const { id } = await response.json();
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
