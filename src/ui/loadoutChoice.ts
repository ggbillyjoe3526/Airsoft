import { GRIPS, handlingOf, MAGAZINES } from '../config/attachments';
import { BALLISTICS } from '../config/ballistics';
import { BOT_BEHAVIOUR } from '../config/bots';
import { MOVEMENT } from '../config/movement';
import { SIM_DT } from '../config/sim';
import { AIMING, OPTICS } from '../config/optics';
import { BB_WEIGHT, HOP_UP, muzzleEnergy, muzzleVelocity, type ReplicaConfig } from '../config/replicas';
import type { KitSlot } from '../pool/kit';
import type { LoadoutModel, PlayerKit } from '../pool/loadoutModel';
import { timeToSteady } from '../sim/accuracy';
import { fitParts } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { bestHopUp, flightTime, hopUpReach } from '../sim/hopUp';
import { vec3 } from '../sim/vec';

/** A BB weight as the menus show it, e.g. "0.25 g". */
export function bbWeightLabel(grams: number): string {
  return `${grams.toFixed(2)} g`;
}

/**
 * What the BB weight does on this replica, both sides of the choice: how fast it leaves and gets to mid-range, and how
 * far it stays on target with the hop-up set for it, e.g. "Leaves the barrel at 88 m/s (0.97 J) and reaches 20 m in
 * 0.27 s (as it comes). Longest reach at about 65% hop-up: on target to about 38 m." The longest reach may rise a
 * little on the way (within HOP_UP.onTargetBand), so it can sit above the factory dial.
 */
export function bbWeightReadout(replica: ReplicaConfig, grams: number): string {
  const factory = grams === replica.bbWeight ? ' (as it comes)' : '';
  const best = bestHopUp(replica, BALLISTICS, grams);
  const distance = BB_WEIGHT.timeReadoutDistance;
  const time = flightTime(replica, best.dial, distance, BALLISTICS, grams);
  return (
    `Leaves the barrel at ${Math.round(muzzleVelocity(replica, grams))} m/s (${muzzleEnergy(replica, grams).toFixed(2)} J) and reaches ${distance} m in ${time.toFixed(2)} s${factory}. ` +
    `Longest reach at about ${hopUpLabel(best.dial)} hop-up: on target ${reachText(best.onTargetTo)}.`
  );
}

/** "to about 38 m", or "past 60 m" for a BB still on target where the readout stops following it. */
function reachText(onTargetTo: number): string {
  return onTargetTo >= HOP_UP.readoutRange ? `past ${HOP_UP.readoutRange} m` : `to about ${Math.round(onTargetTo)} m`;
}

/** The dial as the menus show it. */
export function hopUpLabel(dial: number): string {
  return `${Math.round(dial * 100)}%`;
}

/** One line under a hop-up slider saying what the setting does to a level shot with `grams` BBs. */
export function hopUpReadout(replica: ReplicaConfig, dial: number, grams = replica.bbWeight): string {
  const { onTargetTo, peakRise } = hopUpReach(replica, dial, BALLISTICS, grams);
  const reach = reachText(onTargetTo);
  if (peakRise > HOP_UP.onTargetBand) return `Too much: the BB rises ${Math.round(peakRise * 100)} cm over your aim and floats. On target ${reach}.`;
  // "Factory setting" only with the factory BB too: the dial is set for that weight, not for every weight.
  const factory = grams === replica.bbWeight && Math.abs(dial - replica.hopUpDial) < HOP_UP.dialStep / 2 ? ' (factory setting)' : '';
  return `On target ${reach}, then the BB drops${factory}.`;
}

/**
 * One line under the optic: how quickly the fitted optic comes up to your eye with this replica's grip and tiers, e.g.
 * "Up to your eye in 0.30 s with the vertical grip.", or that iron sights fire from the hip.
 */
export function opticReadout(slot: KitSlot): string {
  if (slot.optic === null) return 'Fired from the hip: no sight to raise.';
  const h = handlingOf(slot.replica, slot.parts);
  const time = (AIMING.raiseTime * OPTICS[slot.optic].raiseScale * h.raiseScale).toFixed(2);
  const grip = slot.parts.grip;
  return `Up to your eye in ${time} s${grip === 'none' ? '' : ` with the ${GRIPS[grip].label.toLowerCase()}`}.`;
}

/**
 * The Loadout grip line's "steady": the spread multiplier back within 0.1 of ×1, an ordinary stance's spread (holding
 * still then tightens it further; sim/accuracy.ts timeToSteady).
 */
const STEADY_MARGIN = 0.1;

/**
 * One line under the grip, in numbers: how quickly the replica comes up after a switch, and after a sprint when it can
 * fire against when the aim is steady again (from the sim's own accuracy rule), e.g. "Brings the AEG Rifle up in
 * 0.45 s. After a sprint it can fire from 0.20 s, steady from 0.27 s."
 */
