import {
  KILL_TARGET, type MatchMode,
  AIM_ASSIST,
  BOT_FILL,
  COUNTDOWN_SECONDS,
  CRATE_PICKUP_RADIUS,
  CRATE_RESPAWN_SECONDS,
  DEFAULT_MAP_ID,
  KART_BALL_RADIUS,
  KART_COLORS,
  KART_HIT_RADIUS,
  MATCH_SECONDS,
  MAX_HP,
  MAX_PLAYERS,
  MUZZLE_OFFSETS,
  RESPAWN_SECONDS,
  RESULTS_SECONDS,
  SPAWN_SHIELD_SECONDS,
  TICK_RATE,
  WEAPONS,
  WEAPON_TYPES,
  WEAPON_WEIGHTS,
  assistTarget,
  collisionWorld,
  dist3,
  getMap,
  normalize,
  pointBlocked,
  raySphere,
  raycastWorld,
  rotateByQuat,
  surfaceHeight,
  type ClientMsg,
  type CollisionWorld,
  type ErrorCode,
  type GameEvent,
  type MapDef,
  type Phase,
  type ProjectileKind,
  type Quat,
  type RoomInfo,
  type ServerMsg,
  type SpawnDef,
  type Vec3,
  type WeaponType,
} from '@kart/shared';
import { isPlausibleMove } from './validation';
import { BOT_NAMES, driveBot, newBotState, steerToward, type BotState } from './Bot';

export interface Player {
  id: string;
  name: string;
  color: number;
  send: (data: string) => void;
  score: number;
  deaths: number;
  hp: number;
  alive: boolean;
  respawnAt: number;
  weapon: WeaponType | null;
  ammo: number;
  shieldUntil: number;
  pos: Vec3;
  quat: Quat;
  vel: Vec3;
  lastStateAt: number;
  lastFireAt: number;
  loadedMap: string;
  /** which of the twin guns fires next (1 = left, -1 = right) */
  gunSide: 1 | -1;
  /** set for computer-controlled karts */
  bot?: BotState;
}

interface Projectile {
  id: number;
  kind: ProjectileKind;
  owner: string;
  pos: Vec3;
  vel: Vec3;
  bornAt: number;
}

interface Mine {
  id: number;
  owner: string;
  pos: Vec3;
  bornAt: number;
}

interface Crate {
  pos: Vec3;
  availableAt: number;
}

const TICK_SECONDS = 1 / TICK_RATE;
const SUBSTEPS = 4;
/** MATCH_SECONDS env var shortens matches for local testing. */
const MATCH_MS = (Number(globalThis.process?.env?.MATCH_SECONDS) || MATCH_SECONDS) * 1000;
/** The host can start this long after a map change even if someone is still loading. */
const LOAD_GRACE_MS = 20_000;
let playerCounter = 0;

const round = (n: number, f: number) => Math.round(n * f) / f;
const r2 = (v: Vec3) => v.map((n) => round(n, 100)) as Vec3;
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const yawQuat = (yaw: number): Quat => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
/** Grenade flight time to land back at launch height: 2 * lift / gravity. */
const GRENADE_FLIGHT = (2 * WEAPONS.grenade.lift) / WEAPONS.grenade.gravity;

function pickWeapon(): WeaponType {
  const total = WEAPON_TYPES.reduce((s, w) => s + WEAPON_WEIGHTS[w], 0);
  let r = Math.random() * total;
  for (const w of WEAPON_TYPES) {
    r -= WEAPON_WEIGHTS[w];
    if (r <= 0) return w;
  }
  return 'rocket';
}

/** Damage at `dist` from a blast: full inside `full`, falling linearly to `min` at the splash edge. */
export function falloff(dist: number, full: number, radius: number, max: number, min: number): number {
  if (dist <= full) return max;
  if (dist >= radius) return 0;
  return Math.round(max + ((min - max) * (dist - full)) / (radius - full));
}

export class Room {
  readonly players = new Map<string, Player>();
  hostId = '';
  phase: Phase = 'lobby';
  phaseEndsAt = 0;
  map: MapDef;
  private mapSetAt: number;
  private world: CollisionWorld;
  private crates: Crate[] = [];
  private projectiles: Projectile[] = [];
  private mines: Mine[] = [];
  private nextEntityId = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private announcedCanStart = true;
  /** fill empty seats with computer karts when a match starts */
  bots = true;
  quickPlay = false;
  mode: MatchMode = 'deathmatch';

