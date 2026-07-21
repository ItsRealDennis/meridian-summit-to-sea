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

// Hero-peak variant: baked macro texture + tiled snow micro-detail
// that fades in close to the camera — photogrammetry blur never
// reaches the lens.
export function actLambertPeak(map, detail, boost = 1.0) {
  return new THREE.ShaderMaterial({
    name: 'actLambertPeak',
    uniforms: {
      uProgress: uniforms.uProgress,
      uSunDir: uniforms.uSunDir,
      uCamPos: { value: new THREE.Vector3() },
      tMap: { value: map },
      tDetail: { value: detail },
    },
    vertexShader: /* glsl */`
      varying vec3 vN;
      varying vec2 vUv;
      varying vec3 vWp;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vUv = uv;
        vWp = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uProgress;
      uniform vec3 uSunDir, uCamPos;
      uniform sampler2D tMap, tDetail;
      varying vec3 vN;
      varying vec2 vUv;
      varying vec3 vWp;
      ${ATMO_GLSL}
      void main() {
        // gentle decode + lift: the bake already carries its own
        // shadows — crushing them twice turns snow into slate
        vec3 tex = texture2D(tMap, vUv).rgb;
        vec3 alb = pow(tex, vec3(1.45)) * 1.42 * ${boost.toFixed(2)};
        alb += vec3(0.02, 0.03, 0.05);            // skylight in the shadows
        // micro-detail up close, dual-projected
        float camD = length(uCamPos - vWp);
        float nearAmt = 1.0 - smoothstep(120.0, 520.0, camD);
        if (nearAmt > 0.01) {
          vec3 n0 = normalize(vN);
          float flat_ = smoothstep(0.35, 0.7, n0.y);
          float dF = dot(texture2D(tDetail, vWp.xz * 0.03).rgb, vec3(0.333));
          float dW = dot(texture2D(tDetail, vec2(vWp.x + vWp.z, vWp.y) * 0.03).rgb, vec3(0.333));
          float d = mix(dW, dF, flat_);
          alb *= mix(1.0, 0.72 + 0.5 * d, nearAmt * 0.85);
        }
        vec3 n = normalize(vN);
        float grey = actGrey(uProgress), mar = actMarine(uProgress);
        float sunAmt = (1.0 - grey * 0.85) * (1.0 - mar);
        vec3 sunCol = mix(vec3(1.25, 0.85, 0.6), vec3(0.7), grey) * 1.5;
        float diff = max(0.0, (dot(n, uSunDir) + 0.3) / 1.3);
        vec3 amb = mix(horizonCol(uProgress), zenithCol(uProgress), n.y * 0.5 + 0.5) * 0.75;
        gl_FragColor = vec4(alb * (amb + sunCol * diff * (0.2 + 0.8 * sunAmt)), 1.0);
      }
    `,
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
