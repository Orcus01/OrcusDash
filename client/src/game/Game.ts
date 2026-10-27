import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  AIM_ASSIST,
  CLIENT_SEND_RATE,
  DEFAULT_MAP_ID,
  KART_COLORS,
  WEAPONS,
  assistTarget,
  collisionWorld,
  getMap,
  type ClientMsg,
  type GameEvent,
  type LobbyPlayer,
  type MapDef,
  type Phase,
  type Snapshot,
  type WeaponType,
} from '@kart/shared';
import { WorldBuilder } from './WorldBuilder';
import { LocalKart } from './LocalKart';
import { RemoteKart } from './RemoteKart';
import { Effects } from './Effects';
import { Entities } from './Entities';
import { Input } from './Input';
import { Sound } from './Audio';
import { Renderer, type Quality } from './Renderer';
import { loadTextures } from './Textures';
import { KartModel } from './KartModel';
import { WEAPON_TYPES } from '@kart/shared';

export type { Quality } from './Renderer';

const PHYSICS_STEP = 1 / 60;
const INTERP_DELAY_MS = 100;

export interface HudState {
  hp: number;
  alive: boolean;
  weapon: WeaponType | null;
  ammo: number;
  shield: boolean;
}

export interface GameHooks {
  hud(state: HudState): void;
  killFeed(killer: string | null, victim: string, weapon: string, mine: boolean): void;
  hitMarker(): void;
  announce(text: string, sub?: string, color?: string): void;
  damaged(): void;
  eliminated(by: string | null): void;
  respawned(): void;
  pickup(weapon: WeaponType): void;
  mapLoading(mapId: string, progress: number): void;
  mapLoaded(mapId: string): void;
}

export interface MinimapState {
  me: { x: number; z: number; yaw: number } | null;
  others: { x: number; z: number; color: string }[];
  crates: { x: number; z: number; on: boolean }[];
}

const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function loadQuality(): Quality {
  try {
    const saved = localStorage.getItem('kc-quality2');
    if (saved === 'ultra' || saved === 'high' || saved === 'low') return saved;
  } catch {
    /* ignore */
  }
  return matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
}

