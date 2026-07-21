// ── The mountain — CPU-sculpted alpine massif ────────────────
// Ridged fbm over a concave summit cone, arête arms, an island
// shelf that drops to the seabed. Generated in chunks so the
// loader can report honest progress.

import * as THREE from 'three';
import { uniforms, WORLD } from '../config.js';
import { ATMO_GLSL, NOISE_GLSL } from '../shaders/chunks.js';

// ---- CPU value noise -----------------------------------------
function makeNoise(seed = 7) {
  const perm = new Uint8Array(512);
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) grad[i] = rand();

  const fade = (t) => t * t * (3 - 2 * t);
  return function noise2(x, y) {
    const X = Math.floor(x), Y = Math.floor(y);
    const fx = x - X, fy = y - Y;
    const u = fade(fx), v = fade(fy);
    const a = grad[perm[(X & 255) + perm[Y & 255]] & 255];
    const b = grad[perm[((X + 1) & 255) + perm[Y & 255]] & 255];
    const c = grad[perm[(X & 255) + perm[(Y + 1) & 255]] & 255];
    const d = grad[perm[((X + 1) & 255) + perm[(Y + 1) & 255]] & 255];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

const noise2 = makeNoise(11);

function fbm(x, y, oct = 5) {
  let a = 0.5, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    norm += a; a *= 0.5; f *= 2.13;
  }
  return s / norm;
}

function ridgedFbm(x, y, oct = 5) {
  let a = 0.55, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = noise2(x * f, y * f);
    const r = 1 - Math.abs(2 * n - 1);
    s += a * r * r;
    norm += a; a *= 0.52; f *= 2.08;
  }
  return s / norm;
}

// ---- height function -----------------------------------------
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const t = Math.max(0, 1 - r / 940);
  const cone = Math.pow(t, 1.55);

  // arête arms radiating from the summit
  const ang = Math.atan2(z, x);
  const arm = Math.pow(Math.abs(Math.cos(ang * 1.5 + fbm(x * 0.0011, z * 0.0011) * 3.2)), 0.8);

  const ridge = ridgedFbm(x * 0.0021 + 3.1, z * 0.0021 - 1.7, 5);
  const crags = ridgedFbm(x * 0.0072 - 5.4, z * 0.0072 + 2.2, 4);
  let h = cone * (150 + 205 * ridge * (0.55 + 0.45 * arm) + 55 * crags);

  // mid-scale rock mass + fine detail, scaled down near the coast
  h += (fbm(x * 0.006 + 9.2, z * 0.006, 4) - 0.5) * 70 * (0.3 + t);
  h += (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 12 * (0.2 + t);

  // island shelf → seabed
  const shelf = THREE.MathUtils.smoothstep(r, 610, 800);
  h = h * (1 - shelf) + (-55) * shelf;
  return h;
}

