// ── The ocean — Gerstner swell under an overcast ceiling ─────
// Wave set lives here once; the GLSL is generated from it and the
// vessel samples the same maths on the CPU, so the hull always
// sits on the water it appears to float in.

import * as THREE from 'three';
import { uniforms, VESSEL } from '../config.js';
import { ATMO_GLSL, NOISE_GLSL } from '../shaders/chunks.js';

// hull segment endpoints for the foam that breaks against her plating
const HULL_DIR = new THREE.Vector2(Math.cos(VESSEL.yaw), -Math.sin(VESSEL.yaw));
const HULL_A = new THREE.Vector2(
  VESSEL.pos.x + HULL_DIR.x * VESSEL.length * 0.46,
  VESSEL.pos.z + HULL_DIR.y * VESSEL.length * 0.46);
const HULL_B = new THREE.Vector2(
  VESSEL.pos.x - HULL_DIR.x * VESSEL.length * 0.46,
  VESSEL.pos.z - HULL_DIR.y * VESSEL.length * 0.46);

// [dirX, dirZ, amplitude, wavelength, steepness]
export const WAVES = [
  [0.78, 0.62, 2.10, 210.0, 0.16],
  [-0.42, 0.91, 1.30, 118.0, 0.20],
  [0.97, -0.24, 0.75, 62.0, 0.24],
  [0.10, -0.99, 0.42, 34.0, 0.26],
  [-0.83, -0.55, 0.22, 17.0, 0.22],
];
const G = 9.81 * 4.0; // world units are ~metres/4

const waveConst = WAVES.map(([dx, dz, a, l, q], i) => {
  const len = Math.hypot(dx, dz);
  const k = (2 * Math.PI) / l;
  const w = Math.sqrt(G * k);
  return { dx: dx / len, dz: dz / len, a, k, w, q };
});

// CPU mirror — used by the vessel for buoyancy
export function waveSample(x, z, t, out = { y: 0, nx: 0, nz: 0 }) {
  let y = 0, nx = 0, nz = 0;
  for (const wv of waveConst) {
    const ph = wv.k * (wv.dx * x + wv.dz * z) - wv.w * t;
    y += wv.a * Math.sin(ph);
    const c = wv.a * wv.k * Math.cos(ph);
    nx += wv.dx * c; nz += wv.dz * c;
  }
  out.y = y; out.nx = -nx; out.nz = -nz;
  return out;
}

const wavesGLSL = waveConst.map((wv) => `
    ph = ${wv.k.toFixed(6)} * dot(vec2(${wv.dx.toFixed(4)}, ${wv.dz.toFixed(4)}), p.xz) - ${wv.w.toFixed(6)} * t;
    sp = sin(ph); cp = cos(ph);
    p.y += ${wv.a.toFixed(4)} * sp;
    p.x -= ${(wv.q * wv.a).toFixed(4)} * ${wv.dx.toFixed(4)} * cp;
    p.z -= ${(wv.q * wv.a).toFixed(4)} * ${wv.dz.toFixed(4)} * cp;
    nrm.x -= ${wv.dx.toFixed(4)} * ${(wv.a * wv.k).toFixed(6)} * cp;
    nrm.z -= ${wv.dz.toFixed(4)} * ${(wv.a * wv.k).toFixed(6)} * cp;
    crest += ${(wv.q * wv.a * wv.k).toFixed(6)} * sp;`).join('\n');

