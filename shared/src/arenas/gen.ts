import { rng } from '../random';
import { propCollider } from './colliders';
import type { BoxDef, CrateDef, DecalDef, DecalKind, MapDef, MapTheme, PropDef, RampDef, SpawnDef } from './types';

type Rect = { x0: number; z0: number; x1: number; z1: number };

const ROADLIKE: DecalKind[] = ['road', 'runway', 'sidewalk', 'boost', 'parking', 'boardwalk', 'path', 'plaza', 'track', 'checker', 'water', 'lava', 'bridgepath', 'glow'];

/**
 * Deterministic arena builder. Lay out decals → boxes/ramps → spawns/crates → scattered props;
 * every placement helper refuses spots that overlap something already placed.
 */
export class Arena {
  readonly rand: () => number;
  readonly boxes: BoxDef[] = [];
  readonly ramps: RampDef[] = [];
  readonly props: PropDef[] = [];
  readonly decals: DecalDef[] = [];
  readonly spawns: SpawnDef[] = [];
  readonly crates: CrateDef[] = [];
  private readonly reserved: { x: number; z: number; r: number }[] = [];

  constructor(
    readonly half: number,
    seed: number,
  ) {
    this.rand = rng(seed);
  }

  range(a: number, b: number) {
    return a + (b - a) * this.rand();
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rand() * items.length)];
  }

  // ------------------------------------------------------------ raw adds

  box(b: BoxDef) {
    this.boxes.push(b);
    return this;
  }

  ramp(r: RampDef) {
    this.ramps.push(r);
    return this;
  }

  prop(p: PropDef) {
    this.props.push(p);
    return this;
  }

  decal(d: DecalDef) {
    this.decals.push(d);
    return this;
  }

  /** Keep a circular area free of scattered props. */
  reserve(x: number, z: number, r: number) {
    this.reserved.push({ x, z, r });
    return this;
  }

  // ------------------------------------------------------------ queries

  private boxRect(b: BoxDef): Rect {
    return { x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2 };
  }

  onDecal(x: number, z: number, kinds: DecalKind[] = ROADLIKE, margin = 0): boolean {
    for (const d of this.decals) {
      if (!kinds.includes(d.kind)) continue;
      if ((d.kind === 'track' || d.kind === 'lava') && d.r !== undefined && d.w !== undefined) {
        const dist = Math.hypot(x - d.x, z - d.z);
        if (dist < d.r + margin && dist > d.r - d.w - margin) return true;
      } else if (d.r !== undefined) {
        if (Math.hypot(x - d.x, z - d.z) < d.r + margin) return true;
      } else if (d.w !== undefined && d.d !== undefined) {
        if (Math.abs(x - d.x) < d.w / 2 + margin && Math.abs(z - d.z) < d.d / 2 + margin) return true;
      }
    }
    return false;
  }

  /** True if a circle of radius r at (x,z) doesn't overlap obstacles, reserved areas or the arena edge. */
  free(x: number, z: number, r: number, opts: { roads?: boolean; reserved?: boolean } = {}): boolean {
    if (Math.abs(x) > this.half - r - 1.5 || Math.abs(z) > this.half - r - 1.5) return false;
    for (const b of this.boxes) {
      const q = this.boxRect(b);
      const cx = Math.max(q.x0, Math.min(x, q.x1));
      const cz = Math.max(q.z0, Math.min(z, q.z1));
      if (Math.hypot(x - cx, z - cz) < r) return false;
    }
    for (const rp of this.ramps) {
      if (Math.hypot(x - rp.x, z - rp.z) < r + Math.max(rp.w, rp.l) / 2 + 0.5) return false;
    }
    for (const p of this.props) {
      const c = propCollider(p);
      const pr = Math.max(c.r, 0.6 * (p.s ?? 1));
      if (Math.hypot(x - p.x, z - p.z) < r + pr) return false;
    }
    if (opts.reserved !== false) {
      for (const q of this.reserved) if (Math.hypot(x - q.x, z - q.z) < r + q.r) return false;
    }
    if (!opts.roads && this.onDecal(x, z, ROADLIKE, r)) return false;
    return true;
  }

  // ------------------------------------------------------------ placement helpers

  /** Randomly scatter up to `count` props in a region, skipping blocked spots. */
  scatter(
    count: number,
    region: [number, number, number, number],
    make: (x: number, z: number) => PropDef,
    opts: { radius?: number; roads?: boolean; tries?: number } = {},
  ) {
    const [x0, z0, x1, z1] = region;
    let placed = 0;
    for (let t = 0; t < (opts.tries ?? count * 25) && placed < count; t++) {
      const x = this.range(x0, x1);
      const z = this.range(z0, z1);
      const p = make(x, z);
      const r = opts.radius ?? Math.max(propCollider(p).r, 0.8) + 0.6;
      if (!this.free(x, z, r, { roads: opts.roads })) continue;
      this.props.push(p);
      placed++;
    }
    return placed;
  }

  /** Props spaced along a line, skipping blocked spots. */
  line(x0: number, z0: number, x1: number, z1: number, spacing: number, make: (x: number, z: number, i: number) => PropDef, r = 0.6) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.floor(len / spacing));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      if (this.onDecal(x, z, ['road', 'runway'], r)) continue;
      if (this.free(x, z, r, { roads: true })) this.props.push(make(x, z, i));
    }
  }

  /** On lava that isn't covered by a bridge path. */
  onLava(x: number, z: number, margin = 1.5): boolean {
    return this.onDecal(x, z, ['lava'], margin) && !this.onDecal(x, z, ['bridgepath'], 0);
  }

  /** Adds the first `n` candidates that are clear, and reserves space around them. */
  addSpawns(cands: [number, number, number][], n: number) {
    for (const [x, z, yaw] of cands) {
      if (this.spawns.length >= n) break;
      if (!this.free(x, z, 2.5, { roads: true }) || this.onLava(x, z)) continue;
      this.spawns.push({ x, z, yaw });
      this.reserve(x, z, 4);
    }
  }

  addCrates(cands: [number, number, number?][], n: number) {
    for (const [x, z, y] of cands) {
      if (this.crates.length >= n) break;
      if (y) {
        this.crates.push({ x, z, y });
        continue;
      }
      if (!this.free(x, z, 1.6, { roads: true, reserved: false }) || this.onLava(x, z, 0.5)) continue;
      if (this.crates.some((c) => Math.hypot(c.x - x, c.z - z) < 6)) continue;
      this.crates.push({ x, z });
      this.reserve(x, z, 3);
    }
  }

  /** Points on a ring, facing the centre (useful spawn candidates). */
  ring(radius: number, n: number, offset = 0): [number, number, number][] {
    return Array.from({ length: n }, (_, i) => {
      const a = offset + (i / n) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      return [x, z, Math.atan2(-x, -z)] as [number, number, number];
    });
  }

  grid(step: number, margin: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let x = -this.half + margin; x <= this.half - margin; x += step) {
      for (let z = -this.half + margin; z <= this.half - margin; z += step) pts.push([x, z]);
    }
    return pts;
  }

  build(meta: { id: string; name: string; description: string; theme: MapTheme }): MapDef {
    return {
      ...meta,
      half: this.half,
      decals: this.decals,
      boxes: this.boxes,
      ramps: this.ramps,
      props: this.props,
      spawns: this.spawns,
      crates: this.crates,
    };
  }
}

