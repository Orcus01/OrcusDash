import type { Quat, Vec3 } from './protocol';
import { type MapDef, propCollider, wallBoxes } from './maps';

interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface Cylinder {
  x: number;
  z: number;
  r: number;
  h: number;
}

interface Wedge {
  x: number;
  z: number;
  y: number;
  w: number;
  l: number;
  h: number;
  cos: number;
  sin: number;
}

type Obstacle = { t: 'box'; o: Aabb } | { t: 'cyl'; o: Cylinder } | { t: 'wedge'; o: Wedge };

const CELL = 16;

/** Static obstacles used by the server for projectile collision, bucketed in a uniform grid. */
export interface CollisionWorld {
  half: number;
  obstacles: Obstacle[];
  cells: Map<number, number[]>;
}

const worldCache = new Map<string, CollisionWorld>();
const cellKey = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);

function bounds(o: Obstacle): [number, number, number, number] {
  if (o.t === 'box') return [o.o.minX, o.o.minZ, o.o.maxX, o.o.maxZ];
  if (o.t === 'cyl') return [o.o.x - o.o.r, o.o.z - o.o.r, o.o.x + o.o.r, o.o.z + o.o.r];
  const r = Math.hypot(o.o.w, o.o.l) / 2;
  return [o.o.x - r, o.o.z - r, o.o.x + r, o.o.z + r];
}

export function collisionWorld(map: MapDef): CollisionWorld {
  const cached = worldCache.get(map.id);
  if (cached) return cached;
  const obstacles: Obstacle[] = [];
  for (const b of [...map.boxes, ...wallBoxes(map)]) {
    const y = 'y' in b && b.y ? b.y : 0;
    obstacles.push({ t: 'box', o: { minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minY: y, maxY: y + b.h, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 } });
  }
  for (const p of map.props) {
    const c = propCollider(p);
    if (c.r > 0) obstacles.push({ t: 'cyl', o: { x: p.x, z: p.z, r: c.r, h: c.h + (p.y ?? 0) } });
  }
  for (const r of map.ramps) {
    obstacles.push({ t: 'wedge', o: { x: r.x, z: r.z, y: r.y ?? 0, w: r.w, l: r.l, h: r.h, cos: Math.cos(r.rot), sin: Math.sin(r.rot) } });
  }
  const cells = new Map<number, number[]>();
  obstacles.forEach((o, i) => {
    const [x0, z0, x1, z1] = bounds(o);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = cellKey(cx, cz);
        let list = cells.get(k);
        if (!list) cells.set(k, (list = []));
        list.push(i);
      }
    }
  });
  const world = { half: map.half, obstacles, cells };
  worldCache.set(map.id, world);
  return world;
}

function near(world: CollisionWorld, x: number, z: number): number[] {
  return world.cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
}

/** Ramp surface height at (x,z), or -Infinity if outside its footprint. */
function wedgeTop(w: Wedge, x: number, z: number): number {
  const dx = x - w.x;
  const dz = z - w.z;
  // rotate into ramp-local space (inverse yaw)
  const lx = dx * w.cos - dz * w.sin;
  const lz = dx * w.sin + dz * w.cos;
  if (Math.abs(lx) > w.w / 2 || Math.abs(lz) > w.l / 2) return -Infinity;
  return w.y + (w.h * (lz + w.l / 2)) / w.l;
}

function inside(o: Obstacle, p: Vec3): boolean {
  if (o.t === 'box') {
    const b = o.o;
    return p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY && p[2] >= b.minZ && p[2] <= b.maxZ;
  }
  if (o.t === 'cyl') {
    const c = o.o;
    const dx = p[0] - c.x;
    const dz = p[2] - c.z;
    return p[1] <= c.h && dx * dx + dz * dz <= c.r * c.r;
  }
  const top = wedgeTop(o.o, p[0], p[2]);
  return p[1] >= o.o.y && p[1] <= top;
}

export function pointBlocked(world: CollisionWorld, p: Vec3): boolean {
  if (p[1] < 0) return true;
  if (Math.abs(p[0]) > world.half + 0.5 || Math.abs(p[2]) > world.half + 0.5) return true;
  for (const i of near(world, p[0], p[2])) if (inside(world.obstacles[i], p)) return true;
  return false;
}

/** Height of the highest walkable surface at (x,z) that is at or below `fromY` (ground = 0). */
export function surfaceHeight(world: CollisionWorld, x: number, z: number, fromY: number): number {
  let best = 0;
  for (const i of near(world, x, z)) {
    const o = world.obstacles[i];
    let top = -Infinity;
    if (o.t === 'box') {
      const b = o.o;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) top = b.maxY;
    } else if (o.t === 'wedge') {
      top = wedgeTop(o.o, x, z);
    }
    if (top <= fromY + 0.3 && top > best) best = top;
  }
  return best;
}

