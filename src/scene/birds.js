// ── A thermal of choughs riding the summit wind — Act I only ─

import * as THREE from 'three';
import { uniforms } from '../config.js';

export function createBirds() {
  const N = 16;
  // per-bird: 4 verts (body-l, tip-l, body-r, tip-r), 2 triangles
  const verts = N * 4;
  const pos = new Float32Array(verts * 3);       // unused, required
  const corner = new Float32Array(verts * 2);    // (side, tip)
  const bird = new Float32Array(verts * 3);      // radius, speed, phase
  const idx = [];
  for (let i = 0; i < N; i++) {
    const r = 60 + Math.random() * 95;
    const s = (0.14 + Math.random() * 0.08) * (Math.random() > 0.5 ? 1 : -1);
    const ph = Math.random() * Math.PI * 2;
    const corners = [[-1, 0], [-1, 1], [1, 0], [1, 1]];
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      corner[v * 2] = corners[c][0];
      corner[v * 2 + 1] = corners[c][1];
      bird[v * 3] = r; bird[v * 3 + 1] = s; bird[v * 3 + 2] = ph;
    }
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aBird', new THREE.BufferAttribute(bird, 3));
  geo.setIndex(idx);

  const mat = new THREE.ShaderMaterial({
    name: 'birds',
    uniforms: {
      uTime: uniforms.uTime,
      uProgress: uniforms.uProgress,
      uReduced: uniforms.uReduced,
    },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uProgress, uReduced;
      attribute vec2 aCorner;
      attribute vec3 aBird;
      varying float vAlpha;
      const vec3 CENTER = vec3(96.0, 366.0, 310.0);
      void main() {
        float t = uTime * mix(1.0, 0.25, uReduced);
        float ang = aBird.z + t * aBird.y;
        // glide path: a wide ellipse with a slow vertical drift
        vec3 c = CENTER + vec3(cos(ang) * aBird.x, sin(ang * 2.0 + aBird.z) * 7.0,
                               sin(ang) * aBird.x * 0.72);
        // heading frame
        vec3 fwd = normalize(vec3(-sin(ang), 0.0, cos(ang) * 0.72) * sign(aBird.y));
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
        // wing flap
        float flap = sin(t * 6.5 + aBird.z * 9.0) * mix(0.95, 0.15, uReduced);
        float span = 3.1;
        vec3 p = c
          + side * aCorner.x * span * (0.25 + aCorner.y * 0.75) * cos(flap * aCorner.y)
          + vec3(0.0, sin(flap) * aCorner.y * span * 0.8, 0.0)
          + fwd * (aCorner.y > 0.5 ? -0.5 : 0.35);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vAlpha = (1.0 - smoothstep(0.10, 0.20, uProgress)) * 0.85;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vAlpha;
      void main() {
        if (vAlpha < 0.01) discard;
        gl_FragColor = vec4(vec3(0.055, 0.06, 0.07), vAlpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
