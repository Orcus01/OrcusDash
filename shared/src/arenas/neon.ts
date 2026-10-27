import { Arena } from './gen';
import type { MapDef } from './types';

const PI = Math.PI;
const SIGNS = ['NOODLES', 'HOTEL', 'ARCADE', 'KARAOKE', 'PIZZA', '24/7', 'CLUB', 'RAMEN'];
const CARS = ['#d64545', '#2f6fd0', '#f0c419', '#3fa66b', '#e8e8e8', '#8a4fd0'];
const TALL = ['#c97b5a', '#5f8fb8', '#d9b46a', '#7aa070'];
const LOW = ['#e0c9a6', '#b86b6b', '#8fb0c9', '#c9a0c0'];

/** Rotate a point by k quarter-turns around the centre (for symmetric quadrants). */
const rot = (x: number, z: number, k: number): [number, number] => {
  for (let i = 0; i < k; i++) [x, z] = [-z, x];
  return [x, z];
};

export function neon(): MapDef {
  const a = new Arena(36, 4646);

  for (const along of [true, false]) {
    a.decal({ kind: 'sidewalk', x: 0, z: 0, w: along ? 72 : 15, d: along ? 15 : 72 });
  }
  a.decal({ kind: 'road', x: 0, z: 0, w: 72, d: 10 });
  a.decal({ kind: 'road', x: 0, z: 0, w: 10, d: 72 });
  for (const [x, z, w, d] of [
    [0, -7.5, 10, 3],
    [0, 7.5, 10, 3],
    [-7.5, 0, 3, 10],
    [7.5, 0, 3, 10],
  ]) {
    a.decal({ kind: 'crosswalk', x, z, w, d });
  }

  // overpass across the junction: boost up the on-ramps and fly over, or race underneath
  const B = 3.5;
  a.box({ kind: 'bridge', x: 0, z: 0, w: 20, d: 6, y: B, h: 0.5, color: '#6a7080' });
  a.ramp({ x: -14, z: 0, w: 6, l: 8, h: B + 0.5, rot: PI / 2, style: 'concrete' });
  a.ramp({ x: 14, z: 0, w: 6, l: 8, h: B + 0.5, rot: -PI / 2, style: 'concrete' });
  a.decal({ kind: 'boost', x: -22, z: 0, w: 4, d: 4, rot: PI / 2 });
  a.decal({ kind: 'boost', x: 22, z: 0, w: 4, d: 4, rot: -PI / 2 });
  a.decal({ kind: 'boost', x: 0, z: -22, w: 4, d: 4, rot: 0 });
  a.decal({ kind: 'boost', x: 0, z: 22, w: 4, d: 4, rot: PI });

  // four rotated city blocks: a tall corner building, a low shop and a rooftop car park to jump off
  const P = 3.5;
  for (let k = 0; k < 4; k++) {
    const place = (x: number, z: number) => rot(x, z, k);
    const swap = k % 2 === 1;
    const [ax, az] = place(31.5, 12);
    a.box({ kind: 'building', x: ax, z: az, w: swap ? 8 : 9, d: swap ? 9 : 8, h: 14 + k * 2, color: TALL[k], label: SIGNS[k * 2] });
    const [bx, bz] = place(12, 28);
    a.box({ kind: 'building', x: bx, z: bz, w: swap ? 9 : 7, d: swap ? 7 : 9, h: 8, color: LOW[k], label: SIGNS[k * 2 + 1] });
    const [cx, cz] = place(26, 27);
    a.box({ kind: 'platform', x: cx, z: cz, w: swap ? 10 : 12, d: swap ? 12 : 10, h: P, color: '#8a8f99' });
    const [rx, rz] = place(23, 18.5);
    a.ramp({ x: rx, z: rz, w: 5, l: 7, h: P, rot: -(k * PI) / 2, style: 'concrete' }); // rotating positions by +90° turns yaw by -90°
    for (const t of [22, 29]) {
      const [px, pz] = place(t, 3.9);
      a.box({ kind: 'car', x: px, z: pz, w: swap ? 1.9 : 4.2, d: swap ? 4.2 : 1.9, h: 1.45, color: CARS[(k * 2 + t) % CARS.length] });
    }
  }

  a.addSpawns(
    [
      [0, -32, 0],
      [0, 32, PI],
      [-32, 0, PI / 2],
      [32, 0, -PI / 2],
      [-14, -14, PI / 4],
      [14, 14, -PI * 0.75],
      [14, -14, -PI / 4],
      [-14, 14, PI * 0.75],
      [-26, 4, PI / 2],
      [26, -4, -PI / 2],
      [4, 26, PI],
      [-4, -26, 0],
      [-8, -31, 0],
      [8, 31, PI],
    ],
    12,
  );
  const crates: [number, number, number?][] = [[0, 0, B + 0.5], [-6, 0, B + 0.5], [6, 0, B + 0.5]];
  for (let k = 0; k < 4; k++) {
    const [px, pz] = rot(26, 28, k);
    crates.push([px, pz, P]);
    for (const [x, z] of [
      [18, 11],
      [30, 1],
      [11, 19],
    ]) {
      const [qx, qz] = rot(x, z, k);
      crates.push([qx, qz]);
    }
  }
  a.addCrates(crates, 20);

  for (let k = 0; k < 4; k++) {
    for (const t of [11, 25]) {
      const [lx, lz] = rot(t, 6.6, k);
      a.prop({ kind: 'streetlamp', x: lx, z: lz, rot: (k * PI) / 2 + PI });
    }
    const [tx, tz] = rot(18, -6.6, k);
    a.prop({ kind: 'tree', x: tx, z: tz, s: 0.8 });
    const [nx, nz] = rot(8.5, 20, k);
    a.prop({ kind: 'neon', x: nx, z: nz, rot: (k * PI) / 2 });
  }
  a.scatter(4, [-34, -34, 34, 34], (x, z) => ({ kind: 'dumpster', x, z, rot: a.range(0, 6) }), { radius: 1.6 });
  a.scatter(4, [-34, -34, 34, 34], (x, z) => ({ kind: 'vending', x, z, rot: a.range(0, 6) }), { radius: 1.2 });
  a.scatter(8, [-34, -34, 34, 34], (x, z) => ({ kind: 'cone', x, z, rot: a.range(0, 6) }), { roads: true, radius: 0.8 });
  a.scatter(6, [-34, -34, 34, 34], (x, z) => ({ kind: 'hydrant', x, z }), { roads: true, radius: 1 });

  return a.build({
    id: 'neon',
    name: 'Downtown',
    description: 'Golden-hour streets: boost over the overpass and jump off rooftop car parks.',
    theme: {
      mood: 'golden',
      ground: 'concrete_pavement',
      groundTint: '#c8c3b8',
      groundTile: 3,
      wall: 'concrete',
      backdrop: 'city',
      minimap: '#6d6a64',
    },
  });
}
