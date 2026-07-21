// ── Camera choreography — one unbroken shot ──────────────────
// Two Catmull-Rom splines (eye + gaze). Points cluster around the
// seam so the camera naturally slows for the held breath. Drift
// and mouse parallax are whispers, and vanish under reduced motion.

import * as THREE from 'three';
import { WORLD } from './config.js';

const EYE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-30, 424, 715),    // above the clouds, first light
  new THREE.Vector3(-118, 372, 430),   // drawing closer
  new THREE.Vector3(-185, 308, 255),   // the face fills the frame
  new THREE.Vector3(-236, 252, 92),    // entering the deck
  new THREE.Vector3(-226, 212, -44),   // thick of it
  new THREE.Vector3(-206, 188, -136),  // the held breath
  new THREE.Vector3(-150, 148, -365),  // breaking through
  new THREE.Vector3(-70, 96, -585),    // the reveal — open water
  new THREE.Vector3(-30, 46, -860),    // long glide toward her
  new THREE.Vector3(-34, 20, -1120),   // dropping to deck height
  new THREE.Vector3(-36, 17, -1250),   // the flyby — alongside the hull
  new THREE.Vector3(-38, 21, -1335),   // settling abeam her midship
], false, 'centripetal');

const GAZE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 306, 0),        // the summit
  new THREE.Vector3(-10, 298, 0),
  new THREE.Vector3(-58, 248, -15),
  new THREE.Vector3(-120, 200, -150),
  new THREE.Vector3(-110, 175, -310),
  new THREE.Vector3(-70, 128, -470),
  new THREE.Vector3(-14, 66, -780),
  new THREE.Vector3(24, 34, -1080),    // she appears ahead
  new THREE.Vector3(34, 15, -1300),    // eyes on her hull
  new THREE.Vector3(30, 13, -1370),    // tracking along the plating
  new THREE.Vector3(26, 25, -1760),    // released past her bow, horizon
], false, 'centripetal');

const eyeP = new THREE.Vector3();
const gazeP = new THREE.Vector3();
const drift = new THREE.Vector3();
const mouseCur = new THREE.Vector2();

// ── terrain clearance ────────────────────────────────────────
// After the massif is generated, the real ground is sampled along
// the whole spline and a smoothed lift curve guarantees the eye
// never enters a ridge — no hand-tuned guesswork survives here.
const N_CL = 720;
let liftCurve = null;

export function buildClearance(groundFn) {
  const CLEAR = 24;                       // camera + drift + parallax margin
  const probe = [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16], [11, 11], [-11, -11]];
  const raw = new Float32Array(N_CL + 1);
  const e = new THREE.Vector3();
  for (let i = 0; i <= N_CL; i++) {
    EYE.getPoint(i / N_CL, e);
    let g = -1e9;
    for (const [ox, oz] of probe) g = Math.max(g, groundFn(e.x + ox, e.z + oz));
    raw[i] = Math.max(0, g + CLEAR - e.y);
  }
  // dilate (so the later blur cannot sag below the requirement)…
  const dil = new Float32Array(N_CL + 1);
  for (let i = 0; i <= N_CL; i++) {
    let m = 0;
    for (let j = Math.max(0, i - 16); j <= Math.min(N_CL, i + 16); j++) m = Math.max(m, raw[j]);
    dil[i] = m;
  }
  // …then smooth into a camera-worthy curve
  let cur = dil;
  for (let pass = 0; pass < 3; pass++) {
    const nxt = new Float32Array(N_CL + 1);
    for (let i = 0; i <= N_CL; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(N_CL, i + 4); j++) { s += cur[j]; c++; }
      nxt[i] = s / c;
    }
    cur = nxt;
  }
  liftCurve = cur;
}

function liftAt(p) {
  if (!liftCurve) return 0;
  const x = THREE.MathUtils.clamp(p, 0, 1) * N_CL;
  const i = Math.floor(x), f = x - i;
  return liftCurve[i] + (liftCurve[Math.min(N_CL, i + 1)] - liftCurve[i]) * f;
}

export function updateCamera(camera, p, t, dt, mouse, reduced, aspect) {
  const pe = THREE.MathUtils.clamp(p, 0, 1);
  EYE.getPoint(pe, eyeP);
  GAZE.getPoint(pe, gazeP);

  // stillness at the seam: drift fades toward the white-out
  const seam = Math.exp(-Math.pow((p - 0.505) / 0.07, 2));
  const driftAmp = (1 - seam * 0.8) * (reduced ? 0 : 1);
  drift.set(
    Math.sin(t * 0.11) * 2.4 + Math.sin(t * 0.043) * 1.5,
    Math.sin(t * 0.137 + 1.7) * 1.5,
    Math.cos(t * 0.09 + 0.6) * 1.6
  ).multiplyScalar(driftAmp);

  // mouse parallax — soft, slow, desktop only
  const k = 1 - Math.exp(-dt * 2.2);
  mouseCur.x += (mouse.x - mouseCur.x) * k;
  mouseCur.y += (mouse.y - mouseCur.y) * k;
  const par = reduced ? 0 : 1;

  camera.position.copy(eyeP).add(drift);
  camera.position.x += mouseCur.x * 5.5 * par;
  camera.position.y += -mouseCur.y * 3.2 * par;
  camera.position.y += liftAt(pe);

  gazeP.x += mouseCur.x * 10 * par;
  gazeP.y += -mouseCur.y * 6 * par;
  camera.up.set(0, 1, 0).applyAxisAngle(
    new THREE.Vector3(0, 0, 1),
    reduced ? 0 : Math.sin(THREE.MathUtils.smoothstep(p, 0.16, 0.62) * Math.PI) * 0.045
  );
  camera.lookAt(gazeP);

  // breathe a little wider through the white-out; portrait needs room
  const portrait = aspect < 0.85 ? 14 : aspect < 1.2 ? 7 : 0;
  camera.fov = WORLD.fov + portrait + seam * 4;
  camera.updateProjectionMatrix();
}