/** Yaw that points from (x,z) toward the arena centre. */
export const faceCentre = (x: number, z: number) => Math.atan2(-x, -z);

/** Uniformly shrinks a layout's footprint (positions and floor sizes; heights and prop sizes stay). */
export function shrink(map: MapDef, k: number): MapDef {
  const s = (v: number) => Math.round(v * k * 100) / 100;
  return {
    ...map,
    half: Math.round(map.half * k),
    decals: map.decals.map((d) => ({ ...d, x: s(d.x), z: s(d.z), w: d.w === undefined ? undefined : s(d.w), d: d.d === undefined ? undefined : s(d.d), r: d.r === undefined ? undefined : s(d.r) })),
    boxes: map.boxes.map((b) => ({ ...b, x: s(b.x), z: s(b.z), w: s(b.w), d: s(b.d) })),
    ramps: map.ramps.map((r) => ({ ...r, x: s(r.x), z: s(r.z), w: s(r.w), l: s(r.l) })),
    props: map.props.map((p) => ({ ...p, x: s(p.x), z: s(p.z) })),
    spawns: map.spawns.map((p) => ({ ...p, x: s(p.x), z: s(p.z) })),
    crates: map.crates.map((p) => ({ ...p, x: s(p.x), z: s(p.z) })),
  };
}
