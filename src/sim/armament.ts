import type { BallisticsConfig } from '../config/ballistics';
import type { OpticId } from '../config/optics';
import type { ReplicaConfig } from '../config/replicas';
import { BB_WEIGHT, bbMass, type FireMode, HOP_UP, hopUpLift, muzzleVelocity, RECOIL, TRIGGER } from '../config/replicas';
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
  /** Each replica's fire selector setting (one of its fireModes), by loadout slot. */
  modes: FireMode[];
  /** BBs still to come in the burst under way (0 when none is). */
  burstShotsLeft: number;
  /** The optic fitted to each replica (null: none, iron sights), by loadout slot. Fitted before a round, kept between rounds. */
  optics: (OpticId | null)[];
  /** Each replica's hop-up dial (0..1, see ReplicaConfig.hopUpDial), by loadout slot. Set before a round, kept between rounds. */
  hopUps: number[];
  /** The BB weight each replica shoots (grams, see ReplicaConfig.bbWeight), by loadout slot. Set before a match, kept between rounds. */
  bbWeights: number[];
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
    modes: loadout.map((r) => r.defaultFireMode),
    burstShotsLeft: 0,
    optics: loadout.map(() => null),
    hopUps: loadout.map((r) => r.hopUpDial),
    bbWeights: loadout.map((r) => r.bbWeight),
  };
}

/** Sets the BB weight each replica shoots (grams, by loadout slot; missing slots and weights not offered keep theirs). */
export function setBbWeights(a: Armament, grams: readonly number[]): void {
  for (let i = 0; i < a.bbWeights.length && i < grams.length; i++) {
    const g = grams[i]!;
    if ((BB_WEIGHT.choices as readonly number[]).includes(g)) a.bbWeights[i] = g;
  }
}

/** Sets each replica's hop-up dial (by loadout slot; missing slots keep theirs), kept within the dial's range. */
export function setHopUps(a: Armament, dials: readonly number[]): void {
  for (let i = 0; i < a.hopUps.length && i < dials.length; i++) {
    const d = dials[i]!;
    if (Number.isFinite(d)) a.hopUps[i] = Math.min(HOP_UP.maxDial, Math.max(HOP_UP.minDial, d));
  }
}

/** Fits `optic` (or nothing) to every replica in the loadout that has an optic mount. */
export function fitOptic(a: Armament, loadout: readonly ReplicaConfig[], optic: OpticId | null): void {
  for (let i = 0; i < loadout.length; i++) a.optics[i] = loadout[i]!.opticMount ? optic : null;
}

/** The fire selector's next setting for this replica (wrapping round), or `mode` itself if it has only one. */
export function nextFireMode(replica: ReplicaConfig, mode: FireMode): FireMode {
  const modes = replica.fireModes;
  const i = modes.indexOf(mode);
  return modes[(i + 1) % modes.length] ?? replica.defaultFireMode;
}

