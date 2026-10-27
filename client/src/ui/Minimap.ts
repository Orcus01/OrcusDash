import type { MapDef } from '@kart/shared';
import type { MinimapState } from '../game/Game';

const SIZE = 172;

/** Top-down radar: static arena layout drawn once, live karts and crates on top every frame. */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private map: MapDef | null = null;
  private readonly dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor() {
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    this.el.width = SIZE * this.dpr;
    this.el.height = SIZE * this.dpr;
    this.g = this.el.getContext('2d')!;
  }

  private toPx(v: number) {
    const half = this.map!.half;
    return ((v + half) / (half * 2)) * (SIZE - 12) + 6;
  }

  setMap(map: MapDef) {
    if (this.map?.id === map.id) return;
    this.map = map;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE * this.dpr;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const P = (v: number) => this.toPx(v);
    const S = (v: number) => (v / (map.half * 2)) * (SIZE - 12);
    g.fillStyle = map.theme.minimap;
    g.beginPath();
    g.roundRect(6, 6, SIZE - 12, SIZE - 12, 10);
    g.fill();
    for (const d of map.decals) {
      if (d.kind === 'track' && d.r && d.w) {
        g.strokeStyle = 'rgba(40,42,48,0.85)';
        g.lineWidth = S(d.w);
        g.beginPath();
        g.arc(P(d.x), P(d.z), S(d.r - d.w / 2), 0, Math.PI * 2);
        g.stroke();
        continue;
      }
      if (d.kind === 'carpet') continue;
      const colour =
        d.kind === 'road' || d.kind === 'runway' || d.kind === 'parking'
          ? 'rgba(40,42,48,0.85)'
          : d.kind === 'pond' || d.kind === 'water'
            ? 'rgba(120,200,240,0.9)'
            : d.kind === 'boost'
              ? '#00e1ff'
              : 'rgba(255,255,255,0.18)';
      g.fillStyle = colour;
      if (d.r) {
        g.beginPath();
        g.arc(P(d.x), P(d.z), S(d.r), 0, Math.PI * 2);
        g.fill();
      } else if (d.w && d.d) {
        g.fillRect(P(d.x - d.w / 2), P(d.z - d.d / 2), S(d.w), S(d.d));
      }
    }
    for (const b of map.boxes) {
      if (b.hidden || b.kind === 'car') continue;
      g.fillStyle = b.color ?? (b.kind === 'castle_wall' || b.kind === 'castle_tower' ? '#8f897e' : 'rgba(20,22,30,0.75)');
      g.fillRect(P(b.x - b.w / 2), P(b.z - b.d / 2), Math.max(1, S(b.w)), Math.max(1, S(b.d)));
    }
    this.base = c;
  }

  draw(state: MinimapState) {
    if (!this.map || !this.base) return;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.el.width, this.el.height);
    g.drawImage(this.base, 0, 0);
    g.scale(this.dpr, this.dpr);
    const P = (v: number) => this.toPx(v);
    for (const c of state.crates) {
      if (!c.on) continue;
      g.fillStyle = '#ffc928';
      g.fillRect(P(c.x) - 1.5, P(c.z) - 1.5, 3, 3);
    }
    for (const o of state.others) {
      g.fillStyle = o.color;
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(P(o.x), P(o.z), 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    if (state.me) {
      const { x, z, yaw } = state.me;
      g.save();
      g.translate(P(x), P(z));
      // forward is (sin yaw, cos yaw) in x/z → canvas angle
      g.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)));
      g.fillStyle = '#fff';
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(7, 0);
      g.lineTo(-5, 4.5);
      g.lineTo(-2.5, 0);
      g.lineTo(-5, -4.5);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }
}
