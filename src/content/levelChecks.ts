import { type CheckResult, itemName, result } from './checks';
import type { ContentInputs } from './contentInputs';
import type { Asset } from '../pool/pool';

/**
 * An item's level (LV1, levels.md): a level unlocks it, so players get it by playing. One no level names is never
 * unlocked (a fail: add its Name to a level's Unlocks). Pure over the inputs.
 */
export function levelCheck(inputs: ContentInputs, asset: Asset): CheckResult[] {
  const item = itemName(asset);
  const level = inputs.levels.unlockLevel.get(asset.id);
  if (level === undefined) return [result('rules', 'item.level', item, 'fail', "No level in levels.md unlocks it, so no player ever gets it: add its Name to a level's Unlocks.")];
  return [result('rules', 'item.level', item, 'pass', level === 0 ? 'Every player starts with it (levels.md, level 0).' : `Unlocks at level ${level} (levels.md).`)];
}
