import { beforeEach, describe, expect, it } from 'vitest';
import {
  COUNTDOWN_SECONDS,
  DEFAULT_MAP_ID,
  KART_BALL_RADIUS,
  MATCH_SECONDS,
  MAX_PLAYERS,
  RESULTS_SECONDS,
  WEAPONS,
  collisionWorld,
  pointBlocked,
  type GameEvent,
  type MapDef,
  type ServerMsg,
  type Vec3,
} from '@kart/shared';
import { Room, falloff, type Player } from '../src/Room';
import { isPlausibleMove, parseClientMsg } from '../src/validation';

let now = 1_000_000;
const clock = () => now;

function makeRoom(bots = false) {
  const room = new Room('TEST22', () => {}, clock, false);
  room.bots = bots;
  return room;
}

function join(room: Room, name = 'P') {
  const inbox: ServerMsg[] = [];
  const p = room.addPlayer(name, 0, (d) => inbox.push(JSON.parse(d))) as Player;
  expect(typeof p).toBe('object');
  return { p, inbox, events: () => inbox.filter((m): m is { t: 'ev'; e: GameEvent } => m.t === 'ev').map((m) => m.e) };
}

function advance(room: Room, seconds: number) {
  const steps = Math.round(seconds * 20);
  for (let i = 0; i < steps; i++) {
    now += 50;
    room.tick(now);
  }
}

function startPlaying(room: Room) {
  room.startMatch(now);
  advance(room, COUNTDOWN_SECONDS + 0.1);
  expect(room.phase).toBe('playing');
}

function place(p: Player, pos: Vec3) {
  p.pos = pos;
  p.quat = [0, 0, 0, 1]; // facing +z
  p.lastStateAt = now;
}

/** A straight stretch of open ground (facing +z) with no crates nearby, found by probing the map. */
function findLane(map: MapDef, length: number, width = 1.5): [number, number] {
  const world = collisionWorld(map);
  for (let x = -map.half + 5; x < map.half - 5; x += 1.5) {
    for (let z = -map.half + 6; z < map.half - 6 - length; z += 1.5) {
      let clear = true;
      for (let t = -4; t <= length + 4 && clear; t += 0.5) {
        for (let dx = -width; dx <= width; dx += 0.5) {
          for (const y of [0.2, 0.8, 1.6]) if (pointBlocked(world, [x + dx, y, z + t])) clear = false;
        }
      }
      if (clear && !map.crates.some((c) => Math.abs(c.x - x) < 3 && c.z > z - 4 && c.z < z + length + 4)) return [x, z];
    }
  }
  throw new Error('no clear lane');
}

beforeEach(() => {
  now = 1_000_000;
});

describe('room membership', () => {
  it('first player is host and receives the code', () => {
    const room = makeRoom();
    const a = join(room, 'A');
    expect(room.hostId).toBe(a.p.id);
    const joined = a.inbox.find((m) => m.t === 'joined');
    expect(joined && joined.t === 'joined' && joined.room.code).toBe('TEST22');
  });

  it(`rejects player ${MAX_PLAYERS + 1}`, () => {
    const room = makeRoom();
    for (let i = 0; i < MAX_PLAYERS; i++) join(room);
    expect(room.addPlayer('late', 0, () => {})).toBe('FULL');
  });

  it('passes host to the next player when the host leaves, and disposes when empty', () => {
    let emptied = false;
    const room = new Room('TEST22', () => (emptied = true), clock, false);
    const a = join(room, 'A');
    const b = join(room, 'B');
    room.removePlayer(a.p.id);
    expect(room.hostId).toBe(b.p.id);
    room.removePlayer(b.p.id);
    expect(emptied).toBe(true);
  });

  it('only the host can start or change map', () => {
    const room = makeRoom();
    join(room, 'A');
    const b = join(room, 'B');
    room.handle(b.p, { t: 'start' });
    room.handle(b.p, { t: 'setMap', mapId: 'snow' });
    expect(room.phase).toBe('lobby');
    expect(room.map.id).toBe(DEFAULT_MAP_ID);
  });

  it('waits for everyone to load a new map before the host can start (with a grace period)', () => {
    const room = makeRoom();
    const a = join(room, 'A');
    const b = join(room, 'B');
    room.handle(a.p, { t: 'setMap', mapId: 'jungle' });
    room.handle(a.p, { t: 'loaded', mapId: 'jungle' });
    room.handle(a.p, { t: 'start' });
    expect(room.phase).toBe('lobby');
    expect(room.roomInfo(now).canStart).toBe(false);
    room.handle(b.p, { t: 'loaded', mapId: 'jungle' });
    expect(room.roomInfo(now).players.every((p) => p.loaded)).toBe(true);
    room.handle(a.p, { t: 'start' });
    expect(room.phase).toBe('countdown');

    const room2 = makeRoom();
    const c = join(room2, 'C');
    room2.handle(c.p, { t: 'setMap', mapId: 'beach' });
    advance(room2, 21);
    // the grace period ending is announced so the host's Start button re-enables
    const lastRoom = [...c.inbox].reverse().find((m) => m.t === 'room');
    expect(lastRoom && lastRoom.t === 'room' && lastRoom.canStart).toBe(true);
    room2.handle(c.p, { t: 'start' });
    expect(room2.phase).toBe('countdown');
  });
});

