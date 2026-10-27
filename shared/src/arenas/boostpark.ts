import { Arena } from './gen';
import type { MapDef } from './types';

/** Wide sightlines and a small amount of cover keep combat readable and rendering light. */
export function boostpark(): MapDef {
  const a = new Arena(34, 2026);
  const colors = ['#ff5b91', '#47bfff', '#ffcf42', '#a17bff'];
  a.decal({ kind: 'plaza', x: 0, z: 0, w: 58, d: 58 });
  // Two compact loops intersect at the central showdown instead of one oversized circle.
  for(const x of [-12,12]) a.decal({kind:'track',x,z:0,r:15,w:5});
  for(const z of [-21,21]) a.decal({kind:'path',x:0,z,w:42,d:6});
  for(const side of [-1,1]) {
    a.box({kind:'funbox',x:side*12,z:0,w:7,d:10,h:1.4,color:colors[side<0?0:1]});
    for(const end of [-1,1])a.ramp({x:side*12,z:end*8,w:7,l:6,h:1.4,rot:end<0?0:Math.PI,style:'toy'});
  }
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const x = Math.sin(angle), z = Math.cos(angle);
    a.box({ kind: 'toy_block', x: x * 25, z: z * 25, w: i % 2 ? 3 : 7, d: i % 2 ? 7 : 3, h: 2.4, color: colors[i] });
    a.decal({ kind: 'boost', x: i<2?-12:12, z: i%2?-13:13, w: 4, d: 3, rot: i%2?0:Math.PI });
    for (let j = -1; j <= 1; j++) {
      a.box({ kind: 'toy_block', x: i % 2 ? x * 30 : j * 12, z: i % 2 ? j * 12 : z * 30, w: i % 2 ? 1.5 : 9, d: i % 2 ? 9 : 1.5, h: 1.8, color: colors[i] });
    }
  }
  a.addSpawns(a.ring(25, 12, Math.PI / 12), 12);
  a.addCrates([[0,0], [-7,-7], [7,7], [7,-7], [-7,7], [-19,-19], [19,19], [-19,19], [19,-19], [0,28], [28,0], [0,-28], [-28,0]], 13);
  a.addCrates(a.grid(8, 5), 18);
  return a.build({
    id: 'boostpark', name: 'Boost Park',
    description: 'Twin battle loops, ramp-top shortcuts and colorful cover. Cross the centre or outflank your rivals.',
    theme: { mood: 'day', ground: 'concrete_pavement', groundTint: '#71ce87', groundTile: 8, wall: 'concrete', backdrop: 'stadium', minimap: '#6caeb5' },
  });
}
