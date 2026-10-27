import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { KART_SCALE, MAX_HP, type WeaponType } from '@kart/shared';
import { mergeStatic, contactShadowTexture } from './geo';
import { buildMount, type Mount } from './WeaponMounts';

/** Chunky cartoon kart with an expressive helmeted driver and animated wheels. */
export class KartModel {
  readonly root = new THREE.Group();
  /** everything that leans/rolls (wheels stay planted) */
  private readonly body = new THREE.Group();
  private readonly scaled = new THREE.Group();
  private readonly frontPivots: THREE.Group[] = [];
  private readonly spinners: THREE.Group[] = [];
  private readonly shield: THREE.Mesh;
  private readonly contactShadow: THREE.Mesh;
  private readonly paint: THREE.MeshPhysicalMaterial;
  private readonly suit: THREE.MeshStandardMaterial;
  private readonly exhaustGlow: THREE.MeshStandardMaterial;
  private readonly mounts = new Map<WeaponType, Mount>();
  private weapon: WeaponType | null = null;
  private mountPop = 1;
  private spinSpeed = 0;
  private recoil = 0;
  private nameplate: THREE.Sprite | null = null;
  private plateCanvas: HTMLCanvasElement | null = null;
  private plateTex: THREE.CanvasTexture | null = null;
  private plateName = '';
  private plateHp = -1;
  private wheelSpin = 0;
  private shieldTime = 0;
  private landing = 0;
  private ownedMaterials=new Set<THREE.Material>();
  private ownedTextures=new Set<THREE.Texture>();

