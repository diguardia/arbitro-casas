export const DIRECTIONS = { N: [-1, 0], S: [1, 0], E: [0, 1], O: [0, -1] };
const key = ([r, c]) => `${r},${c}`;
const other = p => p === 'A' ? 'B' : 'A';
export function destination(position, direction, die) {
  return position.map((v, i) => (v + DIRECTIONS[direction][i] * die + 10) % 10);
}
function distance(a, b) {
  return a.reduce((n, v, i) => n + Math.min(Math.abs(v - b[i]), 10 - Math.abs(v - b[i])), 0);
}
export function generateHouses(random = Math.random) {
  // Two rotationally symmetric pairs and an equidistant fifth house.
  const houses = [], occupied = new Set(['0,0', '9,9']);
  const candidates = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    if (!occupied.has(key([r, c]))) candidates.push([r, c]);
  }
  while (houses.length < 4) {
    const available = candidates.filter(p => !occupied.has(key(p)) && !occupied.has(key(p.map(v => 9 - v))));
    const p = available[Math.floor(random() * available.length)];
    const q = p.map(v => 9 - v);
    houses.push(p, q); occupied.add(key(p)); occupied.add(key(q));
  }
  const balanced = candidates.filter(p => !occupied.has(key(p)) && distance(p, [0, 0]) === distance(p, [9, 9]));
  houses.push(balanced[Math.floor(random() * balanced.length)]);
  return houses;
}
export function createGame(config, random = Math.random) {
  const game = { config, pieces: { A1: [0, 0], B1: [9, 9] }, houses: generateHouses(random),
    scores: { A: 0, B: 0 }, failures: { A: 0, B: 0 }, pending: { A: [], B: [] },
    nextId: { A: 2, B: 2 }, current: 'A', completed: 0, die: 1, result: null, log: [] };
  beginTurn(game, random);
  return game;
}
function spawn(game, origin) {
  const occupied = new Set([...Object.values(game.pieces), ...game.houses].map(key));
  const queue = [origin], seen = new Set();
  // Breadth-first search: origin, then N, E, S, O, wrapping at edges.
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (seen.has(key(p))) continue;
    seen.add(key(p));
    if (!occupied.has(key(p))) return p;
    for (const d of ['N', 'E', 'S', 'O']) queue.push(destination(p, d, 1));
  }
  throw new Error('No hay casillas libres.');
}
export function beginTurn(game, random = Math.random) {
  const p = game.current;
  for (const origin of game.pending[p]) {
    const id = `${p}${game.nextId[p]++}`;
    game.pieces[id] = spawn(game, origin);
    game.log.push({ text: `Se incorpora ${id}.`, type: 'spawn' });
  }
  game.pending[p] = [];
  game.die = 1 + Math.floor(random() * 3);
}
export function botState(game) {
  const tablero = Array.from({ length: 10 }, () => Array(10).fill(''));
  for (const [r, c] of game.houses) tablero[r][c] = 'N';
  for (const [id, [r, c]] of Object.entries(game.pieces)) tablero[r][c] = id;
  return { jugador: game.current, dado: game.die, tablero };
}
export function validateMove(game, moves) {
  if (!moves || typeof moves !== 'object' || Array.isArray(moves)) return 'La jugada debe ser un diccionario de fichas y direcciones.';
  const ids = Object.keys(game.pieces).filter(id => id.startsWith(game.current));
  if (Object.keys(moves).length !== ids.length || ids.some(id => !Object.hasOwn(moves, id))) return 'Debés indicar un movimiento para cada ficha propia y ninguna otra.';
  if (ids.some(id => !Object.hasOwn(DIRECTIONS, moves[id]))) return 'Las direcciones permitidas son N, S, E y O.';
  const final = Object.entries(game.pieces).map(([id, p]) => id.startsWith(game.current) ? destination(p, moves[id], game.die) : p);
  if (new Set(final.map(key)).size !== final.length) return 'Dos fichas terminarían en la misma casilla. Cambiá las direcciones.';
  return null;
}
export function playTurn(game, moves, error = null, random = Math.random) {
  if (game.result) throw new Error('La partida ya terminó.');
  const p = game.current, turn = game.completed + 1;
  const invalid = error || validateMove(game, moves);
  if (invalid) {
    game.failures[p]++;
    game.log.push({ text: `Turno ${turn} · ${p}: ${invalid} Fallos: ${game.failures[p]}/3.`, type: 'error' });
  } else {
    game.failures[p] = 0;
    for (const [id, direction] of Object.entries(moves)) game.pieces[id] = destination(game.pieces[id], direction, game.die);
    let captured = 0;
    game.houses = game.houses.filter(h => {
      if (Object.entries(game.pieces).some(([id, pos]) => id.startsWith(p) && key(pos) === key(h))) {
        game.scores[p]++; captured++; game.pending[p].push(h); return false;
      }
      return true;
    });
    game.log.push({ text: `Turno ${turn} · ${p} · dado ${game.die}: ${Object.entries(moves).map(([id, d]) => `${id} ${d}`).join(', ')}${captured ? ` · ${captured} casa(s) conquistada(s)` : ''}.`, type: captured ? 'capture' : 'move' });
  }
  game.completed++;
  if (game.failures[p] >= 3) game.result = { winner: other(p), reason: 'Derrota técnica: tres fallos consecutivos.' };
  else if (!game.houses.length || game.completed >= 50) game.result = {
    winner: game.scores.A === game.scores.B ? null : game.scores.A > game.scores.B ? 'A' : 'B',
    reason: !game.houses.length ? 'Todas las casas fueron conquistadas.' : 'Se completaron los 50 turnos.'
  };
  if (!game.result) { game.current = other(p); beginTurn(game, random); }
  return invalid;
}