// ---- geometry (chunked) --------------------------------------
export async function createTerrain(onStep, highDetail = true) {
  const SIZE = 2600;
  const N = highDetail ? 448 : 288;      // verts per side
  const verts = N * N;

  const positions = new Float32Array(verts * 3);
  const normals = new Float32Array(verts * 3);
  const indices = new (verts > 65535 ? Uint32Array : Uint16Array)((N - 1) * (N - 1) * 6);

  // first pass: raw heights so we can normalise the apex
  const heights = new Float32Array(verts);
  let maxH = 0;
  const step = SIZE / (N - 1);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -SIZE / 2 + i * step;
      const z = -SIZE / 2 + j * step;
      const h = terrainHeight(x, z);
      heights[j * N + i] = h;
      if (h > maxH) maxH = h;
    }
    if ((j & 31) === 31) { onStep(j / (2 * N)); await frame(); }
  }
  const scaleY = WORLD.peakY / maxH;
  setHeightScale(scaleY);

  const eps = step;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const x = -SIZE / 2 + i * step;
      const z = -SIZE / 2 + j * step;
      const y = heights[idx] * scaleY;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      // central differences (grid where possible, fn at borders)
      const hL = (i > 0 ? heights[idx - 1] : terrainHeight(x - eps, z)) * scaleY;
      const hR = (i < N - 1 ? heights[idx + 1] : terrainHeight(x + eps, z)) * scaleY;
      const hD = (j > 0 ? heights[idx - N] : terrainHeight(x, z - eps)) * scaleY;
      const hU = (j < N - 1 ? heights[idx + N] : terrainHeight(x, z + eps)) * scaleY;
      const nx = (hL - hR) / (2 * eps);
      const nz = (hD - hU) / (2 * eps);
      const inv = 1 / Math.hypot(nx, 1, nz);
      normals[idx * 3] = nx * inv;
      normals[idx * 3 + 1] = inv;
      normals[idx * 3 + 2] = nz * inv;
    }
    if ((j & 31) === 31) { onStep(0.5 + j / (2 * N)); await frame(); }
  }

  let k = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 120, 0), SIZE);

  const mat = new THREE.ShaderMaterial({
    name: 'terrain',
    uniforms: {
      uTime: uniforms.uTime,
      uProgress: uniforms.uProgress,
      uSunDir: uniforms.uSunDir,
      uCamPos: { value: new THREE.Vector3() },
      tSnow: { value: null },
      tRock: { value: null },
      uTexOn: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vWp;
      varying vec3 vN;
      void main() {
        vWp = (modelMatrix * vec4(position, 1.0)).xyz;
        vN = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uProgress, uTexOn;
      uniform vec3 uSunDir, uCamPos;
      uniform sampler2D tSnow, tRock;
      varying vec3 vWp;
      varying vec3 vN;
      ${NOISE_GLSL}
      ${ATMO_GLSL}

      void main() {
        vec3 n = normalize(vN);
        // micro relief, with close-range sastrugi that fade at distance.
        // steep faces use a wall projection so noise never smears into
        // vertical streaks
        float camD = length(uCamPos - vWp);
        float nearAmt = 1.0 - smoothstep(60.0, 420.0, camD);
        float flatness = smoothstep(0.30, 0.65, n.y);
        float mrFlat = fbm2(vWp.xz * 0.09) - 0.5;
        float mrWall = fbm2(vec2(vWp.x + vWp.z, vWp.y) * 0.09) - 0.5;
        float mr = mix(mrWall, mrFlat, flatness);
        float mr2 = fbm2(vWp.xz * 0.013 + 31.0) - 0.5;
        float sx = (fbm2b(vWp.xz * 0.55 + 91.0) - 0.5) * nearAmt * flatness;
        float sz = (fbm2b(vWp.zx * 0.55 + 47.0) - 0.5) * nearAmt * flatness;
        float mrB = mix(fbm2b(vec2(vWp.z - vWp.x, vWp.y) * 0.09 + 7.0),
                        fbm2b(vWp.zx * 0.09 + 7.0), flatness) - 0.5;
        n = normalize(n + vec3(mr * 0.45 + sx * 0.55, 0.0, mrB * 0.45 + sz * 0.55));

        // snow vs rock
        float slope = n.y;
        float snowLine = smoothstep(72.0, 175.0, vWp.y + mr2 * 90.0);
        float snow = smoothstep(0.40, 0.60, slope + mr * 0.25) * snowLine;

        vec3 rockCol = mix(vec3(0.024, 0.027, 0.033), vec3(0.052, 0.048, 0.046),
                           smoothstep(-0.2, 0.6, mr2 + mr * 0.6));
        // wet dark band where the mountain meets the water
        rockCol *= mix(0.45, 1.0, smoothstep(4.0, 42.0, vWp.y));
        vec3 snowCol = mix(vec3(0.66, 0.72, 0.84), vec3(0.85, 0.87, 0.92), mr * 0.5 + 0.5);
        vec3 alb = mix(rockCol, snowCol, snow);

        // photographic surface detail (loads progressively; the
        // procedural base remains the fallback). Two projections so
        // cliffs never smear, luminance-only so the grade stays ours.
        if (uTexOn > 0.001) {
          vec2 uvF = vWp.xz * 0.016;
          vec2 uvW = vec2(vWp.x + vWp.z, vWp.y) * 0.016;
          float sLum = dot(mix(texture2D(tSnow, uvW).rgb, texture2D(tSnow, uvF).rgb, flatness), vec3(0.333));
          float rLum = dot(mix(texture2D(tRock, uvW * 1.7).rgb, texture2D(tRock, uvF * 1.7).rgb, flatness), vec3(0.333));
          // second octave breaks any tiling up close
          float s2 = dot(texture2D(tSnow, uvF * 5.3 + 0.37).rgb, vec3(0.333));
          float snowMod = (0.72 + 0.42 * sLum) * (0.86 + 0.28 * s2 * nearAmt);
          float rockMod = 0.42 + 1.25 * rLum;
          alb *= mix(1.0, mix(rockMod, snowMod, snow), uTexOn * 0.9);
        }

        // lighting — a low raking dawn sun that fades through the acts
        float grey = actGrey(uProgress), mar = actMarine(uProgress);
        float sunAmt = (1.0 - grey * 0.85) * (1.0 - mar);
        vec3 sunCol = mix(vec3(1.32, 0.84, 0.55), vec3(0.75), grey) * 1.85;
        float wrap = 0.10;
        float diff = max(0.0, (dot(n, uSunDir) + wrap) / (1.0 + wrap));
        // soft self-shadow on faces turned from the light
        float shadowSoft = smoothstep(-0.12, 0.55, dot(n, uSunDir));

        // skylight fill — dawn shadows are blue, and clearly so
        vec3 skyFill = mix(vec3(0.34, 0.42, 0.66), vec3(0.62, 0.66, 0.70), grey);
        skyFill = mix(skyFill, vec3(0.44, 0.52, 0.58), mar);
        vec3 amb = skyFill * (0.42 + 0.34 * n.y)
                 + horizonCol(uProgress) * (1.0 - n.y) * 0.16;
        vec3 col = alb * (amb + sunCol * diff * shadowSoft * (0.22 + 0.78 * sunAmt));

        // sparkle on sunlit snow, dawn only
        vec3 V = normalize(uCamPos - vWp);
        vec3 H = normalize(V + uSunDir);
        float glintN = smoothstep(0.72, 1.0, fbm2b(vWp.xz * 2.1));
        col += vec3(1.2, 1.0, 0.85) * pow(max(dot(n, H), 0.0), 42.0)
               * glintN * snow * sunAmt * 0.85;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  // photographic detail streams in after boot; fade it in gently
  let texReady = 0;
  const tl = new THREE.TextureLoader();
  const prep = (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 4;
    return t;
  };
  tl.load('assets/tex-snow.jpg', (t) => { mat.uniforms.tSnow.value = prep(t); texReady++; });
  tl.load('assets/tex-rock.jpg', (t) => { mat.uniforms.tRock.value = prep(t); texReady++; });

  mesh.onBeforeRender = (r, s, camera) => {
    mat.uniforms.uCamPos.value.copy(camera.position);
    if (texReady === 2 && mat.uniforms.uTexOn.value < 1) {
      mat.uniforms.uTexOn.value = Math.min(1, mat.uniforms.uTexOn.value + 0.02);
    }
  };
  return mesh;
}

// world-space ground height (valid once createTerrain has run)
let heightScale = 1;
export function groundHeight(x, z) { return terrainHeight(x, z) * heightScale; }
export function setHeightScale(s) { heightScale = s; }

const frame = () => new Promise((r) => setTimeout(r, 0));
