// ── Sky — fullscreen background raydome ──────────────────────
// Rendered first at far depth; the composite pass fogs everything
// toward this exact gradient, so the world has no visible edge.

import * as THREE from 'three';
import { uniforms } from '../config.js';
import { ATMO_GLSL, NOISE_GLSL } from '../shaders/chunks.js';

export function createSky() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0,   3, -1, 0,   -1, 3, 0,
  ]), 3));

  const mat = new THREE.ShaderMaterial({
    name: 'sky',
    uniforms: {
      uTime: uniforms.uTime,
      uProgress: uniforms.uProgress,
      uSunDir: uniforms.uSunDir,
      uReduced: uniforms.uReduced,
      uInvProjView: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
    },
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */`
      uniform mat4 uInvProjView;
      uniform vec3 uCamPos;
      varying vec3 vRay;
      void main() {
        gl_Position = vec4(position.xy, 0.99999, 1.0);
        vec4 w = uInvProjView * vec4(position.xy, 1.0, 1.0);
        vRay = w.xyz / w.w - uCamPos;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uProgress, uReduced;
      uniform vec3 uSunDir;
      varying vec3 vRay;
      ${NOISE_GLSL}
      ${ATMO_GLSL}

      // sparse dawn starfield, dissolving with first light
      float stars(vec3 rd) {
        vec2 uv = vec2(atan(rd.x, rd.z), asin(clamp(rd.y, -1.0, 1.0))) * 160.0;
        vec2 id = floor(uv);
        float h = hash12(id);
        vec2 c = fract(uv) - 0.5 + (vec2(hash12(id + 7.1), hash12(id + 3.7)) - 0.5) * 0.6;
        float star = smoothstep(0.09, 0.0, length(c)) * step(0.992, h);
        float tw = 0.7 + 0.3 * sin(uTime * (1.8 + h * 2.0) + h * 40.0) * (1.0 - uReduced);
        return star * tw;
      }

      void main() {
        vec3 rd = normalize(vRay);
        vec3 col = skyFull(rd, uSunDir, uProgress);
        float dawn = (1.0 - actGrey(uProgress));
        float starAmt = dawn * smoothstep(0.12, 0.55, rd.y)
                      * (1.0 - smoothstep(0.0, 0.10, uProgress) * 0.55);
        col += vec3(0.9, 0.93, 1.0) * stars(rd) * starAmt * 0.8;
        // dither against gradient banding
        col += (hash12(gl_FragCoord.xy + uTime) - 0.5) * 0.006;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  mesh.onBeforeRender = (renderer, scene, camera) => {
    mat.uniforms.uCamPos.value.copy(camera.position);
    mat.uniforms.uInvProjView.value
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();
  };

  return mesh;
}
