// ── Composite pass ───────────────────────────────────────────
// One fullscreen pass does the heavy weather: a raymarched
// volumetric cloud deck (depth-aware, so the summit pierces it),
// closed-form height fog, the guaranteed white-out beat, and the
// film grade. Clouds, fog and sky share one atmosphere, so the
// world never shows a seam.

import * as THREE from 'three';
import { uniforms, WORLD } from './config.js';
import { ATMO_GLSL, FOG_GLSL, NOISE_GLSL } from './shaders/chunks.js';

// ---- 3D noise bake (fbm + worley), tileable ------------------
export async function bakeNoise3D(onStep) {
  const S = 80;
  const data = new Uint8Array(S * S * S);

  // periodic value-noise lattices
  const lattices = [6, 12, 24].map((P) => {
    const l = new Float32Array(P * P * P);
    let s = P * 7919 + 17;
    const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < l.length; i++) l[i] = rand();
    return { P, l };
  });
  const wts = [0.58, 0.28, 0.14];

  // periodic worley feature points
  const WC = 5;
  const feat = new Float32Array(WC * WC * WC * 3);
  {
    let s = 99991;
    const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < WC * WC * WC; i++) {
      feat[i * 3] = rand(); feat[i * 3 + 1] = rand(); feat[i * 3 + 2] = rand();
    }
  }

  const smooth = (t) => t * t * (3 - 2 * t);
  function vnoise3(l, P, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    let r = 0;
    for (let dz = 0; dz < 2; dz++)
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const v = l[(((zi + dz) % P) * P + ((yi + dy) % P)) * P + ((xi + dx) % P)];
          r += v * (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
        }
    return r;
  }

  for (let z = 0; z < S; z++) {
    const w = z / S;
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        let f = 0;
        for (let o = 0; o < 3; o++) {
          const { P, l } = lattices[o];
          f += wts[o] * vnoise3(l, P, u * P, v * P, w * P);
        }
        // worley F1 (wrapped)
        const cx = u * WC, cy = v * WC, cz = w * WC;
        const ix = Math.floor(cx), iy = Math.floor(cy), iz = Math.floor(cz);
        let d2min = 4;
        for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const jx = (ix + dx + WC) % WC, jy = (iy + dy + WC) % WC, jz = (iz + dz + WC) % WC;
              const fi = ((jz * WC + jy) * WC + jx) * 3;
              let ox = feat[fi] + ix + dx - cx;
              let oy = feat[fi + 1] + iy + dy - cy;
              let oz = feat[fi + 2] + iz + dz - cz;
              const d2 = ox * ox + oy * oy + oz * oz;
              if (d2 < d2min) d2min = d2;
            }
        const worley = 1 - Math.min(1, Math.sqrt(d2min));
        const val = Math.max(0, Math.min(1, f * 0.62 + worley * 0.52 - 0.10));
        data[(z * S + y) * S + x] = val * 255;
      }
    }
    if ((z & 7) === 7) { onStep(z / S); await new Promise((r) => setTimeout(r, 0)); }
  }

  const tex = new THREE.Data3DTexture(data, S, S, S);
  tex.format = THREE.RedFormat;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeBlueNoise() {
  const S = 128;
  const d = new Uint8Array(S * S * 4);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 255;
  const t = new THREE.DataTexture(d, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// ---- the pass ------------------------------------------------
export function createPost(renderer, noise3D) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depthTexture = new THREE.DepthTexture(size.x, size.y);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthTexture,
    depthBuffer: true,
  });

  const mat = new THREE.ShaderMaterial({
    name: 'composite',
    glslVersion: THREE.GLSL3,
    uniforms: {
      tScene: { value: rt.texture },
      tDepth: { value: depthTexture },
      tNoise: { value: noise3D },
      tBlue: { value: makeBlueNoise() },
      uInvProjView: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uCamFwd: { value: new THREE.Vector3() },
      uNear: { value: WORLD.near },
      uFar: { value: WORLD.far },
      uRes: { value: new THREE.Vector2() },
      uSteps: { value: 16 },
      uCoverage: { value: 0.62 },
      uWhiteout: { value: 0 },
      uTime: uniforms.uTime,
      uProgress: uniforms.uProgress,
      uSunDir: uniforms.uSunDir,
      uReduced: uniforms.uReduced,
    },
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */`
      out vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      precision highp sampler3D;
      in vec2 vUv;
      out vec4 oCol;
      uniform sampler2D tScene, tDepth, tBlue;
      uniform sampler3D tNoise;
      uniform mat4 uInvProjView;
      uniform vec3 uCamPos, uCamFwd, uSunDir;
      uniform float uNear, uFar, uTime, uProgress, uReduced;
      uniform float uSteps, uCoverage, uWhiteout;
      uniform vec2 uRes;
      ${NOISE_GLSL}
      ${ATMO_GLSL}
      ${FOG_GLSL}

      const float C_TOP = ${WORLD.cloudTop.toFixed(1)};
      const float C_BOT = ${WORLD.cloudBot.toFixed(1)};

      float cloudMap(vec3 p, float cov) {
        // the deck floor undulates — no ruler lines across the world
        float botWobble = (texture(tNoise, vec3(p.xz * 0.00033, 0.71)).r - 0.5) * 66.0;
        float hN = clamp((p.y - C_BOT - botWobble) / (C_TOP - C_BOT), 0.0, 1.0);
        // rounded profile — soft floor, billowed top
        float prof = smoothstep(0.0, 0.18, hN) * (1.0 - smoothstep(0.42, 1.0, hN) * 0.85);
        // large-scale weather: masses and lanes, breaks any tiling
        float mass = texture(tNoise, vec3(p.x * 0.00021, 0.31, p.z * 0.00019)).r;
        float covLocal = clamp(cov * (0.42 + 1.15 * mass), 0.0, 0.98);
        // two rotated sample domains — the lattice never lines up
        float drift = uTime * 0.006 * (1.0 - uReduced * 0.7);
        vec2 xa = mat2(0.857, -0.515, 0.515, 0.857) * p.xz;
        vec2 xb = mat2(0.682, 0.731, -0.731, 0.682) * p.xz;
        float base = texture(tNoise, vec3(xa * 0.0019 + drift, p.y * 0.0026)).r * 0.62
                   + texture(tNoise, vec3(xb * 0.0031 - drift * 0.6, p.y * 0.0037 + 0.5)).r * 0.38;
        float det = texture(tNoise, vec3(p.xz * 0.0104 + drift * 2.0, p.y * 0.011)).r;
        float d = base * 0.76 + det * 0.24;
        float th = 1.02 - covLocal;
        return smoothstep(th, th + 0.26, d * prof) * 0.72;
      }

      float lightMarch(vec3 p, float cov) {
        float od = 0.0;
        od += cloudMap(p + uSunDir * 12.0, cov) * 12.0;
        od += cloudMap(p + uSunDir * 30.0, cov) * 18.0;
        od += cloudMap(p + uSunDir * 58.0, cov) * 28.0;
        return od;
      }

      void main() {
        vec2 ndc = vUv * 2.0 - 1.0;
        vec4 w = uInvProjView * vec4(ndc, 1.0, 1.0);
        vec3 rd = normalize(w.xyz / w.w - uCamPos);
        vec3 ro = uCamPos;

        vec3 col = texture(tScene, vUv).rgb;

        float d = texture(tDepth, vUv).r;
        bool isSky = d >= 0.99999;
        float dist = 1e7;
        if (!isSky) {
          float viewZ = (uNear * uFar) / (d * (uFar - uNear) - uFar); // negative
          dist = -viewZ / max(dot(rd, uCamFwd), 1e-4);
        }

        float grey = actGrey(uProgress);
        float mar = actMarine(uProgress);

        // ── aerial + height fog on surfaces ──
        if (!isSky) {
          vec3 fCol = fogColor(rd, uSunDir, uProgress);
          float haze = 1.0 - exp(-dist * mix(0.00016, 0.00033, max(grey, mar)));
          // marine mist hugging the water
          float mist = heightFog(ro, rd, dist, -6.0, 36.0, 0.0026 * mar);
          // thin valley haze under the deck at dawn
          float valley = heightFog(ro, rd, dist, 30.0, 90.0, 0.0022 * (1.0 - mar));
          float fogA = clamp(haze + mist + valley, 0.0, 1.0);
          col = mix(col, fCol, fogA);
        }

        // ── volumetric cloud deck ──
        float tTop = (C_TOP - ro.y) / rd.y;
        float tBot = (C_BOT - ro.y) / rd.y;
        float t0 = min(tTop, tBot), t1 = max(tTop, tBot);
        if (abs(rd.y) < 1e-3) { // grazing: inside slab sees clouds, else not
          bool inside = ro.y > C_BOT && ro.y < C_TOP;
          t0 = inside ? 0.0 : 1e8;
          t1 = inside ? 4000.0 : -1.0;
        }
        t0 = max(t0, 0.0);
        t1 = min(t1, min(dist, 5200.0));
        // from below, resolve the ceiling where it enters — the far
        // reaches merge into haze anyway (kills grazing-angle speckle)
        t1 = min(t1, t0 + 750.0);

        float T = 1.0;
        vec3 acc = vec3(0.0);
        if (t1 > t0) {
          float span = t1 - t0;
          float n = uSteps;
          float dt = span / n;
          float jitter = texelFetch(tBlue, ivec2(mod(gl_FragCoord.xy, 128.0)), 0).r;
          float tcur = t0 + dt * jitter;

          float sunAmt = (1.0 - grey * 0.8) * (1.0 - mar);
          vec3 litCol = mix(vec3(1.14, 0.93, 0.76), vec3(0.925, 0.935, 0.945), grey);
          litCol = mix(litCol, vec3(0.80, 0.845, 0.87), mar);
          vec3 shdCol = mix(vec3(0.415, 0.465, 0.60), vec3(0.665, 0.685, 0.705), grey);
          shdCol = mix(shdCol, vec3(0.485, 0.535, 0.575), mar);
          float phase = 1.0 + 2.4 * pow(max(dot(rd, uSunDir), 0.0), 9.0) * sunAmt;

          for (int i = 0; i < 24; i++) {
            if (float(i) >= n || T < 0.012) break;
            vec3 p = ro + rd * tcur;
            float dens = cloudMap(p, uCoverage);
            if (dens > 0.004) {
              float od = lightMarch(p, uCoverage);
              float beer = exp(-od * 0.13);
              float powder = 1.0 - exp(-dens * 14.0);
              vec3 c = mix(shdCol, litCol * phase, beer * mix(1.0, powder, 0.45));
              float a = 1.0 - exp(-dens * dt * 0.12);
              acc += T * a * c;
              T *= 1.0 - a;
            }
            tcur += dt;
          }
          // clouds themselves fade into distance haze (mid-span keyed,
          // so the march limit never shows as an edge)
          float cloudDist = clamp(((t0 + t1) * 0.5 - 1100.0) / 3100.0, 0.0, 1.0);
          vec3 fCol = fogColor(rd, uSunDir, uProgress);
          acc = mix(acc, fCol * (1.0 - T), cloudDist);
          T = mix(T, 1.0 - (1.0 - T) * 0.85, cloudDist * 0.4);
        }
        col = col * T + acc;

        // ── the held breath — guaranteed white-out with live wisps ──
        if (uWhiteout > 0.001) {
          vec3 fCol = fogColor(rd, uSunDir, uProgress);
          float wisp = fbm2(vUv * vec2(uRes.x / uRes.y, 1.0) * 2.6
                            + vec2(uTime * 0.035, -uTime * 0.012) * (1.0 - uReduced));
          float wo = clamp(uWhiteout * (0.90 + 0.14 * wisp), 0.0, 1.0);
          col = mix(col, fCol * (0.99 + 0.025 * wisp), wo);
        }

        // ── grade ──
        col *= 1.06;
        col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
        vec3 wb = mix(vec3(1.025, 1.0, 0.975), vec3(1.0), grey);
        wb = mix(wb, vec3(0.955, 1.0, 1.05), mar);
        col *= wb;
        float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, vec3(L), clamp(grey * (1.0 - mar) * 0.16 + uWhiteout * 0.18, 0.0, 0.5));

        float vig = 1.0 - (0.30 - uWhiteout * 0.16) * pow(length(vUv - 0.5) * 1.5, 2.4);
        col *= vig;

        float grain = hash12(gl_FragCoord.xy + fract(uTime) * 731.0) - 0.5;
        col += grain * (0.011 + uWhiteout * 0.02) * (1.0 - uReduced * 0.65);

        col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
        oCol = vec4(col, 1.0);
      }
    `,
  });

  const quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0,   3, -1, 0,   -1, 3, 0,
  ]), 3));
  const quad = new THREE.Mesh(quadGeo, mat);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const api = {
    rt,
    mat,
    setSize(w, h) {
      rt.setSize(w, h);
      mat.uniforms.uRes.value.set(w, h);
    },
    render(scene, camera) {
      mat.uniforms.uCamPos.value.copy(camera.position);
      camera.getWorldDirection(mat.uniforms.uCamFwd.value);
      mat.uniforms.uInvProjView.value
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .invert();
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    },
  };
  api.setSize(size.x, size.y);
  return api;
}
