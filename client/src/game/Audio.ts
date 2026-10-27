/**
 * Tiny synthesized sound engine (Web Audio) — no audio files needed.
 * Must be unlocked from a user gesture before it makes any sound.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private voices = 0;
  private readonly maxVoices = 24;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  muted = false;
  volume = 0.25;
  engineEnabled = false;

  constructor() {
    try {
      const savedVolume = localStorage.getItem('kc-volume');
      if (savedVolume !== null) this.volume = Math.max(0, Math.min(1, Number(savedVolume) || 0));
      this.engineEnabled = localStorage.getItem('kc-engine') === '1';
      this.muted = localStorage.getItem('kc-muted') === '1';
    } catch {
      /* storage unavailable */
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('kc-muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    try { localStorage.setItem('kc-volume', String(this.volume)); } catch {}
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  toggleEngine() {
    this.engineEnabled = !this.engineEnabled;
    try { localStorage.setItem('kc-engine', this.engineEnabled ? '1' : '0'); } catch {}
    return this.engineEnabled;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    if (!this.ctx || this.muted || this.volume===0 || this.voices>=this.maxVoices) return;
    this.voices++;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.onended=()=>{o.disconnect();g.disconnect();this.voices=Math.max(0,this.voices-1);};
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = 'lowpass', sweepTo?: number) {
    if (!this.ctx || this.muted || this.volume===0 || this.voices>=this.maxVoices) return;
    this.voices++;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.onended=()=>{src.disconnect();f.disconnect();g.disconnect();this.voices=Math.max(0,this.voices-1);};
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Continuous engine hum. speed01 = 0..1, on = false fades it out. */
  engine(speed01: number, on: boolean) {
    if (!this.ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc.type = 'sine';
      this.engineOsc2.type = 'triangle';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 400;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      this.engineOsc2.start();
    }
    const t = this.ctx.currentTime;
    const f = 48 + speed01 * 110;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2!.frequency.setTargetAtTime(f * 0.501, t, 0.08);
    this.engineFilter!.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1);
    this.engineGain!.gain.setTargetAtTime(on && this.engineEnabled ? 0.018 + speed01 * 0.018 : 0, t, 0.15);
  }

  private lastShot = -Infinity;
  shot(distance = 0) {
    const now = performance.now();
    if (now - this.lastShot < 70 || distance > 35) return;
    this.lastShot = now;
    const level = Math.max(0, 1 - distance / 35);
    this.burst(0.05, 0.12 * level, 2400, 'bandpass');
    this.tone(180, 0.06, 'triangle', 0.04 * level, 90);
  }
  rocket() {
    this.burst(0.5, 0.3, 600, 'bandpass', 3000);
    this.tone(220, 0.4, 'triangle', 0.06, 880);
  }
  grenade() {
    this.tone(140, 0.12, 'triangle', 0.18, 70);
    this.burst(0.15, 0.25, 900, 'lowpass');
  }
  boost() {
    this.burst(0.6, 0.25, 400, 'bandpass', 2400);
    this.tone(300, 0.5, 'triangle', 0.06, 900);
  }
  mine() {
    this.tone(700, 0.08, 'triangle', 0.12);
    this.tone(500, 0.1, 'triangle', 0.12, undefined, 0.09);
  }
  shield() {
    this.tone(400, 0.5, 'sine', 0.18, 1200);
    this.tone(600, 0.5, 'triangle', 0.08, 1800);
  }
  private lastExplosion = -Infinity;
  explosion(distance = 0) {
    const now = performance.now();
    if (now - this.lastExplosion < 120) return;
    this.lastExplosion = now;
    const vol = Math.max(0, 0.35 - distance / 80);
    this.burst(0.45, vol, 1200, 'lowpass', 60);
    this.tone(90, 0.6, 'sine', vol * 0.6, 30);
  }
  hit() {
    this.tone(160, 0.12, 'triangle', 0.15, 60);
  }
  hitMarker() {
    this.tone(1400, 0.05, 'triangle', 0.06);
  }
  pickup() {
    this.tone(660, 0.1, 'triangle', 0.18);
    this.tone(990, 0.16, 'triangle', 0.18, undefined, 0.08);
  }
  beep(high = false) {
    this.tone(high ? 880 : 440, high ? 0.45 : 0.2, 'triangle', 0.12);
  }
  ko() {
    this.tone(520, 0.12, 'triangle', 0.12);
    this.tone(780, 0.12, 'triangle', 0.12, undefined, 0.1);
    this.tone(1040, 0.25, 'triangle', 0.12, undefined, 0.2);
  }
  /** fanfare for multi-kills and streaks */
  streak() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, undefined, 0.32 + i * 0.08));
  }
}
