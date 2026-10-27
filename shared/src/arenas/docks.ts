import { Arena } from './gen';
import type { MapDef } from './types';

const PI = Math.PI;
const BOXES = ['#c0392b', '#2e6fc0', '#2f9a4a', '#e0a82c', '#e8e8e2', '#d2691e', '#16a0a0', '#8e44ad'];
const CL = 12.2;
const CW = 2.44;
const CH = 2.6;

export function docks(): MapDef {
  const a = new Arena(38, 7272);

  a.decal({ kind: 'road', x: 0, z: 12, w: 76, d: 8 });
  a.decal({ kind: 'road', x: 28, z: -13, w: 8, d: 50 });

  // container yard: rows with lanes between, some stacks you can drive up onto and jump off
  const rows = [-30, -20, -10];
  rows.forEach((z, ri) => {
    let x = -35 + ri * 2;
    let lastEnd = -100;
    let n = 0;
    while (x < 12) {
      const len = n % 3 === 2 ? CL / 2 : CL;
      const tall = (n + ri) % 3 === 0 ? 2 : 1;
      for (let lvl = 0; lvl < tall; lvl++) {
        a.box({ kind: 'container', x: x + len / 2, z, w: len, d: CW, h: CH, y: lvl * CH, color: BOXES[(n * 3 + ri + lvl) % BOXES.length] });
      }
      if (tall === 1 && x - lastEnd >= 9 && x > -31) {
        a.ramp({ x: x - 4.1, z, w: 2.4, l: 8, h: CH, rot: PI / 2, style: 'metal' });
        a.crates.push({ x: x + len / 2, z, y: CH });
      }
      lastEnd = x + len;
      x += len + 8 + (n % 2) * 2;
      n++;
    }
  });

  // gantry crane over the quay
  a.prop({ kind: 'crane', x: 28, z: -24 });
  for (const sx of [-8, 8]) for (const sz of [-4.5, 4.5]) a.box({ kind: 'steel', x: 28 + sx, z: -24 + sz, w: 1, d: 1, h: 20, hidden: true });

  // warehouses past the road
  a.box({ kind: 'warehouse', x: -20, z: 28, w: 20, d: 12, h: 8, mat: 'corrugated_iron', color: '#6fa3dc' });
  a.box({ kind: 'warehouse', x: 12, z: 29, w: 16, d: 10, h: 7, mat: 'corrugated_iron', color: '#e08a6a' });
  a.ramp({ x: 30, z: 26, w: 5, l: 6, h: 1.7, rot: PI, style: 'metal' });
  a.ramp({ x: -4, z: 4, w: 5, l: 6, h: 1.5, rot: -PI / 2, style: 'metal' });
  a.ramp({ x: -2, z: 22, w: 5, l: 6, h: 1.7, rot: PI / 2, style: 'metal' });
  a.decal({ kind: 'boost', x: -24, z: 12, w: 4, d: 4, rot: PI / 2 });
  a.decal({ kind: 'boost', x: 18, z: 12, w: 4, d: 4, rot: -PI / 2 });
  a.decal({ kind: 'boost', x: 28, z: 0, w: 4, d: 4, rot: PI });

  a.addSpawns(
    [
      [-32, 12, PI / 2],
      [34, 12, -PI / 2],
      [6, 12, PI / 2],
      [28, -33, 0],
      [28, 4, PI],
      [-34, -15, PI / 2],
      [-34, -25, PI / 2],
      [18, -15, -PI / 2],
      [18, -25, -PI / 2],
      [-8, 19, PI / 2],
      [34, 32, PI],
      [-34, 33, PI / 2],
      [-12, 4, PI / 2],
      [12, 4, -PI / 2],
    ],
    12,
  );
  const lanes: [number, number][] = [];
  for (const z of [-25, -15, -5]) for (const x of [-26, -8, 10]) lanes.push([x, z]);
  a.addCrates([[0, 12], [-14, 12], [14, 12], [28, -12], [28, 6], [-30, 20], [30, 20], ...lanes], 22);

  a.line(-36, -36.6, 36, -36.6, 6, (x, z) => ({ kind: 'bollard', x, z }), 0.4);
  a.line(36.6, -36, 36.6, 36, 6, (x, z) => ({ kind: 'bollard', x, z }), 0.4);
  for (const [x, z] of [
    [-36, 20],
    [36, 36],
    [-2, -36],
  ]) {
    a.prop({ kind: 'light_tower', x, z });
  }
  a.scatter(10, [-36, -36, 36, 36], (x, z) => ({ kind: a.pick(['barrel', 'barrel_blue'] as const), x, z, rot: a.range(0, 6) }), { radius: 1 });
  a.scatter(6, [-36, -36, 36, 36], (x, z) => ({ kind: 'crate', x, z, rot: a.range(0, 6), s: a.range(1, 1.3) }), { radius: 1.2 });
  a.scatter(4, [-36, -36, 36, 36], (x, z) => ({ kind: 'tyres', x, z }), { radius: 1.2 });
  a.prop({ kind: 'ship', x: -10, z: -100, rot: 0.1 });

  return a.build({
    id: 'docks',
    name: 'Harbor Docks',
    description: 'A sunny container yard: drive across the stacks, under the crane and over the jumps.',
    theme: {
      mood: 'day',
      ground: 'concrete_floor_02',
      groundTint: '#e2ded4',
      groundTile: 6,
      wall: 'rail',
      backdrop: 'docks',
      water: ['n', 'e'],
      minimap: '#7a7c80',
    },
  });
}
