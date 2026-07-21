// ── The story layer — typography choreographed to the descent ─
// Sections live in progress windows; every frame writes only
// transform/opacity/filter, so the type dissolves into the fog
// without ever touching layout.

import { SECTIONS, prefersReducedMotion } from './config.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ── ink: the UI is graded with the world ──
const INK = {
  dawn:  { ink: [0xef, 0xe9, 0xdd], accent: [0xd8, 0xb9, 0x8a], shadow: 0.35 },
  white: { ink: [0x2c, 0x34, 0x3b], accent: [0x8d, 0x6f, 0x45], shadow: 0.0 },
  sea:   { ink: [0xea, 0xef, 0xed], accent: [0x9c, 0xb8, 0xb4], shadow: 0.28 },
};

function mixRgb(a, b, t) {
  return [lerp(a[0], b[0], t) | 0, lerp(a[1], b[1], t) | 0, lerp(a[2], b[2], t) | 0];
}

export function createUI(scroll, audio) {
  const root = document.documentElement;
  const sections = SECTIONS.map((s) => {
    const el = document.getElementById(s.id);
    return { ...s, el, reveals: [...el.querySelectorAll('.reveal')] };
  });
  const cue = document.getElementById('cue');
  const instrument = document.getElementById('instrument');
  const instValue = document.getElementById('inst-value');
  const instUnit = document.getElementById('inst-unit');
  const instTag = document.getElementById('inst-tag');
  const instRuler = instrument.querySelector('.inst-ruler');
  const menu = document.getElementById('menu');
  const menuBtn = document.getElementById('menu-toggle');
  const soundBtn = document.getElementById('sound-toggle');

  const canBlur = matchMedia('(min-width: 861px)').matches;
  let lastInstText = '';
  let staticOn = false;

  // ── per-word statement reveals ──
  // words carry their own lag in CSS; JS writes one --lp per frame
  document.querySelectorAll('.statement').forEach((el) => {
    el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' '));
    let wi = 0;
    const wrap = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
            const s = document.createElement('span');
            s.className = 'w';
            s.setAttribute('aria-hidden', 'true');
            s.style.setProperty('--wi', wi++);
            s.textContent = tok;
            frag.appendChild(s);
          });
          node.replaceChild(frag, c);
        }
      });
    };
    wrap(el);
  });

  // ── magnetic controls ──
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion()) {
    document.querySelectorAll('.nav-links a, .cta, #sound-toggle, #menu-toggle, #to-top, .div-more')
      .forEach((el) => {
        el.classList.add('mag');
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
          const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
          el.classList.add('mag-live');
          el.style.transform = `translate(${(dx * 7).toFixed(1)}px, ${(dy * 5).toFixed(1)}px)`;
        });
        el.addEventListener('pointerleave', () => {
          el.classList.remove('mag-live');
          el.style.transform = '';
        });
      });
  }

  // ── wordmark entrance: letters converge from a wide tracking ──
  const letters = [...document.querySelectorAll('.wordmark span')];
  function playEntrance() {
    if (prefersReducedMotion()) return; // CSS shows everything plainly
    letters.forEach((l, i) => {
      const c = i - (letters.length - 1) / 2;
      l.animate(
        [
          { opacity: 0, transform: `translateX(${c * 26}px)`, filter: 'blur(6px)' },
          { opacity: 1, transform: 'translateX(0)', filter: 'blur(0px)' },
        ],
        { duration: 1900, delay: 350 + Math.abs(c) * 90, easing: 'cubic-bezier(.22,.9,.28,1)', fill: 'backwards' }
      );
    });
    const fadeUp = (sel, delay) => {
      const el = document.querySelector(sel);
      el?.animate(
        [
          { opacity: 0, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 1400, delay, easing: 'cubic-bezier(.22,.9,.28,1)', fill: 'backwards' }
      );
    };
    fadeUp('#top .over', 1500);
    fadeUp('#top .tagline', 1800);
  }

  // ── goto links ──
  document.querySelectorAll('[data-goto]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      scroll.goTo(parseFloat(a.dataset.goto));
      if (menu.classList.contains('open')) toggleMenu(false);
    });
  });

  function toggleMenu(open) {
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? 'CLOSE' : 'MENU';
  }
  menuBtn.addEventListener('click', () => toggleMenu(!menu.classList.contains('open')));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (panel.classList.contains('open')) { closePanel(); return; }
      if (menu.classList.contains('open')) toggleMenu(false);
    }
    if (e.key === 'm' || e.key === 'M') {
      if (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) toggleSound();
    }
  });

  // ── division deep-dive panels ──
  const panel = document.getElementById('panel');
  const panelClose = document.getElementById('panel-close');
  let panelReturnFocus = null;
  function openPanel(id, trigger) {
    panel.querySelectorAll('article').forEach((a) => { a.hidden = a.id !== id; });
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden'; // the film waits
    panelReturnFocus = trigger || null;
    panelClose.focus();
  }
  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    panelReturnFocus?.focus?.();
  }
  document.querySelectorAll('.div-more').forEach((b) => {
    b.addEventListener('click', () => openPanel(b.dataset.panel, b));
  });
  panelClose.addEventListener('click', closePanel);
  panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });

  function toggleSound() {
    const on = audio.toggle();
    soundBtn.setAttribute('aria-pressed', String(on));
  }
  soundBtn.addEventListener('click', toggleSound);
  audio.autoEnable((on) => soundBtn.setAttribute('aria-pressed', String(on)));

  // ── custom cursor (pointer devices only) ──
  const cursor = document.getElementById('cursor');
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion()) {
    document.body.classList.add('has-cursor');
    let cx = -100, cy = -100, tx = -100, ty = -100;
    addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
    addEventListener('mouseover', (e) => {
      document.body.classList.toggle('cursor-link', !!e.target.closest('a, button'));
    });
    const tick = () => {
      cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
      cursor.style.transform = `translate(${cx - 3.5}px, ${cy - 3.5}px)`;
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ── per-frame choreography ──
  function update(p) {
    const reduced = prefersReducedMotion();

    // ink grade: bone over dawn sky → dark ink over snow and fog →
    // bone again over the dark sea
    const dark = smooth(0.155, 0.215, p) * (1 - smooth(0.645, 0.71, p));
    const mar = smooth(0.66, 0.75, p);
    let ink = mixRgb(INK.dawn.ink, INK.white.ink, dark);
    ink = mixRgb(ink, INK.sea.ink, mar * (1 - dark));
    let accent = mixRgb(INK.dawn.accent, INK.white.accent, dark);
    accent = mixRgb(accent, INK.sea.accent, mar * (1 - dark));
    const shAlpha = lerp(lerp(0.35, 0, dark), 0.28, mar * (1 - dark));
    // dark ink loses its text-shadow, so it needs more body to hold
    // contrast on the bright acts
    const dimA = lerp(0.62, 0.88, dark);
    const hairA = lerp(0.27, 0.42, dark);
    root.style.setProperty('--ink', `rgb(${ink})`);
    root.style.setProperty('--ink-dim', `rgba(${ink}, ${dimA.toFixed(3)})`);
    root.style.setProperty('--hair', `rgba(${ink}, ${hairA.toFixed(3)})`);
    root.style.setProperty('--accent', `rgb(${accent})`);
    root.style.setProperty('--shadow', `0 0 24px rgba(8,12,18,${shAlpha.toFixed(3)})`);

    // sections
    for (const s of sections) {
      const pad = 0.05;
      const active = p > s.start - pad && p < s.end + pad;
      if (!active) { if (s.el.classList.contains('on')) s.el.classList.remove('on'); continue; }
      s.el.classList.add('on');
      const local = clamp01((p - s.start) / (s.end - s.start));
      const isHero = s.start === 0;
      s.reveals.forEach((el, i) => {
        const lag = i * 0.055;
        const fadeIn = isHero ? 1 : smooth(0.02 + lag, 0.2 + lag, local);
        const fadeOut = s.out === 'none' ? 0
          : isHero ? smooth(0.42, 0.88, local)
          : smooth(0.8, 0.995, local);
        const isStatement = el.classList.contains('statement');
        // statements assemble word by word (CSS-computed); the block
        // itself only handles the exit
        const op = isStatement ? (1 - fadeOut) : fadeIn * (1 - fadeOut);
        let ty = isStatement ? 0 : (1 - fadeIn) * 30;
        let blur = 0;
        if (s.out === 'fog') { blur = fadeOut * 9; ty -= fadeOut * 14; }
        if (s.out === 'up') ty -= fadeOut * 44;
        if (isStatement) el.style.setProperty('--lp', (reduced ? 1 : fadeIn).toFixed(3));
        el.style.opacity = op.toFixed(3);
        el.style.transform = `translateY(${ty.toFixed(2)}px)`;
        el.style.filter = (canBlur && !reduced && blur > 0.2) ? `blur(${blur.toFixed(2)}px)` : '';
      });
      // the seam line breathes wider as the world whites out
      if (s.id === 'seam') {
        const sp = (0.62 + local * 0.5).toFixed(3);
        s.el.querySelector('.seam-line').style.letterSpacing = `${sp}em`;
      }
    }

    // scroll cue
    cue.classList.toggle('gone', p > 0.03);

    // ── the instrument (signature): altitude → static → position fix ──
    const SUMMIT = 8848;
    let text, unit, tag, isStatic = false;
    if (p < 0.47) {
      const alt = Math.round(SUMMIT * (1 - Math.pow(smooth(0.0, 0.57, p), 1.12)));
      text = alt.toLocaleString('en-US').replace(/,/g, ' ');
      unit = 'M'; tag = 'ALTITUDE';
    } else if (p < 0.585) {
      // signal returns only once we are truly through the deck
      text = '— · — · —'; unit = ''; tag = 'NO SIGNAL'; isStatic = true;
    } else if (p < 0.64) {
      text = '0'; unit = 'M'; tag = 'SEA LEVEL';
    } else {
      text = '43°17′N 9°02′W'; unit = ''; tag = 'POSITION · 6.2 kn';
    }
    if (text !== lastInstText) {
      instValue.textContent = text;
      instUnit.textContent = unit;
      instTag.textContent = tag;
      lastInstText = text;
      instValue.style.fontSize = p >= 0.64 ? '13px' : '';
    }
    if (isStatic !== staticOn) { instrument.classList.toggle('static', isStatic); staticOn = isStatic; }
    instrument.classList.toggle('retired', p > 0.952);
    instRuler.style.setProperty('--ruler-y', `${(p * 1400).toFixed(1)}px`);
  }

  return { update, playEntrance };
}
