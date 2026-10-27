import type { BoxDef, MapDef, PropDef } from './types';

/** Collision cylinder for a prop (radius 0 = karts drive through it). */
export function propCollider(p: PropDef): { r: number; h: number } {
  const s = p.s ?? 1;
  switch (p.kind) {
    case 'tree':
      return { r: 0.45 * s, h: 8 * s };
    case 'pine':
      return { r: 0.4 * s, h: 10 * s };
    case 'palm':
      return { r: 0.35 * s, h: 8 * s };
    case 'quiver':
      return { r: 0.5 * s, h: 4 * s };
    case 'rock':
      return { r: 0.9 * s, h: 1.4 * s };
    case 'boulder':
      return { r: 1.7 * s, h: 2.4 * s };
    case 'cactus':
      return { r: 0.35 * s, h: 3 * s };
    case 'snowman':
      return { r: 0.8 * s, h: 2.2 * s };
    case 'streetlamp':
      return { r: 0.2, h: 7 };
    case 'lamp':
      return { r: 0.2, h: 4 };
    case 'hydrant':
      return { r: 0.25, h: 0.8 };
    case 'trashcan':
      return { r: 0.3, h: 1 };
    case 'barrel':
    case 'barrel_blue':
      return { r: 0.32 * s, h: 0.95 * s };
    case 'crate':
    case 'military_crate':
      return { r: 0.5 * s, h: 0.9 * s };
    case 'propane':
      return { r: 0.22, h: 0.7 };
    case 'generator':
      return { r: 0.45, h: 0.6 };
    case 'tyres':
      return { r: 0.55, h: 1.1 };
    case 'picnic':
      return { r: 0.9, h: 0.8 };
    case 'umbrella':
      return { r: 0.12, h: 2.5 };
    case 'lifebuoy':
      return { r: 0.12, h: 1.6 };
    case 'utility':
      return { r: 0.45, h: 1.3 };
    case 'fountain':
      return { r: 4.2, h: 1.0 };
    case 'bollard':
      return { r: 0.18, h: 0.8 };
    case 'flag':
      return { r: 0.1, h: 9 };
    case 'candy_cane':
      return { r: 0.3 * s, h: 4 * s };
    case 'lollipop':
      return { r: 0.25 * s, h: 4.5 * s };
    case 'gumdrop':
      return { r: 0.9 * s, h: 1.3 * s };
    case 'cone':
      return { r: 0.25, h: 0.7 };
    case 'torch':
      return { r: 0.15, h: 2.2 };
    case 'floodlight':
      return { r: 0.4, h: 14 };
    case 'tyre_wall':
      return { r: 0.6, h: 1 };
    case 'dome':
      return { r: 3.2 * s, h: 3 * s };
    case 'antenna':
      return { r: 0.35, h: 9 };
    case 'reactor':
      return { r: 2.6 * s, h: 5 * s };
    case 'crystal':
      return { r: 0.6 * s, h: 2.4 * s };
    case 'dead_tree':
      return { r: 0.3 * s, h: 4 * s };
    case 'dumpster':
      return { r: 0.9, h: 1.3 };
    case 'vending':
      return { r: 0.6, h: 1.9 };
    case 'neon':
      return { r: 0.2, h: 5 };
    case 'jungle_tree':
      return { r: 0.6 * s, h: 10 * s };
    case 'statue':
      return { r: 1.2 * s, h: 3.5 * s };
    case 'light_tower':
      return { r: 0.5, h: 16 };
    case 'fern':
    case 'banner':
    case 'ammo':
    case 'shrub':
    case 'bench':
    case 'buoy':
    case 'marker':
    case 'ship':
    case 'aircon':
    case 'crane':
    case 'watchtower':
      return { r: 0, h: 0 };
  }
}

/** Arena boundary walls (thickness 2, generated from `half`). Collider height is taller than any visual. */
export const WALL_COLLIDER_HEIGHT = 12;

export function wallBoxes(map: Pick<MapDef, 'half'>): Omit<BoxDef, 'color' | 'kind'>[] {
  const h = map.half;
  const len = h * 2 + 4;
  return [
    { x: 0, z: -h - 1, w: len, d: 2, h: WALL_COLLIDER_HEIGHT },
    { x: 0, z: h + 1, w: len, d: 2, h: WALL_COLLIDER_HEIGHT },
    { x: -h - 1, z: 0, w: 2, d: len, h: WALL_COLLIDER_HEIGHT },
    { x: h + 1, z: 0, w: 2, d: len, h: WALL_COLLIDER_HEIGHT },
  ];
}
