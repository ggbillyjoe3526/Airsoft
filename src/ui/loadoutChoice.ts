import { BALLISTICS } from '../config/ballistics';
import type { OpticChoice } from '../config/optics';
import { HOP_UP, type ReplicaConfig } from '../config/replicas';
import { loadSetting, numberIn } from '../settings/storage';
import { hopUpReach } from '../sim/hopUp';

/**
 * The loadout set on the start screen before a match: the rifle's optic and each replica's hop-up. It is the
 * start of the loadout screen to come (roadmap), so it is offered before a match (the title screen and the
 * result screen), never on the pause screen mid-match (owner, 2026-10-03).
 */
export function loadoutOffered(screen: 'title' | 'pause' | 'result'): boolean {
  return screen !== 'pause';
}

/**
 * When a loadout change is fitted. Before the first match and on the result screen it is fitted at once;
 * mid-match it waits for the next round, so a round in progress is never changed (the same rule as the bot
 * difficulty). The mid-match path is dormant while the loadout is only offered before a match (loadoutOffered),
 * and kept (owner: keep the functionality) for when a loadout screen is reachable mid-match.
 */
export function loadoutTakesEffect(started: boolean, matchOver: boolean): 'now' | 'nextRound' {
  return started && !matchOver ? 'nextRound' : 'now';
}

/** The note shown with the optic picker: only while a picked optic waits for the next round. */
export function opticNote(picked: OpticChoice, fitted: OpticChoice, matchOver: boolean): string {
  return picked !== fitted && !matchOver ? 'Fitted from the next round.' : '';
}

/** The settings field a replica's hop-up dial is saved as. */
export function hopUpField(replica: ReplicaConfig): `hopUp.${string}` {
  return `hopUp.${replica.id}`;
}

/** Each replica's saved hop-up dial, or its out-of-the-box setting. */
export function loadHopUps(loadout: readonly ReplicaConfig[]): number[] {
  return loadout.map((r) => loadSetting(hopUpField(r), numberIn(HOP_UP.minDial, HOP_UP.maxDial), r.hopUpDial));
}

/** The dial as the start screen shows it. */
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
