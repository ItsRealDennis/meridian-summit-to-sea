// ── Scroll — native document scroll, consumed with weight ────
// The page keeps its real scrollbar, keyboard and touch physics;
// we only smooth what the *camera* does with it. Spamming the
// wheel can never break the world.

import { WORLD, prefersReducedMotion } from './config.js';

export function createScroll() {
  const spacer = document.createElement('div');
  spacer.style.cssText = 'position:absolute;top:0;left:0;width:1px;pointer-events:none;visibility:hidden;';
  document.body.appendChild(spacer);

  let vh = window.innerHeight;
  let max = 1;
  const fit = () => {
    vh = window.innerHeight;
    spacer.style.height = `${vh * WORLD.pages}px`;
    max = Math.max(1, vh * WORLD.pages - vh);
  };
  fit();

  const state = {
    target: 0,      // raw progress from the scrollbar
    p: 0,           // smoothed progress the camera uses
    v: 0,           // progress velocity (for audio/motion accents)
    animating: null,
  };

  const read = () => { state.target = Math.min(1, Math.max(0, window.scrollY / max)); };
  window.addEventListener('scroll', read, { passive: true });
  read();

  function update(dt) {
    const reduced = prefersReducedMotion();
    const prev = state.p;
    if (reduced) {
      state.p = state.target;
    } else {
      const k = 1 - Math.exp(-dt / WORLD.scrollTau);
      state.p += (state.target - state.p) * k;
      if (Math.abs(state.target - state.p) < 0.00001) state.p = state.target;
    }
    state.v = dt > 0 ? (state.p - prev) / dt : 0;
  }

  // eased programmatic travel for nav anchors
  function goTo(p) {
    const startY = window.scrollY;
    const endY = p * max;
    if (prefersReducedMotion()) { window.scrollTo(0, endY); return; }
    const dur = Math.min(2.6, 0.7 + Math.abs(endY - startY) / max * 2.2);
    const t0 = performance.now();
    if (state.animating) cancelAnimationFrame(state.animating);
    const ease = (t) => 1 - Math.pow(1 - t, 3.2);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / (dur * 1000));
      window.scrollTo(0, startY + (endY - startY) * ease(t));
      if (t < 1) state.animating = requestAnimationFrame(step);
      else state.animating = null;
    };
    state.animating = requestAnimationFrame(step);
  }
  // a human touch on the wheel takes the controls back
  window.addEventListener('wheel', () => {
    if (state.animating) { cancelAnimationFrame(state.animating); state.animating = null; }
  }, { passive: true });
  window.addEventListener('touchstart', () => {
    if (state.animating) { cancelAnimationFrame(state.animating); state.animating = null; }
  }, { passive: true });

  return { state, update, fit, goTo };
}
