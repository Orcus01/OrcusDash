import { Arena } from './gen';
import type { MapDef } from './types';

const PI = Math.PI;

export function canyon(): MapDef {
  const a = new Arena(38, 5151);

  a.decal({ kind: 'path', x: 0, z: 22, w: 76, d: 7 });
  a.decal({ kind: 'path', x: 0, z: -2, w: 7, d: 48 });

  // two mesas joined by a rope bridge; boost up the ramp, cross over, or race underneath
  const M = 4.5;
  a.box({ kind: 'rock', x: -16, z: 0, w: 11, d: 11, h: M });
  a.box({ kind: 'rock', x: 16, z: 0, w: 11, d: 11, h: M });
  a.box({ kind: 'bridge', x: 0, z: 0, w: 21.2, d: 4, y: M - 0.5, h: 0.5, color: '#9a6a3c' });
  a.ramp({ x: -16, z: -10, w: 5, l: 9, h: M, rot: 0, style: 'dirt' });
  a.ramp({ x: 16, z: 10, w: 5, l: 9, h: M, rot: PI, style: 'dirt' });
  a.decal({ kind: 'boost', x: -16, z: -19, w: 4, d: 4, rot: 0 });
  a.decal({ kind: 'boost', x: 16, z: 19, w: 4, d: 4, rot: PI });

  // ruined fort to the north
  for (const [x, z, w, d, h] of [
    [-10, -33, 8, 1.6, 3],
    [10, -33, 8, 1.6, 2.4],
    [-15, -26, 1.6, 8, 2.6],
    [15, -26, 1.6, 8, 2],
    [-9, -19, 5, 1.6, 2],
    [9, -19, 5, 1.6, 2.4],
  ]) {
    a.box({ kind: 'ruin', x, z, w, d, h, mat: 'sandstone_blocks_05' });
  }
  for (const [x, z] of [
    [-15, -33],
    [15, -33],
  ]) {
    a.box({ kind: 'pillar', x, z, w: 2.4, d: 2.4, h: 4.5, color: '#d0a070' });
  }

  // shacks and jumps down south
  a.box({ kind: 'shack', x: -27, z: 31, w: 6, d: 5, h: 3.2 });
  a.box({ kind: 'shack', x: 27, z: 32, w: 5, d: 5, h: 3 });
  for (const [x, z, rot] of [
    [-29, 10, PI / 2],
    [29, -10, -PI / 2],
    [-6, 31, PI],
    [30, 18, -PI / 2],
    [-28, -14, 0],
  ] as const) {
    a.ramp({ x, z, w: 5, l: 6, h: 1.7, rot, style: 'dirt' });
  }

  a.addSpawns(
    [
      [0, 33, PI],
      [-33, 22, PI / 2],
      [33, 24, -PI / 2],
      [-34, -4, PI / 2],
      [34, 4, -PI / 2],
      [0, -26, PI],
      [-26, -33, PI / 4],
      [26, -33, -PI / 4],
      [-12, 16, PI],
      [12, -16, 0],
      [-20, 26, PI / 2],
      [20, 27, -PI / 2],
      [6, 12, PI],
      [-6, -12, 0],
    ],
    12,
  );
  a.addCrates(
    [
      [-16, 0, M],
      [16, 0, M],
      [0, 0, M],
      [0, -27],
      [-7, -26],
      [7, -26],
      [0, 9],
      [-26, 22],
      [26, 22],
      [-31, -24],
      [31, -24],
      [0, 22],
      [-16, 32],
      [16, 30],
      [-34, 4],
      [34, -4],
      [-22, 13],
      [22, -13],
      [-9, -9],
      [9, 9],
    ],
    20,
  );

  a.scatter(10, [-36, -36, 36, 36], (x, z) => ({ kind: 'cactus', x, z, s: a.range(0.8, 1.2), rot: a.range(0, 6) }), { radius: 1.4 });
  a.scatter(4, [-36, -36, 36, 36], (x, z) => ({ kind: 'dead_tree', x, z, s: a.range(0.9, 1.3), rot: a.range(0, 6) }), { radius: 1.4 });
  a.scatter(6, [-36, -36, 36, 36], (x, z) => ({ kind: 'boulder', x, z, s: a.range(0.6, 0.9), rot: a.range(0, 6) }), { radius: 2.2 });
  a.scatter(6, [-36, -36, 36, 36], (x, z) => ({ kind: 'barrel', x, z, rot: a.range(0, 6) }), { radius: 1 });
  a.scatter(4, [-36, -36, 36, 36], (x, z) => ({ kind: 'crate', x, z, rot: a.range(0, 6) }), { radius: 1.2 });

  return a.build({
    id: 'canyon',
    name: 'Desert Canyon',
    description: 'Sun-baked mesas, a rope bridge, boost pads and a ruined fort.',
    theme: {
      mood: 'day',
      ground: 'coast_sand_01',
      groundTint: '#f0cfa2',
      groundTile: 7,
      wall: 'rock',
      backdrop: 'canyon',
      minimap: '#c48a58',
    },
  });
}
