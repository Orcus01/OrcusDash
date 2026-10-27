// Headless bot that joins a room by code over WebSocket and hunts other players.
// Handy for solo testing: create a room in the browser, then run
//   npx tsx scripts/ws-bot.mjs <CODE> [name] [seconds]
import WebSocket from 'ws';

const [, , code, name = 'Botty', seconds = '60'] = process.argv;
if (!code) {
  console.error('usage: npx tsx scripts/ws-bot.mjs <ROOM_CODE> [name] [seconds]');
  process.exit(1);
}
const URL = process.env.WS_URL ?? 'ws://localhost:2567/ws';
const SPEED = 14; // m/s, comfortably under the server's anti-cheat limit
const TICK = 50;

const ws = new WebSocket(URL);
const send = (m) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

let me = '';
let phase = 'lobby';
let pos = null;
let yaw = 0;
let alive = false;
let weapon = null;
let snap = null;
let mapId = 'town';
let lastFire = 0;
const stats = { kills: 0, deaths: 0, pickups: [], shots: 0 };

ws.on('open', () => send({ t: 'join', code, name, color: 5 }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.t === 'error') {
    console.error('server error:', m.message);
    process.exit(1);
  }
  if (m.t === 'joined') {
    me = m.you;
    phase = m.room.phase;
    mapId = m.room.mapId;
    send({ t: 'loaded', mapId });
    console.log(`joined ${m.room.code} as ${me}`);
  }
  if (m.t === 'room') {
    phase = m.phase;
    if (m.mapId !== mapId) send({ t: 'loaded', mapId: m.mapId });
    mapId = m.mapId;
  }
  if (m.t === 'snap') {
    snap = m;
    const mine = m.players.find((p) => p.id === me);
    if (mine) {
      weapon = mine.w;
      alive = mine.a === 1;
    }
  }
  if (m.t === 'ev') {
    const e = m.e;
    if (e.type === 'respawn' && e.id === me) {
      pos = [...e.p];
      yaw = e.yaw;
      alive = true;
    }
    if (e.type === 'pickup' && e.id === me) stats.pickups.push(e.weapon);
    if (e.type === 'kill' && e.killer === me && e.victim !== me) stats.kills++;
    if (e.type === 'kill' && e.victim === me) {
      stats.deaths++;
      alive = false;
    }
  }
  if (m.t === 'correct') pos = [...m.p];
});

// Crate locations come from the shared map definitions (run with tsx so the .ts import works).
const { MAPS } = await import('../shared/src/maps.ts');

setInterval(() => {
  if (!pos || !alive || phase !== 'playing' || !snap) return;
  const now = Date.now();
  let target = null;
  if (!weapon && MAPS) {
    const room = MAPS.find((mp) => mp.id === mapId) ?? MAPS[0];
    let best = Infinity;
    room.crates.forEach((c, i) => {
      if (snap.crates[i] !== '1') return;
      const d = Math.hypot(c.x - pos[0], c.z - pos[2]);
      if (d < best) {
        best = d;
        target = [c.x, pos[1], c.z];
      }
    });
  } else {
    let best = Infinity;
    for (const p of snap.players) {
      if (p.id === me || !p.a) continue;
      const d = Math.hypot(p.p[0] - pos[0], p.p[2] - pos[2]);
      if (d < best) {
        best = d;
        target = p.p;
      }
    }
  }
  if (!target) return;
  const dx = target[0] - pos[0];
  const dz = target[2] - pos[2];
  const dist = Math.hypot(dx, dz);
  yaw = Math.atan2(dx, dz);
  const stopAt = weapon && weapon !== 'mine' ? 8 : 0;
  const step = Math.min(Math.max(0, dist - stopAt), (SPEED * TICK) / 1000);
  pos = [pos[0] + (dx / (dist || 1)) * step, pos[1], pos[2] + (dz / (dist || 1)) * step];
  send({ t: 'state', p: pos, q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], v: [(dx / (dist || 1)) * SPEED, 0, (dz / (dist || 1)) * SPEED] });

  if (weapon && dist < 30 && now - lastFire > (weapon === 'gun' ? 100 : 500)) {
    lastFire = now;
    stats.shots++;
    send({ t: 'fire', d: [dx / dist, 0, dz / dist] });
  }
}, TICK);

setTimeout(() => {
  console.log(JSON.stringify(stats));
  ws.close();
  process.exit(0);
}, Number(seconds) * 1000);
