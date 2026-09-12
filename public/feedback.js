// Short, locally generated effects: no audio downloads or external services.
export function createSound() {
  let context, master, enabled = true;
  try { enabled = localStorage.getItem('casas-sound') !== 'off'; } catch {}
  function unlock() {
    if (!enabled) return;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0.16;
        master.connect(context.destination);
      }
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Audio is optional; a browser restriction must not block play. */ }
  }
  function note(frequency, offset = 0, duration = 0.09, type = 'sine') {
    if (!enabled || !master || context?.state !== 'running') return;
    const time = context.currentTime + offset;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.5, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain); gain.connect(master);
    oscillator.start(time); oscillator.stop(time + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  return {
    get enabled() { return enabled; },
    unlock,
    toggle() {
      enabled = !enabled;
      try { localStorage.setItem('casas-sound', enabled ? 'on' : 'off'); } catch {}
      unlock();
      if (master) master.gain.setValueAtTime(enabled ? 0.16 : 0, context.currentTime);
      return enabled;
    },
    play(kind) {
      if (kind === 'tick') note(480, 0, 0.035, 'triangle');
      if (kind === 'select') note(360, 0, 0.05);
      if (kind === 'move') { note(330); note(440, 0.07); }
      if (kind === 'land') { note(620); note(830, 0.09, 0.16); }
      if (kind === 'capture') [523, 659, 784].forEach((f, i) => note(f, i * 0.09, 0.2));
      if (kind === 'finish') [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.13, 0.3));
      if (kind === 'error') { note(180, 0, 0.15, 'triangle'); note(130, 0.16, 0.2, 'triangle'); }
    },
  };
}

// The pointer is at 12 o'clock; sector centers are at 60°, 180°, 300°.
// Only presents the server's die: never generates another random outcome.
export function wheelTarget(value, previousAngle = 0) {
  const resting = 300 - (value - 1) * 120;
  return Math.ceil(previousAngle / 360) * 360 + 1080 + resting;
}
