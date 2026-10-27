import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Box-projected UVs in metres, so a material made with `assets.pbr(id, { tile })` shows the photo
 * texture at real-world scale on any surface. `offset` shifts the projection (e.g. stacked boxes).
 */
export function worldUV(geo: THREE.BufferGeometry, offset = new THREE.Vector3()): THREE.BufferGeometry {
  geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x;
      uv[i * 2 + 1] = z;
    } else if (nx >= nz) {
      uv[i * 2] = z;
      uv[i * 2 + 1] = y;
    } else {
      uv[i * 2] = x;
      uv[i * 2 + 1] = y;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function worldBox(w: number, h: number, d: number, offset?: THREE.Vector3): THREE.BufferGeometry {
  return worldUV(new THREE.BoxGeometry(w, h, d), offset);
}

/** Ground-hugging plane (XZ) with UVs in metres. */
export function worldPlane(w: number, d: number, cx = 0, cz = 0, segs = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d, segs, segs);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, 0, cz);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), -pos.getZ(i));
  return g;
}

export function worldDisc(r: number, cx = 0, cz = 0): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, 48);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, 0, cz);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), -pos.getZ(i));
  return g;
}

/** Wedge rising from 0 at local -z to h at local +z. Group 0 = slope, group 1 = sides/back. */
export function wedgeGeometry(w: number, l: number, h: number): THREE.BufferGeometry {
  const A = [-w / 2, 0, -l / 2];
  const B = [w / 2, 0, -l / 2];
  const C = [-w / 2, 0, l / 2];
  const D = [w / 2, 0, l / 2];
  const E = [-w / 2, h, l / 2];
  const F = [w / 2, h, l / 2];
  const positions: number[] = [];
  const uvs: number[] = [];
  const s = Math.hypot(l, h);
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => {
    positions.push(...a, ...b, ...c);
    uvs.push(...ua, ...ub, ...uc);
  };
  const geo = new THREE.BufferGeometry();
  tri(A, E, B, [0, 0], [0, s], [w, 0]);
  tri(B, E, F, [w, 0], [0, s], [w, s]);
  geo.addGroup(0, 6, 0);
  tri(C, D, E, [0, 0], [w, 0], [0, h]);
  tri(D, F, E, [w, 0], [w, h], [0, h]);
  tri(A, C, E, [0, 0], [l, 0], [l, h]);
  tri(B, F, D, [0, 0], [l, h], [l, 0]);
  tri(A, B, C, [0, 0], [w, 0], [0, l]);
  tri(B, D, C, [w, 0], [w, l], [0, l]);
  geo.addGroup(6, 18, 1);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/** Offsets vertices by a hash of their position so shared corners stay welded (low-poly rocks etc). */
export function jitter(geo: THREE.BufferGeometry, amount: number, seed: number, keepBottom = true): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const h = (x: number, y: number, z: number, k: number) => {
    const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 0.1 + k * 19.19) * 43758.5453;
    return v - Math.floor(v) - 0.5;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (keepBottom && y <= box.min.y + 1e-3) continue;
    const kx = Math.round(x * 100) / 100;
    const ky = Math.round(y * 100) / 100;
    const kz = Math.round(z * 100) / 100;
    pos.setXYZ(i, x + h(kx, ky, kz, 1) * amount, y + h(kx, ky, kz, 2) * amount * 0.5, z + h(kx, ky, kz, 3) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Lumpy boulder (unit radius, base at y = 0) with world-scale UVs for a rock photo texture. */
export function rockGeometry(variant: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  jitter(g, 0.55, variant * 97 + 13, false);
  g.scale(1.25, 0.75, 1);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y - 0.15, 0);
  return worldUV(g);
}

// ---------------------------------------------------------------- instancing

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  local: THREE.Matrix4;
  castShadow: boolean;
}

