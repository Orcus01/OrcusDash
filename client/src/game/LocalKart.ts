import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { KART_BALL_RADIUS } from '@kart/shared';
import { KartModel } from './KartModel';
import { Nitro } from './Nitro';

const R = KART_BALL_RADIUS;
const MAX_SPEED = 11.5;
const BOOST_SPEED = 15;
const MAX_REVERSE = 6;
const ACCEL = 13;
const BRAKE = 34;
const COAST = 5;
const TURN_RATE = 3.7;
const GRIP = 10;
const DRIFT_GRIP = 2.0;
const ICE_GRIP = 1.3;
const HOP_SPEED = 4.2;
const MINI_TURBO_TIME = 0.9;
const BOOST_PAD_TIME = 1.2;

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

export interface DriveInput {
  throttle: number;
  steer: number;
  drift: boolean;
  nitro?: boolean;
}

export type SurfaceQuery = (x: number, z: number) => { kind: 'ice' | 'boost' | 'water' | 'lava' | null; dir?: number };

/**
 * The player's own kart. Arcade handling on top of a Rapier ball: we steer a heading and
 * directly shape the ball's horizontal velocity (strong sideways grip, looser while drifting).
 */
export class LocalKart {
  readonly model: KartModel;
  readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly chassis: RAPIER.Collider;

  yaw = 0;
  forwardSpeed = 0;
  grounded = false;
  drifting = false;
  boosting = 0;
  readonly nitro = new Nitro();
  onNitro?: () => void;
  onBigAir?: (seconds: number) => void;
  alive = false;
  boundaryHalf = Infinity;
  steerInput = 0;
  /** Called when the kart lands after a jump (for dust/sfx). */
  onLand?: (pos: THREE.Vector3, impact: number) => void;
  /** Called when the kart rolls over a boost pad. */
  onBoostPad?: () => void;
  /** Called when the kart drives into lava. */
  onLava?: () => void;
  surface: SurfaceQuery = () => ({ kind: null });
  onIce = false;
  onWater = false;
  get driftCharged() {
    return this.drifting && this.driftTime > MINI_TURBO_TIME;
  }

  get driftCharge() {
    return this.drifting ? Math.min(1, this.driftTime / MINI_TURBO_TIME) : 0;
  }

  private driftDir = 0;
  private driftTime = 0;
  private driftHeld = false;
  private airTime = 0;
  private groundDistance = Infinity;
  private lastVy = 0;
  private readonly normal = new THREE.Vector3(0, 1, 0);
  private readonly smoothUp = new THREE.Vector3(0, 1, 0);
  private readonly prevPos = new THREE.Vector3();
  private readonly curPos = new THREE.Vector3();
  private roll = 0;
  private pitch = 0;

