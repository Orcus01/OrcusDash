import { courtyard } from './arenas/courtyard';
import { boostpark } from './arenas/boostpark';
import { neon } from './arenas/neon';
import { canyon } from './arenas/canyon';
import { docks } from './arenas/docks';
import { jungle } from './arenas/jungle';
import { lavapit } from './arenas/lavapit';
import { space } from './arenas/space';
import { shrink } from './arenas/gen';
import type { MapDef } from './arenas/types';

export * from './arenas/types';
export { propCollider, wallBoxes, WALL_COLLIDER_HEIGHT } from './arenas/colliders';

/** Every arena, generated deterministically so server and clients agree on the layout. */
export const MAPS: MapDef[] = [courtyard(), boostpark(), neon(), canyon(), docks(), jungle(), lavapit(), space()].map((map) => shrink(map, 1.5));
export const DEFAULT_MAP_ID = 'courtyard';

export function getMap(id: string): MapDef | undefined {
  return MAPS.find((m) => m.id === id);
}