export function createOcean(highDetail = true) {
  const SIZE = 15000;
  const N = highDetail ? 340 : 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    name: 'ocean',
    uniforms: {
      uTime: uniforms.uTime,
      uProgress: uniforms.uProgress,
      uSunDir: uniforms.uSunDir,
      uReduced: uniforms.uReduced,
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`
      uniform float uTime, uReduced;
      varying vec3 vWp;
      varying vec3 vNrm;
      varying float vCrest;
      void main() {
        vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
        float t = uTime * mix(1.0, 0.28, uReduced);
        vec3 nrm = vec3(0.0, 1.0, 0.0);
        float crest = 0.0;
        float ph, sp, cp;
        ${wavesGLSL}
        vWp = p;
        vNrm = nrm;
        vCrest = crest;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uProgress, uReduced;
      uniform vec3 uSunDir, uCamPos;
      varying vec3 vWp;
      varying vec3 vNrm;
      varying float vCrest;
      ${NOISE_GLSL}
      ${ATMO_GLSL}

      void main() {
        float t = uTime * mix(1.0, 0.28, uReduced);
        vec3 n = normalize(vNrm);
        // fine chop detail — strong enough that the surface reads as
        // water, not vapour
        float d1 = fbm2(vWp.xz * 0.045 + vec2(t * 0.05, t * 0.028));
        float d2 = fbm2b(vWp.xz * 0.16 - vec2(t * 0.06, 0.0));
        n = normalize(n + vec3((d1 - 0.5) * 0.78 + (d2 - 0.5) * 0.44, 0.0,
                               (fbm2(vWp.zx * 0.045 + 13.0 + vec2(0.0, t * 0.04)) - 0.5) * 0.78));

        vec3 V = normalize(uCamPos - vWp);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y) * 0.9 + 0.04;
        vec3 skyRef = skyBase(R, uProgress);

        float fres = 0.045 + 0.72 * pow(1.0 - max(dot(V, n), 0.0), 5.0);

        // body colour — cold slate green, lighter where swell lifts
        float lift = clamp(vWp.y * 0.18 + 0.5, 0.0, 1.0);
        vec3 deep = mix(vec3(0.020, 0.045, 0.054), vec3(0.062, 0.100, 0.108), lift);
        // dawn warms the water faces that catch the light
        float sunAmt = (1.0 - actGrey(uProgress) * 0.85) * (1.0 - actMarine(uProgress));
        deep += vec3(0.35, 0.18, 0.08) * max(dot(n, uSunDir), 0.0) * sunAmt * 0.35;

        vec3 col = mix(deep, skyRef * 0.85, fres);

        // sun path glitter (dawn only — hidden under the overcast)
        float glit = pow(max(dot(R, uSunDir), 0.0), 180.0);
        col += vec3(1.2, 0.8, 0.5) * glit * sunAmt * 1.2;

        // foam: crests + streaks, dissolving with distance (no far sparkle)
        float camD = length(uCamPos - vWp);
        float nearW = 1.0 - smoothstep(500.0, 1900.0, camD);
        float streak = fbm2b(vec2(vWp.x * 0.016, vWp.z * 0.055) + d1 * 0.4);
        float foam = smoothstep(0.52, 0.95, vCrest * 0.5 + 0.5 + (d2 - 0.5) * 0.55)
                   * smoothstep(0.35, 0.75, streak) * nearW;

        // the sea works against her hull — a breathing collar of foam
        vec2 ha = vec2(${HULL_A.x.toFixed(1)}, ${HULL_A.y.toFixed(1)});
        vec2 hb = vec2(${HULL_B.x.toFixed(1)}, ${HULL_B.y.toFixed(1)});
        vec2 pa = vWp.xz - ha, ba = hb - ha;
        float hSeg = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float hd = length(pa - ba * hSeg);
        float surge = 0.6 + 0.4 * sin(t * 0.9 + vWp.x * 0.3 + vWp.z * 0.21);
        float hullFoam = smoothstep(16.5, 9.8, hd) * smoothstep(6.5, 9.8, hd)
                       * smoothstep(0.3, 0.7, fbm2b(vWp.xz * 0.35 + t * 0.05))
                       * surge * actMarine(uProgress);
        foam = max(foam, hullFoam * 0.85);

        vec3 foamCol = horizonCol(uProgress) * 1.06;
        col = mix(col, foamCol, foam * 0.6);

        // a slightly deepened far band gives the eye a horizon to hold
        col *= 1.0 - 0.16 * smoothstep(1300.0, 2900.0, camD) * (1.0 - smoothstep(2900.0, 5400.0, camD));
        // the sheet itself dissolves into the haze long before its edge
        vec3 fogC = skyBase(normalize(vec3(vWp.x - uCamPos.x, 0.02, vWp.z - uCamPos.z)), uProgress);
        col = mix(col, fogC, smoothstep(3200.0, 6200.0, camD));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, s, camera) => {
    mat.uniforms.uCamPos.value.copy(camera.position);
    // follow the camera on a snapped grid so the sheet never ends
    const snap = 50;
    mesh.position.x = Math.round(camera.position.x / snap) * snap;
    mesh.position.z = Math.round(camera.position.z / snap) * snap;
    mesh.updateMatrixWorld();
  };
  return mesh;
}
