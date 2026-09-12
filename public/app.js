import { destination, validateMove } from '/engine.js';
import { createSound, wheelTarget } from '/feedback.js';
const $ = id => document.getElementById(id);
let game = null, gameId = null, selected = null, moves = {}, busy = false, paused = false, timer;
let rolling = false, wheelAngle = 0;
const sound = createSound();
function updateSoundButton() {
  $('sound-toggle').textContent = sound.enabled ? '♫ Sonido activado' : '♫ Sonido apagado';
  $('sound-toggle').setAttribute('aria-pressed', String(sound.enabled));
}
$('sound-toggle').onclick = () => { sound.toggle(); updateSoundButton(); sound.play('select'); };
updateSoundButton();
document.addEventListener('pointerdown', () => sound.unlock());
document.addEventListener('keydown', () => sound.unlock());
$('history-button').onclick = () => $('history-dialog').showModal();
$('close-history').onclick = () => $('history-dialog').close();

async function rollDie() {
  if (!game || game.result) return;
  rolling = true;
  render();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 0 : Number($('speed').value) === 50 && !isHuman() ? 450 : 1100;
  const target = wheelTarget(game.die, wheelAngle);
  const wheel = $('wheel');
  let ticks;
  try {
    if (duration && wheel.animate) {
      let count = 0;
      const tick = () => { sound.play('tick'); if (++count < 8) ticks = setTimeout(tick, 55 + count * 20); };
      tick();
      const animation = wheel.animate([{ transform: `rotate(${wheelAngle}deg)` }, { transform: `rotate(${target}deg)` }], { duration, easing: 'cubic-bezier(.12,.65,.16,1)', fill: 'forwards' });
      await animation.finished.catch(() => {});
      wheel.style.transform = `rotate(${target % 360}deg)`;
      animation.cancel();
    } else wheel.style.transform = `rotate(${target % 360}deg)`;
  } finally {
    clearTimeout(ticks);
    wheelAngle = target % 360;
    rolling = false;
    sound.play('land');
    render();
  }
}
const arrows = { N: '↑', E: '→', S: '↓', O: '←' };
const houseIcon = '<svg class="house" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 15 16 5l12 10M8 13v14h16V13M13 27v-9h6v9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
for (let i = 0; i < 10; i++) { document.querySelector('.columns').append(Object.assign(document.createElement('span'), { textContent: i })); document.querySelector('.rows').append(Object.assign(document.createElement('span'), { textContent: i })); }
for (const p of ['A', 'B']) $(`player-${p}`).onchange = () => { $(`url-wrap-${p}`).hidden = $(`player-${p}`).value !== 'bot'; $(`url-${p}`).required = $(`player-${p}`).value === 'bot'; };
$('rules-button').onclick = () => $('rules').showModal(); $('close-rules').onclick = () => $('rules').close();
function showError(message) { $('error').textContent = message || ''; $('error').hidden = !message; }
async function request(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}
function isHuman() { return game && !game.result && game.config[game.current].type === 'human'; }
function selectPiece(id) { if (!isHuman() || busy) return; selected = id; sound.play('select'); render(); }
function choose(direction) {
  if (!selected || !isHuman() || busy) return;
  moves[selected] = direction;
  sound.play('select');
  selected = Object.keys(game.pieces).find(id => id.startsWith(game.current) && !moves[id]) || selected;
  render();
}
function renderBoard() {
  const pieces = game?.pieces || { A1: [0, 0], B1: [9, 9] };
  const houses = game?.houses || [[2, 3], [7, 6], [3, 7], [6, 2], [4, 5]];
  $('board').replaceChildren();
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const cell = document.createElement('button'); cell.className = `cell ${(r + c) % 2 ? 'alternate' : ''}`;
    const piece = Object.keys(pieces).find(id => pieces[id][0] === r && pieces[id][1] === c);
    const house = houses.some(h => h[0] === r && h[1] === c);
    cell.setAttribute('aria-label', `Fila ${r}, columna ${c}${piece ? `, ficha ${piece}` : house ? ', casa neutral' : ', vacía'}`);
    if (piece) cell.innerHTML = `<span class="piece ${piece[0].toLowerCase()}">${piece}</span>`;
    else if (house) cell.innerHTML = houseIcon;
    if (piece === selected) cell.classList.add('selected');
    let targetDirection;
    if (selected && isHuman()) for (const dir of Object.keys(arrows)) {
      const pos = destination(pieces[selected], dir, game.die);
      if (pos[0] === r && pos[1] === c) { cell.classList.add('target'); targetDirection = dir; }
    }
    for (const [id, dir] of Object.entries(moves)) {
      const pos = destination(pieces[id], dir, game.die);
      if (pos[0] === r && pos[1] === c) { cell.classList.add('planned'); cell.dataset.plan = `${cell.dataset.plan || ''} ${id}${arrows[dir]}`; }
    }
    cell.onclick = () => { if (targetDirection) choose(targetDirection); else if (piece?.startsWith(game?.current)) selectPiece(piece); };
    $('board').append(cell);
  }
}
function render() {
  document.body.classList.toggle('playing', !!game);
  document.body.classList.toggle('finished', !!game?.result);
  $('roll-banner').classList.toggle('rolling', rolling);
  renderBoard();
  $('setup').hidden = !!game; $('game-panel').hidden = !game;
  $('result').hidden = !game?.result;
  if (!game) { $('phase').textContent = 'Listo para empezar'; $('turn-count').textContent = 'TURNO — / 50'; $('die').textContent = '—'; $('die-caption').textContent = 'Iniciá una partida para lanzar la rueda.'; $('roll-label').textContent = 'DADO DEL TURNO'; return; }
  $('phase').textContent = game.result ? 'Partida finalizada' : rolling ? 'Girando la rueda…' : busy ? 'Procesando turno…' : `Turno del jugador ${game.current}`;
  $('turn-count').textContent = `TURNO ${game.result ? game.completed : game.completed + 1} / 50`;
  $('remaining').textContent = `${game.houses.length} CASAS POR CONQUISTAR`;
  $('scores').innerHTML = ['A', 'B'].map(p => `<div class="score ${!game.result && game.current === p ? 'active' : ''}"><span class="score-title"><span class="player-marker ${p.toLowerCase()}">${p}</span>${game.config[p].type === 'bot' ? 'Bot' : 'Humano'}</span><strong>${game.scores[p]} <small>casas</small></strong><small>${Object.keys(game.pieces).filter(id => id[0] === p).length} fichas · ${game.failures[p]}/3 fallos${game.pending[p].length ? ` · +${game.pending[p].length} pendiente` : ''}</small></div>`).join('');
  $('turn-panel').hidden = !!game.result;
  $('die').textContent = rolling ? '…' : game.die; $('current-player').textContent = `Jugador ${game.current}`;
  $('roll-label').textContent = game.result ? 'ÚLTIMA TIRADA' : `DADO DEL TURNO · JUGADOR ${game.current}`;
  $('die-caption').textContent = rolling ? 'La rueda está girando…' : `${game.die === 1 ? 'casilla' : 'casillas'} por ficha`;
  $('turn-help').textContent = rolling ? 'Esperá el resultado de la rueda.' : `Todas las fichas avanzan ${game.die} casilla${game.die > 1 ? 's' : ''}.`;
  const human = isHuman();
  $('instruction').textContent = rolling ? 'Preparando el próximo turno…' : human ? 'Elegí una ficha y su destino iluminado, o una dirección. Luego confirmá.' : busy ? 'Esperando la respuesta del bot…' : paused ? 'La partida está en pausa.' : 'El árbitro solicita y valida cada jugada automáticamente.';
  $('piece-list').replaceChildren();
  if (human) for (const id of Object.keys(game.pieces).filter(id => id.startsWith(game.current))) {
    const button = document.createElement('button'); button.className = `piece-choice ${selected === id ? 'selected' : ''}`; button.textContent = `${id} ${arrows[moves[id]] || '·'}`; button.onclick = () => selectPiece(id); $('piece-list').append(button);
  }
  $('directions').hidden = !human; $('confirm').hidden = !human;
  const validation = human ? validateMove(game, moves) : null;
  $('move-status').textContent = human ? validation || 'Todo listo. Podés confirmar tu movimiento.' : '';
  $('confirm').disabled = busy || !!validation;
  document.querySelectorAll('[data-dir], .piece-choice').forEach(button => { button.disabled = busy; });
  document.querySelector('.bot-controls').hidden = human || !!game.result;
  $('speed-label').hidden = human || !!game.result;
  $('pause').textContent = paused ? 'Continuar' : 'Pausar'; $('pause').disabled = busy; $('step').disabled = busy || !paused;
  $('new-game').disabled = busy;
  $('log').replaceChildren();
  for (const entry of [...game.log].reverse()) { const li = document.createElement('li'); li.textContent = entry.text; li.className = entry.type; $('log').append(li); }
  if (!game.log.length) $('log').innerHTML = '<li class="empty-log">La historia empieza con el primer movimiento.</li>';
  if (game.result) { $('result').replaceChildren(); const title = document.createElement('strong'); title.textContent = game.result.winner ? `Victoria del jugador ${game.result.winner}` : '¡Empate!'; $('result').append(title, `${game.result.reason} Resultado: A ${game.scores.A} · B ${game.scores.B}.`); }
}
function schedule() { clearTimeout(timer); if (game && !game.result && !isHuman() && !paused && !busy) timer = setTimeout(takeTurn, Number($('speed').value)); }
async function animateTurn(previous, next) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const board = $('board');
  const moving = Object.entries(previous.pieces).filter(([id, from]) => {
    const to = next.pieces[id];
    return to && (from[0] !== to[0] || from[1] !== to[1]);
  });
  if (!moving.length || !board.animate) return;
  const layer = document.createElement('div');
  layer.className = 'piece-motion-layer';
  layer.setAttribute('aria-hidden', 'true');
  board.append(layer);
  const hidden = [];
  try {
    const bounds = layer.getBoundingClientRect();
    const cellBounds = pos => board.children[pos[0] * 10 + pos[1]].getBoundingClientRect();
    const first = cellBounds([0, 0]);
    const pitchX = cellBounds([0, 1]).left - first.left;
    const pitchY = cellBounds([1, 0]).top - first.top;
    const sprites = moving.map(([id, from]) => {
      const original = board.children[from[0] * 10 + from[1]].querySelector('.piece');
      const rect = original.getBoundingClientRect();
      const sprite = original.cloneNode(true);
      Object.assign(sprite.style, { position: 'absolute', left: `${rect.left - bounds.left}px`, top: `${rect.top - bounds.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      layer.append(sprite);
      original.style.visibility = 'hidden';
      hidden.push(original);
      return { id, from, sprite };
    });
    $('phase').textContent = 'Moviendo fichas…';
    for (const { id, from, sprite } of sprites) {
      const to = next.pieces[id];
      // The die is at most three: the shortest signed delta follows the move.
      const dr = (to[0] - from[0] + 15) % 10 - 5;
      const dc = (to[1] - from[1] + 15) % 10 - 5;
      const wrapX = (from[1] + dc - to[1]) * pitchX;
      const wrapY = (from[0] + dr - to[0]) * pitchY;
      const copies = [sprite];
      if (wrapX || wrapY) {
        const copy = sprite.cloneNode(true);
        copy.style.left = `${parseFloat(sprite.style.left) - wrapX}px`;
        copy.style.top = `${parseFloat(sprite.style.top) - wrapY}px`;
        layer.append(copy);
        copies.push(copy);
      }
      const animations = copies.map(copy => copy.animate([
        { transform: 'translate(0, 0)' },
        { transform: `translate(${dc * pitchX}px, ${dr * pitchY}px)` }
      ], { duration: 280, easing: 'ease-in-out', fill: 'forwards' }));
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      sprite.style.left = `${parseFloat(sprite.style.left) + (to[1] - from[1]) * pitchX}px`;
      sprite.style.top = `${parseFloat(sprite.style.top) + (to[0] - from[0]) * pitchY}px`;
      animations.forEach(animation => animation.cancel());
      copies.slice(1).forEach(copy => copy.remove());
    }
  } finally {
    layer.remove();
    hidden.forEach(piece => { piece.style.visibility = ''; });
  }
}
async function takeTurn() {
  if (busy || !game || game.result) return;
  clearTimeout(timer); busy = true; showError(); render();
  try {
    const result = await request(`/api/games/${gameId}/turn`, { turn: game.completed, moves });
    const previous = game;
    await animateTurn(previous, result.game);
    game = result.game; moves = {}; selected = isHuman() ? Object.keys(game.pieces).find(id => id.startsWith(game.current)) : null;
    sound.play(game.result ? 'finish' : game.failures[previous.current] > previous.failures[previous.current] ? 'error' : game.houses.length < previous.houses.length ? 'capture' : 'move');
    render();
    await rollDie();
  } catch (err) { showError(err.message); paused = true;
    try { const response = await fetch(`/api/games/${gameId}`); if (response.ok) { game = (await response.json()).game; moves = {}; selected = null; } } catch {}
  } finally { busy = false; render(); schedule(); }
}
$('setup-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return; busy = true; $('start').disabled = true; showError();
  sound.unlock();
  try {
    const config = Object.fromEntries(['A', 'B'].map(p => [p, { type: $(`player-${p}`).value, url: $(`url-${p}`).value.trim() }]));
    const result = await request('/api/games', config); game = result.game; gameId = result.id; moves = {}; paused = false; selected = isHuman() ? 'A1' : null;
    window.scrollTo({ top: 0, behavior: 'instant' });
    await rollDie();
  } catch (err) { showError(err.message); } finally { busy = false; $('start').disabled = false; render(); schedule(); }
};
$('confirm').onclick = takeTurn;
$('pause').onclick = () => { paused = !paused; render(); schedule(); };
$('step').onclick = takeTurn; $('speed').onchange = schedule;
$('new-game').onclick = () => { if (!game.result && !confirm('¿Terminar esta partida y preparar una nueva?')) return; clearTimeout(timer); game = null; gameId = null; selected = null; moves = {}; $('remaining').textContent = '5 CASAS POR CONQUISTAR'; $('log').innerHTML = '<li class="empty-log">La historia empieza con el primer movimiento.</li>'; showError(); render(); };
document.querySelectorAll('[data-dir]').forEach(button => button.onclick = () => choose(button.dataset.dir));
document.addEventListener('keydown', event => { if ($('rules').open || $('history-dialog').open || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return; const dir = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'O', ArrowRight: 'E' }[event.key]; if (dir && isHuman()) { event.preventDefault(); choose(dir); } });
render();
