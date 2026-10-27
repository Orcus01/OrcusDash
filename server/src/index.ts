import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize as normalizePath, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { WebSocketServer, WebSocket } from 'ws';
import { SERVER_PORT, MAX_PLAYERS, generateCode, isValidCode, normalizeCode, type ServerMsg } from '@kart/shared';
import { Room, type Player } from './Room';
import { parseClientMsg } from './validation';

const PORT = Number(process.env.PORT) || SERVER_PORT;
const CLIENT_DIST = resolve(fileURLToPath(import.meta.url), '../../../client/dist');
const MAX_MESSAGES_PER_SECOND = 80;

const rooms = new Map<string, Room>();
const sessions = new Map<string, {room:Room; player:Player; socket:WebSocket; timer?:ReturnType<typeof setTimeout>}>();
const RECONNECT_GRACE_MS = 15_000;
const gzipCache = new Map<string, Buffer>();
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm']);

// ------------------------------------------------------------------ static files (production)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  const safe = normalizePath(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(CLIENT_DIST, safe);
  if (!file.startsWith(CLIENT_DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) file = join(CLIENT_DIST, 'index.html');
  } catch {
    file = join(CLIENT_DIST, 'index.html');
  }
  try {
    let body: Buffer = await readFile(file);
    const ext = extname(file);
    const headers: Record<string, string> = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': file.includes(`${CLIENT_DIST}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
      let gz = gzipCache.get(file);
      if (!gz) gzipCache.set(file, (gz = gzipSync(body)));
      body = gz;
      headers['content-encoding'] = 'gzip';
      headers['vary'] = 'accept-encoding';
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Client not built. In development open http://localhost:5173 (npm run dev); for production run npm run build first.');
  }
});

// ------------------------------------------------------------------ websocket rooms

const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
  let room: Room | null = null;
  let player: Player | null = null;
  let sessionToken = '';
  let budget = MAX_MESSAGES_PER_SECOND;
  let budgetResetAt = Date.now() + 1000;
  ws.isAlive = true;

  const send = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  };
  const reply = (msg: ServerMsg) => send(JSON.stringify(msg));

  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now > budgetResetAt) {
      budget = MAX_MESSAGES_PER_SECOND;
      budgetResetAt = now + 1000;
    }
    if (--budget < 0) return;

    const msg = parseClientMsg(raw.toString());
    if (!msg) return;

    if(sessionToken){const owner=sessions.get(sessionToken);if(owner && owner.socket!==ws){ws.close();return;}}
    if (msg.t === 'leave') {
      const session = sessions.get(sessionToken);
      if(session) { clearTimeout(session.timer); sessions.delete(sessionToken); }
      if(room && player)room.removePlayer(player.id);
      room=null;player=null;sessionToken='';ws.close();return;
    }
    if (msg.t === 'resume' && !player) {
      const session = sessions.get(msg.token);
      if(!session || !session.room.players.has(session.player.id))return reply({t:'error',code:'NOT_FOUND',message:'Your reconnect window expired. Start a new battle.'});
      clearTimeout(session.timer);
      const previousSocket = session.socket;
      session.socket=ws;session.timer=undefined;
      room=session.room;player=session.player;player.send=send;sessionToken=msg.token;
      if(previousSocket!==ws)previousSocket.close();
      reply({t:'joined',you:player.id,room:room.roomInfo(now)});
      reply({t:'session',token:sessionToken});
      if(player.alive)reply({t:'ev',e:{type:'respawn',id:player.id,p:player.pos,yaw:2*Math.atan2(player.quat[1],player.quat[3])}});
      return;
    }
    if (room && player) {
      room.handle(player, msg);
      return;
    }

    if (msg.t === 'quickplay') {
      let target = [...rooms.values()].find((r) => r.quickPlay && r.mode === (msg.mode ?? 'deathmatch') && r.phase !== 'results' && [...r.players.values()].filter((p) => !p.bot).length < MAX_PLAYERS);
      if (!target) {
        const code = generateCode((c) => rooms.has(c));
        target = new Room(code, (r) => rooms.delete(r.code));
        target.quickPlay = true;
        target.mode = msg.mode ?? 'deathmatch';
        rooms.set(code, target);
      }
      const result = target.addPlayer(msg.name, msg.color, send);
      if (typeof result === 'string') return reply({ t: 'error', code: result, message: 'Could not join battle' });
      room = target;
      player = result;
    } else if (msg.t === 'create') {
      const code = generateCode((c) => rooms.has(c));
      const newRoom = new Room(code, (r) => rooms.delete(r.code));
      newRoom.mode = msg.mode ?? 'deathmatch';
      rooms.set(code, newRoom);
      const result = newRoom.addPlayer(msg.name, msg.color, send);
      if (typeof result === 'string') return reply({ t: 'error', code: result, message: 'Could not create room' });
      room = newRoom;
      player = result;
      console.log(`[room ${code}] created by ${msg.name} (${rooms.size} rooms)`);
    } else if (msg.t === 'join') {
      const code = normalizeCode(msg.code);
      if (!isValidCode(code)) return reply({ t: 'error', code: 'BAD_CODE', message: 'Room codes are 6 letters/numbers.' });
      const target = rooms.get(code);
      if (!target) return reply({ t: 'error', code: 'NOT_FOUND', message: `Room ${code} not found.` });
      const result = target.addPlayer(msg.name, msg.color, send);
      if (result === 'FULL') return reply({ t: 'error', code: 'FULL', message: `Room ${code} is full.` });
      if (typeof result === 'string') return reply({ t: 'error', code: result, message: 'Could not join room' });
      room = target;
      player = result;
      console.log(`[room ${code}] ${msg.name} joined (${target.players.size} players)`);
    }
    if(room && player) { sessionToken=randomUUID(); sessions.set(sessionToken,{room,player,socket:ws}); reply({t:'session',token:sessionToken}); }
  });

  ws.on('close', () => {
    const session=sessions.get(sessionToken);
    if(session && session.socket===ws)session.timer=setTimeout(()=>{sessions.delete(sessionToken);session.room.removePlayer(session.player.id);},RECONNECT_GRACE_MS);
    else if(!session && room && player)room.removePlayer(player.id);
    room = null;
    player = null;
  });
});

// Drop connections that stop answering pings (closed laptop lids, dead mobile connections).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { isAlive?: boolean }>) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10_000);
wss.on('close', () => clearInterval(heartbeat));

httpServer.listen(PORT, () => {
  console.log(`OrcusDash server listening on http://localhost:${PORT} (ws path /ws)`);
});
