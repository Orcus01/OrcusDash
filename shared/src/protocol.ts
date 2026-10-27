import type { ProjectileKind, WeaponType, MatchMode } from './constants';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type Phase = 'lobby' | 'countdown' | 'playing' | 'results';

export interface LobbyPlayer {
  id: string;
  name: string;
  color: number;
  score: number;
  deaths: number;
  /** Has finished loading the room's current map */
  loaded: boolean;
  /** computer-controlled */
  bot?: boolean;
}

// ---------- client → server ----------

export type ClientMsg =
  | { t: 'resume'; token: string }
  | { t: 'leave' }
  | { t: 'create'; name: string; color: number; mode?: MatchMode }
  | { t: 'quickplay'; name: string; color: number; mode?: MatchMode }
  | { t: 'join'; code: string; name: string; color: number }
  | { t: 'setMode'; mode: MatchMode }
  | { t: 'setMap'; mapId: string }
  | { t: 'start' }
  | { t: 'rematch' }
  | { t: 'state'; p: Vec3; q: Quat; v: Vec3 }
  | { t: 'fire'; d: Vec3 }
  | { t: 'fell' }
  | { t: 'loaded'; mapId: string }
  | { t: 'setBots'; on: boolean };

// ---------- server → client ----------

export interface PlayerSnap {
  id: string;
  p: Vec3;
  q: Quat;
  v: Vec3;
  hp: number;
  /** 1 = alive */
  a: 0 | 1;
  /** 1 = shielded */
  sh: 0 | 1;
  w: WeaponType | null;
  ammo: number;
}

export interface ProjectileSnap {
  id: number;
  k: ProjectileKind;
  p: Vec3;
  /** velocity (m/s) */
  v: Vec3;
}

export interface MineSnap {
  id: number;
  p: Vec3;
  owner: string;
}

export interface Snapshot {
  t: 'snap';
  /** Server time (ms) */
  ts: number;
  timeLeft: number;
  players: PlayerSnap[];
  projectiles: ProjectileSnap[];
  mines: MineSnap[];
  /** One char per crate: '1' = available */
  crates: string;
}

export interface RoomInfo {
  t: 'room';
  code: string;
  phase: Phase;
  /** Seconds left in the current phase (0 in lobby) */
  timeLeft: number;
  mapId: string;
  mode: MatchMode;
  hostId: string;
  players: LobbyPlayer[];
  /** Host may start now (everyone has loaded the map, or the loading grace period ran out) */
  canStart: boolean;
  /** fill empty seats with bots when the match starts */
  bots: boolean;
}

export type ErrorCode = 'NOT_FOUND' | 'FULL' | 'BAD_REQUEST' | 'BAD_CODE';

export type GameEvent =
  | { type: 'shot'; id: string; o: Vec3; e: Vec3; hit: boolean }
  | { type: 'launch'; id: string; weapon: WeaponType }
  | { type: 'mine'; id: string }
  | { type: 'shield'; id: string }
  | { type: 'explode'; p: Vec3; kind: ProjectileKind | 'mine' | 'kart' }
  | { type: 'hit'; victim: string; attacker: string; weapon: WeaponType; hp: number; dir: Vec3 }
  | { type: 'kill'; victim: string; killer: string; weapon: WeaponType | 'fall' }
  | { type: 'pickup'; id: string; weapon: WeaponType; crate: number }
  | { type: 'respawn'; id: string; p: Vec3; yaw: number };

export type ServerMsg =
  | { t: 'session'; token: string }
  | { t: 'joined'; you: string; room: RoomInfo }
  | { t: 'error'; code: ErrorCode; message: string }
  | RoomInfo
  | Snapshot
  | { t: 'ev'; e: GameEvent }
  | { t: 'correct'; p: Vec3 };
