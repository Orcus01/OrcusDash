import { KART_BALL_RADIUS, lavaAt, pointBlocked, surfaceHeight, type CollisionWorld, type MapDef, type Vec3 } from '@kart/shared';

export const BOT_NAMES = ['Blaze', 'Viper', 'Nitro', 'Rook', 'Jinx', 'Turbo', 'Ghost', 'Fang', 'Comet', 'Riot'];

const TOP_SPEED = 11;
const ACCEL = 10;
const TURN_RATE = 2.8;
const STEP_UP = 0.45;

/** Per-bot driving state. Bots are simulated on the server at the tick rate. */
export interface BotState {
  yaw: number;
  speed: number;
  vy: number;
  /** what we're heading for: a crate index or a kart id */
  goal: { crate: number } | { kart: string } | null;
  retargetAt: number;
  /** progress check, to notice being stuck on a wall */
  checkAt: number;
  checkPos: Vec3;
  reverseUntil: number;
  reverseSteer: number;
  /** when the current target first came into the firing cone */
  sightedAt: number;
  nextFireAt: number;
  heldSince: number;
  /** -1..1, a wobble so bots don't drive in perfect lines */
  wander: number;
  /** after closing in on a target, swing out to this point and come back around for another pass */
  evadeUntil: number;
  evade: [number, number];
}

export function newBotState(yaw: number, now: number): BotState {
  return {
    yaw,
    speed: 0,
    vy: 0,
    goal: null,
    retargetAt: 0,
    checkAt: now + 1500,
    checkPos: [0, 0, 0],
    reverseUntil: 0,
    reverseSteer: 1,
    sightedAt: 0,
    nextFireAt: 0,
    heldSince: now,
    wander: Math.random() * 2 - 1,
    evadeUntil: 0,
    evade: [0, 0],
  };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Something at kart height (or lava) at this point? */
export function botBlocked(world: CollisionWorld, map: MapDef, x: number, z: number, footY: number): boolean {
  if (pointBlocked(world, [x, footY + STEP_UP, z])) return true;
  const g = surfaceHeight(world, x, z, footY + STEP_UP);
  return g < 0.1 && lavaAt(map, x, z, -0.6);
}

/**
 * Steers toward `goal` (x,z), feeling ahead for walls and lava and picking the clearer side.
 * Returns the steering amount in -1..1.
 */
export function steerToward(b: BotState, world: CollisionWorld, map: MapDef, pos: Vec3, gx: number, gz: number, now: number): number {
  const footY = pos[1] - KART_BALL_RADIUS;
  const want = Math.atan2(gx - pos[0], gz - pos[2]);
  const look = 2.2 + Math.abs(b.speed) * 0.35;
  const clear = (ang: number, dist: number) => {
    for (const t of [dist * 0.5, dist]) {
      if (botBlocked(world, map, pos[0] + Math.sin(ang) * t, pos[2] + Math.cos(ang) * t, footY)) return false;
    }
    return true;
  };
  let target = want + b.wander * 0.15 * Math.sin(now / 900);
  // when the straight line toward the goal is blocked, try progressively wider angles
  if (!clear(b.yaw + wrap(target - b.yaw) * 0.5, look)) {
    for (const off of [0.5, 0.9, 1.3, 1.8, 2.4]) {
      const l = b.yaw + off;
      const r = b.yaw - off;
      const lFree = clear(l, look);
      const rFree = clear(r, look);
      if (lFree || rFree) {
        target = lFree && rFree ? (Math.abs(wrap(l - want)) < Math.abs(wrap(r - want)) ? l : r) : lFree ? l : r;
        break;
      }
    }
  }
  return Math.max(-1, Math.min(1, wrap(target - b.yaw) * 1.6));
}

/** Integrates one bot for dt seconds. Returns 'fell' when it drove into lava or off the world. */
export function driveBot(
  b: BotState,
  world: CollisionWorld,
  map: MapDef,
  pos: Vec3,
  steer: number,
  throttle: number,
  dt: number,
): { pos: Vec3; vel: Vec3; fell: boolean } {
  const gravity = map.theme.gravity ?? -30;
  const footY = pos[1] - KART_BALL_RADIUS;
  const g0 = surfaceHeight(world, pos[0], pos[2], footY + 0.05);
  const grounded = footY - g0 < 0.08;

  const targetSpeed = throttle * TOP_SPEED * (1 - Math.min(0.45, Math.abs(steer) * 0.4));
  b.speed += Math.sign(targetSpeed - b.speed) * Math.min(Math.abs(targetSpeed - b.speed), ACCEL * dt);
  b.yaw = wrap(b.yaw + steer * TURN_RATE * dt * Math.min(1, Math.abs(b.speed) / 3) * Math.sign(b.speed || 1));

  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  let nx = pos[0] + fx * b.speed * dt;
  let nz = pos[2] + fz * b.speed * dt;
  // bump into walls: try sliding along one axis before stopping
  const ahead = (x: number, z: number) => pointBlocked(world, [x + fx * 0.85 * Math.sign(b.speed), footY + STEP_UP, z + fz * 0.85 * Math.sign(b.speed)]);
  if (ahead(nx, nz)) {
    if (!ahead(nx, pos[2])) nz = pos[2];
    else if (!ahead(pos[0], nz)) nx = pos[0];
    else {
      nx = pos[0];
      nz = pos[2];
    }
    b.speed *= 0.6;
  }

  const g1 = surfaceHeight(world, nx, nz, footY + STEP_UP);
  let y = footY;
  if (grounded && g1 >= footY - 0.35) {
    // follow the ground (up ramps, gently down slopes)
    b.vy = (g1 - footY) / dt;
    y = g1;
  } else {
    // airborne: keep the launch speed off a ramp lip, fall with gravity
    if (grounded) b.vy = Math.max(0, b.vy);
    b.vy += gravity * dt;
    y = footY + b.vy * dt;
    if (y <= g1) {
      y = g1;
      b.vy = 0;
    }
  }
  const lim = map.half - 1;
  nx = Math.max(-lim, Math.min(lim, nx));
  nz = Math.max(-lim, Math.min(lim, nz));
  const fell = y < -5 || (y < 0.1 && lavaAt(map, nx, nz));
  return { pos: [nx, y + KART_BALL_RADIUS, nz], vel: [fx * b.speed, b.vy, fz * b.speed], fell };
}