/**
 * Collects many copies of the same object and draws each of its meshes with one InstancedMesh.
 * Repeated props (lamps, barrels, trees, windows…) cost a handful of draw calls per map.
 */
export class InstanceBatch {
  private readonly protos = new Map<string, Part[]>();
  private readonly items = new Map<string, THREE.Matrix4[]>();

  /** Register a prototype from an Object3D (all meshes, with their transforms relative to it). */
  defineFrom(key: string, obj: THREE.Object3D) {
    if (this.protos.has(key)) return;
    obj.updateMatrixWorld(true);
    const inv = obj.matrixWorld.clone().invert();
    const parts: Part[] = [];
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) parts.push({ geometry: o.geometry, material: o.material, local: inv.clone().multiply(o.matrixWorld), castShadow: o.castShadow });
    });
    this.protos.set(key, parts);
  }

  define(key: string, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], castShadow = true) {
    if (!this.protos.has(key)) this.protos.set(key, [{ geometry, material, local: new THREE.Matrix4(), castShadow }]);
  }

  has(key: string) {
    return this.protos.has(key);
  }

  add(key: string, matrix: THREE.Matrix4) {
    let list = this.items.get(key);
    if (!list) this.items.set(key, (list = []));
    list.push(matrix);
  }

  place(key: string, x: number, y: number, z: number, rotY = 0, scale: number | THREE.Vector3 = 1) {
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
    this.add(key, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), s));
  }

  /**
   * One InstancedMesh per prototype part per 64 m map chunk, so the camera and each shadow
   * cascade only draw the chunks they can actually see.
   */
  build(chunk = 64): THREE.Group {
    const group = new THREE.Group();
    const m = new THREE.Matrix4();
    for (const [key, list] of this.items) {
      const parts = this.protos.get(key);
      if (!parts || list.length === 0) continue;
      const cells = new Map<string, THREE.Matrix4[]>();
      for (const mat of list) {
        const k = `${Math.floor(mat.elements[12] / chunk)},${Math.floor(mat.elements[14] / chunk)}`;
        let cell = cells.get(k);
        if (!cell) cells.set(k, (cell = []));
        cell.push(mat);
      }
      for (const cell of cells.values()) {
        for (const part of parts) {
          const inst = new THREE.InstancedMesh(part.geometry, part.material, cell.length);
          cell.forEach((mat, i) => inst.setMatrixAt(i, m.multiplyMatrices(mat, part.local)));
          inst.castShadow = part.castShadow;
          inst.receiveShadow = true;
          inst.computeBoundingSphere();
          group.add(inst);
        }
      }
    }
    return group;
  }
}

/** Merge several geometries (sharing one material) into one. */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of prepared) {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.deleteAttribute('uv1');
  }
  return mergeGeometries(prepared, false)!;
}

// ---------------------------------------------------------------- small canvas textures

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export const hazardTexture = () =>
  canvasTex(128, 64, (g) => {
    g.fillStyle = '#f2b705';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#151515';
    for (let x = -64; x < 192; x += 32) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 16, 64);
      g.lineTo(x + 48, 0);
      g.lineTo(x + 32, 0);
      g.fill();
    }
  });

export const boostTexture = () =>
  canvasTex(128, 256, (g) => {
    g.fillStyle = '#062033';
    g.fillRect(0, 0, 128, 256);
    for (let y = -64; y < 320; y += 64) {
      const grad = g.createLinearGradient(0, y, 0, y + 48);
      grad.addColorStop(0, '#00e1ff');
      grad.addColorStop(1, '#00ffa6');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(10, y + 46);
      g.lineTo(64, y + 6);
      g.lineTo(118, y + 46);
      g.lineTo(118, y + 64);
      g.lineTo(64, y + 24);
      g.lineTo(10, y + 64);
      g.fill();
    }
  });

