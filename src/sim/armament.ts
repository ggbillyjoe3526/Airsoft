import type { BallisticsConfig } from '../config/ballistics';
import type { ReplicaConfig } from '../config/replicas';
import { RECOIL, TRIGGER } from '../config/replicas';
import { type BBPool, spawnBB } from './ballistics';
import type { PlayerCommand } from './commands';
import type { GameEvent } from './events';
import { type RngState, rngGaussian } from './rng';
import { type Vec3, vec3 } from './vec';

/**
 * Magazines carried for one replica: the one loaded and the spares in the pouch, each with however many
 * BBs it has left. A reload swaps the loaded mag for the fullest spare and puts the old one back in the
 * pouch as it is (no topping up); empties stay empty. Nothing refills during a round.
 */
export interface ReplicaAmmo {
  /** BBs in the loaded magazine. */
  mag: number;
  /** BBs in each spare magazine (fixed length; a slot is never removed, only swapped). */
  pouch: number[];
}

/** Index of the fullest spare magazine, or -1 if the pouch is empty. */
export function fullestSpare(ammo: ReplicaAmmo): number {
  let best = -1;
  for (let i = 0; i < ammo.pouch.length; i++) if (best < 0 || ammo.pouch[i]! > ammo.pouch[best]!) best = i;
  return best;
}

/**
 * The spare magazine a reload would take: the fullest, if it has more BBs than the loaded one; else -1
 * (a reload wouldn't help, so none happens). The HUD marks this one.
 */
export function nextSpare(ammo: ReplicaAmmo): number {
  const best = fullestSpare(ammo);
  return best >= 0 && ammo.pouch[best]! > ammo.mag ? best : -1;
}

/** True if a reload would give more BBs than the loaded mag has (see nextSpare). */
export function canReload(ammo: ReplicaAmmo): boolean {
  return nextSpare(ammo) >= 0;
}

/** BBs left in all the spare magazines together. */
export function spareBBs(ammo: ReplicaAmmo): number {
  let n = 0;
  for (const m of ammo.pouch) n += m;
  return n;
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
  /** True once this trigger pull has clicked dry, so a held trigger clicks only once per pull. */
  dryFiredThisPull: boolean;
  /** Trigger state last tick, for semi-auto press detection. */
  triggerWasDown: boolean;
  /** Current upward aim kick from recoil (radians). */
  recoil: number;
}

export function createArmament(loadout: readonly ReplicaConfig[]): Armament {
  return {
    ammo: loadout.map((r) => ({ mag: r.magSize, pouch: Array.from({ length: Math.max(0, r.mags - 1) }, () => r.magSize) })),
    active: 0,
    cooldown: 0,
    reload: 0,
    draw: 0,
    pendingPress: 0,
    dryFiredThisPull: false,
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

/** Unit aim direction for yaw/pitch (yaw 0 = -Z, positive pitch = up). */
export function aimDirection(out: Vec3, yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
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
      // Swap: the fullest spare goes in, the old magazine goes back in the pouch as it is.
      const best = nextSpare(ammo);
      if (best >= 0) {
        const loaded = ammo.mag;
        ammo.mag = ammo.pouch[best]!;
        ammo.pouch[best] = loaded;
      }
      a.dryFiredThisPull = false; // a fresh magazine: running it dry again clicks (and reloads) again
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
  if (cmd.reload && ready) {
    if (canReload(ammo)) startReload(characterId, a, replica, ctx);
    // Nothing fuller to swap in: say so, unless the magazine is full anyway (then R obviously does nothing).
    else if (ammo.mag < replica.magSize) ctx.events.push({ type: 'reloadRefused', characterId, replicaId: replica.id });
  }

  const pressed = cmd.fire && !a.triggerWasDown;
  a.triggerWasDown = cmd.fire;
  if (!cmd.fire) a.dryFiredThisPull = false;
  // Semi-auto presses are buffered briefly so a click during the cooldown still fires when ready.
  if (pressed) a.pendingPress = TRIGGER.pressBuffer;
  const wantsShot = replica.fireMode === 'auto' ? cmd.fire : a.pendingPress > 0;
  if (!wantsShot || !canFire || a.draw > 0 || a.reload > 0 || a.cooldown > 0) return;

  if (ammo.mag <= 0) {
    // Empty: one dry click per trigger pull (a held AEG trigger clicks when the mag runs dry), then
    // reload automatically if a spare has BBs in it.
    const click = replica.fireMode === 'auto' ? !a.dryFiredThisPull : pressed || a.pendingPress > 0;
    if (click) {
      a.dryFiredThisPull = true;
      a.pendingPress = 0;
      ctx.events.push({ type: 'dryFire', characterId, replicaId: replica.id });
      if (canReload(ammo)) startReload(characterId, a, replica, ctx);
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

  // The BB's path starts at the eye: its first step then catches cover right in front of the shooter
  // and anyone standing point-blank (even overlapping the shooter), and it never hits its owner.
  // Presentation draws it leaving the replica's muzzle.
  spawnBB(ctx.bbs, characterId, muzzle.eye, dir, replica.muzzleVelocity, replica.hopUp);
}