describe('match flow', () => {
  it('goes countdown → playing → results → lobby', () => {
    const room = makeRoom();
    join(room);
    room.startMatch(now);
    expect(room.phase).toBe('countdown');
    advance(room, COUNTDOWN_SECONDS + 0.1);
    expect(room.phase).toBe('playing');
    advance(room, MATCH_SECONDS);
    expect(room.phase).toBe('results');
    advance(room, RESULTS_SECONDS);
    expect(room.phase).toBe('lobby');
  });

  it('late joiners spawn into a running match', () => {
    const room = makeRoom();
    join(room, 'A');
    startPlaying(room);
    const b = join(room, 'B');
    expect(b.p.alive).toBe(true);
    expect(b.events().some((e) => e.type === 'respawn' && e.id === b.p.id)).toBe(true);
  });
});

describe('combat', () => {
  function duel(gap = 9) {
    const room = makeRoom();
    const a = join(room, 'A');
    const b = join(room, 'B');
    startPlaying(room);
    advance(room, 3); // spawn shields wear off
    const [x, z] = findLane(room.map, gap + 2);
    place(a.p, [x, KART_BALL_RADIUS, z]);
    place(b.p, [x, KART_BALL_RADIUS, z + gap]);
    return { room, a, b };
  }

  it('picks up a weapon from a crate', () => {
    const { room, a } = duel();
    const c = room.map.crates.find((k) => !k.y)!;
    place(a.p, [c.x, KART_BALL_RADIUS, c.z]);
    advance(room, 0.1);
    expect(a.p.weapon).not.toBeNull();
    expect(a.events().some((e) => e.type === 'pickup')).toBe(true);
  });

  it('fires from the weapon mount on the car', () => {
    const { room, a } = duel();
    const m = room.muzzle(a.p, 'gun');
    expect(m[2]).toBeGreaterThan(a.p.pos[2] + 0.5); // in front of the kart
    expect(m[1]).toBeGreaterThan(a.p.pos[1]); // on the hood, above the centre
  });

  it('machine gun kills after enough hits and awards a point', () => {
    const { room, a, b } = duel();
    a.p.weapon = 'gun';
    a.p.ammo = WEAPONS.gun.ammo;
    for (let i = 0; i < WEAPONS.gun.ammo && b.p.alive; i++) {
      room.handle(a.p, { t: 'fire', d: [0, 0, 1] });
      advance(room, 0.1);
    }
    expect(b.p.alive).toBe(false);
    expect(a.p.score).toBe(1);
    expect(b.p.deaths).toBe(1);
  });

  it('rocket kills in one hit, shield blocks it', () => {
    const { room, a, b } = duel();
    b.p.shieldUntil = now + 10_000;
    a.p.weapon = 'rocket';
    a.p.ammo = 1;
    room.handle(a.p, { t: 'fire', d: [0, 0, 1] });
    advance(room, 1);
    expect(b.p.alive).toBe(true);

    b.p.shieldUntil = 0;
    a.p.weapon = 'rocket';
    a.p.ammo = 1;
    a.p.lastFireAt = 0;
    room.handle(a.p, { t: 'fire', d: [0, 0, 1] });
    advance(room, 1);
    expect(b.p.alive).toBe(false);
    expect(a.p.weapon).toBeNull();
  });

  it('triple missiles launch three homing missiles', () => {
    const { room, a, b } = duel(12);
    a.p.weapon = 'missiles';
    a.p.ammo = 1;
    room.handle(a.p, { t: 'fire', d: [0, 0, 1] });
    expect(a.events().filter((e) => e.type === 'launch' && e.weapon === 'missiles')).toHaveLength(1);
    advance(room, 1.5);
    const blasts = a.events().filter((e) => e.type === 'explode' && e.kind === 'missile');
    expect(blasts.length).toBe(3);
    expect(b.p.hp < 100 || !b.p.alive).toBe(true);
  });

  it('grenades arc, bounce and explode on their fuse', () => {
    const { room, a } = duel();
    // nobody in front: aim away from B
    a.p.weapon = 'grenade';
    a.p.ammo = 3;
    room.handle(a.p, { t: 'fire', d: [0, 0, -1] });
    let maxY = 0;
    let minY = Infinity;
    for (let i = 0; i < 30; i++) {
      advance(room, 0.05);
      const snap = [...a.inbox].reverse().find((m) => m.t === 'snap');
      const g = snap && snap.t === 'snap' ? snap.projectiles.find((p) => p.k === 'grenade') : undefined;
      if (g) {
        maxY = Math.max(maxY, g.p[1]);
        minY = Math.min(minY, g.p[1]);
      }
    }
    expect(maxY).toBeGreaterThan(a.p.pos[1] + 0.5); // it arcs upward
    expect(minY).toBeGreaterThan(-0.01); // never sinks into the ground
    advance(room, 0.5);
    expect(a.events().some((e) => e.type === 'explode' && e.kind === 'grenade')).toBe(true);
    expect(a.p.ammo).toBe(2);
  });

  it('a lobbed grenade lands on a kart about 19 m ahead and hurts it', () => {
    const { room, a, b } = duel(19);
    a.p.weapon = 'grenade';
    a.p.ammo = 3;
    room.handle(a.p, { t: 'fire', d: [0, 0, 1] });
    advance(room, 1);
    expect(b.p.hp).toBeLessThan(100);
  });

  it('mines trigger on enemies and the victim respawns', () => {
    const { room, a, b } = duel();
    a.p.weapon = 'mine';
    a.p.ammo = 3;
    room.handle(a.p, { t: 'fire', d: [0, 0, 1] }); // dropped behind A
    const mine = room.muzzle(a.p, 'mine');
    advance(room, 1);
    place(b.p, [mine[0], KART_BALL_RADIUS, mine[2]]);
    advance(room, 0.1);
    expect(b.p.alive).toBe(false);
    advance(room, 3.1);
    expect(b.p.alive).toBe(true);
  });

  it('falling out of the world or into lava counts as a death and respawns', () => {
    const { room, a } = duel();
    room.handle(a.p, { t: 'fell' });
    expect(a.p.alive).toBe(false);
    expect(a.p.deaths).toBe(1);
    expect(a.events().some((e) => e.type === 'kill' && e.weapon === 'fall')).toBe(true);
    advance(room, 3.1);
    expect(a.p.alive).toBe(true);
  });

  it('splash damage falls off with distance', () => {
    expect(falloff(1, 2, 4, 100, 40)).toBe(100);
    expect(falloff(3, 2, 4, 100, 40)).toBe(70);
    expect(falloff(5, 2, 4, 100, 40)).toBe(0);
  });
});

