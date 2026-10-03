import { factoryParts, GRIP_CHOICES, GRIPS, type GripId, handlingOf, MAGAZINES, type MagazineId, type ReplicaParts } from '../config/attachments';
import { BALLISTICS } from '../config/ballistics';
import { MOVEMENT } from '../config/movement';
import { AIMING, OPTIC_CHOICES, type OpticChoice } from '../config/optics';
import { BB_WEIGHT, HOP_UP, type LoadoutSlot, muzzleEnergy, muzzleVelocity, type ReplicaConfig } from '../config/replicas';
import { loadSetting, numberIn } from '../settings/storage';
import { bestHopUp, flightTime, hopUpReach } from '../sim/hopUp';

/** The settings field a replica's hop-up dial is saved as. */
export function hopUpField(replica: ReplicaConfig): `hopUp.${string}` {
  return `hopUp.${replica.id}`;
}

/** A replica's saved hop-up dial, or its out-of-the-box setting. */
export function loadHopUp(r: ReplicaConfig): number {
  return loadSetting(hopUpField(r), numberIn(HOP_UP.minDial, HOP_UP.maxDial), r.hopUpDial);
}

/** The settings field a replica's BB weight is saved as. */
export function bbWeightField(replica: ReplicaConfig): `bbWeight.${string}` {
  return `bbWeight.${replica.id}`;
}

/** A BB weight offered on the Loadout screen, from a stored value (a number, or its text from the picker). */
function bbWeightIn(raw: unknown): number | undefined {
  const g = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  return (BB_WEIGHT.choices as readonly number[]).includes(g) ? g : undefined;
}

/** A replica's saved BB weight (grams), or the one it comes set up for. */
export function loadBbWeight(r: ReplicaConfig): number {
  return loadSetting(bbWeightField(r), bbWeightIn, r.bbWeight);
}

/** The settings field a loadout slot's replica is saved as. */
export function slotField(slot: LoadoutSlot): `slot.${string}` {
  return `slot.${slot.id}`;
}

/** The replica saved for `slot`, or the slot's default (its first) if nothing that fits is saved. */
export function loadSlotPick(slot: LoadoutSlot): ReplicaConfig {
  const id = loadSetting(slotField(slot), (raw) => slot.fits.find((r) => r.id === raw)?.id, slot.fits[0]!.id);
  return slot.fits.find((r) => r.id === id)!;
}

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

/** The settings fields a replica's grip and magazine are saved as (M17b). */
export function gripField(replica: ReplicaConfig): `grip.${string}` {
  return `grip.${replica.id}`;
}

export function magazineField(replica: ReplicaConfig): `mag.${string}` {
  return `mag.${replica.id}`;
}

/** A replica's saved grip and magazine, or the ones it comes with (anything it can't take falls back to those). */
export function loadParts(r: ReplicaConfig): ReplicaParts {
  const factory = factoryParts(r);
  return {
    grip: r.gripMount ? loadSetting(gripField(r), (raw) => GRIP_CHOICES.find((g) => g.id === raw)?.id, factory.grip) : factory.grip,
    magazine: loadSetting(magazineField(r), (raw) => r.magazines.find((m) => m === raw), factory.magazine),
  };
}

/** The magazines a replica takes, as the Loadout screen offers them. */
export function magazineChoices(r: ReplicaConfig): { id: MagazineId; label: string; blurb: string }[] {
  return r.magazines.map((id) => ({ id, label: MAGAZINES[id].label, blurb: MAGAZINES[id].blurb }));
}

/** One line under the magazine, in numbers, e.g. "60 BBs each, 4 carried (240 in all). Reload 1.8 s." */
export function magazineReadout(r: ReplicaConfig, magazine: MagazineId): string {
  const h = handlingOf(r, { grip: 'none', magazine });
  const draw = MAGAZINES[magazine].drawScale !== 1 ? ` Draw ${h.drawTime.toFixed(2)} s.` : '';
  return `${h.magSize} BBs each, ${h.mags} carried (${h.magSize * h.mags} in all). Reload ${h.reloadTime.toFixed(1)} s.${draw}`;
}

/**
 * How long after a sprint ends the aim counts as steady on the grip line: the shake's carry, then two settle time
 * constants (about 86% of the way back), both scaled by the grip as in sim/accuracy.ts.
 */
const STEADY_SETTLES = 2;

/**
 * One line under the grip, in numbers: how quickly the replica comes up (after a switch) and to your eye, and how long
 * after a sprint the aim is steady, against when it can fire again, e.g. "Brings the AEG rifle up in 0.45 s and to
 * your eye in 0.15 s. After a sprint it can fire from 0.20 s and is steady in about 0.6 s."
 */
export function gripReadout(r: ReplicaConfig, grip: GripId): string {
  const h = handlingOf(r, { grip, magazine: r.magazines[0]! });
  const a = MOVEMENT.accuracy;
  const steady = (a.carryTime + STEADY_SETTLES * a.settleTime) * GRIPS[grip].shakeScale;
  return (
    `Brings the ${r.name} up in ${h.drawTime.toFixed(2)} s and to your eye in ${(AIMING.raiseTime * h.raiseScale).toFixed(2)} s. ` +
    `After a sprint it can fire from ${MOVEMENT.sprintFireLockout.toFixed(2)} s and is steady in about ${steady.toFixed(1)} s.`
  );
}

/**
 * The Loadout button's summary on the New game screen: the optic on the replica that takes one (if any), any grip and
 * magazine that isn't the one a replica comes with, then each replica's BB weight and hop-up dial in slot order, e.g.
 * "Red dot · Angled grip · Hi-cap mag · 0.25 g / 0.20 g BBs · hop-up 65% / 55%".
 */
export function loadoutSummary(
  loadout: readonly ReplicaConfig[],
  optic: OpticChoice,
  dials: readonly number[],
  grams: readonly number[],
  parts: readonly ReplicaParts[] = [],
): string {
  const opticPart = loadout.some((r) => r.opticMount) ? `${OPTIC_CHOICES.find((o) => o.id === optic)?.label ?? optic} · ` : '';
  let partsPart = '';
  loadout.forEach((r, i) => {
    const p = parts[i];
    if (!p) return;
    if (p.grip !== 'none') partsPart += `${GRIPS[p.grip].label} · `;
    if (p.magazine !== r.magazines[0]) partsPart += `${MAGAZINES[p.magazine].label} mag · `;
  });
  const weights = loadout.map((r, i) => bbWeightLabel(grams[i] ?? r.bbWeight)).join(' / ');
  return `${opticPart}${partsPart}${weights} BBs · hop-up ${loadout.map((r, i) => hopUpLabel(dials[i] ?? r.hopUpDial)).join(' / ')}`;
}
