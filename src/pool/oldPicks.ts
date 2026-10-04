import { loadSetting, saveSetting, type SettingField } from '../settings/storage';
import { addItem, type Collection, ownedCount } from './collection';
import type { FitSlot } from './kit';
import type { LoadoutModel } from './loadoutModel';
import { type Asset, fits, replicaOf } from './pool';

/**
 * A returning player's M17b picks, carried into the asset pool once (M26b). Before M26 every optic, grip and magazine
 * was free, saved as `optic` (the rifle's), `grip.<replica>` and `mag.<replica>`; now they are assets to own. Each part
 * a player had picked is given to them (at the lowest tier, unless they own a copy already) and fitted where it was,
 * so nobody loses what they played with. Runs once (`oldPicksCarried`); returns true if the collection changed.
 */
export function carryOverOldPicks(model: LoadoutModel, c: Collection): boolean {
  if (loadSetting('oldPicksCarried', (v) => (typeof v === 'boolean' ? v : undefined), false)) return false;
  const pool = model.pool;
  const lowest = pool.tiers[0];
  let changed = false;
  for (const replica of pool.assets.filter((a) => a.category === 'replica')) {
    const id = replicaOf(replica).id;
    const picks: [FitSlot, SettingField][] = [
      ['grip', `grip.${id}`],
      ['magazine', `mag.${id}`],
    ];
    // Only the rifle had an optic slot, saved under one field.
    if (id === 'aeg') picks.unshift(['optic', 'optic']);
    for (const [slot, field] of picks) {
      const key = loadSetting<string | null>(field, (v) => (typeof v === 'string' ? v : undefined), null);
      const part = key ? pool.assets.find((a: Asset) => a.category === slot && a.key === key && fits(a, replica)) : undefined;
      if (!part || !lowest) continue;
      const owned = pool.tiers.find((t) => ownedCount(c, { asset: part.id, tier: t.id }) > 0);
      if (!owned) {
        addItem(c, { asset: part.id, tier: lowest.id });
        changed = true;
      }
      model.setFit(replica.id, slot, { asset: part.id, tier: (owned ?? lowest).id });
    }
  }
  saveSetting('oldPicksCarried', true);
  return changed;
}