describe('bots', () => {
  it('fill a solo match, drive around, fight, and leave when the match ends', () => {
    const room = makeRoom(true);
    const a = join(room, 'Solo');
    startPlaying(room);
    const bots = [...room.players.values()].filter((p) => p.bot);
    expect(room.players.size).toBe(6);
    expect(bots.length).toBe(5);
    expect(room.roomInfo(now).players.filter((p) => p.bot).length).toBe(5);
    const start = bots.map((b) => [...b.pos]);
    advance(room, 30);
    const moved = bots.filter((b, i) => Math.hypot(b.pos[0] - start[i][0], b.pos[2] - start[i][2]) > 5);
    expect(moved.length).toBeGreaterThanOrEqual(3);
    for (const b of bots) {
      expect(Math.abs(b.pos[0])).toBeLessThanOrEqual(room.map.half);
      expect(Math.abs(b.pos[2])).toBeLessThanOrEqual(room.map.half);
    }
    const ev = a.events();
    expect(ev.some((e) => e.type === 'pickup' && e.id.startsWith('b'))).toBe(true);
    expect(ev.some((e) => (e.type === 'shot' || e.type === 'launch' || e.type === 'mine') && e.id.startsWith('b'))).toBe(true);
    room.handle(a.p, { t: 'setBots', on: false }); // ignored outside the lobby
    expect(room.bots).toBe(true);
    advance(room, MATCH_SECONDS + RESULTS_SECONDS + 1);
    expect(room.phase).toBe('lobby');
    expect(room.players.size).toBe(1);
  });

  it('the host can turn them off, and a human joining a full match replaces a bot', () => {
    const room = makeRoom(true);
    const a = join(room, 'Host');
    room.handle(a.p, { t: 'setBots', on: false });
    expect(room.bots).toBe(false);
    room.handle(a.p, { t: 'setBots', on: true });
    startPlaying(room);
    expect(room.players.size).toBe(6);
    const humans = () => [...room.players.values()].filter((p) => !p.bot).length;
    for (let i = 0; i < 7; i++) join(room);
    expect(room.players.size).toBe(8);
    expect(humans()).toBe(8);
    expect(room.addPlayer('late', 0, () => {})).toBe('FULL');
  });

  it('the room closes when the last human leaves, even with bots in it', () => {
    let emptied = false;
    const room = new Room('TEST22', () => (emptied = true), clock, false);
    const a = join(room);
    startPlaying(room);
    expect(room.players.size).toBeGreaterThan(1);
    room.removePlayer(a.p.id);
    expect(emptied).toBe(true);
  });
});

