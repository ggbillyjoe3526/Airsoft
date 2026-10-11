import { CATEGORY_COSTS, TRADE_OFF_EXCEPTIONS } from '../config/contentRules';
import { type Asset, fits } from '../pool/pool';
import { assetRules } from './assetRules';
import { type CheckResult, itemName, result } from './checks';
import { type ContentInputs, drawName, drawTableOf, type PartCategory } from './contentInputs';
import { kitGrid } from './kitGrid';
import { siteClassOf } from './replicaChecks';

/**
 * A part's rules and compatibility checks (CT1; the rulebook is docs/content/attachments.md): optics, grips, lasers,
 * magazines, barrels, muzzle parts, lights and power sources. Pure over the inputs, like replicaChecks.ts.
 */

/** The stats.md table a part's numbers are in, by category: by Key, or (power sources) by ID. */
function statsRow(inputs: ContentInputs, part: Asset): object | undefined {
  const s = inputs.stats;
  const byKey: Record<Exclude<PartCategory, 'power'>, Readonly<Record<string, object>>> = {
    optic: s.optics,
    grip: s.grips,
    laser: s.lasers,
    magazine: s.magazines,
    barrel: s.barrels,
    muzzle: s.muzzles,
    light: s.lights,
  };
  if (part.category === 'power') return s.power[part.id];
  return byKey[part.category as Exclude<PartCategory, 'power'>]?.[part.key];
}

/** The replicas `part` fits. */
export function replicasFitting(inputs: ContentInputs, part: Asset): Asset[] {
  return inputs.pool.assets.filter((a) => a.category === 'replica' && fits(part, a));
}

/** Level 1. */
export function partRules(inputs: ContentInputs, part: Asset): CheckResult[] {
  const item = itemName(part);
  const kind = part.category;
  const out = assetRules(part, kind);
  if (part.category !== 'power') {
    const keys = inputs.partKeys[part.category as PartCategory] ?? [];
    if (!keys.includes(part.key)) out.push(result('rules', `${kind}.key`, item, 'fail', `Its Key "${part.key}" names no ${kind} in the code.`));
    else out.push(result('rules', `${kind}.key`, item, 'pass', `Its Key "${part.key}" is in the code.`));
  }
  if (!statsRow(inputs, part)) out.push(result('rules', `${kind}.stats`, item, 'fail', `stats.md has no ${kind === 'power' ? 'Power sources row for its ID' : `row for "${part.key}"`}: its numbers belong there.`));
  else out.push(result('rules', `${kind}.stats`, item, 'pass', 'stats.md has its numbers.'));

  const byId = part.tags.filter((t) => /^\d{6}$/.test(t));
  if (byId.length > 0) out.push(result('rules', `${kind}.fits`, item, 'warn', `It fits by naming a replica (${byId.join(', ')}), not by tag: say why in its brief, or give it a tag.`));
  const replicas = replicasFitting(inputs, part);
  if (replicas.length === 0) out.push(result('rules', `${kind}.fits`, item, 'fail', `It fits no replica (its Fits: ${part.tags.join(', ') || 'none'}).`));
  else if (!replicas.some((r) => r.tag === 'public')) {
    // A dev part may wait for its dev replica; a public one must fit a public replica (the rulebook's must).
    const dev = replicas.map((r) => r.name).join(', ');
    out.push(part.tag === 'public' ? result('rules', `${kind}.fits`, item, 'fail', `It is public but fits only replicas still in dev (${dev}).`) : result('rules', `${kind}.fits`, item, 'warn', `It fits only replicas still in dev (${dev}): it can go public with them.`));
  }
  else if (byId.length === 0) out.push(result('rules', `${kind}.fits`, item, 'pass', `It fits by tag: ${replicas.map((r) => r.name).join(', ')}.`));

  const effects = inputs.effects(part);
  const better = effects.filter((e) => e.change === 'better');
  const worse = effects.filter((e) => e.change === 'worse');
  const cost = CATEGORY_COSTS[part.category];
  const approved = TRADE_OFF_EXCEPTIONS[part.id];
  const list = (xs: readonly { says: string }[]): string => xs.map((e) => e.says).join(', ');
  if (part.category === 'power' && better.length === 0 && worse.length === 0) {
    out.push(result('rules', `${kind}.tradeOff`, item, 'pass', 'A standard power source: it changes nothing.'));
  } else if (better.length === 0) {
    out.push(result('rules', `${kind}.tradeOff`, item, 'warn', `It improves nothing (${list(effects) || 'no numbers'}): nobody would fit it.`));
  } else if (worse.length > 0) {
    out.push(result('rules', `${kind}.tradeOff`, item, 'pass', `Better: ${list(better)}. Worse: ${list(worse)}.`));
  } else if (cost) {
    out.push(result('rules', `${kind}.tradeOff`, item, 'pass', `Better: ${list(better)}. Its cost is built in: ${cost}.`));
  } else if (approved) {
    out.push(result('rules', `${kind}.tradeOff`, item, 'pass', `Better at everything (${list(better)}), approved: ${approved}.`));
  } else {
    out.push(result('rules', `${kind}.tradeOff`, item, 'fail', `Better at everything (${list(better)}) with no cost: give it one, or it needs your OK.`));
  }
  return out;
}

/** Level 2: on every replica it fits, its model draws it and every kit with it works. */
export function partCompatibility(inputs: ContentInputs, part: Asset): CheckResult[] {
  const item = itemName(part);
  const kind = part.category;
  const out: CheckResult[] = [];
  const replicas = replicasFitting(inputs, part);
  const d = drawName(part);
  if (d) {
    const missing = replicas.filter((r) => {
      const cfg = inputs.replicas[r.key];
      const table = cfg ? inputs.drawTables[drawTableOf(cfg)] : undefined;
      return !table || !table[d.kind].includes(d.name);
    });
    if (missing.length > 0) out.push(result('compatibility', `${kind}.model`, item, 'fail', `Not drawn on ${missing.map((r) => r.name).join(', ')}: it would float or vanish there.`));
    else if (replicas.length > 0) out.push(result('compatibility', `${kind}.model`, item, 'pass', `Drawn on every replica it fits (${replicas.map((r) => r.name).join(', ')}).`));
  }
  let kits = 0;
  const fails: string[] = [];
  const warns: string[] = [];
  for (const r of replicas) {
    const siteClass = siteClassOf(inputs, r);
    if (!siteClass) continue;
    const grid = kitGrid(inputs.pool, r, siteClass);
    kits += grid.tried;
    for (const p of grid.problems) {
      if (!p.parts.includes(part.id)) continue;
      (p.severity === 'fail' ? fails : warns).push(`${p.fit}: ${p.says}`);
    }
  }
  if (fails.length > 0) out.push(result('compatibility', `${kind}.kits`, item, 'fail', `${fails.length} kit${fails.length > 1 ? 's' : ''} with it break: ${fails.slice(0, 3).join('; ')}.`));
  else if (warns.length > 0) out.push(result('compatibility', `${kind}.kits`, item, 'warn', `No kit with it breaks, but ${warns.length} run past the normal ranges: ${warns.slice(0, 3).join('; ')}.`));
  else if (replicas.length > 0) out.push(result('compatibility', `${kind}.kits`, item, 'pass', `Every kit it is in works and stays under the site limit (${kits} kits on ${replicas.length} replica${replicas.length > 1 ? 's' : ''}).`));
  return out;
}
