import * as THREE from 'three';

/** Surface identifiers shared by the arena builders; rendered as lightweight painted patterns. */
export const TEXTURE_IDS = [
  'asphalt_02',
  'concrete_pavement',
  'concrete_floor_02',
  'brick_wall_02',
  'concrete_wall_007',
  'corrugated_iron',
  'container_side',
  'metal_plate',
  'rusty_painted_metal',
  'coast_sand_01',
  'cliff_side',
  'rock_face',
  'sandstone_blocks_05',
  'leafy_grass',
  'forrest_ground_01',
  'castle_brick_01',
  'weathered_planks',
  'bark_brown_02',
] as const;
export type TexId = (typeof TEXTURE_IDS)[number];

const sources = new Map<string, { map: THREE.Texture }>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
let loading: Promise<void> | null = null;

/** Builds every painted surface pattern once without network requests. */
export function loadTextures(_renderer: THREE.WebGLRenderer): Promise<void> {
  // Small painted patterns keep the arena colorful, readable and inexpensive to shade.
  if (loading) return loading;
  for (const id of TEXTURE_IDS) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#f3f3f3';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#dddddd';
    g.lineWidth = 2;
    if (/grass|forrest/.test(id)) {
      for (let i = 0; i < 70; i++) {
        const x = (i * 47) % 128, y = (i * 71) % 128;
        g.fillStyle = i % 3 ? '#e7eee5' : '#fbfff9';
        g.beginPath(); g.ellipse(x, y, 3, 1.2, i, 0, Math.PI * 2); g.fill();
      }
    } else if (/brick|sandstone|castle/.test(id)) {
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 * 32;
        for (let x = -64; x < 128; x += 64) g.strokeRect(x + offset, row * 32, 64, 32);
      }
    } else if (/plank|bark/.test(id)) {
      for (let x = 0; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
    } else if (/metal|container|iron/.test(id)) {
      g.strokeRect(4, 4, 120, 120);
      for (let x = 8; x < 128; x += 24) g.fillRect(x, 8, 3, 112);
    } else if (/pavement|floor/.test(id)) {
      g.strokeRect(0, 0, 64, 64); g.strokeRect(64, 64, 64, 64);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    sources.set(id, { map });
  }
  loading = Promise.resolve();
  return loading;
}

/**
 * Textured material for geometry with UVs in metres (see geo.worldUV): one texture tile every
 * `tile` metres, multiplied by `tint`. Cached per combination.
 */
export function surface(id: TexId, tile: number, tint = '#ffffff', opts: { rough?: number; metal?: number; normal?: number; emissive?: string } = {}): THREE.MeshStandardMaterial {
  const key = `${id}|${tile}|${tint}|${opts.rough}|${opts.metal}|${opts.normal}|${opts.emissive}`;
  let m = materials.get(key);
  if (m) return m;
  const src = sources.get(id);
  m = new THREE.MeshStandardMaterial({ color: tint, roughness: opts.rough ?? 0.9, metalness: opts.metal ?? 0 });
  if (src) {
    const map = src.map.clone();
    map.repeat.set(1 / tile, 1 / tile);
    map.needsUpdate = true;
  }
  if (opts.emissive) {
    m.emissive.set(opts.emissive);
    m.emissiveIntensity = 1;
  }
  m.userData.shared = true;
  materials.set(key, m);
  return m;
}