describe('aim assist', () => {
  it('rocket fired roughly toward an enemy heads straight for them', () => {
    const room = makeRoom();
    const a = join(room, 'A');
    const b = join(room, 'B');
    startPlaying(room);
    const [x, z] = findLane(room.map, 16, 5);
    place(a.p, [x, KART_BALL_RADIUS, z]);
    place(b.p, [x + 4, KART_BALL_RADIUS, z + 14]);
    a.p.weapon = 'rocket';
    a.p.ammo = 1;
    a.p.shieldUntil = 0;
    b.p.shieldUntil = 0;
    room.handle(a.p, { t: 'fire', d: [0, 0, 1] }); // nose points 16° off the target
    advance(room, 1);
    expect(b.p.alive).toBe(false);
  });
});

describe('validation', () => {
  it('accepts normal driving and rejects teleports', () => {
    expect(isPlausibleMove([0, 0.5, 0], [0, 0.5, 1.2], 0.05, 58)).toBe(true);
    expect(isPlausibleMove([0, 0.5, 0], [0, 0.5, 30], 0.05, 58)).toBe(false);
    expect(isPlausibleMove([0, 0.5, 0], [200, 0.5, 0], 1, 58)).toBe(false);
  });

  it('rejects server-side teleport attempts and sends a correction', () => {
    const room = makeRoom();
    const a = join(room);
    startPlaying(room);
    const before = [...a.p.pos];
    now += 50;
    room.handle(a.p, { t: 'state', p: [before[0], before[1], before[2] + 40], q: [0, 0, 0, 1], v: [0, 0, 0] });
    expect(a.p.pos).toEqual(before);
    expect(a.inbox.some((m) => m.t === 'correct')).toBe(true);
  });

  it('parses only well-formed messages', () => {
    expect(parseClientMsg('nonsense')).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'state', p: [0, 0], q: [0, 0, 0, 1], v: [0, 0, 0] }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'fire', d: [0, 'x', 1] }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'loaded', mapId: 'jungle' }))).toEqual({ t: 'loaded', mapId: 'jungle' });
    const join = parseClientMsg(JSON.stringify({ t: 'join', code: 'abc', name: '<b>Bob</b>'.repeat(5), color: 99 }));
    expect(join).toMatchObject({ t: 'join', color: 0 });
    expect(join && join.t === 'join' && join.name.length).toBeLessThanOrEqual(16);
  });
});

describe('Quick Play', () => {
  it('sanitizes the matchmaking request', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'quickplay', name: '<Racer>', color: 99 }))).toEqual({ t: 'quickplay', name: 'Racer', color: 0 });
  });

  it('waits for loading, fills with bots, and starts another round automatically', () => {
    const room = makeRoom(true);
    room.quickPlay = true;
    const { p } = join(room);
    room.tick(now);
    expect(room.phase).toBe('lobby');
    room.handle(p, { t: 'loaded', mapId: DEFAULT_MAP_ID });
    room.tick(now);
    expect(room.phase).toBe('countdown');
    expect([...room.players.values()].some((p) => p.bot)).toBe(true);
    advance(room, COUNTDOWN_SECONDS + MATCH_SECONDS);
    expect(room.phase).toBe('results');
    advance(room, RESULTS_SECONDS);
    expect(room.phase).toBe('countdown');
  });

  it('keeps private rooms in the lobby until the host starts', () => {
    const room = makeRoom();
    const { p } = join(room);
    room.handle(p, { t: 'loaded', mapId: DEFAULT_MAP_ID });
    room.tick(now);
    expect(room.phase).toBe('lobby');
  });
});

