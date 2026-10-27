import * as THREE from 'three';
import { rng, hashString } from '@kart/shared';

/** Cartoon materials + hand-painted canvas textures (no image downloads, instant loading). */

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string, opts: { flat?: boolean; rough?: number; metal?: number; emissive?: string; emissiveIntensity?: number; map?: THREE.Texture; transparent?: number } = {}) {
  const key = `${color}|${opts.flat}|${opts.rough}|${opts.metal}|${opts.emissive}|${opts.emissiveIntensity}|${opts.map?.uuid}|${opts.transparent}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: opts.flat ?? false,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.emissive ? (opts.emissiveIntensity ?? 1) : 0,
      map: opts.map ?? null,
      transparent: opts.transparent !== undefined,
      opacity: opts.transparent ?? 1,
    });
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

export function tex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const texCache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture) {
  let t = texCache.get(key);
  if (!t) { t=make();t.userData.shared=true;t.userData.sharedOwner=t.uuid;texCache.set(key,t); }
  return t;
}

// ---------------------------------------------------------------- ground

// ---------------------------------------------------------------- surfaces

/** One window bay of a pastel building (repeat it per storey and bay). */
export const facadeTexture = (wall: string) =>
  cached(`facade${wall}`, () => {
    const { c, g } = canvas(128, 128);
    g.fillStyle = wall;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(0, 116, 128, 12);
    g.fillStyle = '#ffffff';
    g.fillRect(30, 26, 68, 66);
    const glass = g.createLinearGradient(34, 30, 94, 88);
    glass.addColorStop(0, '#a8dcff');
    glass.addColorStop(1, '#4c86c4');
    g.fillStyle = glass;
    g.fillRect(35, 31, 58, 56);
    g.fillStyle = '#ffffff';
    g.fillRect(62, 31, 4, 56);
    g.fillRect(35, 57, 58, 4);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.beginPath();
    g.moveTo(39, 83);
    g.lineTo(57, 35);
    g.lineTo(64, 35);
    g.lineTo(46, 83);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(28, 92, 72, 6);
    return tex(c);
  });

export const stoneTexture = () =>
  cached('stone', () => {
    const { c, g } = canvas(256, 256);
    const r = rng(7);
    g.fillStyle = '#9b958a';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      const off = (y / 32) % 2 ? 32 : 0;
      for (let x = -32; x < 256; x += 64) {
        const v = 150 + Math.floor(r() * 40);
        g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
        g.beginPath();
        g.roundRect(x + off + 2, y + 2, 60, 28, 5);
        g.fill();
      }
    }
    return tex(c);
  });

export const plankTexture = (tint = '#c08a55') =>
  cached(`plank${tint}`, () => {
    const { c, g } = canvas(128, 128);
    const r = rng(3);
    g.fillStyle = tint;
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.1})`;
      g.fillRect(0, y, 128, 16);
      g.fillStyle = 'rgba(60,30,10,0.35)';
      g.fillRect(0, y + 14, 128, 2);
    }
    return tex(c);
  });

export const stripeTexture = (a: string, b: string, diag = false) =>
  cached(`stripe${a}${b}${diag}`, () => {
    const { c, g } = canvas(128, 128);
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = b;
    if (diag) {
      for (let x = -128; x < 256; x += 64) {
        g.beginPath();
        g.moveTo(x, 128);
        g.lineTo(x + 32, 128);
        g.lineTo(x + 160, 0);
        g.lineTo(x + 128, 0);
        g.fill();
      }
    } else g.fillRect(64, 0, 64, 128);
    return tex(c);
  });

export const chevronTexture = (a = '#ffcc1f', b = '#1c1c1c') =>
  cached(`chev${a}${b}`, () => {
    const { c, g } = canvas(128, 256);
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = b;
    for (let y = -40; y < 300; y += 64) {
      g.beginPath();
      g.moveTo(0, y + 40);
      g.lineTo(64, y);
      g.lineTo(128, y + 40);
      g.lineTo(128, y + 68);
      g.lineTo(64, y + 28);
      g.lineTo(0, y + 68);
      g.fill();
    }
    return tex(c);
  });

export const rainbowTexture = () =>
  cached('rainbow', () => {
    const { c, g } = canvas(256, 64);
    ['#ff5a5f', '#ffb400', '#ffe066', '#7ed957', '#00bbf9', '#9b5de5'].forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(0, i * 11, 256, 11);
    });
    return tex(c);
  });

export const crateTexture = () =>
  cached('crate', () => {
    const { c, g } = canvas(128, 128);
    g.fillStyle = '#c9884c';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#8a5428';
    g.lineWidth = 12;
    g.strokeRect(6, 6, 116, 116);
    g.beginPath();
    g.moveTo(10, 10);
    g.lineTo(118, 118);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < 128; y += 21) g.fillRect(0, y, 128, 2);
    return tex(c, false);
  });

/** The glossy "?" weapon crate. */
export const mysteryTexture = () =>
  cached('mystery', () => {
    const { c, g } = canvas(128, 128);
    const grad = g.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#ffd23f');
    grad.addColorStop(1, '#ff9f1c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#b35f00';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 118, 118);
    g.fillStyle = '#fff';
    g.lineWidth = 6;
    g.font = 'bold 84px "Lilita One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeText('?', 64, 70);
    g.fillText('?', 64, 70);
    return tex(c, false);
  });

export const letterTexture = (letter: string, color: string) =>
  cached(`letter${letter}${color}`, () => {
    const { c, g } = canvas(128, 128);
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 10;
    g.strokeRect(10, 10, 108, 108);
    g.fillStyle = '#ffffff';
    g.font = 'bold 80px "Lilita One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 64, 70);
    return tex(c, false);
  });

