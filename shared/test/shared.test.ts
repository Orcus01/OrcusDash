import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  KART_BALL_RADIUS,
  MAPS,
  collisionWorld,
  generateCode,
  getMap,
  isValidCode,
  normalizeCode,
  pointBlocked,
  raySphere,
  raycastWorld,
  rotateByQuat,
  surfaceHeight,
} from '../src';

describe('join codes', () => {
  it('generates 6-char codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toHaveLength(6);
      expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
      expect(isValidCode(code)).toBe(true);
    }
  });

  it('never returns a code that is already taken', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = generateCode((c) => taken.has(c));
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
  });

  it('normalizes user input', () => {
    expect(normalizeCode(' k7q-2xm ')).toBe('K7Q2XM');
    expect(isValidCode(normalizeCode('k7q 2xm'))).toBe(true);
    expect(isValidCode('K7Q2X')).toBe(false);
    expect(isValidCode('K7Q2X0')).toBe(false); // 0 is not in the alphabet
  });
});

describe('maps', () => {
  it('has 8 arenas with unique ids', () => {
    expect(MAPS).toHaveLength(8);
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(8);
  });

  it('generates identical layouts every time (server and clients must agree)', async () => {
    const again = await import('../src/arenas/docks');
    expect(JSON.stringify((await import('../src/arenas/gen')).shrink(again.docks(), 1.5))).toBe(JSON.stringify(getMap('docks')));
  });

  for (const map of MAPS) {
    describe(map.name, () => {
      const world = collisionWorld(map);
      const clearAround = (x: number, y: number, z: number, r: number) => {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          if (pointBlocked(world, [x + Math.cos(a) * r, y, z + Math.sin(a) * r])) return false;
        }
        return !pointBlocked(world, [x, y, z]);
      };

      it('is a compact Smash Karts-sized arena', () => {
        expect(map.half).toBeGreaterThanOrEqual(50);
        expect(map.half).toBeLessThanOrEqual(63);
      });

      it('has 12 spawns, all clear of obstacles', () => {
        expect(map.spawns.length).toBe(12);
        for (const s of map.spawns) expect(clearAround(s.x, KART_BALL_RADIUS, s.z, 1.5), `spawn ${s.x},${s.z}`).toBe(true);
      });

      it('has plenty of reachable crates', () => {
        expect(map.crates.length).toBeGreaterThanOrEqual(12);
        for (const c of map.crates) {
          const y = (c.y ?? 0) + KART_BALL_RADIUS + 0.05;
          expect(clearAround(c.x, y, c.z, 1), `crate ${c.x},${c.z}`).toBe(true);
        }
      });

      it('keeps ramps inside the arena', () => {
        for (const r of map.ramps) {
          const c = Math.cos(r.rot);
          const s = Math.sin(r.rot);
          for (const [lx, lz] of [
            [-r.w / 2, -r.l / 2],
            [r.w / 2, -r.l / 2],
            [-r.w / 2, r.l / 2],
            [r.w / 2, r.l / 2],
          ]) {
            expect(Math.abs(r.x + lx * c + lz * s)).toBeLessThanOrEqual(map.half + 0.01);
            expect(Math.abs(r.z - lx * s + lz * c)).toBeLessThanOrEqual(map.half + 0.01);
          }
        }
      });
    });
  }
});

describe('geometry', () => {
  it('raySphere hits a sphere straight ahead', () => {
    expect(raySphere([0, 0, 0], [0, 0, 1], [0, 0, 10], 1)).toBeCloseTo(9);
    expect(raySphere([0, 0, 0], [0, 0, 1], [5, 0, 10], 1)).toBeNull();
  });

  it('raycastWorld stops before the arena wall', () => {
    const map = MAPS[0];
    const d = raycastWorld(collisionWorld(map), [0, 1, -10], [0, 0, -1], 500);
    expect(d).toBeLessThan(map.half);
  });

  it('knows the temple steps and ramp heights in the jungle', () => {
    const world = collisionWorld(getMap('jungle')!);
    expect(surfaceHeight(world, 0, 0, 10)).toBeCloseTo(6); // temple top
    expect(surfaceHeight(world, 13.5, 0, 10)).toBeCloseTo(2); // first step
    const mid = surfaceHeight(world, 0, -20.25, 10); // halfway up the first stair ramp
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1.5);
    expect(pointBlocked(world, [0, 0.4, -13.5])).toBe(true);
  });

  it('rotates by quaternion', () => {
    const yaw90: [number, number, number, number] = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
    const v = rotateByQuat([0, 0, 1], yaw90);
    expect(v[0]).toBeCloseTo(1);
    expect(v[2]).toBeCloseTo(0);
  });
});
