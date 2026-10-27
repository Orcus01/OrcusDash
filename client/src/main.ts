import './style.css';
import RAPIER from '@dimforge/rapier3d-compat';
import { DEFAULT_MAP_ID, getMap, type ClientMsg, type RoomInfo, type ServerMsg } from '@kart/shared';
import { Game } from './game/Game';
import { Connection } from './net/Connection';
import { UI } from './ui/UI';

async function boot() {
  await RAPIER.init();

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const game = new Game(canvas);
  const ui = new UI(document.getElementById('ui')!, game);
  const conn = new Connection();

  let room: RoomInfo | null = null;
  let myId = '';
  let resumeToken = '';
  let reconnectGeneration = 0;
  let reconnectTimer = 0;
  let reconnecting = false;
  let joinTimer = 0;

  const loadingEl = document.getElementById('loading')!;
  const invite = new URLSearchParams(location.search).get('room') ?? '';
  ui.showMenu(invite);
  const firstMap = game.loadMap(DEFAULT_MAP_ID);
  const progress = setInterval(() => {
    const bar = document.querySelector('.map-card .load .bar') as HTMLElement | null;
    loadingEl.textContent = `Loading… ${bar?.style.width || '0%'}`;
  }, 150);
  firstMap.finally(() => {
    clearInterval(progress);
    loadingEl.classList.add('done');
  });

  const frame = () => {
    ui.tick();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /** Load the room's map and tell the server once it's ready (the host can't start until everyone has it). */
  function syncMap(mapId: string) {
    game.loadMap(mapId).then(() => {
      if (room?.mapId !== mapId) return;
      ui.minimap.setMap(getMap(mapId)!);
      conn.send({ t: 'loaded', mapId });
    });
  }

  async function connectAndSend(msg: ClientMsg) {
    game.sound.unlock();
    ui.setMenuBusy(true);
    ui.setMenuError('Connecting to the arena…');
    try {
      if (!conn.connected) await conn.connect();
      conn.send(msg);
      clearTimeout(joinTimer);
      joinTimer=window.setTimeout(()=>{if(!room){conn.close();ui.setMenuBusy(false);ui.setMenuError('The room did not respond. Please try again.');}},8000);
    } catch (err) {
      ui.setMenuError((err as Error).message);
      ui.setMenuBusy(false);
    }
  }

  function leaveRoom(message?: string) {
    clearTimeout(joinTimer);reconnectGeneration++;clearTimeout(reconnectTimer);reconnecting=false;resumeToken='';ui.setReconnecting(false);
    room = null;
    myId = '';
    game.detach();
    game.loadMap(DEFAULT_MAP_ID);
    history.replaceState(null, '', location.pathname);
    ui.setMenuBusy(false);
    ui.showMenu();
    if (message) ui.toast(message);
  }

  function applyRoom(next: RoomInfo, first: boolean) {
    const prev = room;
    room = next;
    if (first || prev?.mapId !== next.mapId) syncMap(next.mapId);
    game.setPlayers(next.players);
    ui.updateRoom(next, myId);
    if (!first && prev?.phase === next.phase) return;

    game.setPhase(next.phase);
    switch (next.phase) {
      case 'lobby':
        ui.showLobby();
        break;
      case 'countdown':
        ui.showHud();
        break;
      case 'playing':
        ui.showHud();
        if (prev?.phase === 'countdown') ui.go();
        break;
      case 'results':
        ui.showResults(next);
        break;
    }
  }

  ui.onQuickPlay = (name, color, mode) => connectAndSend({ t: 'quickplay', name, color, mode });
  ui.onCreate = (name, color, mode) => connectAndSend({ t: 'create', name, color, mode });
  ui.onJoin = (code, name, color) => connectAndSend({ t: 'join', code, name, color });
  ui.onRematch = () => conn.send({t:'rematch'});
  ui.onStart = () => conn.send({ t: 'start' });
  ui.onSetMode = (mode) => conn.send({ t: 'setMode', mode });
  ui.onSetMap = (mapId) => conn.send({ t: 'setMap', mapId });
  ui.onSetBots = (on) => conn.send({ t: 'setBots', on });
  ui.onLeave = () => {
    conn.close();
    leaveRoom();
  };

  conn.onClose = () => {
    if(!room)return;
    if(!resumeToken){leaveRoom('Connection lost. Please join again.');return;}
    const generation=++reconnectGeneration;
    reconnecting=true;game.setPaused(true);ui.setReconnecting(true);
    const attempt=async(tries:number)=>{
      if(generation!==reconnectGeneration)return;
      try {
        await conn.connect();
        if(generation!==reconnectGeneration){conn.close();return;}
        conn.send({t:'resume',token:resumeToken});
        reconnectTimer=window.setTimeout(()=>{if(reconnecting && generation===reconnectGeneration){conn.close(false);if(tries<2)void attempt(tries+1);else leaveRoom('Could not reconnect. Please start a new battle.');}},2500);
      }catch{
        if(generation!==reconnectGeneration)return;
        if(tries<2)reconnectTimer=window.setTimeout(()=>void attempt(tries+1),500);
        else leaveRoom('Could not reconnect. Please start a new battle.');
      }
    };
    reconnectTimer=window.setTimeout(()=>void attempt(0),400);
  };

  conn.onMessage = (m: ServerMsg) => {
    switch (m.t) {
      case 'session':
        resumeToken=m.token;
        break;
      case 'joined':
        clearTimeout(joinTimer);clearTimeout(reconnectTimer);reconnecting=false;ui.setReconnecting(false);game.setPaused(false);ui.setMenuError('');
        myId = m.you;
        game.attach(myId, (msg) => conn.send(msg));
        history.replaceState(null, '', `${location.pathname}?room=${m.room.code}`);
        ui.setMenuBusy(false);
        applyRoom(m.room, true);
        break;
      case 'room':
        if (room) applyRoom(m, false);
        break;
      case 'snap':
        game.onSnapshot(m);
        if (room) ui.phaseTime(room.phase, m.timeLeft);
        break;
      case 'ev':
        game.onEvent(m.e);
        break;
      case 'correct':
        game.onCorrection(m.p);
        break;
      case 'error':
        clearTimeout(joinTimer);
        if(reconnecting){conn.close();leaveRoom(m.message);break;}
        ui.setMenuBusy(false);
        ui.setMenuError(m.message);
        if (!room) conn.close();
        break;
    }
  };

  // Handy for debugging from the browser console.
  (window as any).kart = { game, ui, conn };
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Failed to start: ${(err as Error).message}`;
});