export const crowdTexture = () =>
  cached('crowd', () => {
    const { c, g } = canvas(256, 64);
    const r = rng(11);
    g.fillStyle = '#3a3f4a';
    g.fillRect(0, 0, 256, 64);
    const shirts = ['#e8403a', '#2f7cf6', '#f5b700', '#2fbf5a', '#ffffff', '#ff7a1a', '#a24df0'];
    for (let row = 0; row < 4; row++) {
      for (let x = 4; x < 256; x += 9) {
        const y = 10 + row * 15 + r() * 2;
        g.fillStyle = shirts[Math.floor(r() * shirts.length)];
        g.fillRect(x, y + 5, 7, 8);
        g.fillStyle = ['#f1c27d', '#c68642', '#8d5524', '#ffdbac'][Math.floor(r() * 4)];
        g.beginPath();
        g.arc(x + 3.5, y + 2, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    return tex(c);
  });

export const adTexture = (i: number) =>
  cached(`ad${i}`, () => {
    const { c, g } = canvas(256, 64);
    const looks: [string, string, string][] = [
      ['#e8403a', '#ffffff', 'ORCUSDASH'],
      ['#2f7cf6', '#ffe066', 'TURBO!'],
      ['#111111', '#7ed957', 'ZOOM'],
      ['#f5b700', '#1c1c1c', 'BOOM BOX'],
      ['#9b5de5', '#ffffff', 'DRIFT KING'],
    ];
    const [bg, fg, text] = looks[i % looks.length];
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = fg;
    g.font = 'bold 40px "Lilita One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 35);
    return tex(c, false);
  });

export const graffitiTexture = (base: string) =>
  cached(`graf${base}`, () => {
    const { c, g } = canvas(256, 128);
    const r = rng(hashString(base));
    g.fillStyle = '#c7c9cd';
    g.fillRect(0, 0, 256, 128);
    const cols = [base, '#ff5a5f', '#ffb400', '#00a699', '#3d7bff', '#9b5de5', '#111111'];
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = cols[Math.floor(r() * cols.length)];
      g.lineWidth = 8 + r() * 14;
      g.lineCap = 'round';
      g.beginPath();
      let x = r() * 256;
      let y = r() * 128;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (r() - 0.5) * 120;
        y += (r() - 0.5) * 70;
        g.quadraticCurveTo(x + 30, y - 30, x, y);
      }
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111';
    g.lineWidth = 6;
    g.font = 'bold 54px "Lilita One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const word = ['SK8', 'ZOOM', 'KART', 'BOOM', 'YO!'][Math.floor(r() * 5)];
    g.strokeText(word, 128, 66);
    g.fillText(word, 128, 66);
    return tex(c);
  });

export const panelTexture = (base: string) =>
  cached(`panel${base}`, () => {
    const { c, g } = canvas(128, 128);
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 4;
    g.strokeRect(4, 4, 120, 120);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(16, 16, 96, 22);
    g.fillStyle = '#5ff3ff';
    g.fillRect(16, 100, 96, 6);
    return tex(c);
  });

/** A bay of windows; some lit (night) — used as both colour and glow map on buildings. */
export const windowTexture = (wall: string, night: boolean, seed: number) =>
  cached(`win${wall}${night}${seed}`, () => {
    const { c, g } = canvas(128, 128);
    const r = rng(seed);
    g.fillStyle = wall;
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const lit = night ? r() < 0.45 : false;
        g.fillStyle = '#1b1f26';
        g.fillRect(x * 64 + 10, y * 64 + 10, 44, 40);
        if (lit) {
          g.fillStyle = r() < 0.7 ? '#ffd38a' : '#9fd8ff';
          g.fillRect(x * 64 + 12, y * 64 + 12, 40, 36);
        } else {
          const glass = g.createLinearGradient(x * 64 + 12, y * 64 + 12, x * 64 + 52, y * 64 + 48);
          glass.addColorStop(0, night ? '#262b38' : '#7f95ab');
          glass.addColorStop(1, night ? '#11141b' : '#3e4f62');
          g.fillStyle = glass;
          g.fillRect(x * 64 + 12, y * 64 + 12, 40, 36);
        }
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x * 64 + 8, y * 64 + 50, 48, 4);
      }
    }
    return tex(c);
  });

/** Glow-only version of a window bay (black except the lit panes). */
export const windowGlowTexture = (seed: number) =>
  cached(`wing${seed}`, () => {
    const { c, g } = canvas(128, 128);
    const r = rng(seed);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        if (r() < 0.45) {
          g.fillStyle = r() < 0.7 ? '#ffc870' : '#7fcfff';
          g.fillRect(x * 64 + 12, y * 64 + 12, 40, 36);
        }
      }
    }
    return tex(c);
  });

export const neonSignTexture = (text: string, color: string) =>
  cached(`neon${text}${color}`, () => {
    const { c, g } = canvas(512, 128);
    g.fillStyle = '#07070c';
    g.fillRect(0, 0, 512, 128);
    g.font = 'bold 84px "Lilita One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 24;
    g.fillStyle = color;
    g.fillText(text, 256, 68);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.55;
    g.fillText(text, 256, 68);
    return tex(c, false);
  });

export const lightPoolTexture = (color: string) =>
  cached(`pool${color}`, () => {
    const { c, g } = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return tex(c, false);
  });

export const crosswalkTexture = () =>
  cached('xwalk', () => {
    const { c, g } = canvas(128, 32);
    g.clearRect(0, 0, 128, 32);
    g.fillStyle = 'rgba(235,235,225,0.9)';
    for (let x = 4; x < 128; x += 16) g.fillRect(x, 0, 9, 32);
    return tex(c);
  });
