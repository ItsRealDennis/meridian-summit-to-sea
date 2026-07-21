// ── The photographic mountain ────────────────────────────────
// The hero summit IS the AI-reconstructed peak now: the procedural
// massif ducks into a foothill shelf beneath it (terrain.js), and
// the same mesh echoes as sister massifs on the horizon. When the
// hero lands we rebuild the camera clearance from its real surface
// via a vertex-binned height grid.

import * as THREE from 'three';
import { actLambertTextured, actLambertPeak } from './materials.js';

const HERO_HEIGHT = 470;

export function createSummit(onHeightGrid) {
  const group = new THREE.Group();

  const detail = new THREE.TextureLoader().load('assets/tex-snow.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  });

  import('../../vendor/GLTFLoader.js')
    .then(({ GLTFLoader }) => new Promise((res, rej) =>
      new GLTFLoader().load('assets/peak.glb', res, undefined, rej)))
    .then((gltf) => {
      const proto = gltf.scene;
      const box = new THREE.Box3().setFromObject(proto);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      proto.position.set(-center.x, -box.min.y, -center.z);

      // ── the hero peak ──
      const hero = proto.clone();
      const heroMats = [];
      hero.traverse((o) => {
        if (o.isMesh) {
          const map = o.material && o.material.map;
          if (map) {
            o.material = actLambertPeak(map, detail, 1.1);
            heroMats.push(o.material);
          }
        }
      });
      const hs = HERO_HEIGHT / size.y;
      const heroHolder = new THREE.Group();
      heroHolder.add(hero);
      heroHolder.scale.setScalar(hs);
      heroHolder.position.y = -56; // deep roots — the torn skirt drowns in the shelf
      group.add(heroHolder);
      group.onBeforeRender = () => {};
      hero.traverse((o) => {
        if (o.isMesh) {
          o.onBeforeRender = (r, s, camera) => {
            for (const m of heroMats) m.uniforms.uCamPos.value.copy(camera.position);
          };
        }
      });

      // ── clearance grid from the hero's real surface ──
      const GRID = 96;
      const span = Math.max(size.x, size.z) * hs * 1.04;
      const half = span / 2;
      const grid = new Float32Array(GRID * GRID).fill(-1e3);
      const v = new THREE.Vector3();
      group.updateWorldMatrix(true, true);
      hero.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          o.localToWorld(v);
          const gx = Math.floor(((v.x + half) / span) * (GRID - 1));
          const gz = Math.floor(((v.z + half) / span) * (GRID - 1));
          if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) continue;
          const idx = gz * GRID + gx;
          if (v.y > grid[idx]) grid[idx] = v.y;
        }
      });
      const peakHeight = (x, z) => {
        const gx = Math.floor(((x + half) / span) * (GRID - 1));
        const gz = Math.floor(((z + half) / span) * (GRID - 1));
        if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return -1e3;
        let m = -1e3;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const jx = gx + dx, jz = gz + dz;
            if (jx < 0 || jz < 0 || jx >= GRID || jz >= GRID) continue;
            m = Math.max(m, grid[jz * GRID + jx]);
          }
        return m;
      };
      if (onHeightGrid) onHeightGrid(peakHeight);

      // ── sister massifs on the horizon ──
      for (const [x, z, h, yaw] of [
        [-2100, -2300, 640, 0.7],
        [2500, -900, 540, 2.4],
        [-3100, 400, 580, 4.1],
      ]) {
        const inst = proto.clone();
        inst.traverse((o) => {
          if (o.isMesh) {
            const map = o.material && o.material.map;
            if (map && !(o.material && o.material.name === 'actLambertTex')) {
              o.material = actLambertTextured(map, 1.1);
            }
          }
        });
        const m = new THREE.Group();
        m.add(inst);
        m.scale.setScalar(h / size.y);
        m.position.set(x, -30, z);
        m.rotation.y = yaw;
        group.add(m);
      }
    })
    .catch(() => { /* the procedural shelf stands alone */ });

  return group;
}