function makeLockMarker(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ff4040';
  g.lineWidth = 9;
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(64, 64, 46, i * (Math.PI / 2) + 0.25, (i + 1) * (Math.PI / 2) - 0.25);
    g.stroke();
  }
  g.fillStyle = '#ff4040';
  g.beginPath();
  g.arc(64, 64, 7, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.renderOrder = 999;
  s.visible = false;
  return s;
}

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.1, 2500);
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly sound = new Sound();
  private readonly effects: Effects;
  private readonly entities: Entities;
  private readonly physics: RAPIER.World;
  private world: WorldBuilder | null = null;
  map: MapDef = getMap(DEFAULT_MAP_ID)!;
  loadedMapId = '';
  private loadToken = 0;
  private loading: Promise<void> | null = null;

  private local: LocalKart | null = null;
  private remotes = new Map<string, RemoteKart>();
  private players = new Map<string, LobbyPlayer>();
  private myId = '';
  private send: ((msg: ClientMsg) => void) | null = null;
  phase: Phase | 'menu' = 'menu';

  private clockOffset: number | null = null;
  private lastSnapTs = 0;
  private acc = 0;
  private sendAcc = 0;
  private lastFrame = performance.now();
  private frameCount = 0;
  private fireCooldown = 0;
  private fireHeld = false;
  private pendingSingleShot = 0;
  private fellSent = false;
  private myWeapon: WeaponType | null = null;
  private myAmmo = 0;
  private myHp = 100;
  private myShield = false;
  private shake = 0;
  private orbit = 0;
  private exhaustAcc = 0;
  private deathPos: THREE.Vector3 | null = null;
  private readonly camTarget = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3(0, 40, 90);
  hooks: GameHooks | null = null;
  /** soft light that follows your kart so it stays readable on dark maps */
  private readonly kartLight = new THREE.PointLight('#fff4e6', 0, 8, 1.8);
  /** kills since my last death, and the time of my last kill (for multi-kills) */
  private streak = 0;
  private multi = 0;
  private lastKillAt = 0;
  private firstBlood = false;
  /** red marker over the enemy the aim assist would lock on to */
  private readonly lockMarker = makeLockMarker();
  /** frames-per-second, smoothed (shown in the settings panel) */
  fps = 60;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, this.scene, this.camera, loadQuality());
    this.scene.add(this.kartLight, this.lockMarker);
    this.renderer.setBrightness(this.brightness);
    this.renderer.onLightning = () => setTimeout(() => this.sound.explosion(25), 600 + Math.random() * 900);
    this.physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.physics.timestep = PHYSICS_STEP;
    this.effects = new Effects(this.scene);
    this.entities = new Entities(this.scene, this.effects, (id) => this.colorOf(id));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.webgl.setAnimationLoop(() => this.frame());
  }

  get quality(): Quality {
    return this.renderer.quality;
  }

  get brightness(): number {
    try {
      const v = Number(localStorage.getItem('kc-brightness2'));
      return v >= 0.4 && v <= 1.3 ? v : 0.95;
    } catch {
      return 0.95;
    }
  }

  setBrightness(b: number) {
    try {
      localStorage.setItem('kc-brightness2', String(b));
    } catch {
      /* ignore */
    }
    this.renderer.setBrightness(b);
  }

  setQuality(q: Quality) {
    try {
      localStorage.setItem('kc-quality2', q);
    } catch {
      /* ignore */
    }
    this.renderer.setQuality(q);
    this.renderer.prepare(this.scene);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 60;
    this.camera.updateProjectionMatrix();
    this.renderer.resize();
  }

  /** Builds a map (procedural, so this takes a moment rather than a download). */
  loadMap(id: string): Promise<void> {
    if (this.loadedMapId === id && !this.loading) return Promise.resolve();
    if (this.map.id === id && this.loading) return this.loading;
    const map = getMap(id) ?? getMap(DEFAULT_MAP_ID)!;
    const token = ++this.loadToken;
    this.map = map;
    this.loadedMapId = '';
    this.loading = (async () => {
      this.hooks?.mapLoading(map.id, 0.1);
      await loadTextures(this.renderer.webgl);
      // let the UI paint the progress before the (synchronous) build
      await new Promise((r) => setTimeout(r, 0));
      if (token !== this.loadToken) return;
      if (this.world) {
        this.scene.remove(this.world.group);
        this.world.dispose();
      }
      this.physics.gravity = { x: 0, y: map.theme.gravity ?? -30, z: 0 };
      const world = new WorldBuilder(map, this.physics);
      world.build();
      this.world = world;
      this.scene.add(world.group);
      this.renderer.setEnvironment(map);
      this.kartLight.intensity = { day: 0, golden: 0, night: 4, storm: 3.5, volcanic: 0, space: 0, mist: 1, sunset: 0 }[map.theme.mood];
      this.entities.setMap(map);
      // Compile every shader we might need mid-match now (weapon mounts, projectiles, explosions),
      // otherwise the first rocket or pickup causes a visible hitch.
      const warm = this.warmupObjects();
      this.scene.add(warm);
      try {
        await this.renderer.webgl.compileAsync(this.scene, this.camera);
        this.renderer.webgl.render(this.scene, this.camera);
      } catch {
        /* optional */
      }
      this.scene.remove(warm);
      if (token !== this.loadToken) return;
      if (this.local) { this.local.boundaryHalf = map.half; this.local.surface = (x, z) => world.surfaceAt(x, z); }
      this.loadedMapId = map.id;
      this.loading = null;
      this.hooks?.mapLoading(map.id, 1);
      this.hooks?.mapLoaded(map.id);
    })();
    return this.loading;
  }

  private warmup: THREE.Group | null = null;

  private warmupObjects(): THREE.Group {
    if (this.warmup) return this.warmup;
    const group = new THREE.Group();
    const kart = new KartModel('#ff0000');
    kart.setShield(true);
    kart.setNameplate('warmup', 50);
    for (const w of WEAPON_TYPES) {
      const k = new KartModel('#00ff00');
      k.setWeapon(w);
      k.root.position.set(0, -50, 0);
      group.add(k.root);
    }
    kart.root.position.set(0, -50, 0);
    group.add(kart.root, this.entities.warmupObjects());
    // particles use transparent basic materials with both blend modes
    for (const blending of [THREE.NormalBlending, THREE.AdditiveBlending]) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending }));
      m.position.set(0, -50, 0);
      group.add(m);
    }
    group.traverse((o) => (o.frustumCulled = false));
    this.warmup = group;
    return group;
  }

  private colorOf(id: string) {
    return KART_COLORS[this.players.get(id)?.color ?? 0] ?? KART_COLORS[0];
  }

  private nameOf(id: string) {
    return this.players.get(id)?.name ?? 'Someone';
  }

  // ------------------------------------------------------------------ room lifecycle

  attach(myId: string, send: (msg: ClientMsg) => void) {
    this.myId = myId;
    this.send = send;
    this.clockOffset = null;
  }

  detach() {
    this.send = null;
    this.myId = '';
    this.local?.dispose();
    this.local = null;
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.players.clear();
    this.entities.clear();
    this.effects.clear();
    this.phase = 'menu';
    this.sound.engine(0, false);
  }

  setPlayers(list: LobbyPlayer[]) {
    this.players = new Map(list.map((p) => [p.id, p]));
    for (const [id, r] of this.remotes) {
      const info = this.players.get(id);
      if (!info) {
        r.dispose();
        this.remotes.delete(id);
      } else {
        r.setInfo(info.name, KART_COLORS[info.color]);
      }
    }
    const me = this.players.get(this.myId);
    if (me && this.local) this.local.model.setColor(KART_COLORS[me.color]);
  }

  setPhase(phase: Phase) {
    const prev = this.phase;
    this.phase = phase;
    if (phase !== 'playing') this.setPaused(false);
    if (phase === 'lobby') {
      this.local?.kill();
      for (const r of this.remotes.values()) r.alive = false;
      this.entities.clear();
      this.myWeapon = null;
      this.deathPos = null;
    }
    if (phase === 'countdown' || phase === 'playing') this.ensureLocal();
    if (phase === 'countdown' && prev !== 'countdown') {
      this.effects.clear();
      this.streak = 0;
      this.multi = 0;
      this.firstBlood = false;
    }
  }

  private ensureLocal(): LocalKart | null {
    if (!this.local && this.myId) {
      const me = this.players.get(this.myId);
      this.local = new LocalKart(this.physics, this.scene, KART_COLORS[me?.color ?? 0]);
      this.local.onLand = (pos, impact) => {
        this.local?.model.landed(impact);
        this.effects.dust(pos.clone().setY(pos.y - 0.3), '#9a8a70');
        this.shake = Math.max(this.shake, impact * 0.2);
      };
      this.local.onNitro = () => this.sound.boost();
      this.local.onBigAir = (seconds) => {
        this.hooks?.announce('BIG AIR!', `${seconds.toFixed(1)}s airborne · +25% NITRO`, '#69e5ff');
        this.sound.pickup();
        if(this.local)for(const wheel of this.local.rearPoints())this.effects.spark(wheel, '#69e5ff');
      };
      this.local.onBoostPad = () => this.sound.boost();
      this.local.onLava = () => {
        if (this.fellSent || this.phase !== 'playing') return;
        this.fellSent = true;
        this.send?.({ t: 'fell' });
      };
      this.local.boundaryHalf = this.map.half;
      const world = this.world;
      if (world) this.local.surface = (x, z) => world.surfaceAt(x, z);
      this.renderer.prepare(this.local.model.root);
    }
    return this.local;
  }

  cameraView: 'arcade' | 'chase' = (()=>{try{return localStorage.getItem('kc-camera')==='chase'?'chase':'arcade';}catch{return 'arcade';}})();
  shakeEnabled = (()=>{try{return localStorage.getItem('kc-shake')!=='0';}catch{return true;}})();
  setCameraView(view: 'arcade' | 'chase') { this.cameraView = view; try{localStorage.setItem('kc-camera',view);}catch{} }
  setShakeEnabled(on:boolean) {this.shakeEnabled=on;try{localStorage.setItem('kc-shake',on?'1':'0');}catch{} }

  paused = false;

  setPaused(on: boolean) {
    this.paused = on;
    this.input.clear();
  }

  private get controlsEnabled() {
    return !this.paused && this.phase === 'playing' && !!this.local?.alive && !!this.loadedMapId;
  }

  // ------------------------------------------------------------------ network input

  onSnapshot(s: Snapshot) {
    const now = performance.now();
    const sample = now - s.ts;
    if (this.clockOffset === null) this.clockOffset = sample;
    // Track the fastest-arriving packets more closely than slow ones (jitter only ever delays).
    else this.clockOffset += (sample - this.clockOffset) * (sample < this.clockOffset ? 0.2 : 0.02);
    this.lastSnapTs = s.ts;

    const present = new Set<string>();
    for (const ps of s.players) {
      present.add(ps.id);
      if (ps.id === this.myId) {
        const hadWeapon = this.myWeapon;
        this.myWeapon = ps.w;
        this.myAmmo = ps.ammo;
        this.myHp = ps.hp;
        this.myShield = ps.sh === 1;
        if (hadWeapon !== ps.w) this.pendingSingleShot = 0;
        this.local?.model.setShield(this.myShield);
        this.local?.model.setWeapon(ps.a ? ps.w : null);
        if (ps.a === 0 && this.local?.alive) this.local.kill();
        continue;
      }
      let r = this.remotes.get(ps.id);
      if (!r) {
        const info = this.players.get(ps.id);
        r = new RemoteKart(ps.id, this.physics, this.scene, KART_COLORS[info?.color ?? 0]);
        r.setInfo(info?.name ?? '', KART_COLORS[info?.color ?? 0]);
        this.remotes.set(ps.id, r);
        this.renderer.prepare(r.model.root);
      }
      r.push(s.ts, ps);
    }
    for (const [id, r] of this.remotes) {
      if (!present.has(id)) {
        r.dispose();
        this.remotes.delete(id);
      }
    }
    this.entities.applySnapshot(s, now);
    this.hooks?.hud({ hp: this.myHp, alive: !!this.local?.alive, weapon: this.myWeapon, ammo: this.myAmmo, shield: this.myShield });
  }

  onCorrection(p: number[]) {
    this.local?.correct(v3(p));
  }

  private kartModel(id: string) {
    return id === this.myId ? this.local?.model : this.remotes.get(id)?.model;
  }

  onEvent(e: GameEvent) {
    const listener = this.local?.alive ? this.local.position : this.camTarget;
    switch (e.type) {
      case 'respawn': {
        const pos = v3(e.p);
        if (e.id === this.myId) {
          // Spawn events for a new match arrive just before the 'countdown' phase message.
          const local = this.ensureLocal();
          const wasDead = this.deathPos !== null;
          local?.teleport(pos, e.yaw);
          this.fellSent = false;
          this.deathPos = null;
          this.camPos.copy(pos).add(new THREE.Vector3(-Math.sin(e.yaw) * 6, 2.6, -Math.cos(e.yaw) * 6));
          if (wasDead) this.hooks?.respawned();
        } else {
          this.remotes.get(e.id)?.snapTo(pos, e.yaw, this.lastSnapTs);
        }
        break;
      }
      case 'explode': {
        const p = v3(e.p);
        this.effects.explosion(p, e.kind === 'kart');
        const d = p.distanceTo(listener);
        this.sound.explosion(d);
        this.shake = Math.max(this.shake, Math.max(0, 1 - d / 30) * 0.7);
        break;
      }
      case 'shot': {
        const o = v3(e.o);
        this.effects.tracer(o, v3(e.e), e.hit);
        this.effects.muzzleFlash(o);
        this.kartModel(e.id)?.fired();
        this.sound.shot(o.distanceTo(listener));
        break;
      }
      case 'launch': {
        const model = this.kartModel(e.id);
        model?.fired();
        const muzzle = model?.muzzleWorld();
        if (muzzle) this.effects.muzzleFlash(muzzle, true);
        if (e.id === this.myId || (muzzle && muzzle.distanceTo(listener) < 25)) {
          if (e.weapon === 'grenade') this.sound.grenade();
          else this.sound.rocket();
        }
        break;
      }
      case 'mine':
        if (e.id === this.myId) this.sound.mine();
        break;
      case 'shield':
        if (e.id === this.myId) this.sound.shield();
        break;
      case 'hit':
        if (e.victim === this.myId) {
          this.hooks?.damaged();
          this.sound.hit();
          this.local?.knockback(v3(e.dir), e.weapon === 'gun' ? 2 : 8);
          this.shake = Math.max(this.shake, e.weapon === 'gun' ? 0.12 : 0.5);
        } else {
          const r = this.remotes.get(e.victim);
          if (r) this.effects.spark(r.position.clone().setY(r.position.y + 0.4), '#ff6a3d');
        }
        if (e.attacker === this.myId && e.victim !== this.myId) {
          this.hooks?.hitMarker();
          this.sound.hitMarker();
        }
        break;
      case 'kill': {
        const killer = e.killer && e.killer !== e.victim ? this.nameOf(e.killer) : null;
        if (e.victim === this.myId) {
          this.deathPos = this.local?.position.clone() ?? null;
          this.local?.kill();
          this.hooks?.eliminated(killer);
        }
        if (e.victim === this.myId) {
          this.streak = 0;
          this.multi = 0;
        }
        if (e.killer && e.killer !== e.victim && e.weapon !== 'fall' && !this.firstBlood) {
          this.firstBlood = true;
          if (e.killer === this.myId) this.hooks?.announce('FIRST BLOOD!', `you took out ${this.nameOf(e.victim)}`, '#ff5a4a');
        }
        if (e.killer === this.myId && e.victim !== this.myId) {
          this.sound.ko();
          this.local?.nitro.reward(0.4);
          const t = performance.now();
          this.multi = t - this.lastKillAt < 4500 ? this.multi + 1 : 1;
          this.lastKillAt = t;
          this.streak++;
          const multi = ['', '', 'DOUBLE KILL!', 'TRIPLE KILL!', 'QUAD KILL!', 'UNSTOPPABLE!'][Math.min(this.multi, 5)];
          const streak = { 3: 'KILLING SPREE!', 5: 'RAMPAGE!', 7: 'DOMINATING!', 10: 'LEGENDARY!' }[this.streak];
          if (multi) this.hooks?.announce(multi, `${this.streak} in a row · +40% NITRO`, '#ffc928');
          else if (streak) this.hooks?.announce(streak, `${this.streak} kills without dying · +40% NITRO`, '#ff8a3d');
          else if (this.firstBlood && this.streak > 0) this.hooks?.announce(`KO! ${this.nameOf(e.victim)}`, '+40% NITRO', '#ffffff');
          if (multi || streak) this.sound.streak();
        }
        this.hooks?.killFeed(killer, this.nameOf(e.victim), e.weapon, e.victim === this.myId || e.killer === this.myId);
        break;
      }
      case 'pickup': {
        const pos = this.entities.crateWorldPos(e.crate);
        if (pos) this.effects.burst(pos, '#ffcf3f');
        if (e.id === this.myId) {
          this.myWeapon = e.weapon;
          this.myAmmo = WEAPONS[e.weapon].ammo;
          this.local?.model.setWeapon(e.weapon);
          if (this.local) this.renderer.prepare(this.local.model.root);
          this.sound.pickup();
          this.hooks?.pickup(e.weapon);
          this.hooks?.hud({ hp: this.myHp, alive: !!this.local?.alive, weapon: this.myWeapon, ammo: this.myAmmo, shield: this.myShield });
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ frame loop

  private frame() {
    const now = performance.now();
    const rawDt = (now - this.lastFrame) / 1000;
    const dt = Math.min(0.15, rawDt);
    this.renderer.sampleFrame(rawDt);
    this.lastFrame = now;
    if (rawDt > 0) this.fps += (1 / rawDt - this.fps) * 0.05;

    // Fixed-step physics (only once the arena colliders exist).
    if (this.loadedMapId) {
      this.acc += dt;
      let steps = 0;
      const drive = { throttle: this.input.throttle, steer: this.input.steer, drift: this.input.drift, nitro: this.input.nitro };
      while (this.acc >= PHYSICS_STEP && steps < 10) {
        this.local?.fixedUpdate(PHYSICS_STEP, drive, this.controlsEnabled);
        this.physics.step();
        this.local?.afterStep();
        this.acc -= PHYSICS_STEP;
        steps++;
      }
      if (steps === 10) this.acc = 0;
    }
    const alpha = this.acc / PHYSICS_STEP;

    const local = this.local;
    if (local?.alive) {
      local.syncVisual(alpha, dt);
      if (local.position.y < -8 && !this.fellSent) {
        this.fellSent = true;
        this.send?.({ t: 'fell' });
      }
    }

    this.sendState(dt);
    this.handleFiring(dt);
    this.updateLock(now);

    if (this.clockOffset !== null) {
      const renderTime = now - this.clockOffset - INTERP_DELAY_MS;
      for (const r of this.remotes.values()) r.update(renderTime, dt);
    }

    this.world?.update(dt);
    this.entities.update(dt, now);
    this.kartEffects(dt);
    this.effects.update(dt);
    this.updateCamera(dt);

    const inMatch = this.phase === 'countdown' || this.phase === 'playing';
    this.sound.engine(local ? Math.min(1, Math.abs(local.forwardSpeed) / 12.5) : 0, inMatch && !!local?.alive);

    if (local?.alive) this.kartLight.position.copy(local.position).add(new THREE.Vector3(0, 2.2, 0));
    // Catch materials of anything created since the last pass (weapon mounts, projectiles…).
    if (++this.frameCount % 45 === 0) this.renderer.prepare(this.scene);
    this.renderer.render(local?.alive ? local.position : this.camTarget, dt);
  }

  private sendState(dt: number) {
    const local = this.local;
    if (!this.send || !local?.alive || (this.phase !== 'playing' && this.phase !== 'countdown')) return;
    this.sendAcc += dt;
    if (this.sendAcc < 1 / CLIENT_SEND_RATE) return;
    this.sendAcc = 0;
    const p = local.position;
    const q = local.model.root.quaternion;
    const v = local.velocity;
    this.send({ t: 'state', p: [r2(p.x), r2(p.y), r2(p.z)], q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)], v: [r2(v.x), r2(v.y), r2(v.z)] });
  }

  private handleFiring(dt: number) {
    this.fireCooldown -= dt;
    this.pendingSingleShot -= dt;
    const fire = this.input.fire;
    if (this.controlsEnabled && this.myWeapon && this.send && this.local) {
      const d = this.local.aimDirection;
      const dir: [number, number, number] = [r3(d.x), r3(d.y), r3(d.z)];
      if (this.myWeapon === 'gun') {
        if (fire && this.fireCooldown <= 0 && this.myAmmo > 0) {
          this.send({ t: 'fire', d: dir });
          this.fireCooldown = WEAPONS.gun.clientInterval;
          this.myAmmo--;
        }
      } else if (fire && !this.fireHeld && this.pendingSingleShot <= 0) {
        this.send({ t: 'fire', d: dir });
        this.pendingSingleShot = 0.4;
      }
    }
    this.fireHeld = fire;
  }

  /** Shows which enemy your shot would lock on to (same rule the server uses). */
  private updateLock(now: number) {
    const m = this.lockMarker;
    const assist = this.myWeapon ? AIM_ASSIST[this.myWeapon] : undefined;
    const local = this.local;
    if (!assist || !local?.alive || !this.controlsEnabled) {
      m.visible = false;
      return;
    }
    const d = local.aimDirection;
    const p = local.position;
    const targets = [...this.remotes.values()].filter((r) => r.alive && r.model.root.visible).map((r) => ({ r, pos: [r.position.x, r.position.y, r.position.z] as [number, number, number] }));
    const hit = assistTarget(collisionWorld(this.map), [p.x, p.y + 0.3, p.z], [d.x, d.y, d.z], targets, assist.cone, assist.range);
    if (!hit) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.copy(hit.target.r.position).add(new THREE.Vector3(0, 0.45, 0));
    m.material.rotation = now / 400;
    const s = 0.1 + Math.sin(now / 120) * 0.007;
    m.scale.set(s, s, 1);
  }

  private kartEffects(dt: number) {
    this.exhaustAcc += dt;
    const emit = this.exhaustAcc > 0.07;
    if (emit) this.exhaustAcc = 0;
    const local = this.local;
    if (local?.alive) {
      if (emit && local.boosting > 0) this.effects.puff(local.exhaustPoint(), '#ff9d2e', 0.18, 0.5);
      if (local.drifting && local.grounded) {
        const c = local.driftCharged ? '#4fc3ff' : '#ffb000';
        for (const p of local.rearPoints()) this.effects.spark(p, c);
      }
      if (local.boosting > 0) this.effects.spark(local.exhaustPoint(), '#ff6a00');
      if (emit && local.onWater && Math.abs(local.forwardSpeed) > 3) {
        for (const p of local.rearPoints()) this.effects.puff(p, '#e1f5fe', 0.25, 1.5);
      }
    }
  }

  get drivingState() {
    const kart = this.local;
    return { alive: !!kart?.alive, forwardSpeed: kart?.forwardSpeed ?? 0, boosting: kart?.boosting ?? 0, driftCharge: kart?.driftCharge ?? 0, driftCharged: !!kart?.driftCharged, nitro: kart?.nitro.fuel ?? 0, nitroActive: !!kart?.alive && !!kart?.nitro.active };
  }

  private updateCamera(dt: number) {
    const local = this.local;
    const k = 1 - Math.exp(-6 * dt);
    if (local?.alive && this.phase !== 'menu' && this.phase !== 'lobby') {
      const root = local.model.root.position;
      const fwd = new THREE.Vector3(Math.sin(local.yaw), 0, Math.cos(local.yaw));
      const pivot = root.clone().add(new THREE.Vector3(0, 1.0, 0));
      const speed = Math.abs(local.forwardSpeed);
      const portrait = window.innerWidth < window.innerHeight;
      const phone = matchMedia('(pointer: coarse)').matches;
      const back = (phone && portrait ? 4.9 : this.cameraView === 'arcade' ? 5.7 : 4.8) + Math.min(speed / 11.5, 1) * 0.3;
      const desired = root.clone().addScaledVector(fwd, -back).add(new THREE.Vector3(0, phone && portrait ? 4.4 : this.cameraView === 'arcade' ? 4.1 : 2.6, 0));

      // Pull the camera in front of walls/buildings instead of clipping through them.
      const toCam = desired.clone().sub(pivot);
      const dist = toCam.length();
      toCam.normalize();
      const hit = this.physics.castRay(
        new RAPIER.Ray({ x: pivot.x, y: pivot.y, z: pivot.z }, { x: toCam.x, y: toCam.y, z: toCam.z }),
        dist,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (c) => c.parent()?.isFixed() ?? false,
      );
      if (hit) desired.copy(pivot).addScaledVector(toCam, Math.max(1.2, hit.timeOfImpact - 0.3));

      this.camPos.lerp(desired, k);
      this.camPos.y = Math.max(this.camPos.y, root.y + 0.9);
      this.camTarget.lerp(root.clone().addScaledVector(fwd, 1.5).add(new THREE.Vector3(0, 0.4, 0)), 1 - Math.exp(-10 * dt));
      const baseFov = window.innerWidth < window.innerHeight ? 72 : 60;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, baseFov + Math.min(speed / 11.5, 1) * 2 + (local.boosting > 0 ? 2 : 0), 1 - Math.exp(-3 * dt));
      this.camera.updateProjectionMatrix();
    } else if (this.deathPos && this.phase === 'playing') {
      // Eliminated: pull back and up to watch the wreck.
      const yaw = local?.yaw ?? 0;
      const desired = this.deathPos.clone().add(new THREE.Vector3(-Math.sin(yaw) * 11, 7, -Math.cos(yaw) * 11));
      this.camPos.lerp(desired, 1 - Math.exp(-2.5 * dt));
      this.camTarget.lerp(this.deathPos, k);
    } else {
      // Menu / lobby / results: slow orbit around the arena.
      this.orbit += dt * 0.045;
      const R = this.map.half * 1.1;
      const desired = new THREE.Vector3(Math.cos(this.orbit) * R, this.map.half * 0.45 + 6, Math.sin(this.orbit) * R);
      this.camPos.lerp(desired, 1 - Math.exp(-1.2 * dt));
      this.camTarget.lerp(new THREE.Vector3(0, 2, 0), 1 - Math.exp(-1.2 * dt));
    }

    this.camera.position.copy(this.camPos);
    if (this.shake > 0.001 && this.shakeEnabled) {
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake));
    }
    this.shake *= Math.exp(-6 * dt);
    this.camera.lookAt(this.camTarget);
  }

  // ------------------------------------------------------------------ minimap

  minimap(): MinimapState {
    const l = this.local;
    return {
      me: l?.alive ? { x: l.position.x, z: l.position.z, yaw: l.yaw } : null,
      others: [...this.remotes.values()].filter((r) => r.model.root.visible).map((r) => ({ x: r.position.x, z: r.position.z, color: this.colorOf(r.id) })),
      crates: this.entities.crateStates(),
    };
  }
}
