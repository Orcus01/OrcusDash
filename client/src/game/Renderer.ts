import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { MapDef, Mood } from '@kart/shared';

export type Quality = 'ultra' | 'high' | 'low';

const SETTINGS: Record<Quality, { pixelRatio: number; shadowSize: number; shadowBox: number; shadows: boolean; bloom: boolean; clouds: boolean; rain: number }> = {
  ultra: { pixelRatio: 2, shadowSize: 4096, shadowBox: 110, shadows: true, bloom: true, clouds: true, rain: 2200 },
  high: { pixelRatio: 1, shadowSize: 1024, shadowBox: 80, shadows: true, bloom: false, clouds: true, rain: 1400 },
  low: { pixelRatio: 1.35, shadowSize: 1024, shadowBox: 60, shadows: false, bloom: false, clouds: false, rain: 500 },
};
const isPhone = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

interface MoodSpec {
  top: string;
  horizon: string;
  bottom: string;
  /** direction towards the sun / moon */
  sun: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  disc: { color: string; size: number } | null;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  exposure: number;
  env: number;
  bloom: number;
  stars: boolean;
  clouds: number;
  cloudColor: string;
  rain: boolean;
  lightning: boolean;
  /** neon colour blobs in the reflection map */
  neon: boolean;
}

export const MOODS: Record<Mood, MoodSpec> = {
  /** clear, friendly daylight: saturated colours, soft sun, nothing glaring */
  day: {
    top: '#3f86d6',
    horizon: '#a9d4f2',
    bottom: '#b6d2e0',
    sun: [0.45, 0.8, 0.35],
    sunColor: '#fff4e2',
    sunIntensity: 1.5,
    disc: { color: '#fff8e8', size: 0.02 },
    hemiSky: '#d6eaff',
    hemiGround: '#8f9478',
    hemi: 0.95,
    fog: '#b4d4ec',
    fogNear: 70,
    fogFar: 230,
    exposure: 1.0,
    env: 0.35,
    bloom: 0.08,
    stars: false,
    clouds: 0.38,
    cloudColor: '#ffffff',
    rain: false,
    lightning: false,
    neon: false,
  },
  /** warm late afternoon: long shadows, golden light, still bright */
  golden: {
    top: '#4a77c4',
    horizon: '#f2c48e',
    bottom: '#d9b28c',
    sun: [-0.7, 0.42, -0.35],
    sunColor: '#ffdcae',
    sunIntensity: 2.4,
    disc: { color: '#fff0cc', size: 0.026 },
    hemiSky: '#e2eaf6',
    hemiGround: '#8e7660',
    hemi: 1.65,
    fog: '#e3c3a2',
    fogNear: 70,
    fogFar: 240,
    exposure: 0.98,
    env: 0.75,
    bloom: 0.12,
    stars: false,
    clouds: 0.35,
    cloudColor: '#ffd9b8',
    rain: false,
    lightning: false,
    neon: false,
  },
  night: {
    top: '#04050f',
    horizon: '#2b1b4f',
    bottom: '#0b0a18',
    sun: [0.35, 0.65, -0.55],
    sunColor: '#8fa6ff',
    sunIntensity: 1.3,
    disc: { color: '#e8eeff', size: 0.012 },
    hemiSky: '#3a3f72',
    hemiGround: '#14121f',
    hemi: 1.15,
    fog: '#170f2e',
    fogNear: 45,
    fogFar: 180,
    exposure: 1.1,
    env: 0.9,
    bloom: 0.45,
    stars: true,
    clouds: 0.25,
    cloudColor: '#2a2346',
    rain: false,
    lightning: false,
    neon: true,
  },
  sunset: {
    top: '#1c2654',
    horizon: '#c8714a',
    bottom: '#c99a74',
    sun: [-0.85, 0.2, -0.32],
    sunColor: '#ffd0a4',
    sunIntensity: 2.2,
    disc: { color: '#ffe2b0', size: 0.035 },
    hemiSky: '#e8d2c2',
    hemiGround: '#5a3626',
    hemi: 1.2,
    fog: '#b98a6e',
    fogNear: 60,
    fogFar: 260,
    exposure: 0.88,
    env: 0.7,
    bloom: 0.25,
    stars: false,
    clouds: 0.45,
    cloudColor: '#ff9c78',
    rain: false,
    lightning: false,
    neon: false,
  },
  storm: {
    top: '#262c35',
    horizon: '#5c6672',
    bottom: '#3a4048',
    sun: [0.25, 0.85, 0.35],
    sunColor: '#b6c3d4',
    sunIntensity: 1.9,
    disc: null,
    hemiSky: '#8b97a8',
    hemiGround: '#272b31',
    hemi: 1.7,
    fog: '#68717c',
    fogNear: 35,
    fogFar: 180,
    exposure: 1.05,
    env: 0.6,
    bloom: 0.25,
    stars: false,
    clouds: 0.85,
    cloudColor: '#3c434d',
    rain: true,
    lightning: true,
    neon: false,
  },
  mist: {
    top: '#5f7668',
    horizon: '#9fae98',
    bottom: '#8e9c87',
    sun: [-0.45, 0.75, 0.45],
    sunColor: '#fff2d2',
    sunIntensity: 1.7,
    disc: { color: '#fffbe8', size: 0.03 },
    hemiSky: '#d2e2c8',
    hemiGround: '#34442a',
    hemi: 1.1,
    fog: '#86967f',
    fogNear: 14,
    fogFar: 115,
    exposure: 0.85,
    env: 0.6,
    bloom: 0.2,
    stars: false,
    clouds: 0.3,
    cloudColor: '#e4ecdc',
    rain: false,
    lightning: false,
    neon: false,
  },
  volcanic: {
    top: '#5c6f9a',
    horizon: '#e0a07a',
    bottom: '#7a4a38',
    sun: [0.45, 0.7, -0.5],
    sunColor: '#ffe2c4',
    sunIntensity: 2.4,
    disc: { color: '#fff0d8', size: 0.022 },
    hemiSky: '#ffd8bc',
    hemiGround: '#6e4c3e',
    hemi: 1.6,
    fog: '#b07a62',
    fogNear: 60,
    fogFar: 220,
    exposure: 1.0,
    env: 0.6,
    bloom: 0.1,
    stars: false,
    clouds: 0.4,
    cloudColor: '#c8a8a0',
    rain: false,
    lightning: false,
    neon: false,
  },
  space: {
    top: '#06081a',
    horizon: '#3a2e6a',
    bottom: '#0c0e22',
    sun: [0.5, 0.75, 0.2],
    sunColor: '#f2f4ff',
    sunIntensity: 2.6,
    disc: { color: '#ffffff', size: 0.02 },
    hemiSky: '#b4c0f0',
    hemiGround: '#50567a',
    hemi: 1.9,
    fog: '#1a1838',
    fogNear: 80,
    fogFar: 320,
    exposure: 1.0,
    env: 0.8,
    bloom: 0.1,
    stars: true,
    clouds: 0,
    cloudColor: '#000000',
    rain: false,
    lightning: false,
    neon: false,
  },
};

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 bottom;
  uniform vec3 sunDir;
  uniform vec3 discColor;
  uniform float discSize;
  uniform float cloudAmount;
  uniform vec3 cloudColor;
  uniform float time;
  uniform float flash;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += discColor * (smoothstep(1.0 - discSize, 1.0 - discSize * 0.6, s) * 1.6 + pow(s, 24.0) * 0.35);
    #ifdef CLOUDS
    if (h > 0.0 && cloudAmount > 0.0) {
      vec2 uv = d.xz / (h + 0.25) * 1.6 + vec2(time * 0.006, 0.0);
      float c = smoothstep(1.0 - cloudAmount, 1.0, fbm(uv * 1.3));
      col = mix(col, cloudColor + pow(s, 6.0) * 0.25, c * smoothstep(0.0, 0.25, h) * 0.85);
    }
    #endif
    col += flash * vec3(0.22, 0.24, 0.28);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * Stylized-but-grown-up lighting: per-map mood (sky with sun/moon, clouds, stars, fog, rain,
 * lightning), a sun whose shadow box follows the player, a mood-matched reflection map and bloom so
 * neon, lava and lights glow (High/Ultra only, so phones stay smooth).
 */
