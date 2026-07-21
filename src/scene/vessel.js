// ── The lone vessel — a bulker riding out the swell ──────────
// Boxes, careful proportions, one patient light. She samples the
// same Gerstner set as the ocean shader, so she sits in the sea,
// not on it.

import * as THREE from 'three';
import { uniforms, VESSEL } from '../config.js';
import { ATMO_GLSL } from '../shaders/chunks.js';
import { waveSample } from './ocean.js';

const VESSEL_POS = VESSEL.pos;
const YAW = VESSEL.yaw;

import { actLambertTextured } from './materials.js';

const shipMatTextured = actLambertTextured;

function shipMat(hex, mult = 1) {
  return new THREE.ShaderMaterial({
    name: 'ship',
    uniforms: {
      uProgress: uniforms.uProgress,
      uSunDir: uniforms.uSunDir,
      uColor: { value: new THREE.Color(hex).multiplyScalar(mult) },
    },
    vertexShader: /* glsl */`
      varying vec3 vN;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uProgress;
      uniform vec3 uSunDir, uColor;
      varying vec3 vN;
      ${ATMO_GLSL}
      void main() {
        vec3 n = normalize(vN);
        float grey = actGrey(uProgress), mar = actMarine(uProgress);
        float sunAmt = (1.0 - grey * 0.85) * (1.0 - mar);
        vec3 sunCol = mix(vec3(1.25, 0.85, 0.6), vec3(0.7), grey) * 1.5;
        float diff = max(0.0, (dot(n, uSunDir) + 0.3) / 1.3);
        vec3 amb = mix(horizonCol(uProgress), zenithCol(uProgress), n.y * 0.5 + 0.5) * 0.6;
        gl_FragColor = vec4(uColor * (amb + sunCol * diff * (0.2 + 0.8 * sunAmt)), 1.0);
      }
    `,
  });
}

export function createVessel() {
  const group = new THREE.Group();
  const hullMat = shipMat('#171b20');
  const deckMat = shipMat('#232930');
  const hatchMat = shipMat('#4e2f24');
  const castleMat = shipMat('#5e666b');
  const darkMat = shipMat('#0e1114');

  // hull with a tapered bow (verts pulled toward the stem)
  const hull = new THREE.BoxGeometry(76, 5.4, 13, 10, 1, 1);
  const hp = hull.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i);
    const t = THREE.MathUtils.smoothstep(x, 12, 38);      // bow section
    hp.setZ(i, hp.getZ(i) * (1 - t * 0.94));
    hp.setY(i, hp.getY(i) + t * t * 1.1);                 // sheer rise
    const s = THREE.MathUtils.smoothstep(-x, 30, 38);     // stern tuck
    hp.setZ(i, hp.getZ(i) * (1 - s * 0.3));
  }
  hull.computeVertexNormals();
  const hullMesh = new THREE.Mesh(hull, hullMat);
  hullMesh.position.y = 1.4;
  group.add(hullMesh);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 12.4), deckMat);
  deck.position.set(-4, 4.2, 0);
  group.add(deck);

  for (let i = 0; i < 5; i++) {
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(10.6, 1.1, 9.4), hatchMat);
    hatch.position.set(22 - i * 11.5, 4.9, 0);
    group.add(hatch);
  }

  // accommodation castle aft + bridge
  const castle = new THREE.Mesh(new THREE.BoxGeometry(7, 8.5, 9.6), castleMat);
  castle.position.set(-30, 8.4, 0);
  group.add(castle);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.6, 12.6), castleMat);
  bridge.position.set(-30, 12.2, 0);
  group.add(bridge);
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 2.2), darkMat);
  funnel.position.set(-34.5, 14.2, 0);
  group.add(funnel);

  // masts
  const mastGeo = new THREE.CylinderGeometry(0.14, 0.2, 9, 5);
  const mastF = new THREE.Mesh(mastGeo, darkMat);
  mastF.position.set(34, 8.5, 0);
  group.add(mastF);
  const mastA = new THREE.Mesh(mastGeo, darkMat);
  mastA.position.set(-30, 17.4, 0);
  mastA.scale.setScalar(0.66);
  group.add(mastA);

  // one patient anchor light
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([46, 20, 0]), 3));
  const lightMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uReduced: uniforms.uReduced },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uReduced;
      varying float vPulse;
      void main() {
        vPulse = mix(0.55 + 0.45 * sin(uTime * 2.1), 0.8, uReduced);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(340.0 / -mv.z, 2.0, 9.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vPulse;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * vPulse, a * a * 0.9);
      }
    `,
  });
  group.add(new THREE.Points(lightGeo, lightMat));

  group.position.copy(VESSEL_POS);
  group.rotation.y = YAW;

  // Progressive enhancement: a photogrammetry-grade hull streams in
  // behind the loader and replaces the boxes. If anything fails, the
  // procedural silhouette simply stays.
  const boxes = [...group.children];
  import('../../vendor/GLTFLoader.js')
    .then(({ GLTFLoader }) => new Promise((res, rej) =>
      new GLTFLoader().load('assets/vessel.glb', res, undefined, rej)))
    .then((gltf) => {
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = VESSEL.length / Math.max(size.x, size.z);
      root.traverse((o) => {
        if (o.isMesh) {
          const map = o.material && o.material.map;
          o.material = map ? shipMatTextured(map) : shipMat('#1a1e23');
        }
      });
      const holder = new THREE.Group();
      root.position.copy(center).multiplyScalar(-1);
      holder.add(root);
      holder.scale.setScalar(s);
      holder.rotation.y = Math.PI;                  // bow to +x
      holder.position.y = size.y * s * 0.5 - 3.6;   // laden draft
      group.add(holder);
      boxes.forEach((m) => { if (m.isMesh) group.remove(m); });

      // sister ships on the horizon — the fleet is real
      const parent = group.parent;
      if (parent) {
        group.userData.sisters = [];
        for (const [x, z, sc, yaw] of [[-420, -2250, 0.62, 0.4], [330, -2650, 0.74, 1.9]]) {
          const sister = holder.clone();
          const g2 = new THREE.Group();
          g2.add(sister);
          sister.scale.setScalar(s * sc);
          sister.position.y = holder.position.y * sc;
          g2.position.set(x, 0, z);
          g2.rotation.y = yaw;
          g2.visible = false;
          parent.add(g2);
          group.userData.sisters.push(g2);
        }
      }
    })
    .catch(() => { /* the boxes stand watch */ });

  // buoyancy — three sample points → heave, pitch, roll
  const sm = { y: 0, px: 0, rz: 0 };
  group.userData.update = (t, reduced) => {
    const tt = t * (reduced ? 0.28 : 1);
    const cos = Math.cos(YAW), sin = Math.sin(YAW);
    const px = VESSEL_POS.x, pz = VESSEL_POS.z;
    const bow = waveSample(px + cos * 45, pz - sin * 45, tt);
    const aft = waveSample(px - cos * 45, pz + sin * 45, tt);
    const mid = waveSample(px, pz, tt);
    const k = 0.055; // inertia — a laden ship answers slowly
    sm.y += ((bow.y + aft.y + mid.y * 2) / 4 - sm.y) * k;
    sm.px += (Math.atan2(aft.y - bow.y, 90) * 0.8 - sm.px) * k;
    sm.rz += (mid.nx * 0.35 - sm.rz) * k;
    group.position.y = sm.y * 0.7 - 1.7;
    group.rotation.z = sm.px;
    group.rotation.x = sm.rz;
  };

  return group;
}
