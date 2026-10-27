import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng, hashString, propCollider, wallBoxes, type BoxDef, type DecalDef, type MapDef, type PropDef, type RampDef } from '@kart/shared';
import { InstanceBatch, contactShadowTexture, boostTexture, jitter, merge, mergeStatic, rippleNormalTexture, wedgeGeometry, worldBox, worldDisc, worldPlane, worldUV } from './geo';
import { surface, type TexId } from './Textures';
import { crosswalkTexture, lightPoolTexture, mat, neonSignTexture, panelTexture, tex, windowGlowTexture, windowTexture } from './toon';

export type Surface = 'ice' | 'boost' | 'water' | 'lava' | null;

const NEON = ['#ff2bd6', '#2bf0ff', '#ffb02b', '#8a5bff', '#39ff7a'];

function mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, cast = true) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}

const darker = (c: string, k = 0.8) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();

export class WorldBuilder {
  readonly group = new THREE.Group();
  private readonly body: RAPIER.RigidBody;
  private readonly batch = new InstanceBatch();
  private readonly night: boolean;
  private boostMat: THREE.MeshStandardMaterial | null = null;
  private lavaMat: THREE.MeshStandardMaterial | null = null;
  private waterMat: THREE.MeshStandardMaterial | null = null;
  private time = 0;

  constructor(
    readonly map: MapDef,
    private readonly physics: RAPIER.World,
  ) {
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.night = map.theme.mood === 'night' || map.theme.mood === 'space';
  }

