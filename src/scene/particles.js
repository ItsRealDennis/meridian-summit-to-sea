// ── High-altitude snow — sparse, wind-driven, camera-local ───

import * as THREE from 'three';
import { uniforms } from '../config.js';

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
