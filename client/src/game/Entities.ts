import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WEAPONS, type MapDef, type ProjectileKind, type Snapshot } from '@kart/shared';
import { mysteryTexture } from './toon';
import type { Effects } from './Effects';

interface CrateView {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  available: boolean;
  pop: number;
}

interface ProjectileView {
  kind: ProjectileKind;
  mesh: THREE.Group;
  p: THREE.Vector3;
  v: THREE.Vector3;
  recvAt: number;
  trail: number;
}

interface MineView {
  mesh: THREE.Group;
  light: THREE.Mesh;
  phase: number;
}

const crateGeo = new RoundedBoxGeometry(1.05, 1.05, 1.05, 3, 0.12);
const grenadeGeo = new THREE.SphereGeometry(0.11, 14, 10);
const grenadeBand = new THREE.TorusGeometry(0.11, 0.025, 6, 16);
const olive = new THREE.MeshStandardMaterial({ color: '#4b5534', metalness: 0.3, roughness: 0.55 });
const blue = new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: 0.4, metalness: 0.3 });
let crateMat: THREE.MeshPhysicalMaterial | null = null;

const rocketBodyGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.9, 10).rotateX(Math.PI / 2);
const rocketNoseGeo = new THREE.ConeGeometry(0.15, 0.4, 10).rotateX(Math.PI / 2).translate(0, 0, 0.65);
const finGeo = new THREE.BoxGeometry(0.03, 0.32, 0.3).translate(0, 0, -0.35);
const flameGeo = new THREE.ConeGeometry(0.13, 0.6, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.75);
const white = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4, metalness: 0.3 });
const red = new THREE.MeshStandardMaterial({ color: '#e33b3b', roughness: 0.4 });
const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });

const mineBaseGeo = new THREE.CylinderGeometry(0.5, 0.55, 0.18, 16);
const mineDomeGeo = new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const mineLightGeo = new THREE.SphereGeometry(0.09, 10, 8);
const mineRingGeo = new THREE.TorusGeometry(0.52, 0.05, 6, 24).rotateX(Math.PI / 2);
const mineMetal = new THREE.MeshStandardMaterial({ color: '#3a3d46', roughness: 0.4, metalness: 0.7 });