  build() {
    this.ground();
    this.decals();
    this.walls();
    this.batch.define('contact-shadow', new THREE.PlaneGeometry(1,1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map:contactShadowTexture(),transparent:true,depthWrite:false,opacity:.5,polygonOffset:true,polygonOffsetFactor:-7}), false);
    for (const b of this.map.boxes) {
      if (!b.hidden) this.batch.place('contact-shadow', b.x, 0.06, b.z, 0, new THREE.Vector3(b.w + 2, 1, b.d + 2));
      const y = b.y ?? 0;
      this.collider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, y + b.h / 2, b.z));
      if (!b.hidden) this.box(b);
    }
    for (const r of this.map.ramps) this.ramp(r);
    for (const p of this.map.props) {
      const c = propCollider(p);
      if (c.r > 0) this.collider(RAPIER.ColliderDesc.cylinder(c.h / 2, c.r).setTranslation(p.x, (p.y ?? 0) + c.h / 2, p.z));
      this.prop(p);
    }
    this.backdrop();
    const merged = mergeStatic(this.group);
    this.group.clear();
    this.group.add(merged, this.batch.build());
  }

  dispose() {
    this.physics.removeRigidBody(this.body);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.group.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      geometries.add(o.geometry);
      for(const material of Array.isArray(o.material)?o.material:[o.material])if(!material.userData.shared){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture&&(!value.userData.shared||value.userData.sharedOwner!==value.uuid))textures.add(value);}
      if(o instanceof THREE.InstancedMesh)o.dispose();
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    this.group.clear();
  }

  update(dt: number) {
    this.time += dt;
    if (this.boostMat?.map) this.boostMat.map.offset.y = -this.time * 1.6;
    if (this.waterMat?.normalMap) this.waterMat.normalMap.offset.set(this.time * 0.02, this.time * 0.013);
    if (this.lavaMat?.map) {
      this.lavaMat.map.offset.set(this.time * 0.05, this.time * 0.03);
      this.lavaMat.emissiveIntensity = 0.32 + Math.sin(this.time * 2.2) * 0.05;
    }
  }

  surfaceAt(x: number, z: number): { kind: Surface; dir?: number } {
    const inside = (d: DecalDef, pad = 0) =>
      d.r !== undefined
        ? d.w !== undefined
          ? Math.hypot(x - d.x, z - d.z) < d.r - pad && Math.hypot(x - d.x, z - d.z) > d.r - d.w + pad
          : Math.hypot(x - d.x, z - d.z) < d.r - pad
        : Math.abs(x - d.x) < d.w! / 2 - pad && Math.abs(z - d.z) < d.d! / 2 - pad;
    const onBridge = this.map.decals.some((d) => d.kind === 'bridgepath' && inside(d));
    if (!onBridge && this.map.decals.some((d) => d.kind === 'lava' && inside(d, 0.3))) return { kind: 'lava' };
    for (const d of this.map.decals) {
      if (d.kind === 'boost' && inside(d)) return { kind: 'boost', dir: d.rot ?? 0 };
      if (d.kind === 'pond' && inside(d)) return { kind: 'ice' };
      if (d.kind === 'water' && !onBridge && inside(d)) return { kind: 'water' };
    }
    return { kind: null };
  }

  private collider(desc: RAPIER.ColliderDesc) {
    this.physics.createCollider(desc.setFriction(0).setRestitution(0), this.body);
  }

  private add(o: THREE.Object3D) {
    this.group.add(o);
    return o;
  }

  private define(key: string, make: () => THREE.Object3D) {
    if (!this.batch.has(key)) this.batch.defineFrom(key, make());
    return key;
  }

  // ------------------------------------------------------------ ground & surfaces

  private ground() {
    const { half, theme } = this.map;
    const e = half + 4;
    const groundMat = surface(theme.ground as TexId, theme.groundTile, theme.groundTint);
    const water = new Set(theme.water ?? []);
    const L = 700;
    const rects: [number, number, number, number][] = [[-e, -e, e, e]];
    if (!water.has('n')) rects.push([-L, -L, L, -e]);
    if (!water.has('s')) rects.push([-L, e, L, L]);
    if (!water.has('w')) rects.push([-L, -e, -e, e]);
    if (!water.has('e')) rects.push([e, -e, L, e]);
    for (const [x0, z0, x1, z1] of rects) this.add(mesh(worldPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2), groundMat, 0, 0, 0, false));
    this.collider(RAPIER.ColliderDesc.cuboid(half + 60, 0.5, half + 60).setTranslation(0, -0.5, 0));

    if (water.size) {
      const sea = mesh(worldPlane(2000, 2000), this.waterMaterial(), 0, -0.8, 0, false);
      sea.userData.dynamic = true;
      this.add(sea);
      for (const side of water) {
        const alongX = side === 'n' || side === 's';
        const s = side === 'n' || side === 'w' ? -1 : 1;
        this.add(mesh(worldBox(alongX ? 2 * e + 2 : 1, 2.2, alongX ? 1 : 2 * e + 2), surface('concrete_wall_007', 2.5, '#8d8d8d'), alongX ? 0 : s * (e + 0.5), -1.1, alongX ? s * (e + 0.5) : 0, false));
      }
    }
  }

  private waterMaterial() {
    if (!this.waterMat) {
      const n = rippleNormalTexture();
      n.repeat.set(0.08, 0.08);
      const storm = this.map.theme.mood === 'storm';
      this.waterMat = new THREE.MeshStandardMaterial({
        color: storm ? '#1d2a33' : this.map.theme.backdrop === 'jungle' ? '#3d7a64' : '#2a6f8f',
        roughness: 0.08,
        metalness: 0.1,
        normalMap: n,
        normalScale: new THREE.Vector2(0.5, 0.5),
      });
    }
    return this.waterMat;
  }

  private decals() {
    const night = this.night;
    const layers: Partial<Record<DecalDef['kind'], { mat: THREE.Material; y: number }>> = {
      sidewalk: { mat: surface('concrete_pavement', 2.2, night ? '#7d808a' : '#c9c5bc'), y: 0.012 },
      road: { mat: surface('asphalt_02', 6, night ? '#5d606a' : '#9a9a9a', { rough: night ? 0.55 : 0.9 }), y: 0.02 },
      parking: { mat: surface('asphalt_02', 6, '#8a8a8a'), y: 0.02 },
      plaza: { mat: this.map.theme.backdrop === 'stadium' ? mat('#85cbd4') : surface('concrete_pavement', 2.5, '#b8b2a6'), y: 0.025 },
      path: { mat: this.map.theme.backdrop==='stadium' ? surface('concrete_pavement',2.5,'#c2c8b0') : surface(this.map.theme.ground as TexId, this.map.theme.groundTile, darker(this.map.theme.groundTint, 0.8)), y: 0.015 },
      bridgepath: { mat: surface('castle_brick_01', 2, '#9a958c'), y: 0.06 },
    };
    const groups = new Map<string, THREE.BufferGeometry[]>();
    for (const d of this.map.decals) {
      const spec = layers[d.kind];
      if (!spec) continue;
      const g = d.r ? worldDisc(d.r, d.x, d.z) : worldPlane(d.w!, d.d!).rotateY(d.rot??0).translate(d.x,0,d.z);
      g.translate(0, spec.y, 0);
      let list = groups.get(d.kind);
      if (!list) groups.set(d.kind, (list = []));
      list.push(g);
    }
    for (const [k, list] of groups) {
      const m = layers[k as DecalDef['kind']]!.mat as THREE.MeshStandardMaterial;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      this.add(mesh(merge(list), m, 0, 0, 0, false));
    }

    // road markings (dashes break at junctions)
    const dash = mat('#e8e4d6', { rough: 0.6 });
    dash.polygonOffset = true;
    dash.polygonOffsetFactor = -6;
    this.batch.define('dash', new THREE.PlaneGeometry(0.16, 2.4).rotateX(-Math.PI / 2), dash, false);
    for (const d of this.map.decals) {
      if (d.kind !== 'road' || !d.w || !d.d) continue;
      const alongX = d.w > d.d;
      const len = alongX ? d.w : d.d;
      for (let t = -len / 2 + 2; t < len / 2 - 1; t += 5) {
        const x = alongX ? d.x + t : d.x;
        const z = alongX ? d.z : d.z + t;
        const onOther = this.map.decals.some((o) => o !== d && o.kind === 'road' && o.w && o.d && Math.abs(x - o.x) < o.w / 2 + 1 && Math.abs(z - o.z) < o.d / 2 + 1);
        if (!onOther) this.batch.place('dash', x, 0.035, z, alongX ? Math.PI / 2 : 0);
      }
    }

    for (const d of this.map.decals) {
      switch (d.kind) {
        case 'track': {
          if (!d.r || !d.w) break;
          const trackMat = mat('#385675');
          trackMat.polygonOffset = true;
          trackMat.polygonOffsetFactor = -8;
          trackMat.polygonOffsetUnits = -8;
          const track = mesh(new THREE.RingGeometry(d.r - d.w, d.r, 64).rotateX(-Math.PI / 2), trackMat, d.x, 0.12, d.z, false);
          this.add(track);
          for (let i = 0; i < 40; i++) {
            const a = i * Math.PI / 20;
            const radius = d.r - d.w / 2;
            const stripeMat = mat('#fff5dd');
            stripeMat.polygonOffset = true;
            stripeMat.polygonOffsetFactor = -10;
            stripeMat.polygonOffsetUnits = -10;
            const stripe = mesh(new THREE.BoxGeometry(0.18, 0.015, 0.8), stripeMat, d.x + Math.sin(a) * radius, 0.14, d.z + Math.cos(a) * radius, false);
            stripe.rotation.y = a;
            this.add(stripe);
          }
          break;
        }
        case 'crosswalk': {
          const t = crosswalkTexture().clone();
          const along = (d.w ?? 1) > (d.d ?? 1);
          t.repeat.set(Math.max(1, Math.round((along ? d.w! : d.d!) / 2)), 1);
          t.needsUpdate = true;
          const m = mesh(new THREE.PlaneGeometry(along ? d.w! : d.d!, along ? d.d! : d.w!).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -6 }), d.x, 0.04, d.z, false);
          if (!along) m.rotation.y = Math.PI / 2;
          m.userData.dynamic = true;
          this.add(m);
          break;
        }
        case 'puddle': {
          const m = mesh(worldDisc(d.r ?? 1.5, d.x, d.z).translate(0, 0.03, 0), new THREE.MeshStandardMaterial({ color: '#2a2f37', roughness: 0.05, metalness: 0.55, polygonOffset: true, polygonOffsetFactor: -5 }), 0, 0, 0, false);
          this.add(m);
          break;
        }
        case 'water': {
          const g = d.r ? worldDisc(d.r, d.x, d.z) : worldPlane(d.w!, d.d!).rotateY(d.rot??0).translate(d.x,0,d.z);
          const m = mesh(g.translate(0, 0.05, 0), this.waterMaterial(), 0, 0, 0, false);
          m.userData.dynamic = true;
          this.add(m);
          break;
        }
        case 'lava': {
          if (!this.lavaMat) {
            const c = document.createElement('canvas');
            c.width = c.height = 256;
            const g = c.getContext('2d')!;
            const rr = rng(77);
            g.fillStyle = '#ff5a00';
            g.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 70; i++) {
              const gx = rr() * 256;
              const gy = rr() * 256;
              const rad = 10 + rr() * 30;
              const grad = g.createRadialGradient(gx, gy, 0, gx, gy, rad);
              grad.addColorStop(0, rr() > 0.5 ? '#ffe066' : '#ffb000');
              grad.addColorStop(1, 'rgba(255,90,0,0)');
              g.fillStyle = grad;
              g.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
            }
            g.strokeStyle = 'rgba(40,8,0,0.7)';
            g.lineWidth = 6;
            for (let i = 0; i < 26; i++) {
              g.beginPath();
              g.arc(rr() * 256, rr() * 256, 8 + rr() * 22, 0, Math.PI * 1.3);
              g.stroke();
            }
            const t = tex(c);
            t.repeat.set(0.12, 0.12);
            this.lavaMat = new THREE.MeshStandardMaterial({ map: t, color: '#9a9a9a', emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.32, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 });
          }
          let geo: THREE.BufferGeometry;
          if (d.r && d.w) geo = new THREE.RingGeometry(d.r - d.w, d.r, 64);
          else if (d.r) geo = new THREE.CircleGeometry(d.r, 48);
          else geo = new THREE.PlaneGeometry(d.w!, d.d!);
          geo.rotateX(-Math.PI / 2);
          const pos = geo.attributes.position as THREE.BufferAttribute;
          const uv = geo.attributes.uv as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + d.x, pos.getZ(i) + d.z);
          const m = mesh(geo, this.lavaMat, d.x, 0.04, d.z, false);
          m.userData.dynamic = true;
          this.add(m);
          break;
        }
        case 'glow': {
          this.add(mesh(new THREE.PlaneGeometry(d.w!, d.d!).rotateX(-Math.PI / 2), mat('#5ff3ff', { emissive: '#3fe6ff', emissiveIntensity: 0.3 }), d.x, 0.03, d.z, false));
          break;
        }
        case 'boost': {
          if (!this.boostMat) {
            const map = boostTexture();
            this.boostMat = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4 });
          }
          const m = mesh(new THREE.PlaneGeometry(d.w!, d.d!).rotateX(-Math.PI / 2), this.boostMat, d.x, 0.04, d.z, false);
          m.rotation.y = (d.rot ?? 0) + Math.PI;
          m.userData.dynamic = true;
          this.add(m);
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------ walls

  private walls() {
    for (const w of wallBoxes(this.map)) this.collider(RAPIER.ColliderDesc.cuboid(w.w / 2, w.h / 2, w.d / 2).setTranslation(w.x, w.h / 2, w.z));
    const { half, theme } = this.map;
    const e = half + 0.6;
    const water = new Set(theme.water ?? []);
    for (const side of ['n', 's', 'w', 'e'] as const) {
      const style = water.has(side) ? 'rail' : theme.wall;
      const alongX = side === 'n' || side === 's';
      const s = side === 'n' || side === 'w' ? -1 : 1;
      const len = 2 * e;
      const cx = alongX ? 0 : s * e;
      const cz = alongX ? s * e : 0;
      const yaw = alongX ? 0 : Math.PI / 2;
      const at = (t: number): [number, number] => (alongX ? [-e + t, cz] : [cx, -e + t]);
      switch (style) {
        case 'concrete': {
          const key = this.define('jersey', () => {
            const g = new THREE.Group();
            const shape = new THREE.Shape();
            shape.moveTo(-0.4, 0);
            shape.lineTo(0.4, 0);
            shape.lineTo(0.18, 0.3);
            shape.lineTo(0.12, 1.0);
            shape.lineTo(-0.12, 1.0);
            shape.lineTo(-0.18, 0.3);
            shape.closePath();
            const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.9, bevelEnabled: false }).translate(0, 0, -1.45).rotateY(Math.PI / 2);
            g.add(mesh(worldUV(geo), surface('concrete_wall_007', 2, '#a8a8a8')));
            g.add(mesh(new THREE.BoxGeometry(2.9, 0.12, 0.27).translate(0, 0.7, 0), mat('#d9a520', { rough: 0.6 })));
            return g;
          });
          for (let t = 1.5; t < len; t += 3) {
            const [x, z] = at(t);
            this.batch.place(key, x, 0, z, yaw);
          }
          break;
        }
        case 'rock': {
          for (let t = 0; t < len; t += 3) {
            const [x, z] = at(t);
            this.rock(x, z, t * 1.7, 1.8 + Math.sin(t * 3) * 0.5, Math.floor(t) % 3, 'cliff_side');
          }
          break;
        }
        case 'stone': {
          this.add(mesh(worldBox(alongX ? len : 1.2, 1.6, alongX ? 1.2 : len), surface('castle_brick_01', 2, '#8f9a7c'), cx, 0.8, cz));
          break;
        }
        case 'metal': {
          const p = panelTexture('#8e99ad').clone();
          p.repeat.set(len / 3, 1);
          p.needsUpdate = true;
          const pm = new THREE.MeshStandardMaterial({ map: p, roughness: 0.7, metalness: 0.1 });
          this.add(mesh(new THREE.BoxGeometry(alongX ? len : 0.8, 1.6, alongX ? 0.8 : len), alongX ? [mat('#6d7890'), mat('#6d7890'), mat('#9aa5ba'), mat('#9aa5ba'), pm, pm] : [pm, pm, mat('#9aa5ba'), mat('#9aa5ba'), mat('#6d7890'), mat('#6d7890')], cx, 0.8, cz));
          break;
        }
        case 'fence':
        case 'rail': {
          const post = this.define(`post${style}`, () => mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8).translate(0, 0.65, 0), mat('#7b828c', { metal: 0.7, rough: 0.35 })));
          const rail = this.define(`rail${style}`, () => mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6).rotateZ(Math.PI / 2), mat('#9aa1aa', { metal: 0.7, rough: 0.35 })));
          for (let t = 0; t <= len; t += 2.5) {
            const [x, z] = at(t);
            this.batch.place(post, x, 0, z, yaw);
            const [mx, mz] = at(t + 1.25);
            for (const y of [0.55, 1.15]) this.batch.place(rail, mx, y, mz, yaw, new THREE.Vector3(2.5, 1, 1));
          }
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ boxes

  private box(b: BoxDef) {
    const y0 = b.y ?? 0;
    const cy = y0 + b.h / 2;
    const r = rng(hashString(`${this.map.id}:${b.x},${b.z},${y0}`));
    switch (b.kind) {
      case 'building':
        return this.building(b, r);
      case 'platform': {
        const side = surface('concrete_wall_007', 2.5, b.color ?? '#8a8a8a');
        const top = surface('concrete_floor_02', 4, '#9a9a9a');
        this.add(mesh(worldBox(b.w, b.h, b.d, new THREE.Vector3(b.x, y0, b.z)), [side, side, top, side, side, side], b.x, cy, b.z));
        // yellow safety edge
        for (const [w, d, px, pz] of [
          [b.w, 0.3, 0, b.d / 2 - 0.15],
          [b.w, 0.3, 0, -b.d / 2 + 0.15],
          [0.3, b.d, b.w / 2 - 0.15, 0],
          [0.3, b.d, -b.w / 2 + 0.15, 0],
        ]) {
          this.add(mesh(new THREE.BoxGeometry(w, 0.04, d), mat('#d9a520', { rough: 0.6 }), b.x + px, y0 + b.h + 0.02, b.z + pz, false));
        }
        return;
      }
      case 'bridge': {
        const wood = this.map.theme.backdrop === 'canyon';
        const deck = wood ? surface('weathered_planks', 1.5, '#b08060') : surface('concrete_floor_02', 3, b.color ?? '#7a7a80');
        this.add(mesh(worldBox(b.w, b.h, b.d, new THREE.Vector3(b.x, y0, b.z)), deck, b.x, cy, b.z));
        const along = b.w >= b.d;
        const len = along ? b.w : b.d;
        const postMat = wood ? surface('weathered_planks', 1, '#8a6040') : mat('#8f969f', { metal: 0.6, rough: 0.35 });
        for (const s of [-1, 1]) {
          for (let t = -len / 2 + 0.3; t <= len / 2; t += 2.4) {
            this.add(mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), postMat, along ? b.x + t : b.x + s * (b.w / 2 - 0.1), y0 + b.h + 0.45, along ? b.z + s * (b.d / 2 - 0.1) : b.z + t));
          }
          const railGeo = wood ? new THREE.CylinderGeometry(0.035, 0.035, len, 6) : new THREE.BoxGeometry(0.08, 0.08, len);
          if (wood) railGeo.rotateX(Math.PI / 2);
          const rail = mesh(railGeo, wood ? mat('#c8a878', { rough: 1 }) : postMat, along ? b.x : b.x + s * (b.w / 2 - 0.1), y0 + b.h + 0.85, along ? b.z + s * (b.d / 2 - 0.1) : b.z);
          if (along) rail.rotation.y = Math.PI / 2;
          this.add(rail);
        }
        return;
      }
      case 'block':
        this.add(mesh(new RoundedBoxGeometry(b.w, b.h, b.d, 2, 0.12), surface('concrete_wall_007', 2, '#a8a8a8'), b.x, cy, b.z));
        return;
      case 'car':
        return this.car(b);
      case 'container':
        this.add(mesh(worldBox(b.w, b.h, b.d, new THREE.Vector3(b.x, y0, b.z)), surface('container_side', 2.6, b.color ?? '#8c2f27', { rough: 0.65, metal: 0.12 }), b.x, cy, b.z));
        return;
      case 'warehouse': {
        const lowH = 3;
        this.add(mesh(worldBox(b.w, lowH, b.d, new THREE.Vector3(b.x, 0, b.z)), surface('concrete_wall_007', 3, '#9a9a96'), b.x, lowH / 2, b.z));
        const clad = surface('corrugated_iron', 3, b.color ?? '#a3acb2', { metal: 0.15, rough: 0.6 });
        this.add(mesh(worldBox(b.w, b.h - lowH, b.d, new THREE.Vector3(b.x, lowH, b.z)), [clad, clad, surface('corrugated_iron', 3, '#5e666c'), clad, clad, clad], b.x, lowH + (b.h - lowH) / 2, b.z));
        for (const s of [-1, 1]) this.add(mesh(worldBox(6, 5, 0.2), surface('rusty_painted_metal', 2, '#8b9aa5'), b.x, 2.5, b.z + s * (b.d / 2 + 0.08)));
        this.add(mesh(new THREE.BoxGeometry(1.2, 0.3, 0.2), mat('#fff3c4', { emissive: '#ffe9a8', emissiveIntensity: 0.9 }), b.x, 5.6, b.z - b.d / 2 - 0.15, false));
        return;
      }
      case 'steel':
        this.add(mesh(worldBox(b.w, b.h, b.d), surface('metal_plate', 2, '#c99a20'), b.x, cy, b.z));
        return;
      case 'rock': {
        const geo = new THREE.BoxGeometry(b.w, b.h, b.d, Math.ceil(b.w / 2.5), Math.ceil(b.h / 2), Math.ceil(b.d / 2.5));
        // keep the top flat so it can be driven on
        const pos = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          if (pos.getY(i) > b.h / 2 - 0.01) continue;
          const k = Math.sin(pos.getX(i) * 3.1 + pos.getY(i) * 1.7 + pos.getZ(i) * 2.3) * 0.45;
          pos.setXYZ(i, pos.getX(i) * (1 + k * 0.08), pos.getY(i), pos.getZ(i) * (1 + k * 0.08));
        }
        worldUV(geo, new THREE.Vector3(b.x, 0, b.z));
        const side = surface('cliff_side', 6, '#c9a588');
        this.add(mesh(geo, [side, side, surface('coast_sand_01', 5, '#e0c4a4'), side, side, side], b.x, cy, b.z));
        return;
      }
      case 'ruin': {
        const tint = this.map.theme.backdrop === 'jungle' ? '#a8b894' : '#e2c094';
        const geo = new THREE.BoxGeometry(b.w, b.h, b.d, Math.ceil(b.w), 2, Math.ceil(b.d));
        // broken, uneven top edge (only on thin walls; temple steps stay flat)
        if (Math.min(b.w, b.d) < 3) {
          const pos = geo.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++) if (pos.getY(i) > b.h / 2 - 0.01) pos.setY(i, pos.getY(i) - Math.abs(Math.sin(pos.getX(i) * 1.3 + pos.getZ(i) * 0.9)) * b.h * 0.35);
        }
        worldUV(geo, new THREE.Vector3(b.x, y0, b.z));
        this.add(mesh(geo, surface((b.mat as TexId) ?? 'sandstone_blocks_05', 2, tint), b.x, cy, b.z));
        return;
      }
      case 'pillar': {
        const stone = this.map.theme.mood === 'volcanic' ? surface('rock_face', 3, '#6a4a40') : surface('castle_brick_01', 1.5, b.color ?? '#9a9a8a');
        const geo = new THREE.CylinderGeometry(b.w * 0.42, b.w * 0.5, b.h, 8, 3);
        if (this.map.theme.mood === 'volcanic') jitter(geo, 0.5, Math.floor(b.x * 10 + b.z), true);
        this.add(mesh(worldUV(geo, new THREE.Vector3(b.x, y0, b.z)), stone, b.x, cy, b.z));
        this.add(mesh(worldBox(b.w * 1.15, 0.4, b.d * 1.15), stone, b.x, y0 + b.h + 0.2, b.z));
        return;
      }
      case 'shack': {
        const wallH = b.h * 0.75;
        this.add(mesh(worldBox(b.w, wallH, b.d, new THREE.Vector3(b.x, 0, b.z)), surface('weathered_planks', 1.6, '#b0896a'), b.x, wallH / 2, b.z));
        const roof = mesh(worldBox(b.w + 0.8, 0.15, b.d + 0.8), surface('corrugated_iron', 2, '#8a7a6a', { metal: 0.4 }), b.x, wallH + 0.45, b.z);
        roof.rotation.z = 0.12;
        this.add(roof);
        this.add(mesh(new THREE.BoxGeometry(1.1, 2, 0.08), surface('weathered_planks', 1, '#6a4a32'), b.x, 1, b.z + b.d / 2 + 0.05));
        return;
      }
      case 'module': {
        const p = panelTexture(b.color ?? '#e8edf5').clone();
        p.repeat.set(Math.max(1, Math.round(b.w / 3)), Math.max(1, Math.round(b.h / 2)));
        p.needsUpdate = true;
        const side = new THREE.MeshStandardMaterial({ map: p, roughness: 0.75, metalness: 0 });
        this.add(mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [side, side, surface('metal_plate', 2, '#b9c3d3'), side, side, side], b.x, cy, b.z));
        this.add(mesh(new THREE.BoxGeometry(b.w + 0.3, 0.2, b.d + 0.3), mat('#ff8a3d', { emissive: '#ff6a1a', emissiveIntensity: 0.3 }), b.x, y0 + b.h - 0.05, b.z));
        return;
      }
      case 'courtyard_wall':
      case 'courtyard_tower': {
        const tower = b.kind === 'courtyard_tower';
        const stone = surface('castle_brick_01', 1.6, '#d3d6ca');
        this.add(mesh(new RoundedBoxGeometry(b.w,b.h-.35,b.d,1,.12),stone,b.x,y0+(b.h-.35)/2,b.z));
        this.add(mesh(new THREE.BoxGeometry(b.w,.22,b.d),mat('#f0e5cd'),b.x,y0+.18,b.z));
        this.add(mesh(new THREE.BoxGeometry(b.w,.18,b.d),mat('#f0e5cd'),b.x,y0+b.h-.5,b.z));
        if(tower) {
          for(const sx of [-1,1])for(const sz of [-1,1])this.add(mesh(new RoundedBoxGeometry(b.w*.23,.5,b.d*.23,1,.06),stone,b.x+sx*b.w*.38,y0+b.h-.25,b.z+sz*b.d*.38));
          this.add(mesh(new THREE.BoxGeometry(b.w*.22,b.h*.48,.04),mat(b.color??'#7da6d6'),b.x,y0+b.h*.55,b.z+b.d/2+.025,false));
        } else {
          const alongX=b.w>b.d, count=Math.max(3,Math.floor(Math.max(b.w,b.d)/1.8));
          for(let i=0;i<count;i++) {
            const t=(i+.5)/count-.5;
            this.add(mesh(new RoundedBoxGeometry(alongX?b.w/count*.55:b.w,.4,alongX?b.d:b.d/count*.55,1,.04),stone,b.x+(alongX?t*b.w:0),y0+b.h-.2,b.z+(alongX?0:t*b.d)));
          }
          for(const side of [-1,1])this.add(mesh(new THREE.BoxGeometry(alongX?b.w*.6:.03,.25,alongX?.03:b.d*.6),mat(b.color??'#8eb8de'),b.x+(alongX?0:side*(b.w/2+.02)),y0+b.h*.55,b.z+(alongX?side*(b.d/2+.02):0),false));
        }
        return;
      }
      case 'toy_block': {
        const color = b.color ?? '#ffcf42';
        this.add(mesh(new RoundedBoxGeometry(b.w, b.h, b.d, 2, 0.2), mat(color), b.x, cy, b.z));
        this.add(mesh(new THREE.BoxGeometry(b.w * 0.85, 0.08, b.d * 0.85), mat('#ffffff'), b.x, y0 + b.h + 0.04, b.z, false));
        for (const side of [-1, 1]) this.add(mesh(new THREE.BoxGeometry(b.w * 0.7, 0.1, 0.02), mat('#fff5dc'), b.x, y0 + b.h * 0.65, b.z + side * (b.d / 2 + 0.015), false));
        return;
      }
      default:
        this.add(mesh(worldBox(b.w, b.h, b.d), surface('concrete_wall_007', 2.5, b.color ?? '#9a9a9a'), b.x, cy, b.z));
    }
  }

  private building(b: BoxDef, r: () => number) {
    const night = this.night;
    const wall = b.color ?? '#4a4f5c';
    const seed = Math.floor(r() * 4);
    const facade = windowTexture(wall, night, seed).clone();
    const glow = windowGlowTexture(seed).clone();
    const tile = (t: THREE.Texture, u: number) => {
      t.repeat.set(Math.max(1, Math.round(u / 4)), Math.max(1, Math.round(b.h / 4)));
      t.needsUpdate = true;
      return t;
    };
    const side = (u: number) => {
      const m = new THREE.MeshStandardMaterial({ map: tile(facade.clone(), u), roughness: 0.75, metalness: 0.05 });
      if (night) {
        m.emissiveMap = tile(glow.clone(), u);
        m.emissive.set('#ffffff');
        m.emissiveIntensity = 0.55;
      }
      return m;
    };
    const roof = surface('concrete_floor_02', 4, '#55585e');
    const sx = side(b.d);
    const sz = side(b.w);
    this.add(mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [sx, sx, roof, roof, sz, sz], b.x, b.h / 2, b.z));
    // ground floor: darker shopfront band
    this.add(mesh(worldBox(b.w + 0.1, 3.2, b.d + 0.1), surface('brick_wall_02', 2.5, darker(wall, 1.1)), b.x, 1.6, b.z));
    // parapet + rooftop units
    this.add(mesh(worldBox(b.w + 0.4, 0.8, b.d + 0.4), surface('concrete_wall_007', 2, '#7a7a7a'), b.x, b.h + 0.4, b.z));
    for (let i = 0; i < 2; i++) this.add(mesh(new THREE.BoxGeometry(1.6, 1, 1.2), mat('#8a9096', { metal: 0.4, rough: 0.5 }), b.x + (r() - 0.5) * (b.w - 3), b.h + 1.3, b.z + (r() - 0.5) * (b.d - 3)));
    if (b.h > 16) {
      this.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), mat('#555'), b.x, b.h + 3.8, b.z));
      this.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), mat('#ff2020', { emissive: '#ff2020', emissiveIntensity: 1.2 }), b.x, b.h + 6.9, b.z, false));
    }
    // neon sign on the side facing the arena centre
    if (b.label) {
      const color = NEON[hashString(b.label) % NEON.length];
      const fz = Math.abs(b.z) < Math.abs(b.x) ? false : true;
      const s = fz ? -Math.sign(b.z) : -Math.sign(b.x);
      const w = Math.min(fz ? b.w : b.d, 9);
      const sign = mesh(new THREE.PlaneGeometry(w, w / 4), mat('#ffffff', { map: neonSignTexture(b.label, color), emissive: '#ffffff', emissiveIntensity: night ? 0.5 : 0.25 }), 0, 0, 0, false);
      (sign.material as THREE.MeshStandardMaterial).emissiveMap = neonSignTexture(b.label, color);
      sign.position.set(fz ? b.x : b.x + s * (b.w / 2 + 0.08), 6 + w / 8, fz ? b.z + s * (b.d / 2 + 0.08) : b.z);
      sign.rotation.y = fz ? (s > 0 ? 0 : Math.PI) : s > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.add(sign);
      // awning glow strip over the shopfront
      const strip = mesh(new THREE.BoxGeometry(fz ? b.w * 0.8 : 0.1, 0.12, fz ? 0.1 : b.d * 0.8), mat(color, { emissive: color, emissiveIntensity: night ? 0.55 : 0.25 }), fz ? b.x : b.x + s * (b.w / 2 + 0.1), 3.3, fz ? b.z + s * (b.d / 2 + 0.1) : b.z, false);
      this.add(strip);
    }
  }

  private car(b: BoxDef) {
    const color = b.color ?? '#1e2a44';
    const key = this.define(`car${color}`, () => {
      const g = new THREE.Group();
      const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.1 });
      g.add(mesh(new RoundedBoxGeometry(1.8, 0.6, 4.2, 3, 0.2), paint, 0, 0.6, 0));
      g.add(mesh(new RoundedBoxGeometry(1.55, 0.55, 2.2, 3, 0.18), new THREE.MeshPhysicalMaterial({ color: '#10141a', roughness: 0.05, metalness: 0.3 }), 0, 1.12, -0.2));
      for (const [x, z] of [
        [0.82, 1.3],
        [-0.82, 1.3],
        [0.82, -1.3],
        [-0.82, -1.3],
      ]) {
        g.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14).rotateZ(Math.PI / 2), mat('#151515', { rough: 0.9 }), x, 0.36, z));
      }
      for (const x of [-0.6, 0.6]) {
        g.add(mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), mat('#fff6d8', { emissive: '#fff2c0', emissiveIntensity: this.night ? 0.8 : 0.3 }), x, 0.7, 2.1, false));
        g.add(mesh(new THREE.BoxGeometry(0.35, 0.1, 0.05), mat('#ff3030', { emissive: '#ff2020', emissiveIntensity: 1.5 }), x, 0.72, -2.1, false));
      }
      return g;
    });
    this.batch.place(key, b.x, b.y ?? 0, b.z, b.d >= b.w ? 0 : Math.PI / 2, new THREE.Vector3(Math.min(b.w, b.d) / 1.8, b.h / 1.45, Math.max(b.w, b.d) / 4.2));
  }

  // ------------------------------------------------------------ ramps

  private ramp(r: RampDef) {
    const y = r.y ?? 0;
    const style = r.style ?? 'metal';
    const slope =
      style === 'toy' ? mat('#ffc845') : style === 'metal'
        ? surface('metal_plate', 1.6, '#d6dae0', { metal: 0.15, rough: 0.6 })
        : style === 'concrete'
          ? surface('concrete_floor_02', 3, '#9a9a9a')
          : style === 'wood'
            ? surface('weathered_planks', 1.5, '#b08060')
            : style === 'stone'
              ? surface('castle_brick_01', 1.5, this.map.theme.backdrop === 'jungle' ? '#a8b894' : '#c8b898')
              : surface(this.map.theme.ground as TexId, this.map.theme.groundTile * 0.6, darker(this.map.theme.groundTint, 0.85));
    const sideMat = style === 'metal' || style === 'concrete' ? surface('concrete_wall_007', 2, '#a4a4a4') : slope;
    const m = mesh(wedgeGeometry(r.w, r.l, r.h), [slope, sideMat], r.x, y + 0.01, r.z);
    m.rotation.y = r.rot;
    this.add(m);
    if (style === 'metal' || style === 'concrete') {
      // hazard stripe along the lip
      const lip = mesh(new THREE.BoxGeometry(r.w, 0.05, 0.3), mat('#d9a520', { rough: 0.6 }), 0, 0, 0, false);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot);
      const off = new THREE.Vector3(0, r.h + 0.02, r.l / 2 - 0.15).applyQuaternion(q);
      lip.position.set(r.x + off.x, y + off.y, r.z + off.z);
      lip.rotation.y = r.rot;
      this.add(lip);
    }
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot);
    const pts = new Float32Array(18);
    [
      [-r.w / 2, 0, -r.l / 2],
      [r.w / 2, 0, -r.l / 2],
      [-r.w / 2, 0, r.l / 2],
      [r.w / 2, 0, r.l / 2],
      [-r.w / 2, r.h, r.l / 2],
      [r.w / 2, r.h, r.l / 2],
    ].forEach((c, i) => {
      const v = new THREE.Vector3(c[0], c[1], c[2]).applyQuaternion(q);
      pts.set([v.x + r.x, v.y + y, v.z + r.z], i * 3);
    });
    const hull = RAPIER.ColliderDesc.convexHull(pts);
    if (hull) this.collider(hull);
  }

  // ------------------------------------------------------------ props

  rock(x: number, z: number, rotY: number, scale: number, variant: number, tex: TexId = 'rock_face') {
    const bd = this.map.theme.backdrop;
    const tint = bd === 'volcano' ? '#8a6656' : bd === 'canyon' ? '#d8a878' : bd === 'jungle' ? '#a0aa90' : '#a8a8a8';
    const key = this.define(`rock${variant}${tex}`, () => {
      const g = new THREE.IcosahedronGeometry(1, 1);
      jitter(g, 0.45, variant * 31 + 7, false);
      g.scale(1.2, 0.8, 1);
      g.computeBoundingBox();
      g.translate(0, -g.boundingBox!.min.y - 0.15, 0);
      const m = mesh(worldUV(g), surface(tex, 2, tint));
      (m.material as THREE.MeshStandardMaterial).flatShading = true;
      return m;
    });
    this.batch.place(key, x, 0, z, rotY, scale);
  }

  private lightPool(x: number, z: number, color: string, size: number) {
    const m = mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lightPoolTexture(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -8 }), x, 0.05, z, false);
    m.userData.dynamic = true;
    this.add(m);
  }

  private prop(p: PropDef) {
    const s = p.s ?? 1;
    const rot = p.rot ?? 0;
    const y = p.y ?? 0;
    const v = Math.abs(Math.floor(p.x * 7 + p.z * 13)) % 3;
    const place = (key: string, scale: number | THREE.Vector3 = s) => this.batch.place(key, p.x, y, p.z, rot, scale);
    const metal = (c: string) => mat(c, { metal: 0.6, rough: 0.4 });
    switch (p.kind) {
      case 'streetlamp':
      case 'lamp': {
        place(
          this.define('streetlamp', () => {
            const g = new THREE.Group();
            g.add(mesh(new THREE.CylinderGeometry(0.08, 0.14, 5.5, 8), metal('#2c3038'), 0, 2.75, 0));
            g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), metal('#2c3038'), 0, 5.45, 0.65));
            g.add(mesh(new THREE.BoxGeometry(0.5, 0.14, 0.8), metal('#2c3038'), 0, 5.38, 1.3));
            g.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.7), mat('#fff3c4', { emissive: '#ffe1a0', emissiveIntensity: 0.8 }), 0, 5.29, 1.3, false));
            return g;
          }),
          1,
        );
        if (this.night) {
          const off = new THREE.Vector3(0, 0, 1.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
          this.lightPool(p.x + off.x, p.z + off.z, '#ffcf80', 9);
        }
        return;
      }
      case 'neon': {
        const color = NEON[Math.abs(Math.floor(p.x + p.z)) % NEON.length];
        const text = ['BAR', 'OPEN', 'MOTEL', 'TATTOO'][Math.abs(Math.floor(p.x * 3 + p.z)) % 4];
        const g = new THREE.Group();
        g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), metal('#2a2c33'), 0, 2.5, 0));
        const sign = mesh(new THREE.BoxGeometry(3.2, 1, 0.15), [metal('#111'), metal('#111'), metal('#111'), metal('#111'), mat('#ffffff', { map: neonSignTexture(text, color), emissive: '#ffffff', emissiveIntensity: 0.5 }), mat('#ffffff', { map: neonSignTexture(text, color), emissive: '#ffffff', emissiveIntensity: 0.5 })], 0, 4.6, 0);
        for (const m of sign.material as THREE.MeshStandardMaterial[]) if (m.map) m.emissiveMap = m.map;
        g.add(sign);
        g.position.set(p.x, 0, p.z);
        g.rotation.y = rot;
        this.add(g);
        if (this.night) this.lightPool(p.x, p.z, color, 7);
        return;
      }
      case 'dumpster':
        return place(
          this.define('dumpster', () => {
            const g = new THREE.Group();
            g.add(mesh(worldBox(2, 1.2, 1.2), surface('rusty_painted_metal', 1.5, '#4f7a5a', { metal: 0.4 }), 0, 0.65, 0));
            const lid = mesh(new THREE.BoxGeometry(2.05, 0.08, 1.25), metal('#2d3a30'), 0, 1.28, -0.05);
            lid.rotation.x = -0.15;
            g.add(lid);
            return g;
          }),
          1,
        );
      case 'vending':
        return place(
          this.define('vending', () => {
            const g = new THREE.Group();
            g.add(mesh(new RoundedBoxGeometry(1, 1.9, 0.8, 2, 0.05), mat('#b5262b', { rough: 0.4, metal: 0.2 }), 0, 0.95, 0));
            g.add(mesh(new THREE.PlaneGeometry(0.7, 1.2), mat('#cfefff', { emissive: '#9ad8ff', emissiveIntensity: this.night ? 0.7 : 0.3 }), 0.05, 1.15, 0.41, false));
            return g;
          }),
          1,
        );
      case 'cone':
        return place(
          this.define('cone', () => {
            const g = new THREE.Group();
            g.add(mesh(new THREE.BoxGeometry(0.45, 0.04, 0.45), mat('#e8590c'), 0, 0.02, 0));
            g.add(mesh(new THREE.ConeGeometry(0.18, 0.65, 14), mat('#ff6b1a', { rough: 0.5 }), 0, 0.36, 0));
            g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.1, 14), mat('#eeeeee', { emissive: '#ffffff', emissiveIntensity: 0.4 }), 0, 0.4, 0));
            return g;
          }),
          1,
        );
      case 'barrel':
      case 'barrel_blue':
        return place(
          this.define(p.kind, () => {
            const g = new THREE.Group();
            g.add(mesh(worldUV(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 16)), surface('rusty_painted_metal', 1, p.kind === 'barrel' ? '#b8402a' : '#2f5f9a', { metal: 0.5, rough: 0.5 }), 0, 0.475, 0));
            for (const yy of [0.2, 0.75]) g.add(mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 18).rotateX(Math.PI / 2), metal('#333'), 0, yy, 0));
            return g;
          }),
        );
      case 'crate':
      case 'military_crate':
      case 'ammo':
      case 'propane':
      case 'generator':
      case 'utility':
      case 'aircon':
        return place(this.define('crate', () => mesh(worldBox(1.1, 1.1, 1.1).translate(0, 0.55, 0), surface('weathered_planks', 1, '#b08a5a'))));
      case 'tyres':
        return place(
          this.define('tyres', () => {
            const g = new THREE.Group();
            for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.4, 0.16, 8, 18).rotateX(Math.PI / 2), mat('#1a1a1a', { rough: 0.9 }), 0, 0.17 + i * 0.3, 0));
            return g;
          }),
          1,
        );
      case 'trashcan':
        return place(this.define('trash', () => mesh(worldUV(new THREE.CylinderGeometry(0.3, 0.26, 0.95, 14)).translate(0, 0.48, 0), surface('metal_plate', 1, '#6b7078', { metal: 0.6 }))), 1);
      case 'bollard':
        return place(this.define('bollard', () => mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.8, 12).translate(0, 0.4, 0), metal('#3a3d42'))), 1);
      case 'cactus':
        return place(
          this.define('cactus', () => {
            const g = new THREE.Group();
            const green = mat('#3f6b3a', { rough: 0.8 });
            const ribbed = (r: number, h: number) => {
              const geo = new THREE.CapsuleGeometry(r, h, 6, 14);
              const pos = geo.attributes.position as THREE.BufferAttribute;
              for (let i = 0; i < pos.count; i++) {
                const k = 1 + Math.cos(Math.atan2(pos.getZ(i), pos.getX(i)) * 8) * 0.07;
                pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k);
              }
              geo.computeVertexNormals();
              return geo;
            };
            g.add(mesh(ribbed(0.32, 2.4), green, 0, 1.5, 0));
            g.add(mesh(ribbed(0.2, 0.5).rotateZ(Math.PI / 2), green, 0.5, 1.35, 0));
            g.add(mesh(ribbed(0.2, 0.8), green, 0.85, 1.85, 0));
            return g;
          }),
        );
      case 'dead_tree':
        return place(
          this.define('deadtree', () => {
            const g = new THREE.Group();
            const wood = surface('bark_brown_02', 1, '#5a4636');
            g.add(mesh(worldUV(new THREE.CylinderGeometry(0.14, 0.3, 3.6, 7)), wood, 0, 1.8, 0));
            for (const [a, h, l] of [
              [0.6, 2.4, 1.6],
              [-0.9, 3.0, 1.3],
              [2.3, 2.0, 1.1],
            ]) {
              const br = mesh(worldUV(new THREE.CylinderGeometry(0.04, 0.1, l, 5)), wood, Math.cos(a) * 0.45, h, Math.sin(a) * 0.45);
              br.rotation.set(Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9);
              g.add(br);
            }
            return g;
          }),
        );
      case 'boulder':
        return this.rock(p.x, p.z, rot, s * 1.8, v);
      case 'rock':
        return this.rock(p.x, p.z, rot, s, v);
      case 'jungle_tree':
        return place(
          this.define(`jtree${v}`, () => {
            const g = new THREE.Group();
            const h = 7 + v * 1.2;
            g.add(mesh(worldUV(new THREE.CylinderGeometry(0.28, 0.5, h, 8)), surface('bark_brown_02', 1.2, '#7a6a52'), 0, h / 2, 0));
            // buttress roots
            for (let i = 0; i < 4; i++) {
              const root = mesh(new THREE.ConeGeometry(0.35, 1.6, 4), surface('bark_brown_02', 1, '#6a5a44'), Math.cos(i * 1.6) * 0.45, 0.5, Math.sin(i * 1.6) * 0.45);
              root.rotation.z = Math.cos(i * 1.6) * 0.5;
              root.rotation.x = -Math.sin(i * 1.6) * 0.5;
              g.add(root);
            }
            const greens = ['#2f5a2a', '#3b6b30', '#264d24'];
            for (let i = 0; i < 4; i++) {
              const c = mesh(jitter(new THREE.IcosahedronGeometry(2.2 - i * 0.25, 1), 0.5, i + v * 5, false), mat(greens[i % 3], { flat: true, rough: 0.85 }), Math.cos(i * 2.1) * 1.3, h - 0.5 + (i % 2) * 0.8, Math.sin(i * 2.1) * 1.3);
              c.scale.y = 0.55;
              g.add(c);
            }
            return g;
          }),
        );
      case 'fern':
        return place(
          this.define('fern', () => {
            const g = new THREE.Group();
            const leaf = mat('#3e6e34', { rough: 0.8 });
            leaf.side = THREE.DoubleSide;
            for (let i = 0; i < 7; i++) {
              const geo = new THREE.PlaneGeometry(0.35, 1.5, 1, 4);
              geo.translate(0, 0.75, 0);
              const pos = geo.attributes.position as THREE.BufferAttribute;
              for (let k = 0; k < pos.count; k++) {
                const t = pos.getY(k) / 1.5;
                pos.setXYZ(k, pos.getX(k) * (1 - t * 0.8), pos.getY(k) * 0.7, t * t * 0.7);
              }
              geo.computeVertexNormals();
              geo.rotateY((i / 7) * Math.PI * 2);
              g.add(mesh(geo, leaf, 0, 0, 0, false));
            }
            return g;
          }),
        );
      case 'statue':
        return place(
          this.define('statue', () => {
            const g = new THREE.Group();
            const stone = surface('castle_brick_01', 1.2, '#8f9a80');
            g.add(mesh(worldBox(2.2, 0.8, 2.2), stone, 0, 0.4, 0));
            g.add(mesh(worldBox(1.6, 2.2, 1.4), stone, 0, 1.9, 0));
            g.add(mesh(worldBox(1.9, 0.4, 1.7), stone, 0, 3.2, 0));
            g.add(mesh(new THREE.BoxGeometry(1.2, 0.18, 0.1), mat('#1b2016'), 0, 2.2, 0.71));
            for (const sx of [-0.35, 0.35]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.1), mat('#2a3020', { emissive: '#7aff9a', emissiveIntensity: 0.6 }), sx, 2.6, 0.71));
            return g;
          }),
        );
      case 'torch': {
        place(
          this.define('torch', () => {
            const g = new THREE.Group();
            g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2, 8), surface('weathered_planks', 1, '#6a4a32'), 0, 1, 0));
            g.add(mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.25, 10), metal('#2a2a2a'), 0, 2.05, 0));
            g.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 8), mat('#ffb300', { emissive: '#ff7a00', emissiveIntensity: 0.8 }), 0, 2.4, 0, false));
            return g;
          }),
          1,
        );
        this.lightPool(p.x, p.z, '#ff9a40', 5);
        return;
      }
      case 'light_tower': {
        place(
          this.define('lighttower', () => {
            const g = new THREE.Group();
            g.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, 16, 8), metal('#7a8088'), 0, 8, 0));
            g.add(mesh(new THREE.BoxGeometry(3, 1.4, 0.4), metal('#3a3d42'), 0, 16, 0));
            for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CircleGeometry(0.3, 12), mat('#ffffff', { emissive: '#e8f0ff', emissiveIntensity: 0.6 }), -1.05 + i * 0.7, 16, 0.22, false));
            return g;
          }),
          1,
        );
        return;
      }
      case 'crane': {
        const g = new THREE.Group();
        const paint = surface('metal_plate', 2, '#c99a20', { metal: 0.5 });
        const beams: THREE.BufferGeometry[] = [];
        const beam = (w: number, h: number, d: number, px: number, py: number, pz: number) => beams.push(worldBox(w, h, d).translate(px, py, pz));
        for (const sx of [-8, 8]) {
          for (const sz of [-4.5, 4.5]) beam(1, 20, 1, sx, 10, sz);
          beam(0.8, 0.8, 9, sx, 12, 0);
        }
        beam(18, 1.8, 1.4, 0, 20, -4.5);
        beam(18, 1.8, 1.4, 0, 20, 4.5);
        beam(2.6, 2, 46, 0, 21.5, -12);
        beam(4, 3, 4, 0, 19.5, 0);
        g.add(mesh(merge(beams), paint));
        g.add(mesh(new THREE.SphereGeometry(0.25, 8, 6), mat('#ff3030', { emissive: '#ff2020', emissiveIntensity: 1.2 }), 0, 23, -34, false));
        g.position.set(p.x, 0, p.z);
        this.add(g);
        return;
      }
      case 'ship': {
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(60, 9, 14), surface('rusty_painted_metal', 4, '#3a4652', { metal: 0.4 }), 0, 2, 0, false));
        g.add(mesh(new THREE.BoxGeometry(12, 10, 12), mat('#d8d8d0'), -18, 11, 0, false));
        for (let i = 0; i < 6; i++) g.add(mesh(worldBox(6, 2.6, 12), surface('container_side', 2.6, ['#8c2f27', '#24508a', '#a3802c', '#2f6a3a'][i % 4]), -4 + i * 6.5, 7.8, 0, false));
        g.position.set(p.x, 0, p.z);
        g.rotation.y = rot;
        this.add(g);
        return;
      }
      case 'crystal': {
        const c = this.map.theme.mood === 'volcanic' ? '#ff7a2f' : '#b47cff';
        return place(
          this.define(`crystal${c}`, () => {
            const g = new THREE.Group();
            for (let i = 0; i < 3; i++) {
              const geo = new THREE.OctahedronGeometry(0.5, 0);
              geo.scale(1, 2.6 - i * 0.6, 1);
              const m = mesh(geo, mat(c, { flat: true, emissive: c, emissiveIntensity: 0.35, rough: 0.2 }), (i - 1) * 0.45, 1.2 - i * 0.2, (i % 2) * 0.3);
              m.rotation.z = (i - 1) * 0.35;
              g.add(m);
            }
            return g;
          }),
        );
      }
      case 'dome':
        return place(
          this.define('dome', () => {
            const g = new THREE.Group();
            g.add(mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.6, 28), metal('#9aa5ba'), 0, 0.3, 0));
            g.add(mesh(new THREE.SphereGeometry(3.2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#8fd8ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, emissive: '#2fb8ff', emissiveIntensity: 0.35 }), 0, 0.6, 0));
            return g;
          }),
        );
      case 'antenna':
        return place(
          this.define('antenna', () => {
            const g = new THREE.Group();
            g.add(mesh(new THREE.CylinderGeometry(0.15, 0.35, 9, 6), metal('#c9d1de'), 0, 4.5, 0));
            const dish = mesh(new THREE.SphereGeometry(1.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3), mat('#e8ecf2', { rough: 0.4 }), 0, 8.4, 0.4);
            dish.rotation.x = -1.1;
            g.add(dish);
            g.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#ff4040', { emissive: '#ff2020', emissiveIntensity: 1.2 }), 0, 9.2, 0, false));
            return g;
          }),
          1,
        );
      case 'reactor':
        return place(
          this.define('reactor', () => {
            const g = new THREE.Group();
            g.add(mesh(new THREE.CylinderGeometry(2.8, 3.2, 1, 24), metal('#7d8aa3'), 0, 0.5, 0));
            g.add(mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.6, 20), mat('#5ff3ff', { emissive: '#3fe6ff', emissiveIntensity: 0.45, transparent: 0.85 }), 0, 2.8, 0, false));
            for (const yy of [1.6, 3, 4.4]) g.add(mesh(new THREE.TorusGeometry(1.6, 0.18, 8, 24).rotateX(Math.PI / 2), metal('#c9d1de'), 0, yy, 0));
            g.add(mesh(new THREE.CylinderGeometry(2, 2.4, 0.6, 24), metal('#7d8aa3'), 0, 4.9, 0));
            return g;
          }),
        );
      default:
        return;
    }
  }

  // ------------------------------------------------------------ distant scenery

  private backdrop() {
    const { half, theme } = this.map;
    const r = rng(hashString(this.map.id + 'backdrop'));
    const water = new Set(theme.water ?? []);
    const onLand = (x: number, z: number) =>
      !((water.has('n') && z < -half) || (water.has('s') && z > half) || (water.has('w') && x < -half) || (water.has('e') && x > half));
    const ring = (n: number, r0: number, r1: number, fn: (x: number, z: number, i: number) => void) => {
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = r0 + r() * (r1 - r0);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (Math.abs(x) < half + 6 && Math.abs(z) < half + 6) continue;
        if (!onLand(x, z)) continue;
        fn(x, z, i);
      }
    };
    const cliff = (x: number, z: number, i: number, tint: string, hMin: number, hVar: number) => {
      const w = 20 + r() * 30;
      const d = 20 + r() * 30;
      const h = hMin + r() * hVar;
      const geo = jitter(new THREE.BoxGeometry(w, h, d, 4, 4, 4), 3, i, true);
      this.add(mesh(worldUV(geo, new THREE.Vector3(x, 0, z)), surface('cliff_side', 8, tint), x, h / 2 - 1, z, false));
    };

    switch (theme.backdrop) {
      case 'stadium': {
        const treeKey=this.define('courtyard-garden-tree',()=>{
          const tree=new THREE.Group();
          tree.add(mesh(new THREE.CylinderGeometry(.25,.4,3,7),mat('#927153'),0,1.5,0));
          tree.add(mesh(new THREE.IcosahedronGeometry(2,1),mat('#4a9d75',{flat:true}),0,4,0));
          tree.add(mesh(new THREE.IcosahedronGeometry(1.5,1),mat('#77bb8c',{flat:true}),.9,4.7,.2));
          return tree;
        });
        for(let i=0;i<28;i++) {
          const angle=i*Math.PI/14, distance=half+9+(i%3)*2;
          this.batch.place(treeKey,Math.sin(angle)*distance,0,Math.cos(angle)*distance,angle,.85+(i%4)*.12);
        }
        for (let i = 0; i < 20; i++) {
          const angle = i * Math.PI / 10;
          const x = Math.sin(angle) * (half + 12), z = Math.cos(angle) * (half + 12);
          this.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), mat('#fff5dc'), x, 3.5, z, false));
          const flag = mesh(new THREE.BoxGeometry(2.6, 1.3, 0.05), mat(['#ff718e', '#65c7ff', '#ffcd48', '#a486ee'][i % 4]), x + Math.cos(angle) * 1.3, 6, z - Math.sin(angle) * 1.3, false);
          flag.rotation.y = angle;
          this.add(flag);
        }
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          const x = Math.sin(angle) * (half + 70), z = Math.cos(angle) * (half + 70);
          this.add(mesh(new THREE.IcosahedronGeometry(18 + i % 3 * 5, 1), mat(i % 2 ? '#68bb8b' : '#89d7a0', { flat: true }), x, -10, z, false));
        }
        break;
      }
      case 'city':
        ring(70, half + 10, half + 180, (x, z) => {
          const w = 10 + r() * 14;
          const h = 20 + r() * 60;
          const b: BoxDef = { kind: 'building', x, z, w, d: w, h, color: ['#c9a27e', '#8fa9c4', '#d8c3a0', '#a8b4a0', '#c48a74'][Math.floor(r() * 5)] };
          this.building(b, r);
        });
        break;
      case 'canyon':
        ring(40, half + 8, half + 60, (x, z, i) => cliff(x, z, i, '#e0a878', 14, 22));
        ring(30, half + 90, half + 280, (x, z, i) => cliff(x, z, i, '#d49a70', 20, 40));
        break;
      case 'docks':
        ring(30, half + 20, half + 200, (x, z) => {
          const h = 12 + r() * 30;
          this.add(mesh(worldBox(14, h, 14, new THREE.Vector3(x, 0, z)), surface('concrete_wall_007', 4, '#a8aeb6'), x, h / 2, z, false));
        });
        break;
      case 'jungle':
        ring(140, half + 4, half + 50, (x, z) => this.prop({ kind: 'jungle_tree', x, z, s: 1 + r() * 0.6, rot: r() * 6 }));
        ring(20, half + 100, half + 280, (x, z) => {
          const geo = new THREE.SphereGeometry(50 + r() * 50, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
          geo.scale(1, 0.4 + r() * 0.3, 1);
          this.add(mesh(geo, mat('#4f8a3f', { flat: true }), x, -2, z, false));
        });
        break;
      case 'volcano': {
        ring(24, half + 30, half + 220, (x, z, i) => cliff(x, z, i, '#7a5a4c', 10, 30));
        const vx = -60;
        const vz = -half - 110;
        this.add(mesh(worldUV(new THREE.CylinderGeometry(22, 70, 70, 12, 3, true)), surface('rock_face', 10, '#6a5040'), vx, 34, vz, false));
        this.add(mesh(new THREE.CircleGeometry(22, 20).rotateX(-Math.PI / 2), mat('#ff7a00', { emissive: '#ff5a00', emissiveIntensity: 1.1 }), vx, 68.5, vz, false));
        break;
      }
      case 'space': {
        const planet = mesh(new THREE.SphereGeometry(90, 32, 20), mat('#6a4bd0', { rough: 1, emissive: '#2a1a60', emissiveIntensity: 0.4 }), 220, 160, -420, false);
        (planet.material as THREE.MeshStandardMaterial).fog = false;
        this.add(planet);
        const ringM = mesh(new THREE.RingGeometry(120, 170, 64), mat('#c9b6ff', { transparent: 0.55 }), 220, 160, -420, false);
        ringM.rotation.x = -1.2;
        (ringM.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        (ringM.material as THREE.MeshStandardMaterial).fog = false;
        this.add(ringM);
        ring(14, half + 40, half + 200, (x, z, i) => cliff(x, z, i, '#8a90a4', 8, 20));
        break;
      }
    }
  }
}
