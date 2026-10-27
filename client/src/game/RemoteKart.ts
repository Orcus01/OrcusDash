import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { KART_BALL_RADIUS, type PlayerSnap } from '@kart/shared';
import { KartModel } from './KartModel';

interface Sample {
  t: number;
  p: THREE.Vector3;
  q: THREE.Quaternion;
  v: THREE.Vector3;
}

const MAX_EXTRAPOLATE_MS = 200;
const tmpQ = new THREE.Quaternion();

/**
 * Another player's kart, rendered slightly in the past and interpolated between server snapshots
 * so it moves smoothly despite network jitter.
 */
export class RemoteKart {
  readonly model: KartModel;
  private readonly body: RAPIER.RigidBody;
  private buffer: Sample[] = [];
  alive = false;
  hp = 100;
  name = '';
  shield = false;
  readonly position = new THREE.Vector3();
  private speed = 0;
  private prevYaw = 0;
  private steer = 0;

  constructor(
    readonly id: string,
    private readonly physics: RAPIER.World,
    scene: THREE.Scene,
    color: string,
  ) {
    this.model = new KartModel(color);
    this.model.root.visible = false;
    scene.add(this.model.root);
    // Kinematic collider so the local kart bumps into other players.
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -100, 0));
    physics.createCollider(RAPIER.ColliderDesc.ball(KART_BALL_RADIUS * 1.05).setFriction(0).setRestitution(0.3), this.body);
  }

  setInfo(name: string, color: string) {
    this.name = name;
    this.model.setColor(color);
    this.model.setNameplate(name, this.hp);
  }

  push(serverTime: number, s: PlayerSnap) {
    const wasAlive = this.alive;
    this.alive = s.a === 1;
    this.hp = s.hp;
    this.shield = s.sh === 1;
    this.model.setNameplate(this.name, this.hp);
    this.model.setShield(this.shield);
    this.model.setWeapon(this.alive ? s.w : null);
    if (!this.alive) {
      this.buffer = [];
      return;
    }
    if (!wasAlive) this.buffer = [];
    this.buffer.push({
      t: serverTime,
      p: new THREE.Vector3(s.p[0], s.p[1], s.p[2]),
      q: new THREE.Quaternion(s.q[0], s.q[1], s.q[2], s.q[3]).normalize(),
      v: new THREE.Vector3(s.v[0], s.v[1], s.v[2]),
    });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  /** Teleports (respawn): drop history so the kart doesn't glide across the map. */
  snapTo(p: THREE.Vector3, yaw: number, serverTime: number) {
    this.buffer = [{ t: serverTime, p: p.clone(), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), v: new THREE.Vector3() }];
  }

  update(renderTime: number, dt: number) {
    const visible = this.alive && this.buffer.length > 0;
    this.model.root.visible = visible;
    if (!visible) {
      this.body.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
      return;
    }

    const b = this.buffer;
    let p: THREE.Vector3;
    let q: THREE.Quaternion;
    let v: THREE.Vector3;
    if (renderTime <= b[0].t) {
      ({ p, q, v } = b[0]);
    } else if (renderTime >= b[b.length - 1].t) {
      const last = b[b.length - 1];
      const ahead = Math.min(renderTime - last.t, MAX_EXTRAPOLATE_MS) / 1000;
      p = last.p.clone().addScaledVector(last.v, ahead);
      const distance=last.v.length()*ahead;
      if(distance>.001) {
        const direction=last.v.clone().normalize();
        const obstruction=this.physics.castRay(new RAPIER.Ray({x:last.p.x,y:last.p.y+.12,z:last.p.z},direction),distance+.8,true,undefined,undefined,undefined,this.body,c=>c.parent()?.isFixed()??false);
        if(obstruction && obstruction.timeOfImpact<distance+.8)p.copy(last.p).addScaledVector(direction,Math.min(distance,Math.max(0,obstruction.timeOfImpact-.8)));
      }
      q = last.q;
      v = last.v;
    } else {
      let i = 0;
      while (i < b.length - 2 && b[i + 1].t < renderTime) i++;
      const a = b[i];
      const c = b[i + 1];
      const k = (renderTime - a.t) / Math.max(1, c.t - a.t);
      p = a.p.clone().lerp(c.p, k);
      q = tmpQ.copy(a.q).slerp(c.q, k);
      v = a.v.clone().lerp(c.v, k);
    }

    this.position.copy(p);
    this.model.root.position.set(p.x, p.y - KART_BALL_RADIUS, p.z);
    this.model.root.quaternion.copy(q);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });

    const ground=this.physics.castRay(new RAPIER.Ray({x:p.x,y:p.y,z:p.z},{x:0,y:-1,z:0}),1.3,true,undefined,undefined,undefined,this.body,c=>c.parent()?.isFixed()??false);
    this.model.setContactShadow(!!ground,ground ? ground.timeOfImpact-KART_BALL_RADIUS : Infinity);
    // Derive wheel spin + steering from motion.
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    this.speed = v.x * fwd.x + v.z * fwd.z;
    const yaw = Math.atan2(fwd.x, fwd.z);
    let dYaw = yaw - this.prevYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.prevYaw = yaw;
    const targetSteer = dt > 0 ? THREE.MathUtils.clamp((-dYaw / dt) / 2.4, -1, 1) : 0;
    this.steer = THREE.MathUtils.lerp(this.steer, targetSteer, 1 - Math.exp(-10 * dt));
    this.model.animate(dt, this.speed, this.steer, 0);
  }

  get forwardSpeed() {
    return this.speed;
  }

  dispose() {
    this.physics.removeRigidBody(this.body);
    this.model.dispose();
  }
}
