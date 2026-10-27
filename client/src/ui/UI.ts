import {
  MATCH_MODES, MODE_LABELS, MODE_DESCRIPTIONS, KILL_TARGET, type MatchMode,
  BOT_FILL,
  KART_COLORS,
  MAPS,
  getMap,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  RESPAWN_SECONDS,
  WEAPON_LABELS,
  type Phase,
  type RoomInfo,
  type WeaponType,
} from '@kart/shared';
import type { Game, HudState, Quality } from '../game/Game';
import { GaragePreview } from './GaragePreview';
import { Minimap } from './Minimap';

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const ICONS: Record<WeaponType, string> = {
  rocket: `<svg viewBox="0 0 48 48"><path d="M30 6c6 0 12 6 12 12L26 34l-12-12z" fill="#f2f2f2"/><path d="M30 6c6 0 12 6 12 12l-5 5-12-12z" fill="#e33b3b"/><circle cx="31" cy="17" r="3.5" fill="#3d8bff"/><path d="M14 22l-6 2 4 4zM26 34l-2 6-4-4z" fill="#e33b3b"/><path d="M14 30c-4 2-6 8-6 10 2 0 8-2 10-6z" fill="#ffb547"/></svg>`,
  gun: `<svg viewBox="0 0 48 48"><g fill="#ffc928"><rect x="8" y="14" width="7" height="22" rx="3.5"/><rect x="20" y="10" width="7" height="26" rx="3.5"/><rect x="32" y="14" width="7" height="22" rx="3.5"/></g><g fill="#b87a00"><rect x="8" y="30" width="7" height="6"/><rect x="20" y="30" width="7" height="6"/><rect x="32" y="30" width="7" height="6"/></g></svg>`,
  mine: `<svg viewBox="0 0 48 48"><g stroke="#3a3d46" stroke-width="4" stroke-linecap="round"><path d="M24 6v8M24 34v8M6 24h8M34 24h8M11 11l6 6M31 31l6 6M37 11l-6 6M17 31l-6 6"/></g><circle cx="24" cy="24" r="11" fill="#555a66"/><circle cx="24" cy="24" r="4" fill="#ff3b3b"/></svg>`,
  missiles: `<svg viewBox="0 0 48 48"><g transform="rotate(-35 24 24)"><rect x="8" y="12" width="26" height="6" rx="3" fill="#2f6fd6"/><path d="M34 12l6 3-6 3z" fill="#e33b3b"/><rect x="8" y="21" width="30" height="6" rx="3" fill="#2f6fd6"/><path d="M38 21l6 3-6 3z" fill="#e33b3b"/><rect x="8" y="30" width="26" height="6" rx="3" fill="#2f6fd6"/><path d="M34 30l6 3-6 3z" fill="#e33b3b"/></g></svg>`,
  grenade: `<svg viewBox="0 0 48 48"><circle cx="24" cy="28" r="13" fill="#56603d"/><path d="M14 26h20M14 31h20M24 15v26" stroke="#3b4229" stroke-width="2"/><rect x="20" y="10" width="8" height="7" rx="2" fill="#b58a2a"/><path d="M28 12c6-4 10 0 9 5" stroke="#c9ccd1" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
  shield: `<svg viewBox="0 0 48 48"><path d="M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z" fill="#3fc6ff"/><path d="M24 4l16 6v12c0 10-7 18-16 22z" fill="#1d9ad6"/><path d="M17 24l5 5 9-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const FEED_ICON: Record<string, string> = { rocket: '🚀', missiles: '🎯', gun: '🔫', grenade: '💥', mine: '💣', shield: '🛡️', fall: '🕳️' };

const isTouch = matchMedia('(pointer: coarse)').matches;

function loadPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export class UI {
  onQuickPlay: (name: string, color: number, mode: MatchMode) => void = () => {};
  onCreate: (name: string, color: number, mode: MatchMode) => void = () => {};
  onJoin: (code: string, name: string, color: number) => void = () => {};
  onSetMode: (mode: MatchMode) => void = () => {};
  onRematch: () => void = () => {};
  onStart: () => void = () => {};
  onSetMap: (id: string) => void = () => {};
  onSetBots: (on: boolean) => void = () => {};
  onLeave: () => void = () => {};

  private selectedMode: MatchMode = 'deathmatch';
  private modeButtons = new Map<MatchMode, HTMLButtonElement>();
  private modeObjective!: HTMLElement;
  private coach!: HTMLElement;
  private coachText!: HTMLElement;
  private coachStage: 'drive'|'pickup'|'fire'|'drift'|'done' = loadPref('kc-guide-done','0')==='1'?'done':'drive';
  private color = Number(loadPref('kc-color', String(Math.floor(Math.random() * KART_COLORS.length))));
  private myId = '';
  private room: RoomInfo | null = null;

  // menu
  private reconnectPanel!: HTMLElement;
  private pausePanel!: HTMLElement;
  private pauseButton!: HTMLButtonElement;
  private quitButton!: HTMLButtonElement;
  private garage?: GaragePreview;
  private menu!: HTMLElement;
  private nameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private menuError!: HTMLElement;
  private menuButtons: HTMLButtonElement[] = [];
  private swatches: HTMLElement[] = [];

  // lobby
  private lobby!: HTMLElement;
  private lobbyCode!: HTMLElement;
  private lobbyPlayers!: HTMLElement;
  private lobbyCount!: HTMLElement;
  private mapCards = new Map<string, HTMLButtonElement>();
  private mapBars = new Map<string, HTMLElement>();
  readonly minimap = new Minimap();
  private loadingMsg!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private botsBtn!: HTMLButtonElement;
  private waiting!: HTMLElement;

  // hud
  private hudEl!: HTMLElement;
  private timer!: HTMLElement;
  private speedReadout!: HTMLElement;
  private driftFill!: HTMLElement;
  private driftLabel!: HTMLElement;
  private nitroFill!: HTMLElement;
  private nitroLabel!: HTMLElement;
  private drivePanel!: HTMLElement;
  private speedLines!: HTMLElement;
  private scoreboard!: HTMLElement;
  private feed!: HTMLElement;
  private healthFill!: HTMLElement;
  private weaponBox!: HTMLElement;
  private weaponIcon!: HTMLElement;
  private weaponName!: HTMLElement;
  private weaponAmmo!: HTMLElement;
  private centerMsg!: HTMLElement;
  private banner!: HTMLElement;
  private bannerTimer = 0;
  private crosshair!: HTMLElement;
  private vignette!: HTMLElement;
  private roomChip!: HTMLElement;
  private touch!: HTMLElement;
  private lastTelemetry = 0;
  private lastWeapon: WeaponType | null | undefined = undefined;
  private lastCount = -1;
  private centerTimer = 0;
  private respawnInterval = 0;

  // results
  private results!: HTMLElement;
  private resultsBody!: HTMLElement;
  private resultsNext!: HTMLElement;
  private rematchButton!: HTMLButtonElement;
  private settingsPanel!: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly game: Game,
  ) {
    if (!(this.color >= 0 && this.color < KART_COLORS.length)) this.color = 0;
    this.buildMenu();
    this.buildLobby();
    this.buildHud();
    this.buildResults();
    this.buildCornerButtons();
    game.hooks = {
      hud: (s) => this.hud(s),
      killFeed: (k, v, w, mine) => this.killFeed(k, v, w, mine),
      hitMarker: () => this.flash(this.crosshair, 'show', 160),
      announce: (text, sub, color) => this.announce(text, sub, color),
      damaged: () => this.flash(this.vignette, 'show', 80),
      eliminated: (by) => this.eliminated(by),
      respawned: () => this.hideCenter(),
      pickup: () => this.flash(this.weaponBox, 'pop', 400),
      mapLoading: (id, f) => this.mapLoading(id, f),
      mapLoaded: (id) => this.mapLoading(id, 1),
    };
  }

  // ------------------------------------------------------------------ menu

  private buildMenu() {
    this.nameInput = h('input', { class: 'text', maxlength: MAX_NAME_LENGTH, placeholder: 'Racer', autocomplete: 'off', spellcheck: 'false' });
    this.nameInput.value = loadPref('kc-name', '');
    this.codeInput = h('input', { class: 'text code grow', maxlength: 7, placeholder: 'CODE', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters' });
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    this.codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && this.join());
    this.nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && (this.codeInput.value ? this.join() : this.create()));

    const swatchRow = h('div', { class: 'swatches' });
    KART_COLORS.forEach((c, i) => {
      const s = h('button', { type: 'button', class: 'swatch', 'aria-label': `Kart color ${i + 1}`, 'aria-pressed': i === this.color, style: { background: c }, title: `Colour ${i + 1}`, onclick: () => this.pickColor(i) });
      this.swatches.push(s);
      swatchRow.append(s);
    });
    this.pickColor(this.color);

    const playBtn = h('button', { class: 'btn go quick-play', onclick: () => this.onQuickPlay(this.playerName(), this.color, this.selectedMode) }, 'PLAY NOW', h('small', {}, 'Jump into a battle · bots fill empty seats'));
    const createBtn = h('button', { class: 'btn blue', onclick: () => this.create() }, 'Create room');
    const joinBtn = h('button', { class: 'btn blue small', onclick: () => this.join() }, 'Join');
    this.menuButtons = [playBtn, createBtn, joinBtn];
    this.menuError = h('div', { class: 'error' });

    const help = isTouch
      ? h('div', { class: 'help' }, h('span', {}, 'Drag on the left side to steer'), h('span', {}, 'FIRE to shoot'), h('span', {}, 'DRIFT to slide'))
      : h(
          'div',
          { class: 'help' },
          h('span', {}, h('kbd', {}, 'W A S D'), ' / ', h('kbd', {}, '↑ ← ↓ →'), ' drive'),
          h('span', {}, h('kbd', {}, 'Space'), ' fire'),
          h('span', {}, h('kbd', {}, 'Shift'), ' drift & hop'),
          h('span', {}, h('kbd', {}, 'E'), ' hold for nitro'),
        );

    const modeSelect = h('select', { class: 'text mode-select', 'aria-label': 'Match mode' });
    MATCH_MODES.forEach((mode) => modeSelect.append(h('option', { value: mode }, MODE_LABELS[mode])));
    const modeHint = h('div', { class: 'mode-hint' }, MODE_DESCRIPTIONS.deathmatch);
    modeSelect.onchange = () => { this.selectedMode = modeSelect.value as MatchMode; modeHint.textContent = MODE_DESCRIPTIONS[this.selectedMode]; };
    const logo = h('h1', { class: 'logo' });
    logo.innerHTML = 'ORCUS<span>DASH</span>';
    this.menu = h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'card menu-card' },
        h('div', { class: 'eyebrow' }, 'FREE-FOR-ALL KART COMBAT'),
        logo,
        h('p', { class: 'tagline' }, 'Grab a weapon. Cause chaos. Take the crown.'),
        h('label', { class: 'field' }, 'Your name'),
        this.nameInput,
        h('label', { class: 'field' }, 'Kart colour'),
        swatchRow,
        h('div', { style: { height: '20px' } }),
        h('label', { class: 'field' }, 'Game mode'), modeSelect, modeHint,
        playBtn,
        h('div', { class: 'menu-secondary' }, createBtn),
        h('div', { class: 'divider' }, 'or join a friend'),
        h('div', { class: 'row' }, this.codeInput, joinBtn),
        this.menuError,
        help,
      ),
    );
    const gallery = h('div', { class: 'home-arenas' }, h('div', { class: 'home-section-title' }, 'PREVIEW THE ARENAS · CHOOSE YOUR ROOM MAP IN THE LOBBY'));
    const tiles = h('div', { class: 'home-map-strip' });
    for (const map of MAPS) {
      const tile = h('button', { class: 'home-map', onclick: () => { void this.game.loadMap(map.id); tiles.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', b === tile)); } }, h('img', { src: `${import.meta.env.BASE_URL}thumbs/${map.id}.webp`, alt: map.name }), h('b', {}, map.name));
      tiles.append(tile);
    }
    gallery.append(tiles);
    this.garage = new GaragePreview(KART_COLORS[this.color]);
    const hero = h('div', { class: 'home-hero' }, h('div', { class: 'home-badge' }, 'ORIGINAL KART COMBAT · 8 ARENAS · 3 MODES'), h('h2', {}, 'BUILT FOR ', h('span', {}, 'CHAOS.')), this.garage.el, h('p', { class: 'garage-caption' }, 'Your paint. Your ride. Pick a color and hit the arena.'), h('div', { class: 'home-features' }, h('span', {}, '⚡ Instant battles'), h('span', {}, '🏁 Private rooms'), h('span', {}, '🎮 Keyboard + touch')));

    const card = this.menu.querySelector('.menu-card')!;
    this.menu.classList.add('home-screen');
    this.menu.replaceChildren(h('div', { class: 'home-layout' }, hero, card, gallery));
    this.root.append(this.menu);
  }

  private pickColor(i: number) {
    this.color = i;
    this.garage?.setColor(KART_COLORS[i]);
    savePref('kc-color', String(i));
    this.swatches.forEach((s, j) => { s.classList.toggle('selected', j === i); s.setAttribute('aria-pressed', String(j === i)); });
  }

  private playerName() {
    const name = this.nameInput.value.trim().slice(0, MAX_NAME_LENGTH) || `Racer${Math.floor(Math.random() * 900 + 100)}`;
    this.nameInput.value = name;
    savePref('kc-name', name);
    return name;
  }

  private create() {
    this.onCreate(this.playerName(), this.color, this.selectedMode);
  }

  private join() {
    const code = this.codeInput.value.trim();
    if (code.length < 6) {
      this.setMenuError('Enter the 6-character room code.');
      this.codeInput.focus();
      return;
    }
    this.onJoin(code, this.playerName(), this.color);
  }

  showMenu(prefillCode = '') {
    this.show(this.menu);
    if (prefillCode) {
      this.codeInput.value = prefillCode.toUpperCase();
      this.setMenuError('');
      (this.nameInput.value ? this.menuButtons[1] : this.nameInput).focus();
    }
    this.room = null;
  }

  setMenuBusy(busy: boolean) {
    for (const b of this.menuButtons) b.disabled = busy;
  }

  setMenuError(msg: string) {
    this.menuError.textContent = msg;
  }

  // ------------------------------------------------------------------ lobby

  private buildLobby() {
    this.lobbyCode = h('div', { class: 'code' });
    this.lobbyPlayers = h('ul', { class: 'player-list' });
    this.lobbyCount = h('span', { style: { color: 'var(--muted)', fontSize: '15px' } });
    const mapList = h('div', { class: 'map-cards' });
    for (const m of MAPS) {
      const bar = h('div', { class: 'bar' });
      const thumb = h('div', { class: 'thumb', style: { background: m.theme.minimap } });
      const img = h('img', { src: `${import.meta.env.BASE_URL}thumbs/${m.id}.webp`, alt: '' });
      img.onerror = () => img.remove();
      thumb.append(img);
      const card = h(
        'button',
        { class: 'map-card', onclick: () => this.onSetMap(m.id) },
        thumb,
        h('div', { class: 'info' }, h('div', { class: 'name' }, m.name), h('div', { class: 'desc' }, m.description)),
        h('div', { class: 'load' }, bar),
      );
      this.mapCards.set(m.id, card);
      this.mapBars.set(m.id, bar);
      mapList.append(card);
    }
    const modeOptions = h('div', { class: 'mode-options' });
    for (const mode of MATCH_MODES) {
      const button = h('button', { class: 'mode-option', onclick: () => this.onSetMode(mode) }, h('b', {}, MODE_LABELS[mode]), h('small', {}, MODE_DESCRIPTIONS[mode]));
      this.modeButtons.set(mode, button); modeOptions.append(button);
    }
    this.startBtn = h('button', { class: 'btn go', onclick: () => this.onStart() }, 'Start match');
    this.waiting = h('div', { class: 'waiting' }, 'Waiting for the host to start…');
    this.botsBtn = h('button', { class: 'btn ghost small bots-toggle', onclick: () => this.onSetBots(!this.room?.bots) }, '');

    const copyCode = h('button', { class: 'btn ghost small', onclick: () => this.copy(this.room?.code ?? '', 'Code copied!') }, 'Copy code');
    const copyLink = h(
      'button',
      {
        class: 'btn ghost small',
        onclick: () => {
          const url = `${location.origin}${location.pathname}?room=${this.room?.code ?? ''}`;
          if (isTouch && navigator.share) navigator.share({ title: 'OrcusDash', text: 'Join my OrcusDash room!', url }).catch(() => {});
          else this.copy(url, 'Invite link copied!');
        },
      },
      isTouch && 'share' in navigator ? 'Share invite' : 'Copy invite link',
    );

    this.lobby = h(
      'div',
      { class: 'screen hidden' },
      h(
        'div',
        { class: 'card wide' },
        h('div', { class: 'code-box' }, h('div', { class: 'label' }, 'Room code: share it with friends'), this.lobbyCode, h('div', { class: 'row' }, copyCode, copyLink)),
        h(
          'div',
          { class: 'lobby-grid' },
          h('div', {}, h('h3', { class: 'section' }, 'Players ', this.lobbyCount), this.lobbyPlayers, this.botsBtn),
          h('div', {}, h('h3', { class: 'section' }, 'Arena'), mapList),
        ),
        h('div', { class: 'lobby-actions' }, modeOptions, this.startBtn, this.waiting, h('button', { class: 'btn ghost', onclick: () => this.onLeave() }, 'Leave room')),
      ),
    );
    this.root.append(this.lobby);
  }

  private copy(text: string, ok: string) {
    navigator.clipboard?.writeText(text).then(
      () => this.toast(ok),
      () => this.toast(text),
    );
  }

  showLobby() {
    this.show(this.lobby);
    this.clearRespawnTimer();
  }

  // ------------------------------------------------------------------ HUD

  private buildHud() {
    this.modeObjective = h('div', { class: 'mode-objective pill' });
    this.coachText=h('span',{'aria-live':'polite'});
    this.coach=h('div',{class:'coach pill hidden'},this.coachText,h('button',{'aria-label':'Dismiss driving tips',onclick:()=>{this.coachStage='done';savePref('kc-guide-done','1');this.coach.classList.add('hidden');}},'×'));
    this.speedLines = h('div', { class: 'speed-lines' });
    this.speedReadout = h('b', {}, '0');
    this.driftFill = h('div', { class: 'charge-fill' });
    this.driftLabel = h('span', {}, 'SHIFT · DRIFT TO CHARGE');
    this.nitroFill = h('div', { class: 'nitro-fill' });
    this.nitroLabel = h('small', {class:'nitro-label'}, 'E · NITRO');
    this.drivePanel = h('div', { class: 'drive-panel pill' }, h('div', { class: 'speed' }, this.speedReadout, h('small', {}, 'KM/H')), h('div', { class: 'charge-track' }, this.driftFill), this.driftLabel, h('div', {class:'nitro-track'}, this.nitroFill), this.nitroLabel);
    this.timer = h('div', { class: 'timer pill' }, '3:00');
    this.scoreboard = h('div', { class: 'scoreboard pill' });
    this.feed = h('div', { class: 'killfeed' });
    this.healthFill = h('div', { class: 'fill' });
    const health = h('div', { class: 'health pill' }, h('div', { class: 'label' }, 'HEALTH'), h('div', { class: 'bar' }, this.healthFill));
    this.weaponIcon = h('div', { class: 'icon' });
    this.weaponName = h('div', { class: 'wname' });
    this.weaponAmmo = h('div', { class: 'ammo' });
    this.weaponBox = h('div', { class: 'weapon pill empty' }, this.weaponIcon, h('div', {}, this.weaponName, this.weaponAmmo));
    this.centerMsg = h('div', { class: 'center-msg hidden' });
    this.banner = h('div', { class: 'banner hidden' });
    this.crosshair = h('div', { class: 'crosshair' });
    this.crosshair.innerHTML = `<svg viewBox="0 0 26 26"><path d="M3 3l6 6M23 3l-6 6M3 23l6-6M23 23l-6-6" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
    this.vignette = h('div', { class: 'vignette' });
    this.roomChip = h('div', { class: 'room-chip pill' });
    this.loadingMsg = h('div', { class: 'loading-msg pill hidden' });
    this.touch = this.buildTouch();
    this.hudEl = h(
      'div',
      { class: 'hud hidden' },
      this.vignette,
      this.speedLines,
      this.drivePanel,
      this.timer,
      this.modeObjective,
      this.coach,
      this.scoreboard,
      this.feed,
      health,
      this.weaponBox,
      this.centerMsg,
      this.banner,
      this.crosshair,
      this.minimap.el,
      this.loadingMsg,
      isTouch ? null : this.roomChip,
      isTouch ? this.touch : null,
    );
    this.root.append(this.hudEl);
    this.hud({ hp: 100, alive: true, weapon: null, ammo: 0, shield: false });
  }

  /**
   * Phone controls (Smash Karts style): a floating joystick anywhere on the left half — push the
   * way you want to go and the kart accelerates and steers there by itself; pull back to reverse.
   * Big FIRE and DRIFT buttons on the right.
   */
  private buildTouch() {
    const zone = h('div', { class: 'stick-zone' });
    const base = h('div', { class: 'stick' });
    const knob = h('div', { class: 'knob' });
    base.append(knob);
    zone.append(base);
    const R = 52;
    let pointer: number | null = null;
    let ox = 0;
    let oy = 0;
    const apply = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy);
      const k = len > R ? R / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const mag = Math.min(1, len / R);
      const input = this.game.input;
      if (mag < 0.18) {
        input.touchSteer = 0;
        input.touchThrottle = 0;
        return;
      }
      // Independent steering avoids the old abrupt full-lock turns from angle mapping.
      const axis = Math.max(-1, Math.min(1, dx / R));
      input.touchSteer = Math.abs(axis) < 0.12 ? 0 : Math.sign(axis) * (Math.abs(axis) - 0.12) / 0.88;
      input.touchThrottle = dy > 18 ? -Math.min(1, (dy - 18) / (R - 18)) : Math.min(1, (mag - 0.12) / 0.7);
    };
    const end = () => {
      pointer = null;
      base.classList.remove('held');
      knob.style.transform = '';
      this.game.input.touchSteer = 0;
      this.game.input.touchThrottle = 0;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (pointer !== null) return;
      e.preventDefault();
      pointer = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.game.sound.unlock();
      const r = base.getBoundingClientRect();
      ox = r.left + r.width / 2;
      oy = r.top + r.height / 2;
      base.classList.add('held');
      apply(e.clientX - ox, e.clientY - oy);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointer) return;
      e.preventDefault();
      apply(e.clientX - ox, e.clientY - oy);
    });
    zone.addEventListener('pointerup', (e) => e.pointerId === pointer && end());
    zone.addEventListener('pointercancel', (e) => e.pointerId === pointer && end());
    zone.addEventListener('lostpointercapture', (e) => e.pointerId === pointer && end());
    window.addEventListener('blur', end);
    window.addEventListener('resize', end);

    const button = (cls: string, label: string, set: (v: boolean) => void) => {
      const b = h('button', { type:'button', 'aria-label': label, class: `tbtn ${cls}` }, label);
      let id: number | null = null;
      b.addEventListener('pointerdown', (e) => {
        if (id !== null) return;
        e.preventDefault();
        id = e.pointerId;
        b.setPointerCapture(e.pointerId);
        b.classList.add('active');
        this.game.sound.unlock();
        set(true);
      });
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        id = null;
        b.classList.remove('active');
        set(false);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      const reset = () => { id = null; b.classList.remove('active'); set(false); };
      window.addEventListener('blur', reset);
      window.addEventListener('resize', reset);
      return b;
    };
    const rotate = h('div', { class: 'rotate-hint' }, 'Landscape gives you a wider view ↻');
    return h(
      'div',
      { class: 'touch' },
      zone,
      button('fire', 'FIRE', (v) => (this.game.input.touchFire = v)),
      button('nitro', 'NITRO', (v) => (this.game.input.touchNitro = v)),
      button('drift', 'DRIFT', (v) => (this.game.input.touchDrift = v)),
      rotate,
    );
  }

  showHud() {
    this.show(this.hudEl);
  }

  hud(s: HudState) {
    const frac = Math.max(0, s.hp) / 100;
    this.healthFill.style.width = `${frac * 100}%`;
    this.healthFill.classList.toggle('low', frac <= 0.35);
    if (s.weapon !== this.lastWeapon) {
      this.lastWeapon = s.weapon;
      this.weaponBox.classList.toggle('empty', !s.weapon);
      this.weaponIcon.innerHTML = s.weapon ? ICONS[s.weapon] : '<span style="font-size:26px;opacity:.5">?</span>';
      this.weaponName.textContent = s.weapon ? WEAPON_LABELS[s.weapon] : 'Drive through a ? crate';
    }
    if(isTouch){this.weaponAmmo.textContent=s.weapon ? `${s.ammo} ${s.weapon==='gun'?'rounds':'uses'} · FIRE` : '';return;}
    this.weaponAmmo.textContent = s.weapon ? `${s.weapon === 'gun' ? `${s.ammo} rounds` : s.ammo > 1 ? `×${s.ammo}` : ''} · ${isTouch ? 'tap FIRE' : 'SPACE to use'}` : '';
  }

  updateRoom(room: RoomInfo, myId: string) {
    this.room = room;
    this.pauseButton.classList.remove('hidden');
    this.quitButton.classList.remove('hidden');
    if (room.phase !== 'playing') this.setPause(false);
    this.myId = myId;

    // lobby
    this.lobbyCode.textContent = room.code;
    this.lobbyCount.textContent = `(${room.players.length}/${MAX_PLAYERS})`;
    this.lobbyPlayers.replaceChildren(
      ...room.players.map((p) =>
        h(
          'li',
          {},
          h('span', { class: 'dot', style: { background: KART_COLORS[p.color] } }),
          p.name,
          p.loaded ? null : h('span', { class: 'tag loading' }, 'Loading…'),
          p.id === room.hostId ? h('span', { class: 'tag' }, 'Host') : null,
          p.id === myId ? h('span', { class: 'tag you', style: { marginLeft: p.id === room.hostId ? '0' : 'auto' } }, 'You') : null,
        ),
      ),
      ...Array.from({ length: room.bots ? Math.max(0, BOT_FILL - room.players.length) : 0 }, () => h('li', { class: 'empty' }, '🤖 Bot (joins when the match starts)')),
      ...Array.from({ length: room.bots && room.players.length < BOT_FILL ? 0 : Math.max(0, Math.min(2, MAX_PLAYERS - room.players.length)) }, () => h('li', { class: 'empty' }, 'Waiting for player…')),
    );
    const isHost = room.hostId === myId;
    if(this.rematchButton)this.rematchButton.classList.toggle('hidden',!isHost);
    for (const [mode, button] of this.modeButtons) { button.disabled = !isHost; button.classList.toggle('selected', room.mode === mode); }
    const score = room.players.find((p) => p.id === myId)?.score ?? 0;
    this.modeObjective.textContent = room.mode === 'killrace' ? `KILL RACE · YOU ${score}/${KILL_TARGET} · LEAD ${Math.max(0,...room.players.map(p=>p.score))}/${KILL_TARGET}` : MODE_LABELS[room.mode].toUpperCase();
    const botCount = room.bots ? Math.max(0, BOT_FILL - room.players.length) : 0;
    this.botsBtn.textContent = `🤖 Bots: ${room.bots ? 'ON' : 'OFF'}${isHost ? ' (tap to change)' : ''}`;
    this.botsBtn.disabled = !isHost;
    this.botsBtn.classList.toggle('on', room.bots);
    for (const [id, card] of this.mapCards) {
      card.classList.toggle('selected', id === room.mapId);
      card.disabled = !isHost;
    }
    this.startBtn.classList.toggle('hidden', !isHost);
    this.waiting.classList.toggle('hidden', isHost);
    const waitingFor = room.players.filter((p) => !p.loaded).length;
    this.startBtn.disabled = !room.canStart;
    this.startBtn.textContent = !room.canStart
      ? `Waiting for ${waitingFor} player${waitingFor === 1 ? '' : 's'} to load…`
      : botCount > 0
        ? `Start match (${room.players.length} + ${botCount} bots)`
        : room.players.length < 2
          ? 'Start (practice solo)'
          : `Start match (${room.players.length} players)`;

    // scoreboard
    const sorted = [...room.players].sort((a, b) => b.score - a.score || a.deaths - b.deaths);
    this.scoreboard.replaceChildren(
      ...sorted.map((p, i) =>
        h(
          'div',
          { class: `entry${p.id === myId ? ' me' : ''}` },
          h('span', { class: 'rank' }, String(i + 1)),
          h('span', { class: 'dot', style: { background: KART_COLORS[p.color] } }),
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' } }, p.name),
          p.bot ? h('span', { class: 'bot-tag' }, 'BOT') : null,
          h('span', { class: 'score' }, String(p.score)),
        ),
      ),
    );
    this.roomChip.replaceChildren('Room ', h('b', {}, room.code), ` · ${room.players.length}/${MAX_PLAYERS}`);

    if (room.phase === 'results') this.renderResults(room);
  }

  /** Called on every snapshot with the authoritative time left in the current phase. */
  phaseTime(phase: Phase, timeLeft: number) {
    if (phase === 'countdown') {
      const n = Math.ceil(timeLeft);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        this.showCenter(String(n), 'Get ready!');
        this.game.sound.beep(false);
      }
      this.timer.textContent = '3:00';
    } else if (phase === 'playing') {
      const t = Math.max(0, Math.ceil(timeLeft));
      this.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      this.timer.classList.toggle('low', t <= 30);
    } else if (phase === 'results') {
      this.resultsNext.textContent = `Back to the lobby in ${Math.max(0, Math.ceil(timeLeft))}s`;
    }
  }

  go() {
    this.lastCount = -1;
    this.showCenter('GO!', undefined, 900);
    this.game.sound.beep(true);
  }

  private showCenter(text: string, sub?: string, hideAfter = 0) {
    this.centerMsg.replaceChildren(text, sub ? h('small', {}, sub) : '');
    this.centerMsg.classList.remove('hidden', 'bump');
    void this.centerMsg.offsetWidth;
    this.centerMsg.classList.add('bump');
    clearTimeout(this.centerTimer);
    if (hideAfter) this.centerTimer = window.setTimeout(() => this.hideCenter(), hideAfter);
  }

  /** Kill-streak style banner under the timer. */
  private announce(text: string, sub?: string, color = 'var(--accent)') {
    this.banner.replaceChildren(text, sub ? h('small', {}, sub) : '');
    this.banner.style.color = color;
    this.banner.classList.remove('hidden', 'bump');
    void this.banner.offsetWidth;
    this.banner.classList.add('bump');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.add('hidden'), 1800);
  }

  private hideCenter() {
    this.clearRespawnTimer();
    this.centerMsg.classList.add('hidden');
  }

  private clearRespawnTimer() {
    clearInterval(this.respawnInterval);
  }

  private eliminated(by: string | null) {
    let left = RESPAWN_SECONDS;
    const render = () => this.centerMsg.replaceChildren('ELIMINATED', h('small', {}, `${by ? `by ${by} · ` : ''}respawning in ${left}…`));
    this.showCenter('ELIMINATED');
    render();
    this.clearRespawnTimer();
    this.respawnInterval = window.setInterval(() => {
      left = Math.max(1, left - 1);
      render();
    }, 1000);
  }

  private killFeed(killer: string | null, victim: string, weapon: string, mine: boolean) {
    const entry = h('div', { class: `kf${mine ? ' me' : ''}` }, killer ? `${killer} ${FEED_ICON[weapon] ?? '💥'} ${victim}` : `${FEED_ICON[weapon] ?? '💥'} ${victim}`);
    this.feed.prepend(entry);
    while (this.feed.children.length > 5) this.feed.lastElementChild?.remove();
    setTimeout(() => (entry.style.opacity = '0'), 4500);
    setTimeout(() => entry.remove(), 5000);
  }

  private flash(el: HTMLElement, cls: string, ms: number) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  // ------------------------------------------------------------------ results

  private buildResults() {
    this.resultsBody = h('div');
    this.resultsNext = h('div', { class: 'next' });
    this.rematchButton=h('button',{class:'btn go results-rematch',onclick:()=>this.onRematch()},'Rematch');
    this.results = h('div', { class: 'screen hidden' }, h('div', { class: 'card results' }, h('h2', {}, 'Match over!'), this.resultsBody, this.resultsNext, this.rematchButton, h('button',{class:'btn blue results-home',onclick:()=>this.quitToHome()},'Quit to home')));
    this.root.append(this.results);
  }

  showResults(room: RoomInfo) {
    this.rematchButton.classList.toggle('hidden',room.hostId!==this.myId);
    this.renderResults(room);
    this.show(this.results);
    this.hideCenter();
  }

  private renderResults(room: RoomInfo) {
    const sorted = [...room.players].sort((a, b) => b.score - a.score || a.deaths - b.deaths);
    const medals = ['🥇', '🥈', '🥉'];
    const winner = sorted[0];
    this.resultsBody.replaceChildren(
      h('div', { class: 'winner' }, !winner ? '' : sorted[1] && sorted[1].score === winner.score ? '🤝 It’s a tie!' : winner.id === this.myId ? '🏆 You win!' : `🏆 ${winner.name} wins!`),
      h(
        'div',
        { class: 'standings' },
        ...sorted.map((p, i) =>
          h(
            'div',
            { class: `standing${p.id === this.myId ? ' me' : ''}` },
            h('span', { class: 'place' }, medals[i] ?? String(i + 1)),
            h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { class: 'dot', style: { background: KART_COLORS[p.color] } }), p.name, p.bot ? h('span', { class: 'bot-tag' }, 'BOT') : null),
            h('span', { class: 'kills' }, `${p.score}`),
            h('span', { class: 'deaths' }, `${p.deaths} KO'd`),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ chrome

  private buildCornerButtons() {
    this.pauseButton = h('button', { class: 'icon-btn hidden', title: 'Pause controls (Esc)', 'aria-label': 'Pause' }, 'Ⅱ');
    this.quitButton = h('button', { class: 'icon-btn hidden', title: 'Quit to home', 'aria-label': 'Quit game' }, '↪');
    this.pausePanel = h('div', { class: 'pause-overlay hidden' }, h('div', { class: 'card pause-card' }, h('h2', {}, 'TAKE A BREATHER'), h('p', {}, 'Your controls are paused. The online battle continues, and your kart can still be hit.'), h('button', { class: 'btn go', onclick: () => this.setPause(false) }, 'Resume game'), h('button',{class:'btn ghost',onclick:()=>this.settingsPanel.classList.toggle('hidden')},'Sound & graphics'), h('button', { class: 'btn blue', onclick: () => this.quitToHome() }, 'Quit to home')));
    this.reconnectPanel=h('div',{class:'reconnect-overlay hidden',role:'status','aria-live':'polite'},h('div',{class:'card pause-card'},h('h2',{},'RECONNECTING…'),h('p',{},'Holding your place for 15 seconds. Your kart can still be hit.'),h('button',{class:'btn blue',onclick:()=>this.quitToHome()},'Quit to home')));
    this.root.append(this.pausePanel,this.reconnectPanel);
    const pauseOnInterruption = () => { if (this.room?.phase === 'playing') this.setPause(true); };
    window.addEventListener('blur', pauseOnInterruption);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnInterruption(); });
    this.pauseButton.onclick = () => this.setPause(!this.game.paused);
    this.quitButton.onclick = () => this.setPause(true);
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !e.repeat && this.room) { e.preventDefault(); this.setPause(!this.game.paused); } });
    const sound = h('button', { class: 'icon-btn', title: 'Sound' }, this.game.sound.muted ? '🔇' : '🔊');
    sound.addEventListener('click', () => {
      this.game.sound.unlock();
      sound.textContent = this.game.sound.toggleMute() ? '🔇' : '🔊';
    });
    const settings = this.buildSettings();
    this.settingsPanel=settings;
    const gear = h('button', { class: 'icon-btn', title: 'Settings' }, '⚙');
    gear.addEventListener('click', () => settings.classList.toggle('hidden'));
    const full = h('button', { class: 'icon-btn', title: 'Fullscreen' }, '⛶');
    full.addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    });
    this.root.append(h('div', { class: 'corner-buttons' }, this.pauseButton, this.quitButton, sound, gear, full), settings);
  }

  setReconnecting(on:boolean) { this.reconnectPanel.classList.toggle('hidden',!on); this.pausePanel.classList.add('hidden'); }

  private setPause(on: boolean) {
    this.game.setPaused(on);
    if(!on)this.settingsPanel?.classList.add('hidden');
    this.pausePanel.classList.toggle('hidden', !on);
  }

  private quitToHome() {
    this.setPause(false);
    this.onLeave();
  }

  private buildSettings(): HTMLElement {
    const fps = h('div', { class: 'fps' });
    const options: [Quality, string, string][] = [
      ['ultra', 'Ultra', 'Sharpest image and shadows (fast computers)'],
      ['high', 'High', 'Balanced · automatic resolution for smoother play'],
      ['low', 'Low', 'Smoothest on phones and older laptops'],
    ];
    const buttons = options.map(([q, label, desc]) => {
      const b = h('button', { class: 'quality-opt' }, h('b', {}, label), h('span', {}, desc));
      b.addEventListener('click', () => {
        this.game.setQuality(q);
        buttons.forEach((x, i) => x.classList.toggle('selected', options[i][0] === q));
        this.toast(`Graphics: ${label}`);
      });
      b.classList.toggle('selected', this.game.quality === q);
      return b;
    });
    const slider = h('input', { type: 'range', min: '0.4', max: '1.3', step: '0.05', class: 'brightness' }) as HTMLInputElement;
    slider.value = String(this.game.brightness);
    slider.addEventListener('input', () => this.game.setBrightness(Number(slider.value)));
    const volume = h('input', { type: 'range', min: '0', max: '1', step: '0.05', class: 'brightness', 'aria-label': 'Sound volume' }) as HTMLInputElement;
    volume.value = String(this.game.sound.volume);
    volume.oninput = () => this.game.sound.setVolume(Number(volume.value));
    const engine = h('button', { class: 'btn ghost small', onclick: () => { engine.textContent = this.game.sound.toggleEngine() ? 'Engine sound: ON' : 'Engine sound: OFF'; } }, this.game.sound.engineEnabled ? 'Engine sound: ON' : 'Engine sound: OFF');
    const motion=h('button',{class:'btn ghost small',onclick:()=>{this.game.setShakeEnabled(!this.game.shakeEnabled);motion.textContent=this.game.shakeEnabled?'Camera shake: ON':'Camera shake: OFF';}},this.game.shakeEnabled?'Camera shake: ON':'Camera shake: OFF');
    const views = (['arcade','chase'] as const).map(view=>{
      const button=h('button',{class:'quality-opt camera-option','aria-pressed':this.game.cameraView===view,onclick:()=>{this.game.setCameraView(view);views.forEach((b,i)=>{b.classList.toggle('selected',(['arcade','chase'] as const)[i]===view);b.setAttribute('aria-pressed',String((['arcade','chase'] as const)[i]===view));});}},h('b',{},view==='arcade'?'Arcade':'Close chase'));
      button.classList.toggle('selected',this.game.cameraView===view);return button;
    });
    const panel = h(
      'div',
      { class: 'settings card hidden' },
      h('h3', { class: 'section' }, 'Sound volume'), volume, engine,
      h('h3', { class: 'section' }, 'Camera view'),
      h('div',{class:'row'},...views),
      motion,
      h('h3', { class: 'section' }, 'Brightness'),
      slider,
      h('h3', { class: 'section', style: { marginTop: '6px' } }, 'Graphics quality'),
      ...buttons,
      fps,
      h('button',{class:'btn ghost small',onclick:()=>panel.classList.add('hidden')},'Close settings'),
    );
    setInterval(() => {
      if (!panel.classList.contains('hidden')) fps.textContent = `${Math.round(this.game.fps)} FPS`;
    }, 500);
    return panel;
  }

  private mapLoading(id: string, f: number) {
    const bar = this.mapBars.get(id);
    if (bar) {
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.parentElement!.classList.toggle('done', f >= 1);
    }
    const name = getMap(id)?.name ?? id;
    this.loadingMsg.textContent = `Loading ${name}… ${Math.round(f * 100)}%`;
    this.loadingMsg.classList.toggle('hidden', f >= 1);
    if (f >= 1) this.minimap.setMap(getMap(id)!);
  }

  /** Called every animation frame while the HUD is up. */
  tick() {
    if (!this.hudEl.classList.contains('hidden') && performance.now() - this.lastTelemetry > 70) {
      this.lastTelemetry = performance.now();
      this.minimap.draw(this.game.minimap());
      const kart = this.game.drivingState;
      if(this.coachStage==='drive' && Math.abs(kart.forwardSpeed)>3)this.coachStage='pickup';
      if(this.coachStage==='pickup' && this.lastWeapon)this.coachStage='fire';
      if(this.coachStage==='fire' && this.game.input.fire)this.coachStage='drift';
      if(this.coachStage==='drift' && kart.driftCharge>.2){this.coachStage='done';savePref('kc-guide-done','1');}
      const tips={drive:isTouch?'Move the left stick to drive. Pull down to reverse.':'WASD or arrow keys to drive. S brakes and reverses.',pickup:'Drive through a gold ? crate to collect a weapon.',fire:isTouch?'Aim toward an opponent and tap FIRE.':'Aim toward an opponent and press SPACE.',drift:isTouch?'Hold DRIFT through a turn. Release when charged.':'Hold SHIFT through a turn. Release when charged.',done:''};
      const tip=tips[this.coachStage];if(this.coachText.textContent!==tip)this.coachText.textContent=tip;
      this.coach.classList.toggle('hidden',!tip||this.room?.phase!=='playing'||this.game.paused||!kart.alive);
      this.speedReadout.textContent = String(Math.round(Math.abs(kart?.alive ? kart.forwardSpeed : 0) * 3.6));
      const boost = !!kart?.alive && kart.boosting > 0;
      this.drivePanel.classList.toggle('boosting', boost);
      this.speedLines.classList.toggle('active', boost);
      this.nitroFill.style.width = `${kart.alive ? kart.nitro * 100 : 0}%`;
      this.nitroLabel.textContent = kart.nitroActive ? 'NITRO BURNING!' : `${isTouch ? 'HOLD NITRO' : 'HOLD E · NITRO'} ${Math.round(kart.nitro*100)}%`;
      const nitroButton = this.touch?.querySelector<HTMLElement>('.tbtn.nitro');
      if(nitroButton) {
        nitroButton.style.setProperty('--fuel',`${kart.nitro*100}%`);
        nitroButton.classList.toggle('empty',kart.nitro<.05);
        nitroButton.setAttribute('aria-label',`Nitro ${Math.round(kart.nitro*100)} percent`);
      }
      this.drivePanel.classList.toggle('charged', !!kart?.alive && kart.driftCharged);
      this.driftFill.style.width = `${boost ? 100 : (kart?.alive ? kart.driftCharge : 0) * 100}%`;
      this.driftLabel.textContent = boost ? 'TURBO!' : kart?.alive && kart.driftCharged ? (isTouch ? 'RELEASE FOR TURBO' : 'RELEASE SHIFT · TURBO READY') : (isTouch ? 'DRIFT FOR TURBO' : 'SHIFT · DRIFT TO CHARGE');
    }
  }

  toast(msg: string) {
    const t = h('div', { class: 'toast' }, msg);
    this.root.append(t);
    setTimeout(() => t.remove(), 2600);
  }

  private show(screen: HTMLElement) {
    this.garage?.setActive(screen === this.menu);
    if (screen === this.menu) { this.room = null; this.setPause(false); this.pauseButton?.classList.add('hidden'); this.quitButton?.classList.add('hidden'); }
    for (const s of [this.menu, this.lobby, this.hudEl, this.results]) s.classList.toggle('hidden', s !== screen);
    // Keep the HUD visible underneath the results card.
    if (screen === this.results) this.hudEl.classList.remove('hidden');
  }
}