it('keeps a plausible edge-crossing update inside the arena and corrects the client', () => {
  const room = makeRoom();
  const { p, inbox } = join(room);
  room.startMatch(now);
  p.pos = [room.map.half - 2, 0.45, 0];
  room.handle(p, { t: 'state', p: [room.map.half + 1, 0.45, 0], q: [0,0,0,1], v: [20,0,0] });
  expect(p.pos[0]).toBe(room.map.half - 1);
  expect(inbox.some((m) => m.t === 'correct' && m.p[0] === room.map.half - 1)).toBe(true);
});

describe('match modes', () => {
  it('only lets the host change the mode in a lobby', () => {
    const room = makeRoom(); const host = join(room).p; const guest = join(room).p;
    room.handle(guest, {t:'setMode',mode:'killrace'}); expect(room.mode).toBe('deathmatch');
    room.handle(host, {t:'setMode',mode:'killrace'}); expect(room.roomInfo(now).mode).toBe('killrace');
    room.startMatch(now); room.handle(host, {t:'setMode',mode:'instagib'}); expect(room.mode).toBe('killrace');
  });
  it('ends Kill Race as soon as a player reaches ten KOs', () => {
    const room = makeRoom(); const {p} = join(room); room.mode='killrace';
    room.startMatch(now); advance(room, COUNTDOWN_SECONDS); p.score=10; room.tick(now);
    expect(room.phase).toBe('results');
  });
  it('one-hit mode eliminates on gun damage but respects shields', () => {
    const room=makeRoom(); const a=join(room).p; const b=join(room).p; room.mode='instagib';
    room.startMatch(now); advance(room,COUNTDOWN_SECONDS);
    (room as any).damage(b,a.id,'gun',13,[0,0,1],now); expect(b.alive).toBe(true);
    b.shieldUntil=0; (room as any).damage(b,a.id,'gun',13,[0,0,1],now);
    expect(b.alive).toBe(false); expect(a.score).toBe(1);
  });
  it('rejects unknown modes while preserving a requested valid mode', () => {
    expect(parseClientMsg('{"t":"setMode","mode":"invalid"}')).toBeNull();
    expect(parseClientMsg('{"t":"quickplay","name":"Racer","color":0,"mode":"killrace"}')).toEqual({t:'quickplay',name:'Racer',color:0,mode:'killrace'});
  });
});

it('rejects movement through a solid block even at a plausible speed', () => {
  const room=makeRoom(); const {p,inbox}=join(room); room.startMatch(now);
  const block=room.map.boxes.find((b)=>b.h>1 && !(b.y??0) && b.kind==='courtyard_wall')!;
  p.pos=[block.x,0.45,block.z-block.d/2-0.3];
  const previous=[...p.pos];
  room.handle(p,{t:'state',p:[block.x,0.45,block.z-block.d/2+0.5],q:[0,0,0,1],v:[0,0,11]});
  expect(p.pos).toEqual(previous); expect(inbox.at(-1)?.t).toBe('correct');
});


it('validates reconnect and deliberate leave messages',()=>{
  expect(parseClientMsg('{"t":"resume","token":"bad"}')).toBeNull();
  expect(parseClientMsg('{"t":"resume","token":"00000000-0000-0000-0000-000000000000"}')).toEqual({t:'resume',token:'00000000-0000-0000-0000-000000000000'});
  expect(parseClientMsg('{"t":"leave"}')).toEqual({t:'leave'});
});


it('only allows the host to rematch from results and resets the score',()=>{
  const room=makeRoom();const host=join(room).p,guest=join(room).p;
  room.startMatch(now);advance(room,COUNTDOWN_SECONDS+MATCH_SECONDS);
  host.score=4;room.handle(guest,{t:'rematch'});expect(room.phase).toBe('results');
  room.handle(host,{t:'rematch'});expect(room.phase).toBe('countdown');expect(host.score).toBe(0);
});
