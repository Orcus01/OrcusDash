import { Arena } from './gen';
import type { MapDef } from './types';

/** Original classic arena: grass, low stone cover, a central jump and four side routes. */
export function courtyard(): MapDef {
  const a = new Arena(36, 901);
  // A connected square loop keeps turns readable; the crossing offers a high/low choice.
  for (const side of [-1, 1]) {
    a.decal({kind:'path',x:side*23,z:0,w:8,d:54});
    a.decal({kind:'path',x:0,z:side*23,w:54,d:8});
  }
  a.decal({kind:'plaza',x:0,z:0,w:29,d:18});
  a.decal({kind:'path',x:0,z:0,w:8,d:54});
  a.decal({kind:'path',x:0,z:0,w:54,d:8});
  // Deck underside is high enough for karts; its four supports leave a broad tunnel.
  a.box({kind:'bridge',x:0,z:0,w:8,d:20,h:.6,y:3.4,color:'#e4bd80'});
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    a.box({kind:'courtyard_tower',x:sx*5.4,z:sz*7,w:2.5,d:3,h:4.4,color:'#64bce4'});
  }
  for(const side of [-1,1]) {
    a.ramp({x:0,z:side*16,w:8,l:12,h:4,rot:side<0?0:Math.PI,style:'stone'});
  }
  const colors=['#65b8f0','#ff937d','#b59bea','#efc757'];
  let corner=0;
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    const color=colors[corner++];
    a.decal({kind:'plaza',x:sx*17,z:sz*17,w:10,d:10});
    // L-shaped forts break long shots, with two generous exits toward the loop.
    a.box({kind:'courtyard_wall',x:sx*14,z:sz*12,w:8,d:2,h:2.2,color});
    a.box({kind:'courtyard_wall',x:sx*12,z:sz*17,w:2,d:8,h:2.2,color});
    a.box({kind:'courtyard_tower',x:sx*30,z:sz*30,w:5,d:5,h:6,color});
    a.prop({kind:'flag',x:sx*30,z:sz*30,y:6,s:1.6});
    // Small jump exits face the centre, away from the arena wall.
    a.ramp({x:sx*18,z:sz*29,w:6,l:6,h:1.2,rot:sz<0?0:Math.PI,style:'stone'});
  }
  a.addSpawns(a.ring(31,24,Math.PI/12),12);
  a.addCrates([[0,0,4],[-18,-18],[18,18],[-18,18],[18,-18],[-30,0],[30,0],[0,30],[0,-30],[-10,0],[10,0]],18);
  a.addCrates(a.grid(8,6),18);
  return a.build({id:'courtyard',name:'Classic Courtyard',description:'A castle garden with a raised crossing, drive-through tunnel, four colorful forts and connected battle lanes.',theme:{mood:'day',ground:'leafy_grass',groundTint:'#58bc6b',groundTile:8,wall:'stone',backdrop:'stadium',minimap:'#63a977'}});
}
