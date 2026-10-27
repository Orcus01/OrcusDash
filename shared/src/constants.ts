export const SERVER_PORT = 2567;

/** Server simulation + snapshot rate (Hz). */
export const TICK_RATE = 20;
/** How often a client sends its own kart state (Hz). */
export const CLIENT_SEND_RATE = 20;

export const MAX_PLAYERS = 8;
/** With bots on, matches are filled up to this many karts. */
export const BOT_FILL = 6;
export const MAX_NAME_LENGTH = 16;

export const COUNTDOWN_SECONDS = 3;
export const MATCH_SECONDS = 180;
export const RESULTS_SECONDS = 10;
export const RESPAWN_SECONDS = 2;
export const SPAWN_SHIELD_SECONDS = 2;

export const MAX_HP = 100;
/** Radius of the sphere used for hit detection around a kart's centre. */
export const KART_HIT_RADIUS = 0.95;
/** Radius of the physics ball the kart rides on (kart position = ball centre). */
export const KART_BALL_RADIUS = 0.4;
/** Visual scale of the kart model (1 = the original, larger kart). */
export const KART_SCALE = 0.65;
/** Fastest a kart can legitimately go (boosting), used by the server's anti-cheat. */
export const KART_MAX_SPEED = 22;

export const CRATE_PICKUP_RADIUS = 2.2;
export const CRATE_RESPAWN_SECONDS = 4;

export type WeaponType = 'rocket' | 'missiles' | 'gun' | 'grenade' | 'mine' | 'shield';
export const WEAPON_TYPES: WeaponType[] = ['rocket', 'missiles', 'gun', 'grenade', 'mine', 'shield'];
/** Relative odds of each weapon dropping from a crate. */
export const WEAPON_WEIGHTS: Record<WeaponType, number> = { rocket: 2, missiles: 1.5, gun: 2.2, grenade: 2, mine: 1.3, shield: 1 };

export type ProjectileKind = 'rocket' | 'missile' | 'grenade';

export const WEAPONS = {
  rocket: { ammo: 1, damage: 100, minDamage: 50, fullRadius: 1.8, splash: 3.4, speed: 42, lifetime: 2.6, homingRange: 45, homingCone: 0.55, turnRate: 2.0 },
  missiles: { ammo: 1, count: 3, spread: 0.21, damage: 50, minDamage: 30, fullRadius: 1.2, splash: 2.4, speed: 36, lifetime: 3, homingRange: 55, homingCone: 0.9, turnRate: 3.5 },
  gun: { ammo: 24, damage: 13, range: 55, cooldown: 0.07, clientInterval: 0.1, spread: 0.025 },
  grenade: { ammo: 3, damage: 100, minDamage: 40, fullRadius: 2, splash: 4.2, speed: 24, lift: 7, gravity: 22, fuse: 1.8, restitution: 0.45 },
  mine: { ammo: 3, damage: 100, minDamage: 60, fullRadius: 1.5, armTime: 0.7, triggerRadius: 1.8, splash: 3.2, lifetime: 45 },
  shield: { ammo: 1, duration: 5 },
} as const;

export const WEAPON_LABELS: Record<WeaponType, string> = {
  rocket: 'Rocket Launcher',
  missiles: 'Triple Missiles',
  gun: 'Machine Gun',
  grenade: 'Grenade Launcher',
  mine: 'Mines',
  shield: 'Shield',
};

/**
 * Weapon mount points on the kart model, in model units (the model is drawn scaled by KART_SCALE
 * with its origin on the ground; +z forward, +x left).
 */
export const MOUNT_POINTS: Record<WeaponType, [number, number, number]> = {
  gun: [0.74, 0.75, 1.2], // twin rotary guns on the side-pods (server alternates the x sign)
  rocket: [-0.95, 0.85, 0.92], // tube on the right side-pod
  missiles: [0, 2.05, 0.35], // pod above the roll hoop
  grenade: [0.55, 1.68, 0.35], // drum launcher on the roll hoop (left)
  mine: [0, 0.35, -1.55], // dispenser at the back
  shield: [0, 1.57, -0.8],
};

/** Where each weapon fires from, in metres relative to the kart's ball centre (kart-local axes). */
export const MUZZLE_OFFSETS = Object.fromEntries(
  Object.entries(MOUNT_POINTS).map(([w, [x, y, z]]) => [w, [x * KART_SCALE, y * KART_SCALE - KART_BALL_RADIUS, z * KART_SCALE]]),
) as Record<WeaponType, [number, number, number]>;

/** Kart paint colours players can pick from. */
export const KART_COLORS = ['#e8413c', '#2f7cf6', '#2fbf5a', '#f5b700', '#a24df0', '#ff7a1a', '#14c4c4', '#ff5fb0'];

/** Aim assist: shots snap toward the enemy nearest the crosshair inside this cone (radians) and range. */
export const AIM_ASSIST: Partial<Record<WeaponType, { cone: number; range: number }>> = {
  gun: { cone: 0.32, range: 50 },
  rocket: { cone: 0.5, range: 60 },
  missiles: { cone: 0.6, range: 60 },
  grenade: { cone: 0.45, range: 28 },
};

export const MATCH_MODES = ['deathmatch', 'killrace', 'instagib'] as const;
export type MatchMode = typeof MATCH_MODES[number];
export const MODE_LABELS: Record<MatchMode, string> = { deathmatch: 'Classic Battle', killrace: 'Kill Race', instagib: 'One-Hit Chaos' };
export const MODE_DESCRIPTIONS: Record<MatchMode, string> = { deathmatch: 'Most KOs in 3 minutes wins.', killrace: 'First to 10 KOs wins. 3-minute time limit.', instagib: 'Every weapon hit is a KO. Shields still protect you.' };
export const KILL_TARGET = 10;
