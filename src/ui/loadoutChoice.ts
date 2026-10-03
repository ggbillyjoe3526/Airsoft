import { BALLISTICS } from '../config/ballistics';
import { OPTIC_CHOICES, type OpticChoice } from '../config/optics';
import { HOP_UP, type ReplicaConfig } from '../config/replicas';
import { loadSetting, numberIn } from '../settings/storage';
import { hopUpReach } from '../sim/hopUp';

/** The settings field a replica's hop-up dial is saved as. */
export function hopUpField(replica: ReplicaConfig): `hopUp.${string}` {
  return `hopUp.${replica.id}`;
}

/** Each replica's saved hop-up dial, or its out-of-the-box setting. */
export function loadHopUps(loadout: readonly ReplicaConfig[]): number[] {
  return loadout.map((r) => loadSetting(hopUpField(r), numberIn(HOP_UP.minDial, HOP_UP.maxDial), r.hopUpDial));
}

/** The dial as the menus show it. */
export function hopUpLabel(dial: number): string {
  return `${Math.round(dial * 100)}%`;
}

/** One line under a hop-up slider saying what the setting does to a level shot. */
export function hopUpReadout(replica: ReplicaConfig, dial: number): string {
  const { onTargetTo, peakRise } = hopUpReach(replica, dial, BALLISTICS);
  const reach = onTargetTo >= HOP_UP.readoutRange ? `past ${HOP_UP.readoutRange} m` : `to about ${Math.round(onTargetTo)} m`;
  if (peakRise > HOP_UP.onTargetBand) return `Too much: the BB rises ${Math.round(peakRise * 100)} cm over your aim and floats. On target ${reach}.`;
  const factory = Math.abs(dial - replica.hopUpDial) < HOP_UP.dialStep / 2 ? ' (factory setting)' : '';
  return `On target ${reach}, then the BB drops${factory}.`;
}

/**
 * The Loadout button's summary on the New game screen: the optic on the replica that takes one (if any) and each
 * replica's hop-up dial, e.g. "Red dot · hop-up 65% / 55%".
 */
export function loadoutSummary(loadout: readonly ReplicaConfig[], optic: OpticChoice, dials: readonly number[]): string {
  const opticPart = loadout.some((r) => r.opticMount) ? `${OPTIC_CHOICES.find((o) => o.id === optic)?.label ?? optic} · ` : '';
  return `${opticPart}hop-up ${loadout.map((r, i) => hopUpLabel(dials[i] ?? r.hopUpDial)).join(' / ')}`;
}