  constructor(
    readonly code: string,
    private readonly onEmpty: (room: Room) => void = () => {},
    private readonly clock: () => number = Date.now,
    autoTick = true,
  ) {
    this.map = getMap(DEFAULT_MAP_ID)!;
    this.world = collisionWorld(this.map);
    this.mapSetAt = clock();
    this.announcedCanStart = false;
    this.resetCrates(0);
    if (autoTick) this.timer = setInterval(() => this.tick(this.clock()), 1000 / TICK_RATE);
  }

  // ---------------------------------------------------------------- membership

  addPlayer(name: string, color: number, send: (data: string) => void): Player | ErrorCode {
    if (this.players.size >= MAX_PLAYERS) {
      const bot = [...this.players.values()].find((p) => p.bot);
      if (!bot) return 'FULL';
      this.players.delete(bot.id);
    }
    const now = this.clock();
    const player: Player = {
      id: `p${(++playerCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name,
      color,
      send,
      score: 0,
      deaths: 0,
      hp: MAX_HP,
      alive: false,
      respawnAt: 0,
      weapon: null,
      ammo: 0,
      shieldUntil: 0,
      pos: [0, -50, 0],
      quat: [0, 0, 0, 1],
      vel: [0, 0, 0],
      lastStateAt: now,
      lastFireAt: 0,
      loadedMap: '',
      gunSide: 1,
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.sendTo(player, { t: 'joined', you: player.id, room: this.roomInfo(now) });
    // Late joiners drop straight into a running match.
    if (this.phase === 'countdown' || this.phase === 'playing') {
      this.spawn(player, this.pickSpawn(player), now, now + SPAWN_SHIELD_SECONDS * 1000);
    }
    this.broadcastRoom(now);
    return player;
  }

  removePlayer(id: string): void {
    if (!this.players.delete(id)) return;
    const humans = [...this.players.values()].filter((p) => !p.bot);
    if (humans.length === 0) {
      this.players.clear();
      this.dispose();
      this.onEmpty(this);
      return;
    }
    if (this.hostId === id) this.hostId = humans[0].id;
    this.broadcastRoom(this.clock());
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  canStart(now: number): boolean {
    if (now - this.mapSetAt >= LOAD_GRACE_MS) return true;
    for (const p of this.players.values()) if (!p.bot && p.loadedMap !== this.map.id) return false;
    return true;
  }

  // ---------------------------------------------------------------- messages

  handle(player: Player, msg: ClientMsg): void {
    const now = this.clock();
    switch (msg.t) {
      case 'setMode':
        if (player.id === this.hostId && this.phase === 'lobby') { this.mode = msg.mode; this.broadcastRoom(now); }
        return;
      case 'setMap': {
        const map = getMap(msg.mapId);
        if (player.id !== this.hostId || this.phase !== 'lobby' || !map || map.id === this.map.id) return;
        this.map = map;
        this.world = collisionWorld(map);
        this.mapSetAt = now;
        this.announcedCanStart = false;
        this.resetCrates(now);
        this.broadcastRoom(now);
        return;
      }
      case 'loaded':
        if (player.loadedMap === msg.mapId) return;
        player.loadedMap = msg.mapId;
        if (this.canStart(now)) this.announcedCanStart = true;
        this.broadcastRoom(now);
        return;
      case 'setBots':
        if (player.id !== this.hostId || this.phase !== 'lobby' || this.bots === msg.on) return;
        this.bots = msg.on;
        this.broadcastRoom(now);
        return;
      case 'rematch':
        if(player.id===this.hostId && this.phase==='results')this.startMatch(now);
        return;
      case 'start':
        if (player.id === this.hostId && this.phase === 'lobby' && this.canStart(now)) this.startMatch(now);
        return;
      case 'state':
        this.applyState(player, msg.p, msg.q, msg.v, now);
        return;
      case 'fire':
        if (this.phase === 'playing' && player.alive) this.fire(player, msg.d, now);
        return;
      case 'fell':
        // fell out of the world or drove into lava
        if (!player.alive) return;
        if (this.phase === 'playing') this.kill(player, '', 'fall', now);
        else if (this.phase === 'countdown') this.spawn(player, this.pickSpawn(player), now, now + SPAWN_SHIELD_SECONDS * 1000);
        return;
      default:
        return;
    }
  }

  private applyState(p: Player, pos: Vec3, quat: Quat, vel: Vec3, now: number): void {
    if (!p.alive || (this.phase !== 'playing' && this.phase !== 'countdown')) return;
    const dt = (now - p.lastStateAt) / 1000;
    if (!isPlausibleMove(p.pos, pos, dt, this.map.half)) {
      this.sendTo(p, { t: 'correct', p: p.pos });
      p.lastStateAt = now;
      return;
    }
    const limit = this.map.half - 1;
    const bounded: Vec3 = [Math.max(-limit, Math.min(limit, pos[0])), pos[1], Math.max(-limit, Math.min(limit, pos[2]))];
    const travel = dist3(p.pos, bounded);
    if (travel > 0.001 && p.pos[1] >= 0 && bounded[1] >= 0) {
      const origin: Vec3 = [p.pos[0], p.pos[1] + 0.12, p.pos[2]];
      const direction = normalize([bounded[0] - p.pos[0], bounded[1] - p.pos[1], bounded[2] - p.pos[2]]);
      if (raycastWorld(this.world, origin, direction, travel) < travel - 0.05) {
        this.sendTo(p, { t: 'correct', p: p.pos });
        p.lastStateAt = now;
        return;
      }
    }
    if (bounded[0] !== pos[0] || bounded[2] !== pos[2]) this.sendTo(p, { t: 'correct', p: bounded });
    p.pos = bounded;
    p.quat = quat;
    p.vel = vel;
    p.lastStateAt = now;
  }

  // ---------------------------------------------------------------- match flow

  startMatch(now: number): void {
    this.projectiles = [];
    this.mines = [];
    this.resetCrates(now);
    if (this.bots) this.addBots(now);
    const order = [...this.map.spawns.keys()].sort(() => Math.random() - 0.5);
    let i = 0;
    for (const p of this.players.values()) {
      p.score = 0;
      p.deaths = 0;
      const spawn = this.map.spawns[order[i++ % order.length]];
      this.spawn(p, spawn, now, now + (COUNTDOWN_SECONDS + SPAWN_SHIELD_SECONDS) * 1000);
    }
    this.setPhase('countdown', now + COUNTDOWN_SECONDS * 1000, now);
  }

  private setPhase(phase: Phase, endsAt: number, now: number): void {
    this.phase = phase;
    this.phaseEndsAt = endsAt;
    if (phase === 'results' || phase === 'lobby') {
      this.projectiles = [];
      this.mines = [];
    }
    if (phase === 'lobby') {
      for (const p of this.players.values()) {
        p.alive = false;
        if (p.bot) this.players.delete(p.id);
      }
    }
    this.broadcastRoom(now);
  }

  tick(now: number): void {
    if (this.phase === 'countdown' && now >= this.phaseEndsAt) {
      this.setPhase('playing', now + MATCH_MS, now);
    } else if (this.phase === 'playing' && now >= this.phaseEndsAt) {
      this.setPhase('results', now + RESULTS_SECONDS * 1000, now);
    } else if (this.phase === 'results' && now >= this.phaseEndsAt) {
      this.setPhase('lobby', 0, now);
    }

    if (this.quickPlay && this.phase === 'lobby' && this.players.size > 0 && this.canStart(now)) this.startMatch(now);

    if (this.phase === 'playing') {
      for (const p of this.players.values()) {
        if (!p.alive && p.respawnAt > 0 && now >= p.respawnAt) {
          this.spawn(p, this.pickSpawn(p), now, now + SPAWN_SHIELD_SECONDS * 1000);
        }
      }
      this.updateBots(now);
      this.updateCrates(now);
      this.updateProjectiles(now);
      this.updateMines(now);
      if (this.mode === 'killrace' && [...this.players.values()].some((p) => p.score >= KILL_TARGET)) this.setPhase('results', now + RESULTS_SECONDS * 1000, now);
    }

    // let the host know when the loading grace period runs out
    if (this.phase === 'lobby' && !this.announcedCanStart && this.canStart(now)) {
      this.announcedCanStart = true;
      this.broadcastRoom(now);
    }

    if (this.phase !== 'lobby') this.broadcastSnapshot(now);
  }

  private spawn(p: Player, s: SpawnDef, now: number, shieldUntil: number): void {
    p.alive = true;
    p.hp = MAX_HP;
    p.respawnAt = 0;
    p.weapon = null;
    p.ammo = 0;
    p.shieldUntil = shieldUntil;
    p.pos = [s.x, (s.y ?? 0) + KART_BALL_RADIUS + 0.05, s.z];
    p.vel = [0, 0, 0];
    p.quat = yawQuat(s.yaw);
    p.lastStateAt = now;
    if (p.bot) p.bot = newBotState(s.yaw, now);
    this.event({ type: 'respawn', id: p.id, p: p.pos, yaw: s.yaw });
  }

  /** The spawn point furthest from every other living kart. */
  pickSpawn(forPlayer: Player): SpawnDef {
    let best = this.map.spawns[0];
    let bestScore = -Infinity;
    for (const s of this.map.spawns) {
      let nearest = Infinity;
      for (const o of this.players.values()) {
        if (o === forPlayer || !o.alive) continue;
        nearest = Math.min(nearest, Math.hypot(o.pos[0] - s.x, o.pos[2] - s.z));
      }
      const score = nearest + Math.random() * 6;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- crates

  private resetCrates(now: number): void {
    this.crates = this.map.crates.map((c) => ({ pos: [c.x, (c.y ?? 0) + KART_BALL_RADIUS, c.z] as Vec3, availableAt: now }));
  }

  private updateCrates(now: number): void {
    for (const p of this.players.values()) {
      if (!p.alive || p.weapon) continue;
      for (let i = 0; i < this.crates.length; i++) {
        const c = this.crates[i];
        if (c.availableAt > now) continue;
        const horizontal = Math.hypot(p.pos[0] - c.pos[0], p.pos[2] - c.pos[2]);
        if (horizontal > CRATE_PICKUP_RADIUS || Math.abs(p.pos[1] - c.pos[1]) > 2.2) continue;
        const weapon = pickWeapon();
        p.weapon = weapon;
        p.ammo = WEAPONS[weapon].ammo;
        if (p.bot) p.bot.heldSince = now;
        c.availableAt = now + CRATE_RESPAWN_SECONDS * 1000;
        this.event({ type: 'pickup', id: p.id, weapon, crate: i });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- weapons

  /** World position of a weapon's muzzle on this kart. */
  muzzle(p: Player, weapon: WeaponType): Vec3 {
    const [mx, my, mz] = MUZZLE_OFFSETS[weapon];
    const o = rotateByQuat([weapon === 'gun' ? mx * p.gunSide : mx, my, mz], p.quat);
    return [p.pos[0] + o[0], p.pos[1] + o[1], p.pos[2] + o[2]];
  }

  private fire(p: Player, rawDir: Vec3, now: number): void {
    if (!p.weapon || p.ammo <= 0) return;
    const cooldown = p.weapon === 'gun' ? WEAPONS.gun.cooldown * 1000 : 300;
    if (now - p.lastFireAt < cooldown) return;
    p.lastFireAt = now;

    const weapon = p.weapon;
    const origin = this.muzzle(p, weapon);
    // Aim assist: snap toward the enemy nearest the line of fire.
    const assist = AIM_ASSIST[weapon];
    const aimed = assist ? assistTarget(this.world, origin, normalize(rawDir), this.enemiesOf(p), assist.cone, assist.range) : null;
    // Keep shots roughly level so nobody can fire straight up/down through the map.
    const d = aimed ? aimed.dir : normalize(rawDir);
    const dir = normalize([d[0], Math.max(-0.5, Math.min(0.5, d[1])), d[2]]);
    const flat = normalize([dir[0], 0, dir[2]]);

    switch (weapon) {
      case 'rocket':
        this.launch('rocket', p, origin, dir, WEAPONS.rocket.speed, now);
        break;
      case 'missiles': {
        const { count, spread, speed } = WEAPONS.missiles;
        for (let i = 0; i < count; i++) {
          const a = (i - (count - 1) / 2) * spread;
          const c = Math.cos(a);
          const s = Math.sin(a);
          const md: Vec3 = normalize([dir[0] * c + dir[2] * s, dir[1] + 0.04, -dir[0] * s + dir[2] * c]);
          this.launch('missile', p, [origin[0] + (i - 1) * 0.25 * c, origin[1], origin[2] - (i - 1) * 0.25 * s], md, speed, now);
        }
        break;
      }
      case 'grenade': {
        const g = WEAPONS.grenade;
        // with a target: lob so it lands on them; otherwise inherit some of the kart's speed
        const h = aimed ? Math.max(6, Math.min(30, (aimed.dist - 0.5) / GRENADE_FLIGHT)) : 0;
        const vel: Vec3 = aimed
          ? [flat[0] * h, g.lift, flat[2] * h]
          : [flat[0] * g.speed + p.vel[0] * 0.5, g.lift + Math.max(0, dir[1]) * g.speed, flat[2] * g.speed + p.vel[2] * 0.5];
        this.projectiles.push({ id: this.nextEntityId++, kind: 'grenade', owner: p.id, pos: origin, vel, bornAt: now });
        break;
      }
      case 'gun':
        this.fireGun(p, dir, origin, now);
        p.gunSide = p.gunSide === 1 ? -1 : 1;
        break;
      case 'mine': {
        const x = origin[0];
        const z = origin[2];
        this.mines.push({ id: this.nextEntityId++, owner: p.id, pos: [x, surfaceHeight(this.world, x, z, p.pos[1]), z], bornAt: now });
        if (this.mines.length > 40) this.mines.shift();
        this.event({ type: 'mine', id: p.id });
        break;
      }
      case 'shield':
        p.shieldUntil = now + WEAPONS.shield.duration * 1000;
        this.event({ type: 'shield', id: p.id });
        break;
    }
    if (weapon === 'rocket' || weapon === 'missiles' || weapon === 'grenade') this.event({ type: 'launch', id: p.id, weapon });

    p.ammo--;
    if (p.ammo <= 0) p.weapon = null;
  }

  private launch(kind: ProjectileKind, p: Player, origin: Vec3, dir: Vec3, speed: number, now: number) {
    this.projectiles.push({ id: this.nextEntityId++, kind, owner: p.id, pos: origin, vel: [dir[0] * speed, dir[1] * speed, dir[2] * speed], bornAt: now });
  }

  private fireGun(p: Player, aim: Vec3, o: Vec3, now: number): void {
    const s = p.bot ? 0.11 : WEAPONS.gun.spread;
    const dir = normalize([aim[0] + (Math.random() - 0.5) * s, aim[1] + (Math.random() - 0.5) * s, aim[2] + (Math.random() - 0.5) * s]);
    let best = raycastWorld(this.world, o, dir, WEAPONS.gun.range);
    let victim: Player | null = null;
    for (const t of this.players.values()) {
      if (t === p || !t.alive) continue;
      const hit = raySphere(o, dir, [t.pos[0], t.pos[1] + 0.2, t.pos[2]], KART_HIT_RADIUS + 0.2);
      if (hit !== null && hit < best) {
        best = hit;
        victim = t;
      }
    }
    const e: Vec3 = [o[0] + dir[0] * best, o[1] + dir[1] * best, o[2] + dir[2] * best];
    this.event({ type: 'shot', id: p.id, o: r2(o), e: r2(e), hit: !!victim });
    if (victim) this.damage(victim, p.id, 'gun', WEAPONS.gun.damage, dir, now);
  }

  private kartHit(pos: Vec3, owner: string, radius = KART_HIT_RADIUS): boolean {
    for (const t of this.players.values()) {
      if (t.id === owner || !t.alive) continue;
      if (dist3(pos, [t.pos[0], t.pos[1] + 0.2, t.pos[2]]) < radius) return true;
    }
    return false;
  }

  private updateProjectiles(now: number): void {
    const dt = TICK_SECONDS / SUBSTEPS;
    const survivors: Projectile[] = [];
    outer: for (const pr of this.projectiles) {
      const age = (now - pr.bornAt) / 1000;
      if (pr.kind === 'grenade') {
        const g = WEAPONS.grenade;
        if (age > g.fuse) {
          this.detonate(pr, now);
          continue;
        }
        for (let s = 0; s < SUBSTEPS; s++) {
          pr.vel[1] -= g.gravity * dt;
          const next: Vec3 = [pr.pos[0] + pr.vel[0] * dt, pr.pos[1] + pr.vel[1] * dt, pr.pos[2] + pr.vel[2] * dt];
          if (this.kartHit(next, pr.owner, KART_HIT_RADIUS + 0.2)) {
            pr.pos = next;
            this.detonate(pr, now);
            continue outer;
          }
          if (pointBlocked(this.world, next)) {
            const floor = surfaceHeight(this.world, next[0], next[2], pr.pos[1]);
            if (pr.vel[1] < 0 && pr.pos[1] >= floor - 0.05) {
              // bounce off the floor
              next[1] = floor + 0.12;
              pr.vel = [pr.vel[0] * 0.7, -pr.vel[1] * g.restitution, pr.vel[2] * 0.7];
            } else {
              // glance off a wall
              next[0] = pr.pos[0];
              next[2] = pr.pos[2];
              pr.vel = [-pr.vel[0] * 0.4, pr.vel[1], -pr.vel[2] * 0.4];
            }
          }
          pr.pos = next;
        }
        survivors.push(pr);
        continue;
      }

      const cfg = pr.kind === 'rocket' ? WEAPONS.rocket : WEAPONS.missiles;
      if (age > cfg.lifetime) {
        this.detonate(pr, now);
        continue;
      }
      this.steer(pr, cfg);
      for (let s = 0; s < SUBSTEPS; s++) {
        pr.pos = [pr.pos[0] + pr.vel[0] * dt, pr.pos[1] + pr.vel[1] * dt, pr.pos[2] + pr.vel[2] * dt];
        if (this.kartHit(pr.pos, pr.owner) || pointBlocked(this.world, pr.pos)) {
          this.detonate(pr, now);
          continue outer;
        }
      }
      survivors.push(pr);
    }
    this.projectiles = survivors;
  }

  /** Homing toward the nearest enemy inside a cone in front of the projectile. */
  private steer(pr: Projectile, cfg: { homingCone: number; homingRange: number; turnRate: number }): void {
    const speed = len(pr.vel);
    const dir = normalize(pr.vel);
    const minCos = Math.cos(cfg.homingCone);
    let target: Vec3 | null = null;
    let bestDist: number = cfg.homingRange;
    for (const t of this.players.values()) {
      if (t.id === pr.owner || !t.alive) continue;
      const to: Vec3 = [t.pos[0] - pr.pos[0], t.pos[1] + 0.2 - pr.pos[1], t.pos[2] - pr.pos[2]];
      const dist = len(to);
      if (dist > bestDist || dist < 1e-3) continue;
      const cos = (to[0] * dir[0] + to[1] * dir[1] + to[2] * dir[2]) / dist;
      if (cos < minCos) continue;
      bestDist = dist;
      target = [to[0] / dist, to[1] / dist, to[2] / dist];
    }
    if (!target) return;
    const k = Math.min(1, cfg.turnRate * TICK_SECONDS);
    const nd = normalize([dir[0] + (target[0] - dir[0]) * k, dir[1] + (target[1] - dir[1]) * k, dir[2] + (target[2] - dir[2]) * k]);
    pr.vel = [nd[0] * speed, nd[1] * speed, nd[2] * speed];
  }

  private detonate(pr: Projectile, now: number) {
    const cfg = pr.kind === 'rocket' ? WEAPONS.rocket : pr.kind === 'missile' ? WEAPONS.missiles : WEAPONS.grenade;
    const weapon: WeaponType = pr.kind === 'rocket' ? 'rocket' : pr.kind === 'missile' ? 'missiles' : 'grenade';
    this.explode(pr.pos, pr.owner, pr.kind, weapon, cfg, now);
  }

  private updateMines(now: number): void {
    const cfg = WEAPONS.mine;
    const survivors: Mine[] = [];
    for (const m of this.mines) {
      const age = (now - m.bornAt) / 1000;
      if (age > cfg.lifetime) continue;
      let triggered = false;
      if (age >= cfg.armTime) {
        for (const t of this.players.values()) {
          if (t.id === m.owner || !t.alive) continue;
          if (Math.hypot(t.pos[0] - m.pos[0], t.pos[2] - m.pos[2]) < cfg.triggerRadius && Math.abs(t.pos[1] - m.pos[1]) < 2) {
            triggered = true;
            break;
          }
        }
      }
      if (triggered) this.explode([m.pos[0], m.pos[1] + 0.3, m.pos[2]], m.owner, 'mine', 'mine', cfg, now);
      else survivors.push(m);
    }
    this.mines = survivors;
  }

  private explode(
    pos: Vec3,
    owner: string,
    kind: ProjectileKind | 'mine',
    weapon: WeaponType,
    cfg: { splash: number; fullRadius: number; damage: number; minDamage: number },
    now: number,
  ): void {
    this.event({ type: 'explode', p: r2(pos), kind });
    for (const t of this.players.values()) {
      if (t.id === owner || !t.alive) continue;
      const center: Vec3 = [t.pos[0], t.pos[1] + 0.2, t.pos[2]];
      const dmg = falloff(dist3(center, pos), cfg.fullRadius, cfg.splash, cfg.damage, cfg.minDamage);
      if (dmg <= 0) continue;
      const dir = normalize([center[0] - pos[0], 0.6, center[2] - pos[2]]);
      this.damage(t, owner, weapon, dmg, dir, now);
    }
  }

  private damage(victim: Player, attacker: string, weapon: WeaponType, amount: number, dir: Vec3, now: number): void {
    if (!victim.alive || victim.shieldUntil > now) return;
    victim.hp = Math.max(0, victim.hp - (this.mode === 'instagib' ? MAX_HP : amount));
    this.event({ type: 'hit', victim: victim.id, attacker, weapon, hp: victim.hp, dir: dir.map((n) => round(n, 100)) as Vec3 });
    if (victim.hp <= 0) this.kill(victim, attacker, weapon, now);
  }

  private kill(victim: Player, killerId: string, weapon: WeaponType | 'fall', now: number): void {
    victim.alive = false;
    victim.deaths++;
    victim.respawnAt = now + RESPAWN_SECONDS * 1000;
    victim.weapon = null;
    victim.ammo = 0;
    const killer = this.players.get(killerId);
    if (killer && killer !== victim) killer.score++;
    this.event({ type: 'explode', p: victim.pos, kind: 'kart' });
    this.event({ type: 'kill', victim: victim.id, killer: killerId, weapon });
    this.broadcastRoom(now);
  }

  // ---------------------------------------------------------------- bots

  private enemiesOf(p: Player): Player[] {
    return [...this.players.values()].filter((t) => t !== p && t.alive);
  }

  /** Enemies worth a bot's attention (no point shooting at a shield). */
  private botTargets(p: Player, now: number): Player[] {
    return this.enemiesOf(p).filter((t) => t.shieldUntil <= now);
  }

  /** Tops the match up to BOT_FILL karts with computer drivers. */
  private addBots(now: number): void {
    const usedNames = new Set([...this.players.values()].map((p) => p.name));
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    const names = BOT_NAMES.filter((n) => !usedNames.has(n)).sort(() => Math.random() - 0.5);
    while (this.players.size < Math.min(BOT_FILL, MAX_PLAYERS) && names.length) {
      let color = KART_COLORS.findIndex((_, i) => !usedColors.has(i));
      if (color < 0) color = Math.floor(Math.random() * KART_COLORS.length);
      usedColors.add(color);
      const bot: Player = {
        id: `b${(++playerCounter).toString(36)}`,
        name: names.pop()!,
        color,
        send: () => {},
        score: 0,
        deaths: 0,
        hp: MAX_HP,
        alive: false,
        respawnAt: 0,
        weapon: null,
        ammo: 0,
        shieldUntil: 0,
        pos: [0, -50, 0],
        quat: [0, 0, 0, 1],
        vel: [0, 0, 0],
        lastStateAt: now,
        lastFireAt: 0,
        loadedMap: this.map.id,
        gunSide: 1,
        bot: newBotState(0, now),
      };
      this.players.set(bot.id, bot);
    }
  }

  private botGoal(p: Player, b: BotState, now: number): Vec3 | null {
    const g = b.goal;
    if (!g) return null;
    if ('crate' in g) {
      const c = this.crates[g.crate];
      return c && c.availableAt <= now && !p.weapon ? c.pos : null;
    }
    const t = this.players.get(g.kart);
    return t && t.alive && t.shieldUntil <= now ? t.pos : null;
  }

  private pickBotGoal(p: Player, b: BotState, now: number): void {
    const armed = p.weapon && p.weapon !== 'mine' && p.weapon !== 'shield';
    let best: BotState['goal'] = null;
    let bestScore = Infinity;
    if (!armed && !p.weapon) {
      this.crates.forEach((c, i) => {
        if (c.availableAt > now || Math.abs(c.pos[1] - p.pos[1]) > 1) return;
        const score = Math.hypot(c.pos[0] - p.pos[0], c.pos[2] - p.pos[2]) * (0.8 + Math.random() * 0.4);
        if (score < bestScore) {
          bestScore = score;
          best = { crate: i };
        }
      });
    }
    if (!best || armed) {
      bestScore = Infinity;
      for (const t of this.botTargets(p, now)) {
        const score = Math.hypot(t.pos[0] - p.pos[0], t.pos[2] - p.pos[2]) * (0.8 + Math.random() * 0.4);
        if (score < bestScore) {
          bestScore = score;
          best = { kart: t.id };
        }
      }
    }
    b.goal = best;
  }

  private updateBots(now: number): void {
    for (const p of this.players.values()) {
      const b = p.bot;
      if (!b || !p.alive) continue;
      if (now >= b.retargetAt || !this.botGoal(p, b, now)) {
        this.pickBotGoal(p, b, now);
        b.retargetAt = now + 1000 + Math.random() * 1000;
      }
      const goal = this.botGoal(p, b, now);
      let steer = 0;
      let throttle = 1;
      if (now < b.reverseUntil) {
        steer = b.reverseSteer;
        throttle = -0.7;
      } else if (now < b.evadeUntil) {
        steer = steerToward(b, this.world, this.map, p.pos, b.evade[0], b.evade[1], now);
      } else if (goal) {
        // too close to fight: swing out and come back around for another pass
        if ('kart' in b.goal! && Math.hypot(goal[0] - p.pos[0], goal[2] - p.pos[2]) < 6) {
          const away = Math.atan2(p.pos[0] - goal[0], p.pos[2] - goal[2]) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6);
          const lim = this.map.half - 5;
          b.evade = [Math.max(-lim, Math.min(lim, goal[0] + Math.sin(away) * 16)), Math.max(-lim, Math.min(lim, goal[2] + Math.cos(away) * 16))];
          b.evadeUntil = now + 1300 + Math.random() * 500;
        }
        steer = steerToward(b, this.world, this.map, p.pos, goal[0], goal[2], now);
      } else {
        steer = Math.sin(now / 1400 + b.wander * 4) * 0.6;
      }
      const r = driveBot(b, this.world, this.map, p.pos, steer, throttle, TICK_SECONDS);
      // don't drive through other karts
      for (const o of this.players.values()) {
        if (o === p || !o.alive) continue;
        const dx = r.pos[0] - o.pos[0];
        const dz = r.pos[2] - o.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < 1.6 && d > 1e-3 && Math.abs(r.pos[1] - o.pos[1]) < 1.2) {
          r.pos[0] = o.pos[0] + (dx / d) * 1.6;
          r.pos[2] = o.pos[2] + (dz / d) * 1.6;
          b.speed *= 0.8;
        }
      }
      p.pos = r.pos;
      p.vel = r.vel;
      p.quat = yawQuat(b.yaw);
      p.lastStateAt = now;
      if (r.fell) {
        this.kill(p, '', 'fall', now);
        continue;
      }
      if (now >= b.checkAt) {
        if (now >= b.reverseUntil && Math.hypot(p.pos[0] - b.checkPos[0], p.pos[2] - b.checkPos[2]) < 1.5) {
          b.reverseUntil = now + 700 + Math.random() * 500;
          b.reverseSteer = Math.random() < 0.5 ? 1 : -1;
          b.goal = null;
        }
        b.checkPos = [p.pos[0], p.pos[1], p.pos[2]];
        b.checkAt = now + 1200;
      }
      this.botCombat(p, b, now);
    }
  }

  private botCombat(p: Player, b: BotState, now: number): void {
    const w = p.weapon;
    if (!w || now < b.nextFireAt) return;
    const fwd: Vec3 = [Math.sin(b.yaw), 0, Math.cos(b.yaw)];
    const held = now - b.heldSince;
    if (w === 'shield') {
      if (p.hp < MAX_HP || held > 3000) this.fire(p, fwd, now);
      return;
    }
    if (w === 'mine') {
      const chaser = this.enemiesOf(p).some((t) => {
        const dx = t.pos[0] - p.pos[0];
        const dz = t.pos[2] - p.pos[2];
        return Math.hypot(dx, dz) < 14 && dx * fwd[0] + dz * fwd[2] < 0;
      });
      if (chaser || held > 5000) {
        this.fire(p, fwd, now);
        b.nextFireAt = now + 900;
      }
      return;
    }
    const assist = AIM_ASSIST[w]!;
    const sight = assistTarget(this.world, this.muzzle(p, w), fwd, this.botTargets(p, now), assist.cone * 0.6, assist.range * 0.7);
    if (!sight) {
      b.sightedAt = 0;
      return;
    }
    if (!b.sightedAt) b.sightedAt = now;
    // a short reaction time so bots don't snipe the instant you round a corner
    if (now - b.sightedAt < 700) return;
    this.fire(p, fwd, now);
    b.nextFireAt = now + (w === 'gun' ? 150 : 1600);
  }

  // ---------------------------------------------------------------- networking

  roomInfo(now: number): RoomInfo {
    return {
      t: 'room',
      code: this.code,
      phase: this.phase,
      timeLeft: this.phase === 'lobby' ? 0 : Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1000)),
      mapId: this.map.id,
      mode: this.mode,
      hostId: this.hostId,
      canStart: this.canStart(now),
      bots: this.bots,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        deaths: p.deaths,
        loaded: !!p.bot || p.loadedMap === this.map.id,
        ...(p.bot ? { bot: true } : {}),
      })),
    };
  }

  private broadcastSnapshot(now: number): void {
    this.broadcast({
      t: 'snap',
      ts: now,
      timeLeft: Math.max(0, round((this.phaseEndsAt - now) / 1000, 10)),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        p: r2(p.pos),
        q: p.quat.map((n) => round(n, 1000)) as Quat,
        v: p.vel.map((n) => round(n, 10)) as Vec3,
        hp: p.hp,
        a: p.alive ? 1 : 0,
        sh: p.shieldUntil > now ? 1 : 0,
        w: p.weapon,
        ammo: p.ammo,
      })),
      projectiles: this.projectiles.map((pr) => ({ id: pr.id, k: pr.kind, p: r2(pr.pos), v: pr.vel.map((n) => round(n, 10)) as Vec3 })),
      mines: this.mines.map((m) => ({ id: m.id, p: r2(m.pos), owner: m.owner })),
      crates: this.crates.map((c) => (c.availableAt <= now ? '1' : '0')).join(''),
    });
  }

  private broadcastRoom(now: number): void {
    this.broadcast(this.roomInfo(now));
  }

  private event(e: GameEvent): void {
    this.broadcast({ t: 'ev', e });
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) p.send(data);
  }

  private sendTo(p: Player, msg: ServerMsg): void {
    p.send(JSON.stringify(msg));
  }
}
