/**
 * Arena data model. Shared by the client (visuals + physics colliders) and the server (spawns,
 * crates, projectile collision). Units are metres, y is up, ground is y = 0.
 * Yaw 0 faces +z; a kart's forward vector is (sin yaw, 0, cos yaw).
 */

export type BoxKind =
  | 'courtyard_wall'
  | 'courtyard_tower'
  | 'building' // low/mid-rise with windows
  | 'tower' // skyscraper with a glass curtain wall
  | 'block' // row of concrete jersey barriers
  | 'rock' // mesa / cliff
  | 'platform' // drivable raised plateau
  | 'cabin'
  | 'ice'
  | 'container' // shipping container (stackable via y)
  | 'hangar'
  | 'warehouse'
  | 'hut'
  | 'sandbags'
  | 'pier' // drivable wooden deck
  | 'car' // parked car
  | 'steel' // structural steel (crane / tower legs)
  | 'castle_wall'
  | 'castle_tower'
  | 'toy_block' // giant ABC block
  | 'stand' // stadium grandstand
  | 'hay' // hay bale stack
  | 'bridge' // elevated deck you can drive on (via ramps) and under
  | 'funbox' // skate-park box with flat top
  | 'graffiti' // painted concrete wall / ledge
  | 'pillar' // rock / metal column
  | 'module' // space-station building
  | 'ruin' // weathered stone wall (temple / fort)
  | 'shack'; // wooden shed

export interface BoxDef {
  kind: BoxKind;
  x: number;
  z: number;
  /** size along x */
  w: number;
  /** size along z */
  d: number;
  h: number;
  /** base height (for stacking) */
  y?: number;
  /** tint / paint */
  color?: string;
  /** surface texture id override */
  mat?: string;
  /** collider only, nothing drawn (the visual comes from a prop) */
  hidden?: boolean;
  /** neon sign text (night city buildings) */
  label?: string;
}

/** A wedge that rises from 0 at local -z to `h` at local +z, rotated by `rot` around y. */
export interface RampDef {
  x: number;
  z: number;
  w: number;
  l: number;
  h: number;
  rot: number;
  /** base height, for ramps up onto platforms or containers */
  y?: number;
  style?: 'metal' | 'dirt' | 'snow' | 'wood' | 'concrete' | 'toy' | 'stone';
}

export type PropKind =
  | 'tree'
  | 'pine'
  | 'palm'
  | 'quiver'
  | 'rock'
  | 'boulder'
  | 'shrub'
  | 'cactus'
  | 'snowman'
  | 'streetlamp'
  | 'lamp'
  | 'hydrant'
  | 'trashcan'
  | 'barrel'
  | 'barrel_blue'
  | 'crate'
  | 'military_crate'
  | 'ammo'
  | 'propane'
  | 'generator'
  | 'tyres'
  | 'bench'
  | 'picnic'
  | 'umbrella'
  | 'lifebuoy'
  | 'buoy'
  | 'marker'
  | 'ship'
  | 'aircon'
  | 'utility'
  | 'fountain'
  | 'crane'
  | 'watchtower'
  | 'bollard'
  | 'flag'
  | 'candy_cane'
  | 'lollipop'
  | 'gumdrop'
  | 'cone'
  | 'torch'
  | 'banner'
  | 'floodlight'
  | 'tyre_wall'
  | 'dome'
  | 'antenna'
  | 'reactor'
  | 'crystal'
  | 'dead_tree'
  | 'dumpster'
  | 'vending'
  | 'neon' // standalone neon sign on a pole
  | 'jungle_tree'
  | 'fern'
  | 'statue'
  | 'light_tower';

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  /** scale */
  s?: number;
  /** yaw */
  rot?: number;
  /** base height */
  y?: number;
}

export type DecalKind =
  | 'road'
  | 'sidewalk'
  | 'plaza'
  | 'pond'
  | 'path'
  | 'runway'
  | 'apron'
  | 'boost'
  | 'boardwalk'
  | 'parking'
  | 'track' // ring road: outer radius r, width w
  | 'water' // flat shallow water you can drive through
  | 'checker' // chequered start/finish strip
  | 'carpet' // play-mat rug (Toy Land)
  | 'lava' // touching it burns your kart (rect, circle, or ring with w)
  | 'bridgepath' // stone path that is safe to cross lava on
  | 'glow' // glowing floor strip (Space Station)
  | 'puddle' // wet, reflective patch
  | 'crosswalk';

export interface DecalDef {
  kind: DecalKind;
  x: number;
  z: number;
  /** rectangle size (x / z) */
  w?: number;
  d?: number;
  /** circle radius */
  r?: number;
  /** yaw (boost pads point this way) */
  rot?: number;
}

export type WallStyle = 'concrete' | 'rock' | 'fence' | 'stone' | 'metal' | 'rail';
export type Backdrop = 'stadium' | 'city' | 'canyon' | 'docks' | 'jungle' | 'volcano' | 'space';
export type Side = 'n' | 's' | 'e' | 'w';
/** Lighting preset: sky, sun, fog, glow and weather. */
export type Mood = 'day' | 'golden' | 'night' | 'sunset' | 'storm' | 'mist' | 'volcanic' | 'space';

export interface MapTheme {
  mood: Mood;
  /** ground texture id (client/public/tex) */
  ground: string;
  groundTint: string;
  /** metres per texture tile */
  groundTile: number;
  wall: WallStyle;
  backdrop: Backdrop;
  /** sides of the arena that face open water */
  water?: Side[];
  /** world gravity (default -30); lower = floatier jumps */
  gravity?: number;
  /** flat colour used to draw the ground on the minimap */
  minimap: string;
}

export interface SpawnDef {
  x: number;
  z: number;
  yaw: number;
  y?: number;
}

export interface CrateDef {
  x: number;
  z: number;
  /** height of the surface the crate sits on */
  y?: number;
}

export interface MapDef {
  id: string;
  name: string;
  description: string;
  /** Arena is the square [-half, half] on x and z, enclosed by walls. */
  half: number;
  theme: MapTheme;
  decals: DecalDef[];
  boxes: BoxDef[];
  ramps: RampDef[];
  props: PropDef[];
  spawns: SpawnDef[];
  crates: CrateDef[];
}