/** Distance along a unit-length ray to the first static obstacle (or the ground), capped at maxDist. */
export function raycastWorld(world: CollisionWorld, o: Vec3, d: Vec3, maxDist: number): number {
  let best = maxDist;
  if (d[1] < 0) {
    const t = -o[1] / d[1];
    if (t >= 0 && t < best) best = t;
  }
  // Gather obstacles from the grid cells the ray passes through.
  const seen = new Set<number>();
  const steps = Math.ceil(maxDist / (CELL / 2));
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(maxDist, (s * CELL) / 2);
    for (const i of near(world, o[0] + d[0] * t, o[2] + d[2] * t)) seen.add(i);
  }
  for (const i of seen) {
    const ob = world.obstacles[i];
    let t: number | null = null;
    if (ob.t === 'box') t = rayAabb(o, d, ob.o);
    else if (ob.t === 'cyl') t = rayCylinder(o, d, ob.o);
    else t = rayWedge(o, d, ob.o, best);
    if (t !== null && t < best) best = t;
  }
  return best;
}

function rayAabb(o: Vec3, d: Vec3, b: Aabb): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const mins = [b.minX, b.minY, b.minZ];
  const maxs = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return null;
    } else {
      let t1 = (mins[i] - o[i]) / d[i];
      let t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function rayCylinder(o: Vec3, d: Vec3, c: Cylinder): number | null {
  const ox = o[0] - c.x;
  const oz = o[2] - c.z;
  const a = d[0] * d[0] + d[2] * d[2];
  if (a < 1e-9) return null;
  const b = 2 * (ox * d[0] + oz * d[2]);
  const cc = ox * ox + oz * oz - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return null;
  const y = o[1] + d[1] * t;
  if (y < 0 || y > c.h) return null;
  return t;
}

/** Ramps are rare along a shot, so march the ray in small steps. */
function rayWedge(o: Vec3, d: Vec3, w: Wedge, maxDist: number): number | null {
  for (let t = 0; t <= maxDist; t += 0.4) {
    const x = o[0] + d[0] * t;
    const y = o[1] + d[1] * t;
    const z = o[2] + d[2] * t;
    if (y >= w.y && y <= wedgeTop(w, x, z)) return t;
  }
  return null;
}

/** Distance along a unit-length ray to a sphere, or null if it misses. */
export function raySphere(o: Vec3, d: Vec3, center: Vec3, r: number): number | null {
  const ox = o[0] - center[0];
  const oy = o[1] - center[1];
  const oz = o[2] - center[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  return t >= 0 ? t : null;
}

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-9 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 1];
}

/** Rotates a vector by a unit quaternion [x, y, z, w]. */
export function rotateByQuat(v: Vec3, q: Quat): Vec3 {
  const [qx, qy, qz, qw] = q;
  const ix = qw * v[0] + qy * v[2] - qz * v[1];
  const iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0];
  const iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}

/** True if (x,z) is on lava that isn't covered by a stone bridge path. */
export function lavaAt(map: MapDef, x: number, z: number, pad = 0.3): boolean {
  let lava = false;
  for (const d of map.decals) {
    if (d.kind !== 'lava' && d.kind !== 'bridgepath') continue;
    const p = d.kind === 'lava' ? pad : 0;
    let inside: boolean;
    if (d.r !== undefined) {
      const dist = Math.hypot(x - d.x, z - d.z);
      inside = d.w !== undefined ? dist < d.r - p && dist > d.r - d.w + p : dist < d.r - p;
    } else inside = Math.abs(x - d.x) < d.w! / 2 - p && Math.abs(z - d.z) < d.d! / 2 - p;
    if (!inside) continue;
    if (d.kind === 'bridgepath') return false;
    lava = true;
  }
  return lava;
}

/**
 * Aim assist: the enemy closest to the line of fire inside a forward cone, with a clear line of
 * sight. Returns the unit direction from `origin` to it.
 */
export function assistTarget<T extends { pos: Vec3 }>(
  world: CollisionWorld,
  origin: Vec3,
  dir: Vec3,
  targets: Iterable<T>,
  cone: number,
  range: number,
): { dir: Vec3; dist: number; target: T } | null {
  const fl = Math.hypot(dir[0], dir[2]) || 1;
  const fx = dir[0] / fl;
  const fz = dir[2] / fl;
  let best: { dir: Vec3; dist: number; target: T } | null = null;
  let bestScore = Infinity;
  for (const t of targets) {
    const to: Vec3 = [t.pos[0] - origin[0], t.pos[1] + 0.2 - origin[1], t.pos[2] - origin[2]];
    const flat = Math.hypot(to[0], to[2]);
    const dist = Math.hypot(flat, to[1]);
    if (dist > range || flat < 0.5 || Math.abs(to[1]) > 6) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (to[0] * fx + to[2] * fz) / flat)));
    if (ang > cone) continue;
    const u: Vec3 = [to[0] / dist, to[1] / dist, to[2] / dist];
    // line of sight, checked a little above the karts so cones, hydrants and kerbs don't block it
    if (raycastWorld(world, [origin[0], origin[1] + 0.7, origin[2]], u, dist) < dist - 1.2) continue;
    const score = ang * 40 + dist;
    if (score < bestScore) {
      bestScore = score;
      best = { dir: u, dist, target: t };
    }
  }
  return best;
}
