// Downloads a few CC0 Poly Haven textures and shrinks them to 512px WebP for client/public/tex.
// Usage: node scripts/fetch-textures.mjs
import { mkdir, stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const IDS = [
  'asphalt_02', 'concrete_pavement', 'concrete_floor_02', 'brick_wall_02', 'concrete_wall_007', 'corrugated_iron',
  'container_side', 'metal_plate', 'rusty_painted_metal', 'coast_sand_01', 'cliff_side', 'rock_face',
  'sandstone_blocks_05', 'leafy_grass', 'forrest_ground_01', 'castle_brick_01', 'weathered_planks', 'bark_brown_02',
];
const OUT = 'client/public/tex';
const UA = { 'User-Agent': 'KartClash-texture-fetcher/1.0 (+https://polyhaven.com/license)' };
const exists = (p) => stat(p).then(() => true, () => false);
await mkdir(OUT, { recursive: true });
for (const id of IDS) {
  if (await exists(`${OUT}/${id}_diff.webp`)) continue;
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  for (const [key, name, q] of [['Diffuse', 'diff', 80], ['nor_gl', 'nor', 85]]) {
    const url = files[key]['1k'].jpg.url;
    const buf = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
    let img = sharp(buf).resize(512, 512);
    if (name === 'diff' && id === 'container_side') img = img.modulate({ saturation: 0 }).linear(1.2, 12);
    await img.webp({ quality: q }).toFile(`${OUT}/${id}_${name}.webp`);
  }
  console.log('texture', id);
}
await writeFile(`${OUT}/LICENSE.md`, 'Textures from [Poly Haven](https://polyhaven.com), licensed CC0. Fetched by scripts/fetch-textures.mjs.\n');
