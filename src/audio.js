// ── Sound — synthesized weather, mixed by altitude ───────────
// No samples, no files: wind is filtered noise, the horn is two
// detuned saws through a long echo, the sea is noise breathing
// under slow LFOs. Off by default; the M key or the nav toggle
// opens the air. The mix follows scroll progress: thin summit
// wind → gusts → near-silence at the white-out (one held breath)
// → the horn → the sea.

export function createAudio() {
  let ctx = null, on = false, built = false, userTouched = false;
  const g = {}; // gain nodes
  let windBP, breathLP, lastHornAt = -1e9, hornArmed = { seam: true, vessel: true };
  let master;

  function noiseBuffer(seconds = 2) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      // pink-ish noise (Paul Kellet economy)
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + 0.029591 * w;
      b1 = 0.985 * b1 + 0.032534 * w;
      b2 = 0.95 * b2 + 0.048056 * w;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9;
    }
    return buf;
  }

  function loopNoise() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2 + Math.random());
    src.loop = true;
    src.start();
    return src;
  }

  function makeReverb() {
    const sec = 3.2, len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.5;
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    master.connect(comp).connect(ctx.destination);

    const verb = makeReverb();
    const verbGain = ctx.createGain(); verbGain.gain.value = 0.35;
    verb.connect(verbGain).connect(master);

    // wind — the spine of the mix
    windBP = ctx.createBiquadFilter();
    windBP.type = 'bandpass'; windBP.frequency.value = 480; windBP.Q.value = 0.62;
    g.wind = ctx.createGain(); g.wind.gain.value = 0;
    loopNoise().connect(windBP).connect(g.wind).connect(master);

    // thin summit whistle
    const wbp = ctx.createBiquadFilter();
    wbp.type = 'bandpass'; wbp.frequency.value = 1900; wbp.Q.value = 11;
    g.whistle = ctx.createGain(); g.whistle.gain.value = 0;
    loopNoise().connect(wbp).connect(g.whistle).connect(master);

    // low drone — pressure of the deep world
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 54;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 81.4;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 160;
    g.drone = ctx.createGain(); g.drone.gain.value = 0;
    o1.connect(dlp); o2.connect(dlp); dlp.connect(g.drone).connect(master);
    o1.start(); o2.start();

    // breath at the seam
    breathLP = ctx.createBiquadFilter();
    breathLP.type = 'lowpass'; breathLP.frequency.value = 300;
    g.breath = ctx.createGain(); g.breath.gain.value = 0;
    loopNoise().connect(breathLP).connect(g.breath).connect(master);

    // the sea
    const olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 440;
    g.ocean = ctx.createGain(); g.ocean.gain.value = 0;
    const oceanIn = loopNoise();
    oceanIn.connect(olp).connect(g.ocean).connect(master);
    g.ocean.connect(verb);
    // swell LFOs, gated by act — the sea only breathes once we reach it
    const l1 = ctx.createOscillator(); l1.frequency.value = 0.085;
    const l2 = ctx.createOscillator(); l2.frequency.value = 0.052;
    const l1g = ctx.createGain(); l1g.gain.value = 0.35;
    const l2g = ctx.createGain(); l2g.gain.value = 0.22;
    g.lfoDepth = ctx.createGain(); g.lfoDepth.gain.value = 0;
    l1.connect(l1g).connect(g.lfoDepth);
    l2.connect(l2g).connect(g.lfoDepth);
    g.lfoDepth.connect(g.ocean.gain);
    l1.start(); l2.start();

    g.hornBus = ctx.createGain(); g.hornBus.gain.value = 1;
    g.hornBus.connect(master);
    g.hornBus.connect(verb);

    built = true;
  }

  function horn(long = true) {
    const t = ctx.currentTime;
    const dur = long ? 3.4 : 1.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 1.1;
    const env = ctx.createGain(); env.gain.value = 0;
    const oA = ctx.createOscillator(); oA.type = 'sawtooth'; oA.frequency.value = 62;
    const oB = ctx.createOscillator(); oB.type = 'sawtooth'; oB.frequency.value = 62.8;
    oA.connect(lp); oB.connect(lp); lp.connect(env).connect(g.hornBus);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.34, t + 0.45);
    env.gain.setValueAtTime(0.34, t + Math.max(0.45, dur - 1.4));
    env.gain.exponentialRampToValueAtTime(0.001, t + dur + 1.2);
    oA.start(t); oB.start(t);
    oA.stop(t + dur + 1.5); oB.stop(t + dur + 1.5);
  }

  const set = (node, v, tc = 0.6) => {
    node.gain.setTargetAtTime(v, ctx.currentTime, tc);
  };

  function update(p, v, t) {
    if (!on || !built || ctx.state !== 'running') return;

    // envelope shapes over the journey
    const seam = Math.exp(-Math.pow((p - 0.505) / 0.06, 2));       // the held breath
    const act1 = 1 - smooth(0.2, 0.45, p);
    const act3 = smooth(0.56, 0.78, p);
    const descent = smooth(0.16, 0.38, p) * (1 - smooth(0.42, 0.52, p));

    const gust = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.137 + 2.1);
    const rush = Math.min(0.14, Math.abs(v) * 1.6); // scroll speed stirs the air

    // the held breath ducks everything — including your own scrolling
    set(g.wind, ((0.05 * act1 + 0.16 * descent + 0.035 * act3) * (0.7 + 0.45 * gust) + rush) * (1 - seam * 0.94));
    windBP.frequency.setTargetAtTime(430 + gust * 260 + act3 * -120, ctx.currentTime, 0.8);
    set(g.whistle, 0.016 * act1 * (0.6 + 0.4 * Math.sin(t * 0.6)) * (1 - seam));
    set(g.drone, 0.05 * smooth(0.25, 0.5, p) + 0.045 * act3);
    set(g.breath, seam * 0.05, 1.1);
    set(g.ocean, act3 * 0.26 * (1 - seam), 0.9);
    set(g.lfoDepth, act3 * (1 - seam) * 0.45, 0.9);

    // the horn: once on the breakthrough, once alongside her
    if (hornArmed.seam && p > 0.578 && p < 0.7 && t - lastHornAt > 20) {
      horn(true); lastHornAt = t; hornArmed.seam = false;
    }
    if (p < 0.45) hornArmed.seam = true;
    if (hornArmed.vessel && p > 0.875 && t - lastHornAt > 16) {
      horn(false); lastHornAt = t; hornArmed.vessel = false;
    }
    if (p < 0.7) hornArmed.vessel = true;
  }

  const smooth = (a, b, x) => {
    const q = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return q * q * (3 - 2 * q);
  };

  function toggle() {
    userTouched = true;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch { return false; }
      build();
    }
    on = !on;
    if (on) {
      ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.8);
    } else {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    }
    return on;
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (on) ctx.resume();
  });

  // Sound is meant to be on. Autoplay policy permitting, start at once;
  // otherwise the first real gesture opens the air. The nav toggle and
  // the M key still silence it at will.
  function autoEnable(cb) {
    const events = ['pointerdown', 'keydown', 'touchend'];
    const cleanup = () => events.forEach((e) => removeEventListener(e, handler, true));
    const check = () => {
      if (on && ctx && ctx.state === 'running') { cb(true); cleanup(); return true; }
      return false;
    };
    const attempt = () => {
      if (!on) { const ok = toggle(); userTouched = false; if (!ok) return false; }
      userTouched = false;
      ctx.resume().then(check).catch(() => {});
      return check();
    };
    const handler = (e) => {
      // once a human has spoken (toggle or M), their choice stands
      if (userTouched) { cleanup(); return; }
      // the sound toggle owns its own click — never double-toggle it
      if (e.target && e.target.closest && e.target.closest('#sound-toggle')) return;
      if (on && ctx) { ctx.resume().then(check).catch(() => {}); }
      else attempt();
    };
    attempt();
    events.forEach((e) => addEventListener(e, handler, { capture: true, passive: true }));
  }

  return { toggle, update, autoEnable, get on() { return on; } };
}