export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  quality: Quality;
  private readonly sun = new THREE.DirectionalLight('#ffffff', 2.5);
  private readonly hemi = new THREE.HemisphereLight('#cfe8ff', '#6b8f3a', 1.2);
  private readonly pmrem: THREE.PMREMGenerator;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null;
  private stars: THREE.Points | null = null;
  private rain: THREE.LineSegments | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private mood: MoodSpec = MOODS.day;
  private sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  private time = 0;
  private resolutionScale = 1;
  private sampleTime = 0;
  private sampleFrames = 0;
  private shadowFrame = 0;
  private goodWindows = 0;

  /** Reduce pixel work when sustained frame times miss the 60 Hz target. */
  sampleFrame(seconds: number) {
    if (seconds <= 0 || seconds > 0.2 || document.hidden) return;
    this.sampleTime += seconds;
    this.sampleFrames++;
    if (this.sampleTime < 3) return;
    const average = this.sampleTime / this.sampleFrames;
    this.sampleTime = this.sampleFrames = 0;
    this.goodWindows = average < .018 ? this.goodWindows + 1 : 0;
    const next = average > 0.024 ? Math.max(0.6, this.resolutionScale - 0.1) : this.goodWindows >= 4 ? Math.min(1, this.resolutionScale + .05) : this.resolutionScale;
    if (this.goodWindows >= 4) this.goodWindows = 0;
    if (next !== this.resolutionScale) {
      this.resolutionScale = next;
      this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, SETTINGS[this.quality].pixelRatio) * next);
      this.resize();
    }
  }
  private flash = 0;
  private nextLightning = 6;
  /** called when lightning strikes (for thunder) */
  onLightning?: () => void;
  /** player-chosen brightness multiplier (Settings) */
  private brightness = 0.85;

  setBrightness(b: number) {
    this.brightness = b;
    this.webgl.toneMappingExposure = this.mood.exposure * b;
  }

  constructor(
    canvas: HTMLCanvasElement,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    quality: Quality,
  ) {
    this.quality = quality;
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = THREE.PCFShadowMap;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.hemi);
    this.pmrem = new THREE.PMREMGenerator(this.webgl);
    this.applyQuality();
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.resolutionScale = 1;
    this.sampleTime = this.sampleFrames = 0;
    this.applyQuality();
    if (this.sky) this.buildSky();
    this.buildRain();
  }

  private applyQuality() {
    const s = SETTINGS[this.quality];
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, s.pixelRatio) * this.resolutionScale);
    this.webgl.shadowMap.autoUpdate = false;
    if (this.sun.castShadow !== s.shadows) {
      this.sun.castShadow = s.shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.sun.shadow.mapSize.set(s.shadowSize, s.shadowSize);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -s.shadowBox / 2;
    c.right = c.top = s.shadowBox / 2;
    c.near = 1;
    c.far = 300;
    c.updateProjectionMatrix();
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    if (s.bloom) {
      const composer = new EffectComposer(this.webgl);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const size = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
      this.bloomPass = new UnrealBloomPass(size, this.mood.bloom, 0.35, 0.9);
      composer.addPass(this.bloomPass);
      composer.addPass(new OutputPass());
      this.composer = composer;
    }
    this.resize();
  }

  resize() {
    this.webgl.setSize(window.innerWidth, window.innerHeight, false);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
  }

  get moodSpec() {
    return this.mood;
  }

  /** Sky, reflections, fog, light colours and weather for a map's mood. */
  setEnvironment(map: MapDef) {
    const m = MOODS[map.theme.mood];
    this.mood = m;
    this.sunDir.set(...m.sun).normalize();
    this.sun.color.set(m.sunColor);
    this.sun.intensity = m.sunIntensity;
    this.hemi.color.set(m.hemiSky);
    this.hemi.groundColor.set(m.hemiGround);
    this.hemi.intensity = m.hemi;
    this.scene.fog = new THREE.Fog(m.fog, m.fogNear, m.fogFar);
    this.webgl.toneMappingExposure = m.exposure * this.brightness;
    if (this.bloomPass) this.bloomPass.strength = m.bloom;
    this.buildSky();
    this.buildEnvMap();
    this.buildStars();
    this.buildRain();
    this.nextLightning = 4 + Math.random() * 6;
  }

  private buildSky() {
    if (this.sky) {
      this.scene.remove(this.sky);
      this.sky.geometry.dispose();
      this.sky.material.dispose();
    }
    const m = this.mood;
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      defines: SETTINGS[this.quality].clouds ? { CLOUDS: '' } : {},
      uniforms: {
        top: { value: new THREE.Color(m.top) },
        horizon: { value: new THREE.Color(m.horizon) },
        bottom: { value: new THREE.Color(m.bottom) },
        sunDir: { value: this.sunDir },
        discColor: { value: new THREE.Color(m.disc?.color ?? '#000000') },
        discSize: { value: m.disc?.size ?? 0.0001 },
        cloudAmount: { value: m.clouds },
        cloudColor: { value: new THREE.Color(m.cloudColor) },
        time: { value: 0 },
        flash: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  /** A small painted panorama of the mood, prefiltered for reflections on paint, glass and water. */
  private buildEnvMap() {
    const m = this.mood;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, m.top);
    grad.addColorStop(0.5, m.horizon);
    grad.addColorStop(1, m.bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    const az = Math.atan2(this.sunDir.z, this.sunDir.x);
    const el = Math.asin(this.sunDir.y);
    const sx = ((az / (Math.PI * 2) + 0.5) % 1) * 512;
    const sy = (0.5 - el / Math.PI) * 256;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 60);
    sg.addColorStop(0, m.sunColor);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, 512, 256);
    if (m.neon) {
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * 512;
        const y = 110 + Math.random() * 40;
        const col = ['#ff2bd6', '#2bf0ff', '#ffb02b', '#7a4bff'][i % 4];
        const ng = g.createRadialGradient(x, y, 0, x, y, 18 + Math.random() * 20);
        ng.addColorStop(0, col);
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ng;
        g.fillRect(x - 40, y - 40, 80, 80);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromEquirectangular(t);
    t.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = m.env;
  }

  private buildStars() {
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      this.stars = null;
    }
    if (!this.mood.stars) return;
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.08, Math.random() - 0.5).normalize().multiplyScalar(850);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  private buildRain() {
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      this.rain = null;
    }
    if (!this.mood.rain) return;
    const n = SETTINGS[this.quality].rain;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 70;
      const y = Math.random() * 30;
      const z = (Math.random() - 0.5) * 70;
      pos.set([x, y, z, x + 0.05, y + 0.7, z + 0.02], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#a9bdd4', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  /** Kept for API compatibility (nothing to set up per material). */
  prepare(_root: THREE.Object3D) {}

  render(focus: THREE.Vector3, dt = 1 / 60) {
    this.time += dt;
    if (this.sky) {
      this.sky.position.copy(this.camera.position);
      this.sky.material.uniforms.time.value = this.time;
    }
    if (this.stars) this.stars.position.copy(this.camera.position);

    // rain falls in a box that follows the camera
    if (this.rain) {
      const p = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const arr = p.array as Float32Array;
      const fall = 26 * dt;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= fall;
        arr[i + 4] -= fall;
        if (arr[i + 1] < 0) {
          arr[i + 1] += 30;
          arr[i + 4] += 30;
        }
      }
      p.needsUpdate = true;
      this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
    }

    // lightning: a quick double flash of sky + fill light
    if (this.mood.lightning) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.flash = 1;
        this.nextLightning = 7 + Math.random() * 9;
        this.onLightning?.();
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
      const f = this.flash > 0.5 ? 1 : this.flash > 0.25 ? 0.2 : this.flash * 2;
      if (this.sky) this.sky.material.uniforms.flash.value = f;
      this.hemi.intensity = this.mood.hemi + f * 0.9;
    }

    const s = SETTINGS[this.quality];
    const texel = s.shadowBox / s.shadowSize;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(this.sunDir, 120);
    this.sun.target.updateMatrixWorld();
    this.webgl.shadowMap.needsUpdate = this.quality === 'ultra' || ++this.shadowFrame % 3 === 0;
    if (this.composer) this.composer.render(dt);
    else this.webgl.render(this.scene, this.camera);
  }

  get info() {
    return this.webgl.info;
  }
}
