import { Arena } from './gen';
import type { MapDef } from './types';

const PI = Math.PI;

export function space(): MapDef {
  const a = new Arena(38, 3141);

  // guide strips and launch pads
  for (const s of [-1, 1]) {
    a.decal({ kind: 'glow', x: 0, z: s * 7, w: 56, d: 0.4 });
    a.decal({ kind: 'glow', x: s * 7, z: 0, w: 0.4, d: 56 });
  }
  for (const [x, z, rot] of [
    [0, -30, 0],
    [0, 30, PI],
    [-30, 0, PI / 2],
    [30, 0, -PI / 2],
  ] as const) {
    a.decal({ kind: 'boost', x, z, w: 4, d: 4, rot });
  }

  // reactor core in the middle, four station modules around it
  a.prop({ kind: 'reactor', x: 0, z: 0 });
  const M = 4;
  for (const [x, z] of [
    [-17, -17],
    [17, -17],
    [-17, 17],
    [17, 17],
  ]) {
    a.box({ kind: 'module', x, z, w: 8, d: 8, h: M, color: x * z > 0 ? '#cfd8e6' : '#c4d2e4' });
  }
  // ramps onto the modules and catwalk bridges between them (you can drive underneath)
  a.ramp({ x: 17, z: 9.5, w: 4, l: 7, h: M, rot: 0, style: 'metal' });
  a.ramp({ x: -17, z: 9.5, w: 4, l: 7, h: M, rot: 0, style: 'metal' });
  a.ramp({ x: -17, z: -9.5, w: 4, l: 7, h: M, rot: PI, style: 'metal' });
  a.ramp({ x: 17, z: -9.5, w: 4, l: 7, h: M, rot: PI, style: 'metal' });
  a.box({ kind: 'bridge', x: 0, z: -17, w: 26.2, d: 4, y: M - 0.5, h: 0.5, color: '#8f9cb8' });
  a.box({ kind: 'bridge', x: 0, z: 17, w: 26.2, d: 4, y: M - 0.5, h: 0.5, color: '#8f9cb8' });

  for (const [x, z] of [
    [-31, -31],
    [31, 31],
  ]) {
    a.prop({ kind: 'dome', x, z, s: 0.8 });
  }
  for (const [x, z] of [
    [-32, 32],
    [32, -32],
  ]) {
    a.prop({ kind: 'antenna', x, z });
  }
  for (const [x, z, rot] of [
    [-25, -9, PI / 2],
    [25, 9, -PI / 2],
    [9, -25, 0],
    [-9, 25, PI],
  ] as const) {
    a.ramp({ x, z, w: 5, l: 6, h: 1.7, rot, style: 'metal' });
  }

  a.addSpawns(
    [
      [-28, -20, PI / 2],
      [28, 20, -PI / 2],
      [20, -28, 0],
      [-20, 28, PI],
      [-11, -32, 0],
      [11, 32, PI],
      [-32, 11, PI / 2],
      [32, -11, -PI / 2],
      [11, -32, 0],
      [-11, 32, PI],
      [-32, -11, PI / 2],
      [32, 11, -PI / 2],
    ],
    12,
  );
  a.addCrates(
    [
      [-17, -17, M],
      [17, 17, M],
      [17, -17, M],
      [-17, 17, M],
      [0, -17, M],
      [0, 17, M],
      [-7, -7],
      [7, 7],
      [-7, 7],
      [7, -7],
      [-24, 0],
      [24, 0],
      [0, -24],
      [0, 24],
      [-30, -22],
      [30, 22],
      [22, -30],
      [-22, 30],
    ],
    20,
  );
  a.scatter(8, [-36, -36, 36, 36], (x, z) => ({ kind: a.pick(['crate', 'barrel_blue'] as const), x, z, rot: a.range(0, 6) }), { radius: 1.2 });

  return a.build({
    id: 'space',
    name: 'Space Station',
    description: 'Low gravity! Catwalks, station modules, launch pads and a reactor core.',
    theme: {
      mood: 'space',
      ground: 'concrete_floor_02',
      groundTint: '#cdd4e2',
      groundTile: 5,
      wall: 'metal',
      backdrop: 'space',
      gravity: -17,
      minimap: '#6a7386',
    },
  });
}
