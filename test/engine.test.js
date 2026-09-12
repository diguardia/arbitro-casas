import { test, expect } from '@jest/globals';
import { createGame, destination, generateHouses, validateMove, playTurn, beginTurn, botState } from '../engine.js';
const config = { A: { type: 'human' }, B: { type: 'human' } };
const make = () => createGame(config, () => 0);
test('cinco casas únicas, sin ocupar esquinas y con distancia total equilibrada', () => {
  const dist = (p, origin) => p.reduce((n, v) => n + Math.min(Math.abs(v - origin), 10 - Math.abs(v - origin)), 0);
  for (let i = 0; i < 500; i++) {
    const houses = generateHouses();
    expect(new Set(houses.map(String)).size).toBe(5);
    expect(houses.every(p => String(p) !== '0,0' && String(p) !== '9,9')).toBeTruthy();
    expect(houses.reduce((n, p) => n + dist(p, 0), 0)).toBe(houses.reduce((n, p) => n + dist(p, 9), 0));
  }
});
test('movimiento toroidal en las cuatro direcciones', () => {
  expect(destination([0, 0], 'N', 3)).toEqual([7, 0]);
  expect(destination([0, 0], 'O', 2)).toEqual([0, 8]);
  expect(destination([9, 9], 'S', 2)).toEqual([1, 9]);
  expect(destination([9, 9], 'E', 3)).toEqual([9, 2]);
});
test('valida todas las fichas, colisiones y permutas simultáneas', () => {
  const g = make(); g.pieces = { A1: [0, 0], A2: [0, 1], B1: [1, 0] };
  expect(validateMove(g, { A1: 'E', A2: 'O' })).toBe(null);
  expect(validateMove(g, { A1: 'S', A2: 'E' })).toBeTruthy();
  expect(validateMove(g, { A1: 'E' })).toBeTruthy();
  expect(validateMove(g, { A1: 'X', A2: 'E' })).toBeTruthy();
  g.pieces.A2 = [0, 2]; expect(validateMove(g, { A1: 'E', A2: 'O' })).toBeTruthy();
});
test('atravesar fichas y casas está permitido; solo el destino conquista', () => {
  const g = make(); g.die = 3; g.pieces.B1 = [0, 1]; g.houses = [[0, 2], [0, 3]];
  playTurn(g, { A1: 'E' }, null, () => 0);
  expect(g.scores.A).toBe(1); expect(g.houses).toEqual([[0, 2]]);
  expect(Object.keys(g.pieces).length).toBe(2); expect(g.pending.A).toEqual([[0, 3]]);
  playTurn(g, { B1: 'S' }, null, () => 0);
  expect(g.pieces.A2).toEqual([9, 3]); expect(g.current).toBe('A');
});
test('spawn determinista evita fichas y casas neutrales', () => {
  const g = make(); g.pending.A = [[0, 0]]; g.houses = [[9, 0]];
  beginTurn(g, () => 0); expect(g.pieces.A2).toEqual([0, 1]);
});
test('fallos son atómicos, consecutivos por jugador y producen derrota técnica', () => {
  const g = make(); const initial = structuredClone(g.pieces);
  playTurn(g, {}); expect(g.pieces).toEqual(initial); expect(g.failures.A).toBe(1);
  playTurn(g, { B1: 'N' }); playTurn(g, { A1: 'E' }); expect(g.failures.A).toBe(0);
  for (let i = 0; i < 3; i++) { playTurn(g, { B1: 'N' }); playTurn(g, {}); }
  expect(g.result.winner).toBe('B'); expect(g.result.reason).toMatch(/técnica/);
});
test('termina con última casa y no inicia turnos adicionales', () => {
  const g = make(); g.houses = [[0, 1]];
  playTurn(g, { A1: 'E' }); expect(g.result.winner).toBe('A'); expect(g.completed).toBe(1);
  expect(() => playTurn(g, {})).toThrow();
});
test('50 turnos totales y empate', () => {
  const g = make(); g.completed = 49; g.houses = [[4, 4]];
  playTurn(g, { A1: 'E' }); expect(g.result.winner).toBe(null); expect(g.result.reason).toMatch(/50/);
});
test('contrato exacto del bot', () => {
  const g = make(), state = botState(g);
  expect(Object.keys(state).sort()).toEqual(['dado', 'jugador', 'tablero']);
  expect(state.tablero.length).toBe(10); expect(state.tablero[0][0]).toBe('A1');
  expect(state.tablero.flat().filter(c => c === 'N').length).toBe(5);
});