/** Tileable value-noise normal map for water ripples. */
export const rippleNormalTexture = () =>
  canvasTex(
    256,
    256,
    (g) => {
      const N = 256;
      const hgt = new Float32Array(N * N);
      for (let o = 0; o < 4; o++) {
        const f = 4 << o;
        const amp = 1 / (o + 1);
        const grid = Array.from({ length: f * f }, () => Math.random());
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const gx = (x / N) * f;
            const gy = (y / N) * f;
            const x0 = Math.floor(gx);
            const y0 = Math.floor(gy);
            const tx = gx - x0;
            const ty = gy - y0;
            const s = (t: number) => t * t * (3 - 2 * t);
            const v = (i: number, j: number) => grid[((j % f) * f + (i % f)) % (f * f)];
            const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * s(tx);
            const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * s(tx);
            hgt[y * N + x] += (a + (b - a) * s(ty)) * amp;
          }
        }
      }
      const img = g.createImageData(N, N);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dx = hgt[y * N + ((x + 1) % N)] - hgt[y * N + ((x - 1 + N) % N)];
          const dy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
          const n = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
          const i = (y * N + x) * 4;
          img.data[i] = (n.x * 0.5 + 0.5) * 255;
          img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
          img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    },
    false,
  );

/** Low-frequency greyscale noise used to break up ground-texture tiling. */
export const macroNoiseTexture = () =>
  canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 400; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = 10 + Math.random() * 40;
        const v = Math.random() > 0.5 ? 255 : 0;
        for (const ox of [-256, 0, 256]) {
          for (const oy of [-256, 0, 256]) {
            const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
            grad.addColorStop(0, `rgba(${v},${v},${v},0.12)`);
            grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
            g.fillStyle = grad;
            g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
          }
        }
      }
    },
    false,
  );

/**
 * Bakes every static, single-material mesh under `root` into one merged mesh per material, so a
 * whole arena draws in a few dozen calls. Meshes flagged `userData.dynamic`, multi-material meshes,
 * instanced meshes and points are moved across untouched.
 */
export function mergeStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const keep: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o === root) return;
    const mesh = o as THREE.Mesh;
    if (o.userData.dynamic || o instanceof THREE.Points || o instanceof THREE.InstancedMesh || o instanceof THREE.Sprite) {
      keep.push(o);
      return;
    }
    if (!mesh.isMesh) return;
    let geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const add = (material: THREE.Material, part: THREE.BufferGeometry) => {
      const key = `${material.uuid}|${mesh.castShadow}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { material, cast: mesh.castShadow, geos: [] }));
      b.geos.push(part);
    };
    if (Array.isArray(mesh.material)) {
      // split multi-material meshes into one piece per face group
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }];
      for (const grp of groups) {
        const material = mesh.material[grp.materialIndex ?? 0];
        if (!material) continue;
        const part = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) {
          const attr = geo.attributes[name] as THREE.BufferAttribute;
          const arr = (attr.array as Float32Array).slice(grp.start * attr.itemSize, (grp.start + grp.count) * attr.itemSize);
          part.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize));
        }
        add(material, part);
      }
      return;
    }
    geo.clearGroups();
    add(mesh.material, geo);
  });
  for (const o of keep) {
    // re-parent with the same world transform
    o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

let contactShadow: THREE.CanvasTexture | null = null;
/** Shared soft contact shadow, including on phones with dynamic shadows disabled. */
export function contactShadowTexture(): THREE.CanvasTexture {
  if (contactShadow) return contactShadow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gradient = g.createRadialGradient(32, 32, 8, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(12,28,47,0.55)');
  gradient.addColorStop(.6, 'rgba(12,28,47,0.3)');
  gradient.addColorStop(1, 'rgba(12,28,47,0)');
  g.fillStyle = gradient; g.fillRect(0,0,64,64);
  contactShadow = new THREE.CanvasTexture(c);
  contactShadow.userData.shared=true;
  contactShadow.userData.sharedOwner=contactShadow.uuid;
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  return contactShadow;
}
