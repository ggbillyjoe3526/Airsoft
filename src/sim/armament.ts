import { factoryParts, type Handling, handlingOf, partsFor, type ReplicaParts } from '../config/attachments';
import type { BallisticsConfig } from '../config/ballistics';
import type { OpticId } from '../config/optics';
import type { ReplicaConfig } from '../config/replicas';
import type { ImpactMaterial } from '../config/sounds';
import { bbMass, type FireMode, HOP_UP, hopUpLift, muzzleVelocity, RECOIL, TRIGGER, validBbWeight } from '../config/replicas';
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
  /**
   * The replica in each loadout slot, as this character carries it (M26b): the player's replicas with their rarity,
   * power source and laser worked in (pool/kit.ts), the bots' as they come. Read these, never a shared list.
   */
  replicas: ReplicaConfig[];
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
  /** A reload pressed while the replica was still coming up: it starts once the draw is over (bug pass). */
  reloadQueued: boolean;
  /** True once this trigger pull has clicked dry, so a held trigger clicks only once per pull. */
  dryFiredThisPull: boolean;
  /** Trigger state last tick, for semi-auto press detection. */
  triggerWasDown: boolean;
  /** Shots never use up the magazine: the Dev settings' Bottomless magazines (M24). Kept between rounds. */
  bottomless: boolean;
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
  /** The grip and magazine fitted to each replica (config/attachments.ts), by loadout slot. Set before a match, kept between rounds. */
  parts: ReplicaParts[];
  /** What those parts make of each replica (magazine size and count, reload, draw …): read these, not the replica's own. */
  handling: Handling[];
}

/** Full magazines for one replica: the loaded one and the spares. */
function fullAmmo(h: Handling): ReplicaAmmo {
  return { mag: h.magSize, pouch: Array.from({ length: Math.max(0, h.mags - 1) }, () => h.magSize) };
}

/** A fresh armament: full magazines, everything as each replica comes unless `parts` (by slot) says otherwise. */
export function createArmament(loadout: readonly ReplicaConfig[], parts: readonly ReplicaParts[] = []): Armament {
  const fitted = loadout.map((r, i) => partsFor(r, parts[i] ?? factoryParts(r)));
  const handling = loadout.map((r, i) => handlingOf(r, fitted[i]!));
  return {
    replicas: [...loadout],
    ammo: handling.map(fullAmmo),
    active: 0,
    cooldown: 0,
    reload: 0,
    draw: 0,
    pendingPress: 0,
    reloadQueued: false,
    dryFiredThisPull: false,
    triggerWasDown: false,
    bottomless: false,
    recoil: 0,
    modes: loadout.map((r) => r.defaultFireMode),
    burstShotsLeft: 0,
    optics: loadout.map(() => null),
    hopUps: loadout.map((r) => r.hopUpDial),
    bbWeights: loadout.map((r) => r.bbWeight),
    parts: fitted,
    handling,
  };
}

/**
 * Fits each replica's grip and magazine (by loadout slot; parts a replica can't take keep its factory ones) and fills
 * its magazines for the new parts. Between rounds only: the magazines start full.
 */
export function fitParts(a: Armament, parts: readonly ReplicaParts[]): void {
  for (let i = 0; i < a.replicas.length && i < parts.length; i++) {
    const r = a.replicas[i]!;
    a.parts[i] = partsFor(r, parts[i]!);
    a.handling[i] = handlingOf(r, a.parts[i]!);
    a.ammo[i] = fullAmmo(a.handling[i]!);
  }
}

/** Sets the BB weight each replica shoots (grams, by loadout slot; missing slots and weights not offered keep theirs). */
export function setBbWeights(a: Armament, grams: readonly number[]): void {
  for (let i = 0; i < a.bbWeights.length && i < grams.length; i++) {
    const g = validBbWeight(grams[i]!);
    if (g !== undefined) a.bbWeights[i] = g;
  }
}

/** Sets each replica's hop-up dial (by loadout slot; missing slots keep theirs), kept within the dial's range. */
export function setHopUps(a: Armament, dials: readonly number[]): void {
  for (let i = 0; i < a.hopUps.length && i < dials.length; i++) {
    const d = dials[i]!;
    if (Number.isFinite(d)) a.hopUps[i] = Math.min(HOP_UP.maxDial, Math.max(HOP_UP.minDial, d));
  }
}

/** How far the active replica's shots carry, as a share of the usual (a silencer, M29b: below 1). */
export function shotHeardScale(c: { armament: Armament }): number {
  return c.armament.handling[c.armament.active]?.heardScale ?? 1;
}

/** True if any magazine carried rattles as you move (a hi-cap): quiet moves aren't silent (sim/footsteps.ts). */
export function rattles(a: Armament): boolean {
  for (const h of a.handling) if (h.rattles) return true;
  return false;
}

