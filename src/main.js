// ── MERIDIAN — boot, loop, quality, survival ─────────────────

import * as THREE from 'three';
import { uniforms, WORLD, prefersReducedMotion } from './config.js';
import { createSky } from './scene/sky.js';
import { createTerrain, groundHeight } from './scene/terrain.js';
import { createOcean } from './scene/ocean.js';
import { createVessel } from './scene/vessel.js';
import { createSnow } from './scene/particles.js';
import { createBirds } from './scene/birds.js';
import { bakeNoise3D, createPost } from './post.js';
import { updateCamera, buildClearance } from './camera-path.js';
import { createScroll } from './scroll.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('stage');
const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('loader-fill');
const pctEl = document.getElementById('loader-pct');

let progressShown = 0;
function setProgress(x) {
  // monotonic — async task completion can never walk the bar backwards
  const p = Math.min(1, Math.max(progressShown, x));
  progressShown = p;
  fillEl.style.transform = `scaleX(${p.toFixed(3)})`;
  pctEl.textContent = String(Math.round(p * 100)).padStart(2, '0');
}

function fatal() {
  loaderEl.classList.add('done');
  document.getElementById('fallback').hidden = false;
  canvas.style.display = 'none';
  // the words really do still stand: flow the story as a plain page
  document.body.classList.add('live', 'fallback');
}

async function boot() {
  // ── renderer ──
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    if (!renderer.getContext() || !renderer.capabilities.isWebGL2) throw new Error('no webgl2');
  } catch (err) {
    console.error('MERIDIAN renderer unavailable:', err);
    fatal();
    return;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // composite handles sRGB
  renderer.toneMapping = THREE.NoToneMapping;

  const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 820;
  const quality = {
    dprCap: isMobile ? 1.5 : 1.75,
    scale: 1,           // adaptive multiplier
    steps: isMobile ? 11 : 16,
    floor: 0.55,
    maxPixels: isMobile ? 2.2e6 : 3.4e6,   // raymarch budget — ultrawides included
  };
  const applySize = () => {
    let dpr = Math.min(devicePixelRatio || 1, quality.dprCap) * quality.scale;
    const px = innerWidth * innerHeight * dpr * dpr;
    if (px > quality.maxPixels) dpr *= Math.sqrt(quality.maxPixels / px);
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (post) {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      post.setSize(s.x, s.y);
    }
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(WORLD.fov, innerWidth / innerHeight, WORLD.near, WORLD.far);
  camera.position.set(-40, 402, 585);
  let post = null;
  applySize();

  uniforms.uReduced.value = prefersReducedMotion() ? 1 : 0;
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
    uniforms.uReduced.value = e.matches ? 1 : 0;
  });

  // ── staged load with honest progress ──
  // fonts 8% · noise 30% · terrain 42% · scene 8% · warm-up 12%
  try {
    const fontsP = document.fonts?.ready?.then(() => setProgress(0.08));
    setProgress(0.02);

    const noise3D = await bakeNoise3D((f) => setProgress(0.08 + f * 0.30));
    const terrain = await createTerrain((f) => setProgress(0.38 + f * 0.42), !isMobile);
    buildClearance(groundHeight);
    setProgress(0.80);

    scene.add(createSky());
    scene.add(terrain);
    const ocean = createOcean(!isMobile);
    scene.add(ocean);
    const vessel = createVessel();
    scene.add(vessel);
    const snow = createSnow();
    scene.add(snow);
    const birds = createBirds();
    scene.add(birds);
    post = createPost(renderer, noise3D);
    applySize();
    setProgress(0.88);

    // warm-up: compile every act's shader branches before first paint
    const scroll = createScroll();
    const audio = createAudio();
    const ui = createUI(scroll, audio);
    const mouse = new THREE.Vector2();
    addEventListener('mousemove', (e) => {
      mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });

    const warmPoints = [0.02, 0.5, 0.8];
    for (let i = 0; i < warmPoints.length; i++) {
      uniforms.uProgress.value = warmPoints[i];
      setCloudUniforms(warmPoints[i]);
      updateCamera(camera, warmPoints[i], 0, 0.016, mouse, true, camera.aspect);
      vessel.userData.update(0, true);
      post.render(scene, camera);
      setProgress(0.88 + (i + 1) * 0.04);
      await new Promise((r) => setTimeout(r, 0));
    }
    uniforms.uProgress.value = 0;
    await fontsP;
    setProgress(1);

    // ── handoff ──
    setTimeout(() => {
      loaderEl.classList.add('done');
      loaderEl.setAttribute('aria-hidden', 'true');
      document.body.classList.add('live');
      ui.playEntrance();
    }, 420);

    // ── frame loop ──
    // time is accumulated manually: THREE.Clock.start() zeroes
    // elapsedTime, which would teleport every wave and cloud on
    // each return to the tab
    const clock = new THREE.Clock();
    let worldT = 0;
    let raf = 0;
    let running = false;
    let emaDt = 16, lastTune = 0;

    function setCloudUniforms(p) {
      const m = post.mat.uniforms;
      // coverage: broken cotton at dawn → ragged entry → shut at the
      // seam → high ceiling at sea
      const seamCov = Math.exp(-Math.pow((p - 0.5) / 0.068, 2));
      m.uCoverage.value = 0.55 + 0.43 * seamCov + 0.17 * smooth(0.55, 0.7, p);
      const build = smooth(0.435, 0.502, p);
      const release = 1 - smooth(0.535, 0.60, p);
      m.uWhiteout.value = Math.min(build, release) * 0.99;
      m.uSteps.value = quality.steps;
    }
    function smooth(a, b, x) {
      const q = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return q * q * (3 - 2 * q);
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.1);
      worldT += dt;
      const t = worldT;
      const reduced = prefersReducedMotion();

      scroll.update(dt);
      const p = scroll.state.p;

      uniforms.uTime.value = t;
      uniforms.uProgress.value = p;
      setCloudUniforms(p);

      updateCamera(camera, p, t, dt, mouse, reduced, camera.aspect);

      // act-based culling — nothing invisible costs a draw
      snow.visible = p < 0.44;
      birds.visible = p < 0.22;
      ocean.visible = p > 0.40;
      vessel.visible = p > 0.52;
      terrain.visible = p < 0.86;
      if (vessel.visible) vessel.userData.update(t, reduced);
      ui.update(p);
      audio.update(p, scroll.state.v, t);

      post.render(scene, camera);

      // adaptive quality — trade resolution before it trades frames
      emaDt = emaDt * 0.95 + dt * 1000 * 0.05;
      if (t - lastTune > 1.6) {
        if (emaDt > 24 && quality.scale > quality.floor) {
          quality.scale = Math.max(quality.floor, quality.scale * 0.86);
          quality.steps = Math.max(9, quality.steps - 2);
          applySize(); lastTune = t;
        } else if (emaDt < 12.5 && quality.scale < 1) {
          quality.scale = Math.min(1, quality.scale * 1.12);
          quality.steps = Math.min(isMobile ? 11 : 16, quality.steps + 1);
          applySize(); lastTune = t;
        }
      }
    }
    running = true;
    frame();

    // debug/tuning hook (harmless in production)
    window.__M = { renderer, post, quality, scene, camera, uniforms };

    // ── survival ──
    addEventListener('resize', () => { applySize(); scroll.fit(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
      } else if (!running) {
        clock.getDelta(); // swallow the hidden interval; worldT stays put
        running = true;
        frame();
      }
    });
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      fatal();
    });
  } catch (err) {
    console.error('MERIDIAN failed to initialise:', err);
    fatal();
  }
}

boot();
