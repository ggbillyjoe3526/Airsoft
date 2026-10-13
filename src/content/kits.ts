import { handlingOf } from '../config/attachments';
import type { ReplicaConfig } from '../config/replicas';
import { EMPTY_FIT, FIT_CATEGORY, FIT_SLOTS, type FitSlot, kitSlot, type ReplicaFit } from '../pool/kit';
import { type Asset, fits, type Pool } from '../pool/pool';

/** The kits the spec test and the balance run compare (CT1): a replica as a player gets it, and as carried with a fit. */

/** A replica as it comes for a player: the first power source that fits it (the pool lists the starting ones first), nothing else fitted. */
export function asItComesFit(pool: Pool, replica: Asset): ReplicaFit {
  const power = pool.assets.filter((a) => a.category === 'power' && fits(a, replica));
  const pick = power[0];
  return { ...EMPTY_FIT, power: pick ? { asset: pick.id } : null };
}

/** The replica `replica` with `fit`, as carried: its sheet's numbers include its parts' handling. */
export function carried(pool: Pool, replica: Asset, fit: ReplicaFit): ReplicaConfig {
  const slot = kitSlot(pool, { asset: replica.id }, fit);
  const h = handlingOf(slot.replica, slot.parts);
  return { ...slot.replica, magSize: h.magSize, mags: h.mags, reloadTime: h.reloadTime, drawTime: h.drawTime };
}

/** The Customise slot a part goes in (pool/kit.ts FIT_CATEGORY read backwards), or null for a replica or grenade. */
export function slotOf(part: Asset): FitSlot | null {
  return FIT_SLOTS.find((s) => FIT_CATEGORY[s] === part.category) ?? null;
}
