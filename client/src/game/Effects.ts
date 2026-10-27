import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  grow: number;
  gravity: number;
  opacity: number;
  drag: number;
  spin: number;
}

const sphereGeo = new THREE.IcosahedronGeometry(0.5, 1);
const rockGeo = new THREE.IcosahedronGeometry(0.5, 0);
const boxGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
const tracerGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);

const POOL_SIZE = 220;
const tmp = new THREE.Vector3();

/** Pooled particle effects: explosions, smoke, sparks, tracers. */
export class Effects {
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private light = new THREE.PointLight('#ffb347', 0, 30, 1.6);
  private lightLife = 0;
  private flashLight = new THREE.PointLight('#ffd27a', 0, 8, 2);

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({ mesh, mat, vel: new THREE.Vector3(), life: 0, maxLife: 1, startScale: 1, grow: 0, gravity: 0, opacity: 1, drag: 0, spin: 0 });
    }
    scene.add(this.light, this.flashLight);
  }

  /** Bright muzzle flash at a gun barrel (plus a quick light pulse). */
  muzzleFlash(pos: THREE.Vector3, big = false) {
    this.spawn(sphereGeo, pos, new THREE.Vector3(), '#ffd890', { life: 0.05, scale: big ? 0.6 : 0.3, grow: 1.3, additive: true, opacity: 0.6 });
    this.spawn(sphereGeo, pos, new THREE.Vector3(), '#ff9a2e', { life: 0.08, scale: big ? 0.5 : 0.25, grow: 2.5, additive: true, opacity: 0.7 });
    if (big) for (let i = 0; i < 4; i++) this.puff(pos.clone(), '#bdbdbd', 0.3, 0.3);
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = big ? 12 : 5;
  }

  private spawn(
    geo: THREE.BufferGeometry,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    color: THREE.ColorRepresentation,
    o: { life: number; scale: number; grow?: number; gravity?: number; opacity?: number; additive?: boolean; drag?: number; spin?: number },
  ): Particle | null {
    const p = this.pool.pop();
    if (!p) return null;
    p.mesh.geometry = geo;
    p.mesh.position.copy(pos);
    if (geo === ringGeo || geo === tracerGeo) p.mesh.rotation.set(0, 0, 0);
    else p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.mesh.scale.setScalar(o.scale);
    p.mesh.visible = true;
    p.mat.color.set(color);
    p.mat.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.opacity = o.opacity ?? 1;
    p.mat.opacity = p.opacity;
    p.vel.copy(vel);
    p.life = p.maxLife = o.life;
    p.startScale = o.scale;
    p.grow = o.grow ?? 0;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.spin = o.spin ?? 0;
    this.active.push(p);
    return p;
  }

  private randomDir(upBias = 0): THREE.Vector3 {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1 + upBias, Math.random() * 2 - 1);
    return v.normalize();
  }

  explosion(pos: THREE.Vector3, big = false) {
    const k = big ? 1.3 : 1;
    this.spawn(sphereGeo, pos, new THREE.Vector3(), '#ffd9a0', { life: 0.16, scale: 0.9 * k, grow: 2.6, additive: true, opacity: 0.45 });
    for (let i = 0; i < 12 * k; i++) {
      const v = this.randomDir(0.6).multiplyScalar(4 + Math.random() * 6 * k);
      const color = new THREE.Color('#ff6a10').lerp(new THREE.Color('#ffc23a'), Math.random());
      this.spawn(sphereGeo, pos, v, color, { life: 0.35 + Math.random() * 0.3, scale: 0.6 + Math.random() * 0.5, grow: 1, gravity: 2, additive: true, opacity: 0.55, drag: 3 });
    }
    for (let i = 0; i < 5 * k; i++) {
      const v = this.randomDir(1.2).multiplyScalar(1.5 + Math.random() * 2.5);
      const shade = 0.55 + Math.random() * 0.2;
      this.spawn(sphereGeo, tmp.copy(pos).addScaledVector(v, 0.3), v, new THREE.Color(shade, shade, shade), {
        life: 0.6 + Math.random() * 0.4,
        scale: 0.7 + Math.random() * 0.6,
        grow: 2,
        gravity: 1.5,
        opacity: 0.5,
        drag: 1.2,
      });
    }
    this.spawn(ringGeo, tmp.set(pos.x, Math.max(0.05, pos.y - 0.5), pos.z), new THREE.Vector3(), '#ffe2a8', {
      life: 0.4,
      scale: 0.6,
      grow: 9 * k,
      additive: true,
      opacity: 0.8,
    });
    if (big) {
      for (let i = 0; i < 10; i++) {
        const v = this.randomDir(1.5).multiplyScalar(6 + Math.random() * 6);
        this.spawn(boxGeo, pos, v, '#2a2a2e', { life: 1.3, scale: 0.35 + Math.random() * 0.3, gravity: -22, spin: 10 });
      }
    }
    this.light.position.copy(pos).y += 1.5;
    this.light.intensity = big ? 60 : 40;
    this.lightLife = 0.35;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, hit: boolean) {
    const len = from.distanceTo(to);
    const p = this.spawn(tracerGeo, from, new THREE.Vector3(), '#fff07a', { life: 0.07, scale: 1, additive: true });
    if (p) {
      p.mesh.scale.set(1, 1, len);
      p.mesh.lookAt(to);
      p.grow = 0;
      p.startScale = -1; // keep the custom scale
    }
    this.spawn(sphereGeo, from, new THREE.Vector3(), '#ffdf6b', { life: 0.06, scale: 0.6, additive: true });
    for (let i = 0; i < (hit ? 6 : 3); i++) {
      const v = this.randomDir(0.8).multiplyScalar(3 + Math.random() * 4);
      this.spawn(boxGeo, to, v, hit ? '#ffb347' : '#d8d2c2', { life: 0.25, scale: 0.12, gravity: -12 });
    }
  }

  puff(pos: THREE.Vector3, color: THREE.ColorRepresentation = '#bfbfbf', size = 0.35, rise = 1) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, rise * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6);
    this.spawn(sphereGeo, pos, v, color, { life: 0.45 + Math.random() * 0.3, scale: size, grow: 2.5, opacity: 0.35, drag: 1 });
  }

  spark(pos: THREE.Vector3, color: THREE.ColorRepresentation = '#ffb000') {
    const v = this.randomDir(1).multiplyScalar(2 + Math.random() * 3);
    this.spawn(boxGeo, pos, v, color, { life: 0.25 + Math.random() * 0.2, scale: 0.1, gravity: -14, additive: true });
  }

  burst(pos: THREE.Vector3, color: THREE.ColorRepresentation) {
    for (let i = 0; i < 18; i++) {
      const v = this.randomDir(1).multiplyScalar(4 + Math.random() * 3);
      this.spawn(boxGeo, pos, v, color, { life: 0.6, scale: 0.28, gravity: -10, spin: 8, drag: 1 });
    }
    this.spawn(ringGeo, pos, new THREE.Vector3(), color, { life: 0.35, scale: 0.5, grow: 5, additive: true });
  }

  /** Shield sparkle / impact when a hit is blocked */
  blocked(pos: THREE.Vector3) {
    for (let i = 0; i < 10; i++) this.spark(pos, '#7fe7ff');
  }

  dust(pos: THREE.Vector3, color: THREE.ColorRepresentation) {
    for (let i = 0; i < 6; i++) {
      const v = this.randomDir(0.3).multiplyScalar(1 + Math.random() * 2);
      v.y = Math.abs(v.y);
      this.spawn(rockGeo, pos, v, color, { life: 0.6, scale: 0.4, grow: 1.5, opacity: 0.6, drag: 2 });
    }
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.02 && p.gravity < 0) {
        p.mesh.position.y = 0.02;
        p.vel.multiplyScalar(0.4);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      if (p.startScale > 0) p.mesh.scale.setScalar(p.startScale * (1 + p.grow * t));
      if (p.spin) {
        p.mesh.rotation.x += p.spin * dt;
        p.mesh.rotation.y += p.spin * dt * 0.7;
      }
      p.mat.opacity = p.opacity * (1 - t * t);
    }
    this.flashLight.intensity *= Math.exp(-40 * dt);
    if (this.lightLife > 0) {
      this.lightLife -= dt;
      this.light.intensity *= Math.exp(-10 * dt);
      if (this.lightLife <= 0) this.light.intensity = 0;
    }
  }

  clear() {
    for (const p of this.active) {
      p.mesh.visible = false;
      this.pool.push(p);
    }
    this.active = [];
  }
}
