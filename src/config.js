// ── MERIDIAN world constants ──────────────────────────────────
// One place for the numbers that make the journey.

import * as THREE from 'three';

export const WORLD = {
  // vertical structure (world units ≈ metres/4)
  peakY: 330,          // summit altitude
  cloudTop: 250,       // cloud deck ceiling
  cloudBot: 148,       // cloud deck floor
  seaY: 0,

  // scroll
  pages: 8,            // document height in viewports
  scrollTau: 0.12,     // camera smoothing time-constant (s)

  // camera
  fov: 52,
  near: 0.6,
  far: 9000,
};

// Sun sits low to the east — a first-light sun for the whole film.
export const SUN_DIR = new THREE.Vector3(0.62, 0.16, -0.42).normalize();

// The vessel — shared by the ship itself, the camera flyby, and the
// ocean's hull foam. Bow points seaward (-z).
export const VESSEL = {
  pos: new THREE.Vector3(20, 0, -1350),
  yaw: THREE.MathUtils.degToRad(80),
  length: 108,
};

// Shared uniforms — every material links to these same objects.
export const uniforms = {
  uTime:     { value: 0 },
  uProgress: { value: 0 },
  uSunDir:   { value: SUN_DIR },
  uReduced:  { value: 0 },   // 1 when prefers-reduced-motion
};

// The story layer — section windows in progress space.
// (Act colour ramps live in src/shaders/chunks.js; the whiteout
// envelope lives in src/main.js setCloudUniforms.)
export const SECTIONS = [
  { id: 'top',      start: 0.000, end: 0.150, out: 'up'   },
  { id: 'mission',  start: 0.185, end: 0.280, out: 'fog'  },
  { id: 'trading',  start: 0.285, end: 0.345, out: 'fog'  },
  { id: 'capital',  start: 0.350, end: 0.410, out: 'fog'  },
  { id: 'maritime', start: 0.413, end: 0.468, out: 'fog'  },
  { id: 'energy',   start: 0.472, end: 0.512, out: 'fog'  },
  { id: 'seam',     start: 0.508, end: 0.568, out: 'fog'  },
  { id: 'below',    start: 0.600, end: 0.700, out: 'up'   },
  { id: 'closing',  start: 0.730, end: 0.815, out: 'up'   },
  { id: 'contact',  start: 0.845, end: 0.935, out: 'up'   },
  { id: 'footer',   start: 0.958, end: 1.001, out: 'none' },
];

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
