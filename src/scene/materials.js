// ── Shared act-aware lambert materials ───────────────────────
// Imported photographic assets (the vessel, the summit) are re-lit
// with the same sun and skylight as everything procedural, so one
// atmosphere owns the whole world.

import * as THREE from 'three';
import { uniforms } from '../config.js';
import { ATMO_GLSL } from '../shaders/chunks.js';

const VERT = /* glsl */`
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function frag(albedoExpr) {
  return /* glsl */`
    precision highp float;
    uniform float uProgress;
    uniform vec3 uSunDir, uColor;
    uniform sampler2D tMap;
    varying vec3 vN;
    varying vec2 vUv;
    ${ATMO_GLSL}
    void main() {
      vec3 alb = ${albedoExpr};
      vec3 n = normalize(vN);
      float grey = actGrey(uProgress), mar = actMarine(uProgress);
      float sunAmt = (1.0 - grey * 0.85) * (1.0 - mar);
      vec3 sunCol = mix(vec3(1.25, 0.85, 0.6), vec3(0.7), grey) * 1.5;
      float diff = max(0.0, (dot(n, uSunDir) + 0.3) / 1.3);
      vec3 amb = mix(horizonCol(uProgress), zenithCol(uProgress), n.y * 0.5 + 0.5) * 0.75;
      gl_FragColor = vec4(alb * (amb + sunCol * diff * (0.2 + 0.8 * sunAmt)), 1.0);
    }
  `;
}

export function actLambert(hex) {
  return new THREE.ShaderMaterial({
    name: 'actLambert',
    uniforms: {
      uProgress: uniforms.uProgress,
      uSunDir: uniforms.uSunDir,
      uColor: { value: new THREE.Color(hex) },
      tMap: { value: null },
    },
    vertexShader: VERT,
    fragmentShader: frag('uColor'),
  });
}

export function actLambertTextured(map, boost = 1.0) {
  return new THREE.ShaderMaterial({
    name: 'actLambertTex',
    uniforms: {
      uProgress: uniforms.uProgress,
      uSunDir: uniforms.uSunDir,
      uColor: { value: new THREE.Color('#ffffff') },
      tMap: { value: map },
    },
    vertexShader: VERT,
    fragmentShader: frag(`pow(texture2D(tMap, vUv).rgb, vec3(2.2)) * ${boost.toFixed(2)}`),
  });
}