/** Fits each slot's optic (null: iron sights), by loadout slot; missing slots keep theirs. The pool decides what fits (M26b). */
export function fitOptics(a: Armament, optics: readonly (OpticId | null)[]): void {
  for (let i = 0; i < a.optics.length && i < optics.length; i++) a.optics[i] = optics[i] ?? null;
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

/** What a ray met (raycastSurface): the surface's unit normal, facing back along the ray, and what it is made of. */
export interface SurfaceHit {
  normal: Vec3;
  material: ImpactMaterial;
}

/** Level geometry queries the armament needs. */
export interface WorldQuery {
  /** Distance to the first static surface along unit `dir`, or -1 if none within `maxDist`. */
  raycastStatic(origin: Vec3, dir: Vec3, maxDist: number): number;
  /**
   * The same, also filling `out` with the surface met (BB ricochets, M20). Optional: a query without it (test doubles)
   * has BBs stop dead where they land, as before ricochets.
   */
  raycastSurface?(origin: Vec3, dir: Vec3, maxDist: number, out: SurfaceHit): number;
}

export interface ArmamentContext {
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
  // The tick the cooldown runs out keeps the overshoot (down to -dt), so a held trigger or fast clicking fires at the
  // exact rate on average. In single and burst a replica that sat ready a whole tick rests at 0, so a fresh pull's next
  // shot isn't a tick early (bug pass); a held auto trigger keeps the old rest, which the bots' headless guards are
  // measured with.
  a.cooldown = a.cooldown <= 0 && a.modes[a.active] !== 'auto' ? 0 : Math.max(-dt, a.cooldown - dt);
  a.pendingPress = Math.max(0, a.pendingPress - dt);
  if (a.draw > 0) a.draw = Math.max(0, a.draw - dt);

  let replica = a.replicas[a.active]!;
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
  if (cmd.switchTo >= 0 && cmd.switchTo < a.replicas.length && cmd.switchTo !== a.active) {
    a.active = cmd.switchTo;
    a.reload = 0;
    replica = a.replicas[a.active]!;
    ammo = a.ammo[a.active]!;
    a.draw = a.handling[a.active]!.drawTime;
    a.dryFiredThisPull = false; // a dry click on the other replica doesn't count for this one
    a.burstShotsLeft = 0;
    a.reloadQueued = false; // a reload asked for on the other replica
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
  // Reload pressed while the replica is still coming up (switch, then R straight away): kept until it's up.
  if (cmd.reload && a.draw > 0 && a.reload <= 0) a.reloadQueued = true;
  const reloadAsked = (cmd.reload || a.reloadQueued) && ready;
  if (ready) a.reloadQueued = false;
  if (reloadAsked) {
    if (canReload(ammo)) startReload(characterId, a, replica, ctx);
    // Nothing fuller to swap in: say so, unless the magazine is full anyway (then R obviously does nothing).
    else if (ammo.mag < a.handling[a.active]!.magSize) ctx.events.push({ type: 'reloadRefused', characterId, replicaId: replica.id });
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
  if (!a.bottomless) ammo.mag--;
  a.cooldown += 1 / replica.fireRate;
  fire(characterId, a, replica, muzzle, ctx);
}

function startReload(characterId: number, a: Armament, replica: ReplicaConfig, ctx: ArmamentContext): void {
  a.reload = a.handling[a.active]!.reloadTime;
  ctx.events.push({ type: 'reloadStart', characterId, replicaId: replica.id });
}

function fire(characterId: number, a: Armament, replica: ReplicaConfig, muzzle: Muzzle, ctx: ArmamentContext): void {
  const spread = replica.spreadDeg * muzzle.spreadScale * DEG;
  const yaw = muzzle.yaw + rngGaussian(ctx.rng) * spread;
  const pitchLimit = RECOIL.maxShotPitchDeg * DEG;
  const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, muzzle.pitch + a.recoil + rngGaussian(ctx.rng) * spread));
  aimDirection(dir, yaw, pitch);
  a.recoil = Math.min(RECOIL.maxDeg * DEG, a.recoil + replica.recoilDeg * DEG);
  ctx.events.push({ type: 'shot', characterId, replicaId: replica.id, position: vec3(muzzle.eye.x, muzzle.eye.y, muzzle.eye.z) });

  // The BB's path starts at the eye: its first step then catches cover right in front of the shooter
  // and anyone standing point-blank (even overlapping the shooter), and it never hits its owner.
  // Presentation draws it leaving the replica's muzzle.
  const grams = a.bbWeights[a.active] ?? replica.bbWeight;
  spawnBB(ctx.bbs, characterId, muzzle.eye, dir, muzzleVelocity(replica, grams), hopUpLift(replica, a.hopUps[a.active] ?? replica.hopUpDial), bbMass(replica, grams));
}
