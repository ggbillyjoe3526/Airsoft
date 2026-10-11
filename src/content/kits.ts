import { handlingOf } from '../config/attachments';
import type { ReplicaConfig } from '../config/replicas';
import { EMPTY_FIT, kitSlot, type ReplicaFit } from '../pool/kit';
import { type Asset, fits, type Pool, tiersOf } from '../pool/pool';

/** The kits the spec test and the balance run compare (CT1): a replica as a player gets it, and as carried with a fit. */

/** A replica as it comes for a player: its starter power source (else the first that fits), nothing else fitted. */
export function asItComesFit(pool: Pool, replica: Asset): ReplicaFit {
  const power = pool.assets.filter((a) => a.category === 'power' && fits(a, replica));
  const pick = power.find((a) => a.starter) ?? power[0];
  return { ...EMPTY_FIT, power: pick ? { asset: pick.id, tier: tiersOf(pool, pick)[0]!.id } : null };
}

/** The replica `replica` at its commonest tier with `fit`, as carried: its sheet's numbers include its parts' handling. */
export function carried(pool: Pool, replica: Asset, fit: ReplicaFit): ReplicaConfig {
  const slot = kitSlot(pool, { asset: replica.id, tier: tiersOf(pool, replica)[0]!.id }, fit);
  const h = handlingOf(slot.replica, slot.parts);
  return { ...slot.replica, magSize: h.magSize, mags: h.mags, reloadTime: h.reloadTime, drawTime: h.drawTime };
}
