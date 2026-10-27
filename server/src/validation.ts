import { MATCH_MODES, type MatchMode, KART_MAX_SPEED, MAX_NAME_LENGTH, KART_COLORS, type ClientMsg, type Vec3, type Quat } from '@kart/shared';

/**
 * Rejects kart positions that a legitimate client could not have reached since its last update
 * (teleports, speed hacks, leaving the arena). Generous on timing so network jitter that bunches
 * packets together doesn't cause false positives.
 */
export function isPlausibleMove(prev: Vec3, next: Vec3, dtSeconds: number, half: number): boolean {
  if (!next.every(Number.isFinite)) return false;
  if (Math.abs(next[0]) > half + 2 || Math.abs(next[2]) > half + 2) return false;
  if (next[1] < -30 || next[1] > 40) return false;
  const dt = Math.min(Math.max(dtSeconds, 0.1), 0.5);
  const horizontal = Math.hypot(next[0] - prev[0], next[2] - prev[2]);
  return horizontal <= KART_MAX_SPEED * 1.5 * dt + 1.5;
}

export function sanitizeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_NAME_LENGTH) : '';
  return name || 'Racer';
}

export function sanitizeColor(raw: unknown): number {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < KART_COLORS.length ? (raw as number) : 0;
}

function isNumArray(v: unknown, len: number): boolean {
  return Array.isArray(v) && v.length === len && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Parses and type-checks an incoming message. Returns null for anything malformed. */
export function parseClientMsg(raw: string): ClientMsg | null {
  let m: any;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'resume':
      return typeof m.token === 'string' && /^[a-f0-9-]{36}$/.test(m.token) ? {t:'resume',token:m.token} : null;
    case 'leave':
      return {t:'leave'};
    case 'setMode':
      return MATCH_MODES.includes(m.mode) ? { t: 'setMode', mode: m.mode } : null;
    case 'quickplay':
      return { t: 'quickplay', name: sanitizeName(m.name), color: sanitizeColor(m.color), ...(MATCH_MODES.includes(m.mode) ? { mode: m.mode as MatchMode } : {}) };
    case 'create':
      return { t: 'create', name: sanitizeName(m.name), color: sanitizeColor(m.color), ...(MATCH_MODES.includes(m.mode) ? { mode: m.mode as MatchMode } : {}) };
    case 'join':
      if (typeof m.code !== 'string' || m.code.length > 20) return null;
      return { t: 'join', code: m.code, name: sanitizeName(m.name), color: sanitizeColor(m.color) };
    case 'setMap':
      return typeof m.mapId === 'string' ? { t: 'setMap', mapId: m.mapId } : null;
    case 'rematch':
      return {t:'rematch'};
    case 'start':
      return { t: 'start' };
    case 'state':
      if (!isNumArray(m.p, 3) || !isNumArray(m.q, 4) || !isNumArray(m.v, 3)) return null;
      return { t: 'state', p: m.p as Vec3, q: m.q as Quat, v: m.v as Vec3 };
    case 'fire':
      return isNumArray(m.d, 3) ? { t: 'fire', d: m.d as Vec3 } : null;
    case 'fell':
      return { t: 'fell' };
    case 'setBots':
      return typeof m.on === 'boolean' ? { t: 'setBots', on: m.on } : null;
    case 'loaded':
      return typeof m.mapId === 'string' && m.mapId.length < 40 ? { t: 'loaded', mapId: m.mapId } : null;
    default:
      return null;
  }
}
