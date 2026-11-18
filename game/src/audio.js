// Sound: everything is synthesized with WebAudio — no audio files.
// An engine hum that follows the player's speed, a two-tone siren while
// wanted, and short blips for pickups, jobs and crashes. The context is
// created lazily on the first user gesture (browsers demand that) and
// every call is guarded, so the game plays fine with no audio at all.

export function makeAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenPhase: 0,
    muted: false,
    enabled: false,
  };
}

export function initAudio(audio) {
  if (audio.enabled) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.35;
    audio.master.connect(audio.ctx.destination);

    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    audio.engineOsc2 = audio.ctx.createOscillator();
    audio.engineOsc2.type = 'square';
    audio.engineOsc2.frequency.value = 28;
    const g2 = audio.ctx.createGain();
    g2.gain.value = 0.4;
    audio.engineOsc.connect(filter);
    audio.engineOsc2.connect(g2);
    g2.connect(filter);
    filter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.engineOsc2.start();

    audio.sirenGain = audio.ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenOsc = audio.ctx.createOscillator();
    audio.sirenOsc.type = 'triangle';
    audio.sirenOsc.frequency.value = 720;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();

    audio.enabled = true;
  } catch (e) {
    audio.enabled = false;
  }
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master) audio.master.gain.value = muted ? 0 : 0.35;
}

// Called every frame with the live state: engine pitch follows speed,
// the siren wails while wanted, everything fades on the title screen.
export function updateAudio(audio, speed, wanted, running) {
  if (!audio.enabled || !audio.ctx) return;
  try {
    const t = audio.ctx.currentTime;
    const norm = Math.min(1, Math.abs(speed) / 210);
    audio.engineOsc.frequency.setTargetAtTime(52 + norm * 130, t, 0.08);
    audio.engineOsc2.frequency.setTargetAtTime(26 + norm * 60, t, 0.08);
    audio.engineGain.gain.setTargetAtTime(running ? 0.05 + norm * 0.075 : 0, t, 0.1);
    if (wanted > 0) {
      audio.sirenPhase += 0.11;
      const f = audio.sirenPhase % 2 < 1 ? 660 : 880;
      audio.sirenOsc.frequency.setTargetAtTime(f, t, 0.05);
      audio.sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
    } else {
      audio.sirenGain.gain.setTargetAtTime(0, t, 0.2);
    }
  } catch (e) {
    // Audio is decoration; a failure must never break the game.
  }
}

function blip(audio, freq, dur, type, vol) {
  if (!audio.enabled || !audio.ctx) return;
  try {
    const t = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(audio.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (e) { /* ignore */ }
}

export function sfxPickup(audio) {
  blip(audio, 880, 0.12, 'sine', 0.2);
  setTimeout(() => blip(audio, 1320, 0.14, 'sine', 0.18), 70);
}

export function sfxJob(audio) {
  blip(audio, 523, 0.14, 'triangle', 0.22);
  setTimeout(() => blip(audio, 659, 0.14, 'triangle', 0.22), 110);
  setTimeout(() => blip(audio, 784, 0.22, 'triangle', 0.22), 220);
}

export function sfxCrash(audio) {
  if (!audio.enabled || !audio.ctx) return;
  try {
    const t = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * 0.18);
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const g = audio.ctx.createGain();
    g.gain.value = 0.25;
    const f = audio.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    src.connect(f);
    f.connect(g);
    g.connect(audio.master);
    src.start(t);
  } catch (e) { /* ignore */ }
}

export function sfxBusted(audio) {
  blip(audio, 220, 0.3, 'sawtooth', 0.16);
  setTimeout(() => blip(audio, 165, 0.4, 'sawtooth', 0.16), 200);
}
