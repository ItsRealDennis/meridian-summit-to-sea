// ── High-altitude snow — sparse, wind-driven, camera-local ───
// Plus spindrift: snow torn off the summit ridge by the wind,
// streaming into the dawn light like the mountain is breathing.

import * as THREE from 'three';
import { uniforms } from '../config.js';

export function createSpindrift() {
  const COUNT = 850;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 3); // speed, phase, size
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = -90 + Math.random() * 180;      // along the crest
    pos[i * 3 + 1] = 330 + Math.random() * 100;  // ridge band
    pos[i * 3 + 2] = -70 + Math.random() * 140;
    seed[i * 3] = 16 + Math.random() * 26;       // wind speed
    seed[i * 3 + 1] = Math.random() * 40;
    seed[i * 3 + 2] = 0.5 + Math.random() * 0.9;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));

  const mat = new THREE.ShaderMaterial({
    name: 'spindrift',
    uniforms: {
      uTime: uniforms.uTime,
      uProgress: uniforms.uProgress,
      uReduced: uniforms.uReduced,
      uSunDir: uniforms.uSunDir,
      uPixelRatio: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uProgress, uReduced, uPixelRatio;
      uniform vec3 uSunDir;
      attribute vec3 aSeed;
      varying float vAlpha;
      varying float vWarm;
      void main() {
        float t = uTime * mix(1.0, 0.22, uReduced);
        vec3 p = position;
        // torn off the crest, streaming leeward with gusty turbulence
        float life = fract((t * aSeed.x * 0.011) + aSeed.y * 0.13);
        p.x -= life * 220.0;
        p.y += sin(t * 0.9 + aSeed.y * 3.1) * 3.0 * (1.0 - uReduced)
             - life * 26.0;
        p.z += cos(t * 0.7 + aSeed.y * 1.9) * 4.0 * (1.0 - uReduced);

        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = clamp(aSeed.z * 60.0 * uPixelRatio / dist, 0.8, 4.0 * uPixelRatio);
        // brightest mid-flight, gone before it settles; act I only
        float act = 1.0 - smoothstep(0.16, 0.30, uProgress);
        vAlpha = act * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.55, 1.0, life)) * 0.4;
        // catches the low sun
        vWarm = 0.5 + 0.5 * clamp(uSunDir.x, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vAlpha;
      varying float vWarm;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vAlpha;
        if (a < 0.004) discard;
        vec3 col = mix(vec3(0.92, 0.94, 1.0), vec3(1.05, 0.98, 0.9), vWarm);
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.onBeforeRender = (r) => { mat.uniforms.uPixelRatio.value = r.getPixelRatio(); };
  return pts;
}

export function createSnow() {
  const COUNT = 1300;
  const BOX = 320;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 3); // speed, phase, size
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = Math.random() * BOX;
    pos[i * 3 + 1] = Math.random() * BOX;
    pos[i * 3 + 2] = Math.random() * BOX;
    seed[i * 3] = 6 + Math.random() * 9;        // fall speed
    seed[i * 3 + 1] = Math.random() * 40;       // phase
    seed[i * 3 + 2] = 0.6 + Math.random();      // size
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));

  const mat = new THREE.ShaderMaterial({
    name: 'snow',
    uniforms: {
      uTime: uniforms.uTime,
      uProgress: uniforms.uProgress,
      uReduced: uniforms.uReduced,
      uCamPos: { value: new THREE.Vector3() },
      uPixelRatio: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uProgress, uReduced, uPixelRatio;
      uniform vec3 uCamPos;
      attribute vec3 aSeed;
      varying float vAlpha;
      const float BOX = ${'320.0'};
      void main() {
        float t = uTime * mix(1.0, 0.3, uReduced);
        vec3 p = position;
        p.y -= t * aSeed.x;
        p.x += sin(t * 0.7 + aSeed.y) * 6.0 * (1.0 - uReduced) + t * 3.5;
        p.z += cos(t * 0.53 + aSeed.y * 1.7) * 5.0 * (1.0 - uReduced);
        // wrap into a camera-centred cube
        p = mod(p - uCamPos + BOX * 0.5, BOX) + uCamPos - BOX * 0.5;

        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = clamp(aSeed.z * 46.0 * uPixelRatio / dist, 1.0, 5.0 * uPixelRatio);
        // visible on the summit; gone before the deep cloud (they read
        // as sensor noise against the white-out, not as snow)
        float act = 1.0 - smoothstep(0.30, 0.42, uProgress);
        float nearFade = smoothstep(3.0, 14.0, dist) * (1.0 - smoothstep(BOX * 0.32, BOX * 0.5, dist));
        vAlpha = act * nearFade * 0.55;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, d) * vAlpha;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vec3(0.94, 0.95, 0.99), a);
      }
    `,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.onBeforeRender = (r, s, camera) => {
    mat.uniforms.uCamPos.value.copy(camera.position);
    mat.uniforms.uPixelRatio.value = r.getPixelRatio();
  };
  return pts;
}