export class Entities {
  private crates: CrateView[] = [];
  private projectiles = new Map<number, ProjectileView>();
  private mines = new Map<number, MineView>();
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly effects: Effects,
    private readonly colorOf: (playerId: string) => string,
  ) {}

  setMap(map: MapDef) {
    this.clear();
    for (const c of this.crates) c.mesh.removeFromParent();
    crateMat ??= new THREE.MeshPhysicalMaterial({ map: mysteryTexture(), roughness: 0.35, clearcoat: 1, emissive: '#ff9f1c', emissiveIntensity: 0.25 });
    this.crates = map.crates.map((c) => {
      const mesh = new THREE.Mesh(crateGeo, crateMat!);
      mesh.castShadow = true;
      const base = new THREE.Vector3(c.x, (c.y ?? 0) + 0.95, c.z);
      mesh.position.copy(base);
      this.scene.add(mesh);
      return { mesh, base, available: true, pop: 1 };
    });
  }

  crateStates(): { x: number; z: number; on: boolean }[] {
    return this.crates.map((c) => ({ x: c.base.x, z: c.base.z, on: c.available }));
  }

  crateWorldPos(i: number): THREE.Vector3 | null {
    return this.crates[i]?.mesh.position.clone() ?? null;
  }

  applySnapshot(s: Snapshot, now: number) {
    // crates
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      const available = s.crates[i] === '1';
      if (available && !c.available) c.pop = 0;
      c.available = available;
    }

    // projectiles
    const seen = new Set<number>();
    for (const r of s.projectiles) {
      seen.add(r.id);
      let view = this.projectiles.get(r.id);
      if (!view) {
        view = { kind: r.k, mesh: this.projectileMesh(r.k), p: new THREE.Vector3(), v: new THREE.Vector3(), recvAt: now, trail: 0 };
        this.scene.add(view.mesh);
        this.projectiles.set(r.id, view);
      }
      view.p.set(r.p[0], r.p[1], r.p[2]);
      view.v.set(r.v[0], r.v[1], r.v[2]);
      view.recvAt = now;
    }
    for (const [id, view] of this.projectiles) {
      if (!seen.has(id)) {
        view.mesh.removeFromParent();
        this.projectiles.delete(id);
      }
    }

    // mines
    const seenMines = new Set<number>();
    for (const m of s.mines) {
      seenMines.add(m.id);
      if (this.mines.has(m.id)) continue;
      const mesh = new THREE.Group();
      const base = new THREE.Mesh(mineBaseGeo, mineMetal);
      base.position.y = 0.09;
      const dome = new THREE.Mesh(mineDomeGeo, mineMetal);
      dome.position.y = 0.18;
      const ring = new THREE.Mesh(mineRingGeo, new THREE.MeshStandardMaterial({ color: this.colorOf(m.owner), roughness: 0.5 }));
      ring.position.y = 0.12;
      const light = new THREE.Mesh(mineLightGeo, new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
      light.position.y = 0.5;
      mesh.add(base, dome, ring, light);
      mesh.traverse((o) => (o.castShadow = true));
      mesh.position.set(m.p[0], m.p[1] + 0.01, m.p[2]);
      this.scene.add(mesh);
      this.mines.set(m.id, { mesh, light, phase: Math.random() * 6 });
    }
    for (const [id, view] of this.mines) {
      if (!seenMines.has(id)) {
        view.mesh.removeFromParent();
        this.mines.delete(id);
      }
    }
  }

  update(dt: number, now: number) {
    this.time += dt;
    for (const c of this.crates) {
      c.mesh.visible = c.available;
      if (!c.available) continue;
      c.pop = Math.min(1, c.pop + dt * 3);
      const s = c.pop < 1 ? THREE.MathUtils.lerp(0.2, 1, 1 - Math.pow(1 - c.pop, 3)) * (1 + Math.sin(c.pop * Math.PI) * 0.2) : 1;
      c.mesh.scale.setScalar(s);
      c.mesh.position.y = c.base.y + Math.sin(this.time * 2 + c.base.x) * 0.18;
      c.mesh.rotation.y += dt * 1.2;
      c.mesh.rotation.x = Math.sin(this.time + c.base.z) * 0.15;
    }

    for (const r of this.projectiles.values()) {
      // Extrapolate from the newest server state (with gravity for grenades).
      const t = Math.min((now - r.recvAt) / 1000, 0.15);
      r.mesh.position.copy(r.p).addScaledVector(r.v, t);
      if (r.kind === 'grenade') {
        r.mesh.position.y = Math.max(0.12, r.mesh.position.y - 0.5 * WEAPONS.grenade.gravity * t * t);
        r.mesh.rotation.x += dt * 14;
        r.mesh.rotation.y += dt * 5;
      } else if (r.v.lengthSq() > 1e-4) {
        r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), r.v.clone().normalize());
      }
      r.trail += dt;
      const every = r.kind === 'grenade' ? 0.05 : 0.016;
      while (r.trail > every) {
        r.trail -= every;
        const back = r.v.clone().normalize().multiplyScalar(r.kind === 'rocket' ? -0.7 : -0.4);
        this.effects.puff(r.mesh.position.clone().add(back), '#d9d9d9', r.kind === 'rocket' ? 0.22 : 0.14, 0.4);
      }
    }

    for (const m of this.mines.values()) {
      m.phase += dt;
      m.light.visible = Math.sin(m.phase * 8) > 0;
    }
  }

  /** One of everything this class can spawn, for shader warm-up. */
  warmupObjects(): THREE.Group {
    const g = new THREE.Group();
    for (const k of ['rocket', 'missile', 'grenade'] as ProjectileKind[]) g.add(this.projectileMesh(k));
    const mine = new THREE.Mesh(mineBaseGeo, mineMetal);
    g.add(mine, new THREE.Mesh(mineLightGeo, new THREE.MeshBasicMaterial({ color: '#ff2a2a' })), new THREE.Mesh(mineRingGeo, new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.5 })));
    g.position.set(0, -50, 0);
    return g;
  }

  private projectileMesh(kind: ProjectileKind): THREE.Group {
    const mesh = new THREE.Group();
    if (kind === 'grenade') {
      mesh.add(new THREE.Mesh(grenadeGeo, olive), new THREE.Mesh(grenadeBand, new THREE.MeshStandardMaterial({ color: '#b58a2a', metalness: 0.9, roughness: 0.3 })));
    } else {
      mesh.add(new THREE.Mesh(rocketBodyGeo, kind === 'missile' ? blue : white), new THREE.Mesh(rocketNoseGeo, red), new THREE.Mesh(flameGeo, flameMat));
      for (let k = 0; k < 4; k++) {
        const fin = new THREE.Mesh(finGeo, red);
        fin.rotation.z = (k * Math.PI) / 2;
        mesh.add(fin);
      }
      if (kind === 'missile') mesh.scale.setScalar(0.65);
    }
    mesh.traverse((o) => (o.castShadow = true));
    return mesh;
  }

  clear() {
    for (const r of this.projectiles.values()) r.mesh.removeFromParent();
    for (const m of this.mines.values()) m.mesh.removeFromParent();
    this.projectiles.clear();
    this.mines.clear();
    for (const c of this.crates) {
      c.available = true;
      c.pop = 1;
    }
  }
}
