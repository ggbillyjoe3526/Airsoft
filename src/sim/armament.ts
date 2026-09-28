import type { BallisticsConfig } from '../config/ballistics';
import type { ReplicaConfig } from '../config/replicas';
import { RECOIL, TRIGGER } from '../config/replicas';
import { type BBPool, spawnBB } from './ballistics';
import type { PlayerCommand } from './commands';
import type { GameEvent } from './events';
import { type RngState, rngGaussian } from './rng';
import { type Vec3, vec3 } from './vec';

/** Ammo carried for one replica. */
export interface ReplicaAmmo {
  mag: number;
  reserve: number;
}

/** A character's replicas and what they're doing. Plain data. */
export interface Armament {
  ammo: ReplicaAmmo[];
  active: number;
  /** Seconds until the next shot is allowed (can go slightly negative to keep auto fire rate exact). */
  cooldown: number;
  /** Seconds left on the current reload, 0 when not reloading. */
  reload: number;
  /** Seconds left bringing the active replica up after a switch. */
  draw: number;
  /** Seconds left to honour a semi-auto trigger press that came in while the replica wasn't ready. */
  pendingPress: number;
  /** Trigger state last tick, for semi-auto press detection. */
  triggerWasDown: boolean;
  /** Current upward aim kick from recoil (radians). */
  recoil: number;
}

export function createArmament(loadout: readonly ReplicaConfig[]): Armament {
  return {
    ammo: loadout.map((r) => ({ mag: r.magSize, reserve: r.reserve })),
    active: 0,
    cooldown: 0,
    reload: 0,
    draw: 0,
    pendingPress: 0,
    triggerWasDown: false,
    recoil: 0,
  };
}

/** Where a shot starts and which way it's aimed, before spread. Supplied by the caller. */
export interface Muzzle {
  eye: Vec3;
  yaw: number;
  pitch: number;
}

/** Level geometry queries the armament needs. */
export interface WorldQuery {
  /** Distance to the first static surface along unit `dir`, or -1 if none within `maxDist`. */
  raycastStatic(origin: Vec3, dir: Vec3, maxDist: number): number;
}

export interface ArmamentContext {
  loadout: readonly ReplicaConfig[];
  ballistics: BallisticsConfig;
  bbs: BBPool;
  rng: RngState;
  query: WorldQuery;
  events: GameEvent[];
}

const DEG = Math.PI / 180;
const dir = vec3();
const muzzlePoint = vec3();

/** Unit aim direction for yaw/pitch (yaw 0 = -Z, positive pitch = up). */
export function aimDirection(out: Vec3, yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export function isReloading(a: Armament): boolean {
  return a.reload > 0;
}

/**
 * One tick of replica handling for one character: switching, reloading, firing and recoil.
 * `canFire` is false while sprinting (or just after) — the replica is carried, not aimed.
 */
export function stepArmament(
  characterId: number,
  a: Armament,
  cmd: PlayerCommand,
  muzzle: Muzzle,
  canFire: boolean,
  ctx: ArmamentContext,
  dt: number,
): void {
  a.recoil *= Math.exp(-dt / RECOIL.recoveryTime);
  a.cooldown = Math.max(-dt, a.cooldown - dt);
  a.pendingPress = Math.max(0, a.pendingPress - dt);
  if (a.draw > 0) a.draw = Math.max(0, a.draw - dt);

  let replica = ctx.loadout[a.active]!;
  let ammo = a.ammo[a.active]!;

  if (a.reload > 0) {
    a.reload -= dt;
    if (a.reload <= 0) {
      a.reload = 0;
      const moved = Math.min(replica.magSize - ammo.mag, ammo.reserve);
      ammo.mag += moved;
      ammo.reserve -= moved;
      ctx.events.push({ type: 'reloadEnd', characterId, replicaId: replica.id });
    }
  }

  // Switching cancels a reload (the magazine you were swapping stays as it was).
  if (cmd.switchTo >= 0 && cmd.switchTo < ctx.loadout.length && cmd.switchTo !== a.active) {
    a.active = cmd.switchTo;
    a.reload = 0;
    replica = ctx.loadout[a.active]!;
    ammo = a.ammo[a.active]!;
    a.draw = replica.drawTime;
    ctx.events.push({ type: 'draw', characterId, replicaId: replica.id });
  }

  const ready = a.draw <= 0 && a.reload <= 0;
  if (cmd.reload && ready && ammo.mag < replica.magSize && ammo.reserve > 0) startReload(characterId, a, replica, ctx);

  const pressed = cmd.fire && !a.triggerWasDown;
  a.triggerWasDown = cmd.fire;
  // Semi-auto presses are buffered briefly so a click during the cooldown still fires when ready.
  if (pressed) a.pendingPress = TRIGGER.pressBuffer;
  const wantsShot = replica.fireMode === 'auto' ? cmd.fire : a.pendingPress > 0;
  if (!wantsShot || !canFire || a.draw > 0 || a.reload > 0 || a.cooldown > 0) return;

  if (ammo.mag <= 0) {
    // Empty: a dry-fire click on the trigger press, then reload automatically if there's ammo.
    if (pressed || a.pendingPress > 0) {
      a.pendingPress = 0;
      ctx.events.push({ type: 'dryFire', characterId, replicaId: replica.id });
      if (ammo.reserve > 0) startReload(characterId, a, replica, ctx);
    }
    return;
  }

  a.pendingPress = 0;
  ammo.mag--;
  a.cooldown += 1 / replica.fireRate;
  fire(characterId, a, replica, muzzle, ctx);
}

function startReload(characterId: number, a: Armament, replica: ReplicaConfig, ctx: ArmamentContext): void {
  a.reload = replica.reloadTime;
  ctx.events.push({ type: 'reloadStart', characterId, replicaId: replica.id });
}

function fire(characterId: number, a: Armament, replica: ReplicaConfig, muzzle: Muzzle, ctx: ArmamentContext): void {
  const spread = replica.spreadDeg * DEG;
  const yaw = muzzle.yaw + rngGaussian(ctx.rng) * spread;
  const pitch = muzzle.pitch + a.recoil + rngGaussian(ctx.rng) * spread;
  aimDirection(dir, yaw, pitch);
  a.recoil = Math.min(RECOIL.maxDeg * DEG, a.recoil + replica.recoilDeg * DEG);
  ctx.events.push({ type: 'shot', characterId, replicaId: replica.id, position: vec3(muzzle.eye.x, muzzle.eye.y, muzzle.eye.z) });

  // The BB leaves a little ahead of the eye; if cover is closer than that, it hits the cover.
  const offset = ctx.ballistics.muzzleOffset;
  const blocked = ctx.query.raycastStatic(muzzle.eye, dir, offset);
  if (blocked >= 0) {
    ctx.events.push({
      type: 'bbImpact',
      position: vec3(muzzle.eye.x + dir.x * blocked, muzzle.eye.y + dir.y * blocked, muzzle.eye.z + dir.z * blocked),
    });
    return;
  }
  muzzlePoint.x = muzzle.eye.x + dir.x * offset;
  muzzlePoint.y = muzzle.eye.y + dir.y * offset;
  muzzlePoint.z = muzzle.eye.z + dir.z * offset;
  spawnBB(ctx.bbs, characterId, muzzlePoint, dir, replica.muzzleVelocity, replica.hopUp);
}
