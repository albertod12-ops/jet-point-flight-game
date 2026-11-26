// All sound is synthesized with WebAudio — no audio files, no network.
// Jet engine (higher whine than a prop), wind rush, rain hiss in storms.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let rainGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Jet engine: two detuned saws, higher than a prop, through a low-pass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 110;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 113.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise buffer, loudness follows airspeed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const wind = ctx.createBufferSource();
      wind.buffer = buf;
      wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      wind.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      wind.start();
      // Rain: a second looped noise, high-passed, for storms.
      const rain = ctx.createBufferSource();
      rain.buffer = buf;
      rain.loop = true;
      rain.playbackRate.value = 1.7;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'highpass';
      rainFilter.frequency.value = 2400;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      rain.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(ctx.destination);
      rain.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
      if (rainGain) rainGain.gain.value = 0;
    },
    isMuted() {
      return muted;
    },
    // Called every frame while flying: engine note + wind follow the jet,
    // rain follows the storm flag.
    update(speed, throttle, flying, storm) {
      if (!ctx || muted || !started) return;
      const target = flying ? 0.05 + throttle * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      if (engineOsc) engineOsc.frequency.setTargetAtTime(95 + throttle * 90, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.1, speed * 0.0006) : 0, ctx.currentTime, 0.15);
      rainGain.gain.setTargetAtTime(storm && flying ? 0.05 : 0, ctx.currentTime, 0.3);
    },
    ring(quality) {
      // quality 0 = centre, 1 = edge: brighter chime for a cleaner pass.
      tone(880, 0.35, 'sine', 0.22);
      tone(1318, 0.45, 'sine', 0.16, 0.07);
      if (quality < 0.5) tone(1760, 0.5, 'sine', 0.1, 0.14);
    },
    nearMiss() {
      tone(520, 0.18, 'triangle', 0.12);
      tone(660, 0.18, 'triangle', 0.12, 0.09);
    },
    warn() {
      // Traffic alert: two short beeps.
      tone(980, 0.12, 'square', 0.09);
      tone(980, 0.12, 'square', 0.09, 0.16);
    },
    thunder() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const len = ctx.sampleRate * 1.2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.7;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.4;
      src.connect(g);
      g.connect(ctx.destination);
      src.start(t);
    },
    crash() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const len = ctx.sampleRate * 0.7;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      tone(110, 0.7, 'sawtooth', 0.25);
    },
    land() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, 'triangle', 0.18, i * 0.11));
    },
    click() {
      tone(660, 0.08, 'square', 0.08);
    },
  };
}
