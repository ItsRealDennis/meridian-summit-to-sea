// ── Distant sister massifs — photographic peaks on the horizon ─
// The AI-reconstructed mountain reads perfectly at range, where its
// texture density outruns the eye. Two of them ride the cloud deck
// and give Act I a world beyond the hero summit. The hero massif
// itself stays procedural — infinite-resolution detail up close,
// and the camera-clearance maths stays analytic.

import * as THREE from 'three';
import { actLambertTextured } from './materials.js';

export function createSummit() {
  const group = new THREE.Group();

  import('../../vendor/GLTFLoader.js')
    .then(({ GLTFLoader }) => new Promise((res, rej) =>
      new GLTFLoader().load('assets/peak.glb', res, undefined, rej)))
    .then((gltf) => {
      const proto = gltf.scene;
      proto.traverse((o) => {
        if (o.isMesh) {
          const map = o.material && o.material.map;
          if (map) o.material = actLambertTextured(map, 1.1);
        }
      });
      const box = new THREE.Box3().setFromObject(proto);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      proto.position.set(-center.x, -box.min.y, -center.z);

      // [x, z, summit height, yaw] — far enough that haze does the grading
      for (const [x, z, h, yaw] of [
        [-2100, -2300, 640, 0.7],
        [2500, -900, 540, 2.4],
        [-3100, 400, 580, 4.1],
      ]) {
        const m = new THREE.Group();
        const inst = proto.clone();
        m.add(inst);
        m.scale.setScalar(h / size.y);
        m.position.set(x, -30, z);
        m.rotation.y = yaw;
        group.add(m);
      }
    })
    .catch(() => { /* the horizon stays empty — the world still holds */ });

  return group;
}