/** Where a shot starts and which way it's aimed, before spread. Supplied by the caller. */
export interface Muzzle {
  eye: Vec3;
  yaw: number;
  pitch: number;
  /** The shooter's stance and movement multiplier on the replica's spread (sim/accuracy.ts). */
  spreadScale: number;
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
    a.dryFiredThisPull = false; // a dry click on the other replica doesn't count for this one
    a.burstShotsLeft = 0;
    ctx.events.push({ type: 'draw', characterId, replicaId: replica.id });
  }

  // The fire selector: steps through the replica's modes (a single-mode replica has nothing to change).
  if (cmd.cycleFireMode && replica.fireModes.length > 1) {
    const mode = nextFireMode(replica, a.modes[a.active]!);
    a.modes[a.active] = mode;
    a.burstShotsLeft = 0;
    ctx.events.push({ type: 'fireMode', characterId, replicaId: replica.id, mode });
  }
  const mode = a.modes[a.active]!;

  const ready = a.draw <= 0 && a.reload <= 0;
  if (cmd.reload && ready) {
    if (canReload(ammo)) startReload(characterId, a, replica, ctx);
    // Nothing fuller to swap in: say so, unless the magazine is full anyway (then R obviously does nothing).
    else if (ammo.mag < replica.magSize) ctx.events.push({ type: 'reloadRefused', characterId, replicaId: replica.id });
  }

  const pressed = cmd.fire && !a.triggerWasDown;
  a.triggerWasDown = cmd.fire;
  if (!cmd.fire) a.dryFiredThisPull = false;
  // Semi-auto and burst presses are buffered briefly so a click during the cooldown still fires when ready.
  if (pressed) a.pendingPress = TRIGGER.pressBuffer;
  // A burst runs to the end once started (one pull, several BBs), unless the replica can't fire.
  if (a.burstShotsLeft > 0 && (!canFire || a.draw > 0 || a.reload > 0)) a.burstShotsLeft = 0;
  if (mode === 'burst') {
    // A pull during a burst doesn't queue another: one pull, one burst (a pull just after it ends is buffered).
    if (a.burstShotsLeft > 0) a.pendingPress = 0;
    else if (a.pendingPress > 0 && canFire && a.draw <= 0 && a.reload <= 0 && a.cooldown <= 0) {
      a.burstShotsLeft = TRIGGER.burstShots;
      a.pendingPress = 0;
    }
  }
  const wantsShot = mode === 'auto' ? cmd.fire : mode === 'burst' ? a.burstShotsLeft > 0 : a.pendingPress > 0;
  if (!wantsShot || !canFire || a.draw > 0 || a.reload > 0 || a.cooldown > 0) return;

  if (ammo.mag <= 0) {
    // Empty: one dry click per trigger pull (a held AEG trigger clicks when the mag runs dry; a burst that
    // runs dry clicks once and ends), then reload automatically if a spare has BBs in it.
    const click = mode === 'auto' ? !a.dryFiredThisPull : mode === 'burst' || pressed || a.pendingPress > 0;
    a.burstShotsLeft = 0;
    if (click) {
      a.dryFiredThisPull = true;
      a.pendingPress = 0;
      ctx.events.push({ type: 'dryFire', characterId, replicaId: replica.id });
      if (canReload(ammo)) startReload(characterId, a, replica, ctx);
    }
    return;
  }

  a.pendingPress = 0;
  if (a.burstShotsLeft > 0) a.burstShotsLeft--;
  ammo.mag--;
  a.cooldown += 1 / replica.fireRate;
  fire(characterId, a, replica, muzzle, ctx);
}

function startReload(characterId: number, a: Armament, replica: ReplicaConfig, ctx: ArmamentContext): void {
  a.reload = replica.reloadTime;
  ctx.events.push({ type: 'reloadStart', characterId, replicaId: replica.id });
}

function fire(characterId: number, a: Armament, replica: ReplicaConfig, muzzle: Muzzle, ctx: ArmamentContext): void {
  const spread = replica.spreadDeg * muzzle.spreadScale * DEG;
  const yaw = muzzle.yaw + rngGaussian(ctx.rng) * spread;
  const pitch = muzzle.pitch + a.recoil + rngGaussian(ctx.rng) * spread;
  aimDirection(dir, yaw, pitch);
  a.recoil = Math.min(RECOIL.maxDeg * DEG, a.recoil + replica.recoilDeg * DEG);
  ctx.events.push({ type: 'shot', characterId, replicaId: replica.id, position: vec3(muzzle.eye.x, muzzle.eye.y, muzzle.eye.z) });

  // The BB's path starts at the eye: its first step then catches cover right in front of the shooter
  // and anyone standing point-blank (even overlapping the shooter), and it never hits its owner.
  // Presentation draws it leaving the replica's muzzle.
  const grams = a.bbWeights[a.active] ?? replica.bbWeight;
  spawnBB(ctx.bbs, characterId, muzzle.eye, dir, muzzleVelocity(replica, grams), hopUpLift(replica, a.hopUps[a.active] ?? replica.hopUpDial), bbMass(replica, grams));
}
