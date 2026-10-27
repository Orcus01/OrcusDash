import { Arena } from './gen';
import type { MapDef } from './types';

const PI = Math.PI;

export function jungle(): MapDef {
  const a = new Arena(38, 8383);

  // a river across the south with stone crossings (water slows you down)
  a.decal({ kind: 'water', x: 0, z: 26, w: 76, d: 6 });
  for (const x of [-20, 0, 20]) a.decal({ kind: 'bridgepath', x, z: 26, w: 6, d: 7 });
  a.decal({ kind: 'path', x: 0, z: -2, w: 7, d: 46 });
  a.decal({ kind: 'path', x: 0, z: -2, w: 60, d: 6 });

  // stepped temple you can climb to the top; boost pads launch you up the stairs
  a.box({ kind: 'ruin', x: 0, z: 0, w: 22, d: 22, h: 2, mat: 'castle_brick_01' });
  a.box({ kind: 'ruin', x: 0, z: 0, w: 14, d: 14, h: 2, y: 2, mat: 'castle_brick_01' });
  a.box({ kind: 'ruin', x: 0, z: 0, w: 7, d: 7, h: 2, y: 4, mat: 'castle_brick_01' });
  a.ramp({ x: 0, z: -13.5, w: 5, l: 5, h: 2, rot: 0, style: 'stone' });
  a.ramp({ x: 0, z: -9, w: 4, l: 4, h: 2, y: 2, rot: 0, style: 'stone' });
  a.ramp({ x: 0, z: -5.25, w: 3, l: 3.5, h: 2, y: 4, rot: 0, style: 'stone' });
  a.ramp({ x: 13.5, z: 0, w: 5, l: 5, h: 2, rot: -PI / 2, style: 'stone' });
  a.ramp({ x: -13.5, z: 0, w: 5, l: 5, h: 2, rot: PI / 2, style: 'stone' });
  a.decal({ kind: 'boost', x: 0, z: -21, w: 4, d: 4, rot: 0 });
  a.decal({ kind: 'boost', x: -21, z: 0, w: 4, d: 4, rot: PI / 2 });
  a.decal({ kind: 'boost', x: 21, z: 0, w: 4, d: 4, rot: -PI / 2 });

  // crumbling walls and columns around the plaza
  for (const [x, z, w, d, h] of [
    [-20, -18, 7, 1.6, 2.6],
    [20, -18, 7, 1.6, 2],
    [-27, -4, 1.6, 7, 2.4],
    [27, 7, 1.6, 7, 2.8],
    [-12, 16, 6, 1.6, 1.8],
    [13, 16, 6, 1.6, 2.4],
  ]) {
    a.box({ kind: 'ruin', x, z, w, d, h, mat: 'castle_brick_01' });
  }
  for (const [x, z, h] of [
    [-15, -14, 5],
    [15, -14, 4],
    [-15, 12, 4.5],
    [15, 12, 5],
    [-30, -29, 4],
    [30, -29, 5],
  ]) {
    a.box({ kind: 'pillar', x, z, w: 1.8, d: 1.8, h, color: '#9aa68a' });
  }
  for (const [x, z, rot] of [
    [-29, -16, PI / 2],
    [29, -18, -PI / 2],
    [-27, 14, PI / 2],
    [27, 17, -PI / 2],
  ] as const) {
    a.ramp({ x, z, w: 5, l: 6, h: 1.6, rot, style: 'dirt' });
  }
  for (const [x, z, rot] of [
    [-20, -29, 0.6],
    [20, -29, -0.6],
  ]) {
    a.prop({ kind: 'statue', x, z, rot });
  }

  a.addSpawns(
    [
      [0, -33, 0],
      [-33, -33, PI / 4],
      [33, -33, -PI / 4],
      [-33, 2, PI / 2],
      [33, -2, -PI / 2],
      [-20, -9, PI / 2],
      [20, -9, -PI / 2],
      [0, 33, PI],
      [-24, 33, PI],
      [24, 33, PI],
      [-18, 20, PI / 2],
      [18, 20, -PI / 2],
      [-10, -24, 0],
      [10, -24, 0],
    ],
    12,
  );
  a.addCrates(
    [
      [0, 0, 6],
      [-9, 0, 2],
      [9, 0, 2],
      [0, 6, 4],
      [0, -26],
      [-20, 26],
      [0, 26],
      [20, 26],
      [-32, -10],
      [32, -10],
      [-20, 6],
      [21, -6],
      [-33, 33],
      [33, 33],
      [-26, -24],
      [26, -24],
      [-8, -18],
      [8, 19],
    ],
    20,
  );

  for (const [x, z] of [
    [-5, -16],
    [5, -16],
    [-12, -12],
    [12, -12],
  ]) {
    a.prop({ kind: 'torch', x, z });
  }
  a.scatter(18, [-36, -36, 36, 36], (x, z) => ({ kind: 'jungle_tree', x, z, s: a.range(0.8, 1.1), rot: a.range(0, 6) }), { radius: 2.4 });
  a.scatter(26, [-36, -36, 36, 36], (x, z) => ({ kind: 'fern', x, z, s: a.range(0.8, 1.2), rot: a.range(0, 6) }), { radius: 1 });
  a.scatter(6, [-36, -36, 36, 36], (x, z) => ({ kind: 'rock', x, z, s: a.range(0.7, 1.1), rot: a.range(0, 6) }));

  return a.build({
    id: 'jungle',
    name: 'Jungle Temple',
    description: 'Boost up the stepped temple, ford the river and duck behind the ruins.',
    theme: {
      mood: 'day',
      ground: 'forrest_ground_01',
      groundTint: '#c2cf98',
      groundTile: 5,
      wall: 'stone',
      backdrop: 'jungle',
      minimap: '#5f8048',
    },
  });
}
