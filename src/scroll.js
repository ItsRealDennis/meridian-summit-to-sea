// ── Scroll — native document scroll, consumed with weight ────
// The page keeps its real scrollbar, keyboard and touch physics;
// we only smooth what the *camera* does with it. Spamming the
// wheel can never break the world.

import { WORLD, SECTIONS, prefersReducedMotion } from './config.js';

// magnetic anchors: stop near a beat and the page glides into it
const SNAPS = (() => {
  const pts = [0, ...SECTIONS.map((s) => (s.start + s.end) / 2), 1]
    .sort((a, b) => a - b);
  return pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1] : -1;
    const next = i < pts.length - 1 ? pts[i + 1] : 2;
    const radius = Math.min(p - prev, next - p) * 0.42;
    return { p, radius };
  });
})();

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
  let lastInput = performance.now();
  let lastSnapAt = -1;

  const read = () => { state.target = Math.min(1, Math.max(0, window.scrollY / max)); };
  window.addEventListener('scroll', read, { passive: true });
  read();
  const noteInput = () => { lastInput = performance.now(); lastSnapAt = -1; };
  window.addEventListener('wheel', noteInput, { passive: true });
  window.addEventListener('touchmove', noteInput, { passive: true });
  window.addEventListener('keydown', noteInput, { passive: true });

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

    // settle into the nearest beat once the hand comes off the wheel
    if (!reduced && !state.animating && performance.now() - lastInput > 550) {
      for (const s of SNAPS) {
        const d = s.p - state.target;
        if (Math.abs(d) < s.radius && Math.abs(d) > 0.002 && lastSnapAt !== s.p) {
          lastSnapAt = s.p;
          goTo(s.p);
          break;
        }
      }
    }
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
    let lastSetY = null;
    const step = (now) => {
      // someone else moved the page (scrollbar drag, keyboard, a jump)
      // — their hand wins, immediately
      if (lastSetY !== null && Math.abs(window.scrollY - lastSetY) > 6) {
        state.animating = null;
        return;
      }
      const t = Math.min(1, (now - t0) / (dur * 1000));
      const y = startY + (endY - startY) * ease(t);
      window.scrollTo(0, y);
      lastSetY = y;
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