export function gripReadout(slot: KitSlot): string {
  const c = createCharacter(0, vec3(), 0, [slot.replica]);
  fitParts(c.armament, [slot.parts]);
  const steady = timeToSteady(c, MOVEMENT, SIM_DT, STEADY_MARGIN);
  const lockout = MOVEMENT.sprintFireLockout;
  const after = steady <= lockout ? 'already steady' : `steady from ${steady.toFixed(2)} s`;
  return `Brings the ${slot.replica.name} up in ${handlingOf(slot.replica, slot.parts).drawTime.toFixed(2)} s. After a sprint it can fire from ${lockout.toFixed(2)} s, ${after}.`;
}

/** One line under the magazine, in numbers, e.g. "60 BBs each, 4 carried (240 in all). Reload 1.8 s." */
export function magazineReadout(slot: KitSlot): string {
  const h = handlingOf(slot.replica, slot.parts);
  const draw = MAGAZINES[slot.parts.magazine].drawScale !== 1 ? ` Draw ${h.drawTime.toFixed(2)} s.` : '';
  return `${h.magSize} BBs each, ${h.mags} carried (${h.magSize * h.mags} in all). Reload ${h.reloadTime.toFixed(1)} s.${draw}`;
}

/**
 * One line under the power source: the muzzle energy and speed it gives with the replica's BB weight, and the rate of
 * fire, e.g. "1.04 J: leaves the barrel at 91 m/s with 0.25 g BBs. 14 BBs a second."
 */
export function powerReadout(slot: KitSlot, grams: number): string {
  const r = slot.replica;
  return `${muzzleEnergy(r, grams).toFixed(2)} J: leaves the barrel at ${Math.round(muzzleVelocity(r, grams))} m/s with ${bbWeightLabel(grams)} BBs. ${formatRate(r.fireRate)} BBs a second at most.`;
}

/** One line under the barrel (M29b): the energy and spread it gives, and the draw. */
export function barrelReadout(slot: KitSlot): string {
  const r = slot.replica;
  return `${r.muzzleEnergy.toFixed(2)} J with ${bbWeightLabel(r.bbWeight)} BBs, spread ${r.spreadDeg.toFixed(2)}°. Brings it up in ${handlingOf(r, slot.parts).drawTime.toFixed(2)} s.`;
}

/** One line under the muzzle part (M29b): how far away bots hear its shots, and with a silencer how far without it. */
export function muzzleReadout(slot: KitSlot): string {
  const base = BOT_BEHAVIOUR.hearingDistance;
  const heard = Math.round(base * handlingOf(slot.replica, slot.parts).heardScale);
  // The comparison only means something with a device fitted that changes it (FA13: "22 m (22 m without a silencer)").
  return slot.parts.muzzle && heard !== Math.round(base) ? `Bots hear your shots from ${heard} m (${base} m without a silencer).` : `Bots hear your shots from ${heard} m.`;
}

/** One line under the laser: the spread from the hip, as the crosshair shows it. */
export function laserReadout(slot: KitSlot): string {
  return `Spread ${slot.replica.spreadDeg.toFixed(2)}° from the hip, before stance and movement.`;
}

function formatRate(rate: number): string {
  return Number.isInteger(Math.round(rate * 10) / 10) ? String(Math.round(rate)) : rate.toFixed(1);
}

/**
 * The Loadout tile's summary on the New game screen: any optic, grip, laser or magazine that isn't how a replica comes,
 * then each replica's BB weight and hop-up dial in slot order, e.g. "Red Dot · Vertical Grip · 0.25 g / 0.20 g BBs ·
 * hop-up 65% / 55%". `names`: each slot's fitted item names (as it comes: none).
 */
export function loadoutSummary(kit: PlayerKit, names: readonly string[]): string {
  const parts = names.map((n) => `${n} · `).join('');
  const weights = kit.slots.map((s, i) => bbWeightLabel(kit.bbWeights[i] ?? s.replica.bbWeight)).join(' / ');
  return `${parts}${weights} BBs · hop-up ${kit.slots.map((s, i) => hopUpLabel(kit.hopUps[i] ?? s.replica.hopUpDial)).join(' / ')}`;
}

/**
 * New game's Loadout tile: each equipped replica on its own line (its tier after it unless Common), and the summary
 * line of the parts fitted that aren't how the replica comes, BB weights and hop-up dials.
 */
export function loadoutTile(model: LoadoutModel): { replicas: string; detail: string } {
  const pool = model.pool;
  const lowest = pool.tiers[0]?.id;
  const equipped = model.equipped().filter((r) => r !== null);
  const replicas = equipped
    .map((r) => {
      const name = pool.byId.get(r.asset)!.name;
      return r.tier === lowest ? name : `${name} (${pool.tiers.find((t) => t.id === r.tier)?.label ?? r.tier})`;
    })
    .join('\n');
  const names: string[] = [];
  for (const r of equipped) {
    const fit = model.fitOf(r.asset);
    for (const slot of ['optic', 'grip', 'laser', 'magazine'] as const) {
      const item = fit[slot];
      if (item) names.push(pool.byId.get(item.asset)!.name);
    }
  }
  return { replicas, detail: loadoutSummary(model.kit(), names) };
}
