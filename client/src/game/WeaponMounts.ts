import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { KART_BALL_RADIUS, KART_SCALE, MUZZLE_OFFSETS, type WeaponType } from '@kart/shared';

const gunmetal = new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.85, roughness: 0.35 });
const black = new THREE.MeshStandardMaterial({ color: '#141518', metalness: 0.5, roughness: 0.45 });
const olive = new THREE.MeshStandardMaterial({ color: '#4b5534', metalness: 0.2, roughness: 0.7 });
const red = new THREE.MeshStandardMaterial({ color: '#c42b25', metalness: 0.3, roughness: 0.4 });
const steel = new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 1, roughness: 0.25 });
const hazard = new THREE.MeshStandardMaterial({ color: '#f2b705', metalness: 0.2, roughness: 0.5 });
const glow = new THREE.MeshStandardMaterial({ color: '#7fe7ff', emissive: '#29c8ff', emissiveIntensity: 1.2, roughness: 0.2 });

[gunmetal,black,olive,red,steel,hazard,glow].forEach(material=>{material.userData.shared=true;});

/** Muzzle position in kart-model space (the model is scaled by KART_SCALE and sits R below the ball centre). */
export function muzzleLocal(w: WeaponType): THREE.Vector3 {
  const [x, y, z] = MUZZLE_OFFSETS[w];
  return new THREE.Vector3(x, y + KART_BALL_RADIUS, z).divideScalar(KART_SCALE);
}

function cyl(r: number, len: number, mat: THREE.Material, segs = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, segs), mat);
  m.rotation.x = Math.PI / 2;
  return m;
}

export interface Mount {
  root: THREE.Group;
  muzzle: THREE.Object3D;
  /** spins while firing (gun barrels / grenade drum) */
  spin?: THREE.Object3D;
  /** kicks back when firing */
  recoil?: THREE.Object3D;
}

export function buildMount(w: WeaponType, paint: THREE.Material): Mount {
  const root = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const m = muzzleLocal(w);
  muzzle.position.copy(m);
  let spin: THREE.Object3D | undefined;
  let recoil: THREE.Object3D | undefined;

  switch (w) {
    case 'gun': {
      // twin rotary guns bolted to the side-pods
      recoil = new THREE.Group();
      spin = new THREE.Group();
      const spinR = new THREE.Group();
      for (const side of [1, -1]) {
        const x = m.x * side;
        const body = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.2, 0.5, 2, 0.05), gunmetal);
        body.position.set(x, m.y, m.z - 0.62);
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.2), black);
        mount.position.set(x, m.y - 0.15, m.z - 0.62);
        const shroud = cyl(0.1, 0.12, black);
        shroud.position.set(x, m.y, m.z - 0.33);
        const ammo = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.16, 0.24, 2, 0.03), olive);
        ammo.position.set(x + side * 0.17, m.y - 0.02, m.z - 0.66);
        recoil.add(body, mount, shroud, ammo);
        const barrels = side === 1 ? spin : spinR;
        barrels.position.set(x, m.y, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const barrel = cyl(0.02, 0.56, steel, 8);
          barrel.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, m.z - 0.3);
          barrels.add(barrel);
        }
        const ring = cyl(0.075, 0.04, black);
        ring.position.set(0, 0, m.z - 0.06);
        barrels.add(ring);
        recoil.add(barrels);
      }
      // both barrel sets spin together
      spin.add(new THREE.Object3D());
      spin.userData.twin = spinR;
      root.add(recoil);
      break;
    }
    case 'rocket': {
      // shoulder-style launcher tube clamped to the right side-pod
      recoil = new THREE.Group();
      const tube = cyl(0.16, 1.15, new THREE.MeshStandardMaterial({ color: '#4d5a3a', metalness: 0.3, roughness: 0.6 }));
      tube.position.set(m.x, m.y, m.z - 0.57);
      const lip = cyl(0.18, 0.08, black);
      lip.position.set(m.x, m.y, m.z - 0.02);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 12).rotateX(Math.PI / 2), red);
      tip.position.set(m.x, m.y, m.z - 0.12);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.18), black);
      sight.position.set(m.x + 0.08, m.y + 0.15, m.z - 0.5);
      recoil.add(tube, lip, tip, sight);
      for (const z of [-0.85, -0.25]) {
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.08), gunmetal);
        clamp.position.set(m.x + 0.2, m.y - 0.13, m.z + z);
        root.add(clamp);
      }
      root.add(recoil);
      break;
    }
    case 'missiles': {
      // three-tube pod on struts above the roll hoop
      recoil = new THREE.Group();
      const pod = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.3, 0.62, 2, 0.05), paint);
      pod.position.set(0, m.y, m.z - 0.33);
      recoil.add(pod);
      for (let i = -1; i <= 1; i++) {
        const hole = cyl(0.075, 0.04, black, 12);
        hole.position.set(i * 0.24, m.y, m.z - 0.01);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 10).rotateX(Math.PI / 2), red);
        tip.position.set(i * 0.24, m.y, m.z - 0.04);
        recoil.add(hole, tip);
      }
      for (const x of [-0.25, 0.25]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), gunmetal);
        strut.position.set(x, m.y - 0.3, m.z - 0.55);
        root.add(strut);
      }
      root.add(recoil);
      break;
    }
    case 'grenade': {
      // revolver-drum launcher on the roll hoop, angled up
      recoil = new THREE.Group();
      spin = new THREE.Group();
      const drum = cyl(0.16, 0.22, gunmetal, 6);
      spin.add(drum);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const round = cyl(0.04, 0.24, olive, 8);
        round.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0);
        spin.add(round);
      }
      spin.position.set(m.x, m.y - 0.08, m.z - 0.55);
      const barrel = cyl(0.075, 0.55, black);
      barrel.position.set(m.x, m.y - 0.02, m.z - 0.28);
      const stock = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.14, 0.32, 2, 0.03), gunmetal);
      stock.position.set(m.x, m.y - 0.12, m.z - 0.85);
      recoil.add(spin, barrel, stock);
      recoil.rotation.x = -0.25;
      recoil.position.set(0, -0.1, -0.15);
      root.add(recoil);
      break;
    }
    case 'mine': {
      const box = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.3, 0.32, 2, 0.04), hazard);
      box.position.set(0, m.y + 0.12, m.z + 0.18);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.02), black);
      slot.position.set(0, m.y + 0.02, m.z + 0.01);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.06, 0.33), black);
      stripe.position.set(0, m.y + 0.2, m.z + 0.18);
      root.add(box, slot, stripe);
      break;
    }
    case 'shield': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 16), gunmetal);
      base.position.set(0, 2.0, -0.8);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glow);
      dome.position.set(0, 2.06, -0.8);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), steel);
      ant.position.set(0.1, 2.3, -0.85);
      root.add(base, dome, ant);
      break;
    }
  }
  root.add(muzzle);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { root, muzzle, spin, recoil };
}