  constructor(
    private readonly physics: RAPIER.World,
    scene: THREE.Scene,
    color: string,
  ) {
    this.body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -50, 0).lockRotations().setCcdEnabled(true).setLinearDamping(0.05),
    );
    this.collider = physics.createCollider(
      RAPIER.ColliderDesc.ball(R).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0.05).setDensity(1.5),
      this.body,
    );
    this.chassis = physics.createCollider(
      RAPIER.ColliderDesc.cuboid(0.65, 0.22, 0.9).setTranslation(0, 0.12, 0).setFriction(0).setRestitution(0),
      this.body,
    );
    this.body.setEnabled(false);
    this.model = new KartModel(color);
    this.model.root.visible = false;
    scene.add(this.model.root);
  }

  get position(): THREE.Vector3 {
    return this.curPos;
  }

  get velocity(): THREE.Vector3 {
    const v = this.body.linvel();
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  /** Unit vector the kart's nose points along (follows slopes). */
  get aimDirection(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.root.quaternion).normalize();
  }

  teleport(p: THREE.Vector3, yaw: number) {
    this.body.setEnabled(true);
    this.body.setTranslation({ x: p.x, y: p.y + 0.05, z: p.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.yaw = yaw;
    this.chassis.setRotationWrtParent({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    this.forwardSpeed = 0;
    this.drifting = false;
    this.boosting = 0;
    this.nitro.reset();
    this.driftHeld = false;
    this.driftTime = 0;
    this.airTime = 0;
    this.prevPos.set(p.x, p.y, p.z);
    this.curPos.copy(this.prevPos);
    this.smoothUp.copy(UP);
    this.alive = true;
    this.model.root.visible = true;
    this.syncVisual(1, 0);
  }

  kill() {
    this.alive = false;
    this.model.root.visible = false;
    this.body.setEnabled(false);
    this.model.setShield(false);
  }

  /** Correction from the server (anti-cheat rejected our position). */
  correct(p: THREE.Vector3) {
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.prevPos.copy(p);
    this.curPos.copy(p);
  }

  knockback(dir: THREE.Vector3, strength: number) {
    const v = this.body.linvel();
    this.body.setLinvel({ x: v.x + dir.x * strength, y: v.y + Math.max(2, dir.y * strength), z: v.z + dir.z * strength }, true);
  }

  /** Runs before each physics step. */
  fixedUpdate(dt: number, input: DriveInput, enabled: boolean) {
    if (!this.alive) return;
    const t = this.body.translation();
    const v = this.body.linvel();

    const ray = new RAPIER.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 });
    const hit = this.physics.castRayAndGetNormal(ray, R + 1, true, undefined, undefined, this.collider, this.body);
    this.groundDistance = hit ? hit.timeOfImpact - R : Infinity;
    const wasGrounded = this.grounded;
    this.grounded = !!hit && hit.timeOfImpact <= R + 0.22;
    if (hit && this.grounded) this.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    else this.normal.copy(UP);

    if (this.grounded && !wasGrounded && this.airTime > 0.25) this.onLand?.(this.curPos.clone(), Math.min(1, -this.lastVy / 15));
    if (enabled && this.grounded && !wasGrounded && this.airTime > 0.65 && Math.hypot(v.x,v.z)>6) {
      this.nitro.reward(0.25);
      this.onBigAir?.(this.airTime);
    }
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    this.lastVy = v.y;

    const throttle = enabled ? input.throttle : 0;
    const steer = enabled ? input.steer : 0;
    this.steerInput = steer;

    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    let f = v.x * fwd.x + v.z * fwd.z;
    let l = v.x * right.x + v.z * right.z;

    // --- drifting: hop on press, slide while held, mini-turbo on release
    const driftPressed = enabled && input.drift;
    if (driftPressed && !this.driftHeld && this.grounded) {
      this.body.setLinvel({ x: v.x, y: HOP_SPEED, z: v.z }, true);
      v.y = HOP_SPEED;
    }
    if (driftPressed && !this.drifting && Math.abs(steer) > 0.3 && f > 6) {
      this.drifting = true;
      this.driftDir = Math.sign(steer);
      this.driftTime = 0;
    }
    if (this.drifting) {
      this.driftTime += dt;
      if (!driftPressed || f < 5) {
        if (this.driftTime > MINI_TURBO_TIME && f >= 5) this.boosting = 0.8;
        this.drifting = false;
      }
    }
    this.driftHeld = driftPressed;
    this.boosting = Math.max(0, this.boosting - dt);

    const wasNitro = this.nitro.active;
    this.nitro.step(dt, enabled && !!input.nitro && throttle > 0, enabled);
    if (this.nitro.active && throttle > 0) {
      this.boosting = Math.max(this.boosting, 0.08);
      if (!wasNitro) this.onNitro?.();
    }

    // --- special surfaces
    const surf = this.grounded ? this.surface(t.x, t.z) : { kind: null };
    this.onIce = surf.kind === 'ice';
    this.onWater = surf.kind === 'water';
    if (surf.kind === 'lava') this.onLava?.();
    if (surf.kind === 'boost') {
      if (this.boosting < BOOST_PAD_TIME - 0.2) this.onBoostPad?.();
      this.boosting = Math.max(this.boosting, BOOST_PAD_TIME);
    }

    // --- steering (reverses when backing up, needs some speed to turn)
    const speedFactor = THREE.MathUtils.clamp(Math.abs(f) / 3, 0, 1);
    const dirSign = f >= -0.5 ? 1 : -1;
    let turn: number;
    if (this.drifting) turn = TURN_RATE * (this.driftDir * 0.7 + steer * 0.5);
    else turn = TURN_RATE * steer;
    turn *= speedFactor * dirSign * (this.grounded ? 1 : 0.5);
    this.yaw -= turn * dt;
    this.chassis.setRotationWrtParent({ x: 0, y: Math.sin(this.yaw / 2), z: 0, w: Math.cos(this.yaw / 2) });

    if (this.grounded) {
      const top = (this.boosting > 0 ? BOOST_SPEED : MAX_SPEED) * (surf.kind === 'water' ? 0.6 : 1);
      const speedCeiling = Math.max(top, f - BRAKE * 0.5 * dt);
      if (this.boosting > 0) f += ACCEL * 1.6 * dt;
      const accel = this.onIce ? ACCEL * 0.55 : ACCEL;
      if (throttle > 0) f += (f < 0 ? BRAKE : accel) * throttle * dt;
      else if (throttle < 0) f -= (f > 0.5 ? BRAKE : ACCEL * 0.7) * -throttle * dt;
      else f -= Math.sign(f) * Math.min(Math.abs(f), COAST * dt);
      f = Math.min(f, speedCeiling);
      f = Math.max(-MAX_REVERSE, f);
      l *= Math.exp(-(this.onIce ? ICE_GRIP : this.drifting ? DRIFT_GRIP : GRIP) * dt);

      const nf = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const nr = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      this.body.setLinvel({ x: nf.x * f + nr.x * l, y: v.y, z: nf.z * f + nr.z * l }, true);
    }
    this.forwardSpeed = f;
  }

  /** Runs after each physics step. */
  afterStep() {
    if (!this.alive) return;
    let t = this.body.translation();
    const limit = this.boundaryHalf - 1;
    const x = THREE.MathUtils.clamp(t.x, -limit, limit);
    const z = THREE.MathUtils.clamp(t.z, -limit, limit);
    if (x !== t.x || z !== t.z) {
      const v = this.body.linvel();
      this.body.setTranslation({ x, y: t.y, z }, true);
      this.body.setLinvel({ x: x !== t.x ? 0 : v.x, y: v.y, z: z !== t.z ? 0 : v.z }, true);
      t = this.body.translation();
    }
    this.prevPos.copy(this.curPos);
    this.curPos.set(t.x, t.y, t.z);
  }

  /** Interpolates between physics steps and orients the model to the ground. */
  syncVisual(alpha: number, dt: number) {
    if (!this.alive) return;
    tmpV.lerpVectors(this.prevPos, this.curPos, alpha);
    this.model.root.position.set(tmpV.x, tmpV.y - R, tmpV.z);

    this.smoothUp.lerp(this.normal, 1 - Math.exp(-10 * dt)).normalize();
    const vy = this.body.linvel().y;
    const targetPitch = this.grounded ? 0 : THREE.MathUtils.clamp(-vy * 0.03, -0.35, 0.35);
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 1 - Math.exp(-6 * dt));
    const targetRoll = this.drifting ? this.driftDir * 0.12 : this.steerInput * Math.min(1, Math.abs(this.forwardSpeed) / 15) * 0.07;
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 1 - Math.exp(-8 * dt));

    tmpQ.setFromUnitVectors(UP, this.smoothUp);
    tmpQ2.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.model.root.quaternion.copy(tmpQ).multiply(tmpQ2);
    const visualSteer = this.drifting ? this.driftDir * 0.6 + this.steerInput * 0.4 : this.steerInput;
    this.model.setContactShadow(Number.isFinite(this.groundDistance),this.groundDistance);
    this.model.animate(dt, this.forwardSpeed, visualSteer, this.roll);
    this.model.setBoostGlow(this.boosting > 0 ? 1 : this.driftCharged ? 0.4 : 0);
  }

  /** World positions of the rear wheels (for drift sparks / exhaust). */
  rearPoints(): THREE.Vector3[] {
    const q = this.model.root.quaternion;
    const base = this.model.root.position;
    return [new THREE.Vector3(0.5, 0.04, -0.48), new THREE.Vector3(-0.5, 0.04, -0.48)].map((p) => p.applyQuaternion(q).add(base));
  }

  exhaustPoint(): THREE.Vector3 {
    return new THREE.Vector3(0.1, 0.36, -0.83).applyQuaternion(this.model.root.quaternion).add(this.model.root.position);
  }

  dispose() {
    this.physics.removeRigidBody(this.body);
    this.model.dispose();
  }
}
