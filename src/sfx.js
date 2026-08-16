// Sunete simple generate cu Web Audio (fără fișiere). Cu comutator mute.
let ctx = null;
let muted = false;

function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, type = 'sine', vol = 0.18) {
  if (muted) return;
  const a = ac(); if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g); g.connect(a.destination);
  o.start(); o.stop(a.currentTime + dur);
}
function seq(notes) {
  let t = 0;
  for (const [f, d, ty, v] of notes) { setTimeout(() => tone(f, d, ty, v), t * 1000); t += d; }
}

export const sfx = {
  setMuted(v) { muted = v; },
  isMuted() { return muted; },
  roll() { tone(140, 0.08, 'square', 0.12); setTimeout(() => tone(200, 0.06, 'square', 0.1), 60); },
  cash() { seq([[523, 0.09, 'sine', 0.18], [784, 0.12, 'sine', 0.18]]); },
  pay() { tone(220, 0.16, 'sawtooth', 0.14); },
  build() { tone(440, 0.07, 'triangle', 0.16); setTimeout(() => tone(660, 0.09, 'triangle', 0.16), 70); },
  jail() { seq([[300, 0.12, 'sawtooth', 0.16], [180, 0.2, 'sawtooth', 0.16]]); },
  card() { tone(520, 0.06, 'triangle', 0.14); },
  win() { seq([[523, 0.14, 'sine', 0.2], [659, 0.14, 'sine', 0.2], [784, 0.14, 'sine', 0.2], [1047, 0.26, 'sine', 0.22]]); },
};
