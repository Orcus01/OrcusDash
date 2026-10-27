import { Arena } from './gen';
import type { MapDef } from './types';

const PI = Math.PI;

export function lavapit(): MapDef {
  const a = new Arena(38, 6666);

  // a moat of lava around the volcano island, plus four lava rivers; stone paths are safe
  a.decal({ kind: 'lava', x: 0, z: 0, r: 17, w: 5 });
  for (const [x, z, w, d] of [
    [0, -14.5, 5, 7],
    [0, 14.5, 5, 7],
    [-14.5, 0, 7, 5],
    [14.5, 0, 7, 5],
  ]) {
    a.decal({ kind: 'bridgepath', x, z, w, d });
  }
  for (const [x, z, w, d, bx, bz, bw, bd] of [
    [-28, 0, 4, 28, -28, 6, 6, 5],
    [28, 0, 4, 28, 28, -6, 6, 5],
    [0, -28, 28, 4, -6, -28, 5, 6],
    [0, 28, 28, 4, 6, 28, 5, 6],
  ]) {
    a.decal({ kind: 'lava', x, z, w, d });
    a.decal({ kind: 'bridgepath', x: bx, z: bz, w: bw, d: bd });
  }
  a.reserve(0, 0, 18);

  // volcano island in the middle
  const H = 2.5;
  a.box({ kind: 'platform', x: 0, z: 0, w: 10, d: 10, h: H, color: '#7a5448' });
  a.ramp({ x: 0, z: -8, w: 5, l: 6, h: H, rot: 0, style: 'dirt' });
  a.ramp({ x: 0, z: 8, w: 5, l: 6, h: H, rot: PI, style: 'dirt' });
  a.prop({ kind: 'crystal', x: 3.5, z: 3.5, y: H, s: 1.1 });
  a.prop({ kind: 'crystal', x: -3.5, z: -3.5, y: H, s: 1.1 });

  // rock pillars for cover
  for (const [x, z, s] of [
    [-21, -21, 3.2],
    [21, 21, 3.2],
    [-21, 21, 3],
    [21, -21, 3],
    [-34, -17, 2.6],
    [34, 17, 2.6],
    [-17, 34, 2.6],
    [17, -34, 2.6],
  ]) {
    a.box({ kind: 'pillar', x, z, w: s, d: s, h: 4.5 + (x > 0 ? 1 : 0), color: '#6a5045' });
  }

  // jumps over the lava rivers
  for (const [x, z, rot] of [
    [-21, 10, -PI / 2],
    [21, -10, PI / 2],
    [10, -21, PI],
    [-10, 21, 0],
  ] as const) {
    a.ramp({ x, z, w: 5, l: 6, h: 1.7, rot, style: 'dirt' });
  }

  // spawn lined up with the bridges, or driving around the moat, never straight at the lava
  const spawns: [number, number, number][] = [
    [0, -22, 0],
    [0, 22, PI],
    [-22, 0, PI / 2],
    [22, 0, -PI / 2],
  ];
  for (let i = 0; i < 8; i++) {
    const ang = PI / 4 + (i * PI) / 2 + (i >= 4 ? 0.35 : 0);
    const r = i >= 4 ? 33 : 24;
    spawns.push([Math.cos(ang) * r, Math.sin(ang) * r, Math.atan2(-Math.sin(ang), Math.cos(ang))]); // tangent: drive around the ring
  }
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * PI * 2 + 0.2;
    spawns.push([Math.cos(ang) * 33, Math.sin(ang) * 33, Math.atan2(-Math.sin(ang), Math.cos(ang))]);
  }
  a.addSpawns(spawns, 12);
  a.addCrates(
    [
      [0, 0, H],
      [0, -14.5],
      [0, 14.5],
      [-14.5, 0],
      [14.5, 0],
      [-28, 6],
      [28, -6],
      [-6, -28],
      [6, 28],
      ...a.ring(22, 8, PI / 8).map(([x, z]) => [x, z] as [number, number]),
      [-33, 33],
      [33, -33],
      [-33, -33],
      [33, 33],
    ],
    20,
  );

  a.scatter(6, [-36, -36, 36, 36], (x, z) => ({ kind: 'crystal', x, z, s: a.range(0.7, 1), rot: a.range(0, 6) }), { radius: 1.2 });
  a.scatter(5, [-36, -36, 36, 36], (x, z) => ({ kind: 'dead_tree', x, z, s: a.range(0.8, 1.1), rot: a.range(0, 6) }), { radius: 1.2 });
  a.scatter(8, [-36, -36, 36, 36], (x, z) => ({ kind: 'rock', x, z, s: a.range(0.7, 1.1), rot: a.range(0, 6) }));

  return a.build({
    id: 'lavapit',
    name: 'Lava Pit',
    description: 'Cross the bridges to the volcano island. Touch the lava and you burn!',
    theme: {
      mood: 'volcanic',
      ground: 'rock_face',
      groundTint: '#c8a08a',
      groundTile: 6,
      wall: 'rock',
      backdrop: 'volcano',
      minimap: '#6a5246',
    },
  });
}