  constructor(color: string, number = 7) {
    this.paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0, clearcoat: 0.3 });
    this.suit = new THREE.MeshStandardMaterial({ color:new THREE.Color(color).multiplyScalar(.75), roughness: 0.9 });
    this.exhaustGlow = new THREE.MeshStandardMaterial({ color: '#ffb52e', emissive: '#ff6a00', emissiveIntensity: 0 });
    const white = new THREE.MeshStandardMaterial({ color: '#fff5dd', roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: '#25354d', roughness: 0.9 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#202a40', roughness: 1 });
    const face = new THREE.MeshStandardMaterial({ color: '#ffcda2', roughness: 1 });
    const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.body.add(mesh);
      return mesh;
    };
    // Oversized tires and broad colored bodywork read clearly across the arena.
    add(new RoundedBoxGeometry(1.52, 0.42, 2.3, 2, 0.15), this.paint, 0, 0.5, 0);
    add(new RoundedBoxGeometry(1.25, 0.38, 0.9, 2, 0.15), this.paint, 0, 0.7, 0.8);
    add(new RoundedBoxGeometry(1.75, 0.22, 0.25, 2, 0.07), white, 0, 0.38, 1.3);
    add(new RoundedBoxGeometry(1.6, 0.2, 0.3, 2, 0.07), dark, 0, 0.38, -1.2);
    add(new THREE.BoxGeometry(0.22, 0.025, 0.95), white, 0, 0.905, 0.75);
    add(new RoundedBoxGeometry(0.75, 0.65, 0.3, 2, 0.1), dark, 0, 0.85, -0.68);
    add(new THREE.CapsuleGeometry(0.23, 0.2, 3, 10), this.suit, 0, 1.04, -0.3);
    const head = add(new THREE.SphereGeometry(0.43, 16, 12), this.paint, 0, 1.57, -0.3);
    head.scale.set(1, 1.08, 1);
    for (const side of [-1, 1]) {
      const ear = add(new THREE.ConeGeometry(0.14, 0.24, 5), this.paint, side * 0.27, 1.98, -0.3);
      ear.rotation.z = -side * 0.22;
    }
    add(new RoundedBoxGeometry(0.1, 0.015, 0.55, 1, 0.02), white, 0, 1.99, -0.3);
    const mask = add(new THREE.SphereGeometry(0.34, 14, 10), face, 0, 1.52, -0.05);
    mask.scale.set(1, 0.8, 0.5);
    for (const side of [-1, 1]) {
      add(new THREE.SphereGeometry(0.12, 10, 8), white, side * 0.14, 1.58, 0.1);
      const pupil = add(new THREE.SphereGeometry(0.066, 8, 6), dark, side * 0.14, 1.57, 0.19);
      pupil.scale.z = 0.5;
      add(new THREE.SphereGeometry(0.018, 6, 4), white, side * 0.14 - 0.014, 1.59, 0.224);
      const arm = add(new THREE.CapsuleGeometry(0.1, 0.3, 2, 8), this.suit, side * 0.25, 1.02, -0.03);
      arm.rotation.x = -0.9;
      add(new THREE.SphereGeometry(0.11, 8, 6), white, side * 0.25, 0.95, 0.2);
      add(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 8).rotateX(Math.PI / 2), this.exhaustGlow, side * 0.45, 0.55, -1.3);
    }
    const smile = add(new THREE.TorusGeometry(0.1, 0.018, 4, 12, Math.PI), dark, 0, 1.43, 0.12);
    smile.rotation.z = Math.PI;
    const steering = add(new THREE.TorusGeometry(0.23, 0.035, 5, 12), dark, 0, 0.96, 0.25);
    steering.rotation.x = -0.7;
    if (number >= 0) {
      const badge = new THREE.MeshBasicMaterial({ map: this.numberTexture(number), transparent: true });
      const plate = add(new THREE.PlaneGeometry(0.4, 0.4), badge, 0, 0.91, 0.72);
      plate.rotation.x = -Math.PI / 2;
    }
    for (const x of [-0.88, 0.88]) for (const z of [-0.8, 0.85]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.38, z);
      const spinner = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.34, 12).rotateZ(Math.PI / 2), rubber);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.355, 10).rotateZ(Math.PI / 2), white);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.38, 8).rotateZ(Math.PI / 2), this.paint);
      spinner.add(tire, rim, hub);
      spinner.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
      pivot.add(spinner);
      this.spinners.push(spinner);
      if (z > 0) this.frontPivots.push(pivot);
      this.scaled.add(pivot);
    }
    const mergedBody = mergeStatic(this.body);
    this.body.clear();
    this.body.add(mergedBody);
    this.scaled.add(this.body);
    this.scaled.scale.setScalar(KART_SCALE);
    this.root.add(this.scaled);
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map:contactShadowTexture(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-9,opacity:.7}));
    this.contactShadow.position.y = 0.02;
    this.root.add(this.contactShadow);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `varying vec3 n; varying vec3 v; void main(){ n=normalMatrix*normal; vec4 p=modelViewMatrix*vec4(position,1.0); v=-p.xyz; gl_Position=projectionMatrix*p; }`,
      fragmentShader: `varying vec3 n; varying vec3 v; void main(){ float rim=pow(1.0-abs(dot(normalize(n),normalize(v))),2.5); gl_FragColor=vec4(vec3(0.25,0.8,1.0),0.025+rim*0.65); #include <colorspace_fragment> }`.replace('#include', '\n#include').replace(' }','\n}'),
    }));
    this.shield.position.y = 0.45;
    this.shield.visible = false;
    this.root.add(this.shield);
    this.root.traverse(o=>{if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>this.ownedMaterials.add(m));});
  }

  private numberTexture(n: number) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f4f4f4';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 76px "Lilita One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.ownedTextures.add(t);
    return t;
  }

  setContactShadow(on: boolean, distance = 0) {
    this.contactShadow.visible = on && distance >= -.1 && distance < .9;
    this.contactShadow.position.y = .025 - Math.max(0,distance);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity = .7 * Math.max(0,1-Math.max(0,distance));
  }
  landed(impact:number) { this.landing=Math.max(this.landing,Math.min(1,impact)); }

  setColor(color: string) {
    this.paint.color.set(color);
    this.suit.color.set(color).multiplyScalar(0.75);
  }

  /** Shows the mount for the held weapon (pops in with a little scale animation). */
  setWeapon(w: WeaponType | null) {
    if (w === this.weapon) return;
    if (this.weapon) this.mounts.get(this.weapon)!.root.visible = false;
    this.weapon = w;
    if (!w) return;
    let mount = this.mounts.get(w);
    if (!mount) {
      mount = buildMount(w, this.paint);
      mount.root.traverse(o=>{if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(!m.userData.shared)this.ownedMaterials.add(m);});});
      this.mounts.set(w, mount);
      this.body.add(mount.root);
    }
    mount.root.visible = true;
    this.mountPop = 0;
  }

  /** Visual kick when this kart fires. */
  fired() {
    this.recoil = 1;
    this.spinSpeed = 30;
  }

  /** World position of the current weapon's muzzle. */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.weapon) return null;
    const m = this.mounts.get(this.weapon);
    if (!m) return null;
    this.root.updateMatrixWorld(true);
    return m.muzzle.getWorldPosition(out);
  }

  setBoostGlow(level: number) {
    this.exhaustGlow.emissiveIntensity = level * 3;
  }

  /** Floating name tag with a health bar (for other players). */
  setNameplate(name: string, hp: number) {
    if (!this.nameplate) {
      this.plateCanvas = document.createElement('canvas');
      this.plateCanvas.width = 256;
      this.plateCanvas.height = 80;
      this.plateTex = new THREE.CanvasTexture(this.plateCanvas);
      this.plateTex.colorSpace = THREE.SRGBColorSpace;
      this.nameplate = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.plateTex, depthTest: false, transparent: true, toneMapped: false }));
      this.ownedMaterials.add(this.nameplate.material);
      this.nameplate.scale.set(1.9, 0.6, 1);
      this.nameplate.position.y = 1.55;
      this.nameplate.renderOrder = 10;
      this.root.add(this.nameplate);
    }
    if (name === this.plateName && hp === this.plateHp) return;
    this.plateName = name;
    this.plateHp = hp;
    const g = this.plateCanvas!.getContext('2d')!;
    g.clearRect(0, 0, 256, 80);
    g.font = '800 30px Nunito, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.strokeText(name, 128, 26);
    g.fillStyle = '#fff';
    g.fillText(name, 128, 26);
    const w = 150;
    const x = 128 - w / 2;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.roundRect(x - 3, 52, w + 6, 18, 9);
    g.fill();
    const frac = Math.max(0, hp) / MAX_HP;
    g.fillStyle = frac > 0.35 ? '#33d17a' : '#ff4d5e';
    g.beginPath();
    g.roundRect(x, 55, Math.max(4, w * frac), 12, 6);
    g.fill();
    this.plateTex!.needsUpdate = true;
  }

  setShield(on: boolean) {
    this.shield.visible = on;
  }

  /**
   * @param speed signed forward speed (m/s), spins the wheels
   * @param steer -1..1, turns the front wheels
   * @param roll body roll in radians
   */
  animate(dt: number, speed: number, steer: number, roll = 0) {
    this.landing*=Math.exp(-9*dt);
    this.body.position.y=-this.landing*.12;
    this.wheelSpin += (speed / (0.33 * KART_SCALE)) * dt;
    for (const s of this.spinners) s.rotation.x = this.wheelSpin;
    for (const p of this.frontPivots) p.rotation.y = THREE.MathUtils.lerp(p.rotation.y, -steer * 0.45, 1 - Math.exp(-12 * dt));
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, roll, 1 - Math.exp(-8 * dt));

    if (this.weapon) {
      const m = this.mounts.get(this.weapon)!;
      this.mountPop = Math.min(1, this.mountPop + dt * 4);
      const s = this.mountPop < 1 ? 1 + Math.sin(this.mountPop * Math.PI) * 0.35 : 1;
      m.root.scale.setScalar(s * Math.min(1, 0.3 + this.mountPop * 2));
      this.spinSpeed *= Math.exp(-3 * dt);
      if (m.spin) {
        m.spin.rotation.z += this.spinSpeed * dt;
        const twin = m.spin.userData.twin as THREE.Object3D | undefined;
        if (twin) twin.rotation.z -= this.spinSpeed * dt;
      }
      this.recoil *= Math.exp(-14 * dt);
      if (m.recoil) m.recoil.position.z = -this.recoil * 0.08 + (this.weapon === 'grenade' ? -0.15 : 0);
    }
    if (this.shield.visible) {
      this.shieldTime += dt;
      this.shield.rotation.y += dt * 0.8;
      this.shield.scale.setScalar(1 + Math.sin(this.shieldTime * 6) * 0.04);
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.plateTex?.dispose();
    const geometries=new Set<THREE.BufferGeometry>();
    this.root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});
    geometries.forEach(g=>g.dispose());
    this.ownedMaterials.forEach(m=>m.dispose());
    this.ownedTextures.forEach(t=>t.dispose());
    this.ownedMaterials.clear();this.ownedTextures.clear();
  }
}
