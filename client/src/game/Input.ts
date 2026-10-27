/** Keyboard + on-screen touch controls, merged into one set of axes. */
export class Input {
  private keys = new Set<string>();
  /** Set by the touch UI */
  touchSteer = 0;
  touchThrottle = 0;
  touchFire = false;
  touchDrift = false;
  touchNitro = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('resize', () => this.clear());
    document.addEventListener('visibilitychange', () => { if(document.hidden)this.clear(); });
  }

  clear() {
    this.keys.clear();
    this.touchSteer = this.touchThrottle = 0;
    this.touchFire = this.touchDrift = this.touchNitro = false;
  }

  private any(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  get throttle(): number {
    const k = (this.any('KeyW', 'ArrowUp') ? 1 : 0) - (this.any('KeyS', 'ArrowDown') ? 1 : 0);
    return k !== 0 ? k : this.touchThrottle;
  }

  /** +1 = right */
  get steer(): number {
    const k = (this.any('KeyD', 'ArrowRight') ? 1 : 0) - (this.any('KeyA', 'ArrowLeft') ? 1 : 0);
    return k !== 0 ? k : this.touchSteer;
  }

  get fire(): boolean {
    return this.any('Space', 'KeyJ', 'Enter') || this.touchFire;
  }

  get nitro(): boolean {
    return this.any('KeyE', 'KeyL') || this.touchNitro;
  }

  get drift(): boolean {
    return this.any('ShiftLeft', 'ShiftRight', 'KeyK') || this.touchDrift;
  }
}
