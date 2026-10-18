import { DIFFICULTIES, type Difficulty } from '../config/bots';
import { DESCRIPTIVE_TAGS, DRIVE_TAGS, RANGE_EXCEPTIONS, type RangedStat, REPLICA_RANGES, STAT_WORDS } from '../config/contentRules';
import { cues } from '../config/sounds';
import { type BotKit, kittedBot } from '../pool/botKit';
import { type ItemRef, itemKey } from '../pool/item';
import { FIT_CATEGORY, FIT_SLOTS, type FitSlot } from '../pool/kit';
import { LoadoutModel } from '../pool/loadoutModel';
import { type Asset, fits, hasBuiltInPower } from '../pool/pool';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { assetRules } from './assetRules';
import { type CheckResult, itemName, num, result } from './checks';
import { type ContentInputs, drawName, drawTableOf } from './contentInputs';
import { kitGrid } from './kitGrid';

/**
 * A replica's rules and compatibility checks (CT1; the rulebook is docs/content/replicas.md). Pure over the inputs:
 * the game's own (gameContent.ts) in the tests and the report, a pool or table with a fault in it in the checks' tests.
 */

const RANGED = Object.keys(STAT_WORDS) as RangedStat[];

/** The parts in the pool that fit `replica`, power sources included. */
export function partsFitting(inputs: ContentInputs, replica: Asset): Asset[] {
  return inputs.pool.assets.filter((a) => a.category !== 'replica' && a.category !== 'grenade' && fits(a, replica));
}

/** The Class stats.md gives the replica's Key ('rifle', 'pistol'), or null without a row. */
export function siteClassOf(inputs: ContentInputs, replica: Asset): string | null {
  return inputs.stats.replicas[replica.key]?.siteClass ?? null;
}

/** Level 1: is everything filled in, correctly. */
export function replicaRules(inputs: ContentInputs, replica: Asset): CheckResult[] {
  const item = itemName(replica);
  const out = assetRules(replica, 'replica');
  const r = inputs.replicas[replica.key];
  if (!r) {
    out.push(result('rules', 'replica.key', item, 'fail', `Its Key "${replica.key}" names no replica in the code (pool.ts REPLICA_KEYS).`));
    return out;
  }
  out.push(result('rules', 'replica.key', item, 'pass', `Its Key "${replica.key}" is the code's ${r.name}.`));
  const siteClass = siteClassOf(inputs, replica);
  const ranges = siteClass ? REPLICA_RANGES[siteClass] : undefined;
  if (!siteClass) out.push(result('rules', 'replica.stats', item, 'fail', `stats.md has no row for "${replica.key}": its numbers belong there.`));
  else if (!(siteClass in inputs.stats.siteLimits) || !ranges) out.push(result('rules', 'replica.stats', item, 'fail', `Its class "${siteClass}" has no site limit or normal ranges.`));
  else out.push(result('rules', 'replica.stats', item, 'pass', `stats.md has its numbers, class ${siteClass} (site limit ${num(inputs.stats.siteLimits[siteClass]!)} J).`));
  if (siteClass && !replica.tags.includes(siteClass)) out.push(result('rules', 'replica.class', item, 'fail', `Its tags don't name its class "${siteClass}", so parts that fit by class (the weapon torch) miss it.`));
  else if (siteClass) out.push(result('rules', 'replica.class', item, 'pass', `Tagged with its class, ${siteClass}.`));

  // What drives it: one drive tag that matches the code, or none with the battery built in.
  const drives = replica.tags.filter((t) => t in DRIVE_TAGS);
  if (hasBuiltInPower(replica)) {
    if (drives.length > 0) out.push(result('rules', 'replica.drive', item, 'fail', `Its power is built in, yet it is tagged ${drives.join(', ')}, so a power source would fit it.`));
    else out.push(result('rules', 'replica.drive', item, 'pass', `Its power is built in (${r.power}); no power source fits it.`));
  } else if (drives.length !== 1) out.push(result('rules', 'replica.drive', item, 'fail', `It needs exactly one of the tags ${Object.keys(DRIVE_TAGS).join(', ')}; it has ${drives.length}.`));
  else if (DRIVE_TAGS[drives[0]!] !== r.power) out.push(result('rules', 'replica.drive', item, 'fail', `Tagged ${drives[0]} but the code drives it by ${r.power}.`));
  else out.push(result('rules', 'replica.drive', item, 'pass', `Driven by ${r.power}, as its tag says.`));

  if (r.fireModes.length === 0 || !r.fireModes.includes(r.defaultFireMode)) out.push(result('rules', 'replica.fireModes', item, 'fail', 'Its starting fire mode is not one of its fire modes.'));
  else out.push(result('rules', 'replica.fireModes', item, 'pass', `Fires ${r.fireModes.join(', ')}; starts on ${r.defaultFireMode}.`));

  if (ranges) {
    const outside: string[] = [];
    const excused: string[] = [];
    for (const stat of RANGED) {
      const v = r[stat];
      const range = ranges[stat];
      if (v >= range.min && v <= range.max) continue;
      const why = RANGE_EXCEPTIONS[replica.key]?.[stat];
      const words = `${STAT_WORDS[stat].label} ${num(v, 3)} ${STAT_WORDS[stat].unit} (normal ${num(range.min)} to ${num(range.max)})`.replace(/ +\)/, ')');
      (why ? excused : outside).push(why ? `${words}: ${why}` : words);
    }
    if (outside.length > 0) out.push(result('rules', 'replica.ranges', item, 'fail', `Outside the game's normal range: ${outside.join('; ')}.`));
    else if (excused.length > 0) out.push(result('rules', 'replica.ranges', item, 'pass', `Inside the normal ranges but for the approved ${excused.join('; ')}.`));
    else out.push(result('rules', 'replica.ranges', item, 'pass', 'Every number is inside the game\'s normal range for its class.'));
  }

  // The site limit: as it comes (what bots carry), never past it.
  if (r.muzzleEnergy > r.energyLimit + 1e-9) out.push(result('rules', 'replica.siteLimit', item, 'fail', `As it comes it shoots ${num(r.muzzleEnergy, 3)} J, past its ${num(r.energyLimit)} J site limit.`));
  else out.push(result('rules', 'replica.siteLimit', item, 'pass', `As it comes it stays under its ${num(r.energyLimit)} J site limit (${num(r.muzzleEnergy, 3)} J).`));
  return out;
}

/** Level 2: does it work with everything it is meant to work with. */
export function replicaCompatibility(inputs: ContentInputs, replica: Asset): CheckResult[] {
  const item = itemName(replica);
  const r = inputs.replicas[replica.key];
  if (!r) return [];
  const out: CheckResult[] = [];
  const parts = partsFitting(inputs, replica);
  const tableName = drawTableOf(r);
  const table = inputs.drawTables[tableName];
  if (!table) out.push(result('compatibility', 'replica.model', item, 'fail', `Its model table "${tableName}" doesn't exist (render/replicas/replicaParts.ts REPLICA_PART_TABLES).`));
  else {
    const missing: string[] = [];
    for (const p of parts) {
      const d = drawName(p);
      if (d && !table[d.kind].includes(d.name)) missing.push(`${p.name} (${d.name})`);
    }
    const mags = r.magazines.filter((m) => !table.magazines.includes(m));
    if (mags.length > 0) missing.push(...mags.map((m) => `its ${m} magazine`));
    if (missing.length > 0) out.push(result('compatibility', 'replica.model', item, 'fail', `Its model doesn't draw ${missing.join(', ')}: a part that fits would float or vanish.`));
    else out.push(result('compatibility', 'replica.model', item, 'pass', `Its model ("${tableName}") draws every part that fits it (${parts.filter((p) => drawName(p)).length}) and its magazines.`));
  }

  const magParts = parts.filter((p) => p.category === 'magazine' && !r.magazines.includes(p.key as never));
  if (magParts.length > 0) out.push(result('compatibility', 'replica.magazines', item, 'fail', `${magParts.map((p) => p.name).join(', ')} fit by tag but its config doesn't list them (ReplicaConfig.magazines).`));

  const power = parts.filter((p) => p.category === 'power');
  if (hasBuiltInPower(replica)) out.push(result('compatibility', 'replica.power', item, power.length === 0 ? 'pass' : 'fail', power.length === 0 ? 'Its battery is built in and no power source fits.' : `Its battery is built in, yet ${power.map((p) => p.name).join(', ')} fit.`));
  else if (power.length === 0) out.push(result('compatibility', 'replica.power', item, 'fail', 'No power source fits it, so it can never shoot.'));
  else if (!power.some((p) => (inputs.levels.unlockLevel.get(p.id) ?? Number.POSITIVE_INFINITY) <= (inputs.levels.unlockLevel.get(replica.id) ?? 0))) out.push(result('compatibility', 'replica.power', item, 'warn', `None of its power sources (${power.map((p) => p.name).join(', ')}) unlocks by its own level (levels.md): a player who unlocks it can't shoot it until a later level.`));
  else out.push(result('compatibility', 'replica.power', item, 'pass', `Power sources that fit: ${power.map((p) => p.name).join(', ')}.`));

  const unused = replica.tags.filter((t) => !DESCRIPTIVE_TAGS.includes(t) && !inputs.pool.assets.some((a) => a.category !== 'replica' && a.tags.includes(t)));
  if (unused.length > 0) out.push(result('compatibility', 'replica.tags', item, 'warn', `No part uses its tag${unused.length > 1 ? 's' : ''} ${unused.join(', ')} yet.`));
  else out.push(result('compatibility', 'replica.tags', item, 'pass', 'Every tag it has is used by a part.'));

  // Customise's rows are the Loadout's own call (LoadoutModel.hasSlot): a row for each slot a part fits.
  const loadout = new LoadoutModel(inputs.pool, { owns: () => true });
  const expected = FIT_SLOTS.filter((s) => parts.some((p) => p.category === FIT_CATEGORY[s]));
  const rows = FIT_SLOTS.filter((s) => loadout.hasSlot(replica.id, s));
  if (rows.join() !== expected.join()) out.push(result('compatibility', 'replica.customise', item, 'fail', `Customise shows the rows ${rows.join(', ') || 'none'}; the parts that fit it need ${expected.join(', ') || 'none'}.`));
  else out.push(result('compatibility', 'replica.customise', item, 'pass', rows.length > 0 ? `Customise shows it with the rows ${rows.join(', ')}.` : 'Customise shows it with no part rows.'));

  const profile = r.look.sound ?? r.power;
  const sounds = [cues.shot(profile), cues.dryFire(profile), cues.magOut(profile), cues.magIn(profile)].filter((c) => !inputs.soundCues.has(c));
  if (sounds.length > 0) out.push(result('compatibility', 'replica.sound', item, 'fail', `It has no ${sounds.join(', ')} sound.`));
  else out.push(result('compatibility', 'replica.sound', item, 'pass', `It sounds as ${profile} (shot, dry fire, magazine out and in).`));

  const optic = parts.some((p) => p.category === 'optic');
  if (optic && !r.look.aimHold) out.push(result('compatibility', 'replica.hold', item, 'warn', 'An optic fits it but it has no aim hold: it aims through the optic from its hip hold.'));
  else out.push(result('compatibility', 'replica.hold', item, 'pass', optic ? 'It has a hold and an aim hold for its optics.' : 'It has a hold.'));

  const siteClass = siteClassOf(inputs, replica);
  if (siteClass) {
    const grid = kitGrid(inputs.pool, replica, siteClass);
    const tried = grid.tried < grid.combinations ? `${grid.tried} (spread over all ${grid.combinations})` : `all ${grid.combinations}`;
    const fails = grid.problems.filter((p) => p.severity === 'fail');
    const warns = grid.problems.filter((p) => p.severity === 'warn');
    if (fails.length > 0) out.push(result('compatibility', 'replica.kits', item, 'fail', `Of ${tried} kits, ${fails.length} break: ${fails.slice(0, 3).map((p) => `${p.fit}: ${p.says}`).join('; ')}.`));
    else if (warns.length > 0) out.push(result('compatibility', 'replica.kits', item, 'warn', `Of ${tried} kits none breaks, but ${warns.length} run past the normal ranges: ${warns.slice(0, 3).map((p) => `${p.fit}: ${p.says}`).join('; ')}.`));
    else out.push(result('compatibility', 'replica.kits', item, 'pass', `Every one of ${tried} kits it can wear works, under the site limit.`));
    const s = grid.strongest;
    if (s.uncapped > s.limit) out.push(result('compatibility', 'replica.stack', item, 'info', `Its strongest kit would shoot ${num(s.uncapped, 3)} J; the site limit stops it at ${num(s.limit)} J (${s.fit}).`));
    else out.push(result('compatibility', 'replica.stack', item, 'info', `Its strongest kit shoots ${num(s.uncapped, 3)} J, under the ${num(s.limit)} J limit (${s.fit}).`));
  }
  return out;
}

/** No difficulty's weight: a kit made up for the check, never picked. */
const UNWEIGHTED = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, 0])) as Record<Difficulty, number>;

/**
 * Level 2, the bots (BG1): a bot can carry it as it comes and with each part that fits it (one at a time, as a kit in
 * bot-kits.md would fit it), under its site limit; and some kit in bot-kits.md carries it, or the other team never
 * brings it.
 */
export function replicaBotChecks(inputs: ContentInputs, replica: Asset): CheckResult[] {
  const item = itemName(replica);
  const r = inputs.replicas[replica.key];
  if (!r) return [];
  const problems: string[] = [];
  const fitting = partsFitting(inputs, replica).filter((p) => p.category !== 'light');
  for (const part of [null, ...fitting]) {
    // As it comes a bot carries the replica config the inputs hold; with a part, as the game kits it (pool/kit.ts).
    const kit: BotKit = { name: item, slots: [{ replica: replica.id, parts: part ? [part.id] : [] }], suits: [], weights: UNWEIGHTED };
    const carried = (part ? kittedBot(1, 1, inputs.pool, kit) : createCharacter(1, vec3(), 0, [r], 1)).armament.replicas[0];
    const fitted = part ? ` with the ${part.name}` : '';
    if (!carried || carried.id !== r.id) problems.push(`a bot given it${fitted} carries something else`);
    else if (!(carried.muzzleEnergy > 0 && carried.muzzleEnergy <= carried.energyLimit + 1e-9)) problems.push(`a bot's${fitted} shoots ${num(carried.muzzleEnergy, 3)} J`);
  }
  if (problems.length > 0) return [result('compatibility', 'replica.bots', item, 'fail', `Bots can't carry it: ${[...new Set(problems)].join('; ')}.`)];
  const carries = `Bots carry it as it comes and with each of the ${fitting.length} parts that fit it`;
  if (!inputs.botKits) return [result('compatibility', 'replica.bots', item, 'pass', `${carries}.`)];
  const kits = inputs.botKits.kits.filter((k) => k.slots.some((s) => s.replica === replica.id) && DIFFICULTIES.some((d) => k.weights[d.id] > 0));
  if (kits.length === 0) return [result('compatibility', 'replica.bots', item, 'warn', `${carries}, but no kit in bot-kits.md weighted above 0 holds it: the other team never brings it.`)];
  return [result('compatibility', 'replica.bots', item, 'pass', `${carries}; ${kits.length} kit${kits.length > 1 ? 's' : ''} in bot-kits.md hold${kits.length > 1 ? '' : 's'} it (${kits.map((k) => k.name).join(', ')}).`)];
}

/**
 * Level 2, the save: a kit with a part in every slot that takes one, saved and read back by a fresh Loadout, comes back
 * the same. The caller installs an empty localStorage first (the checks' runners do).
 */
export function replicaSaveCheck(inputs: ContentInputs, replica: Asset): CheckResult[] {
  const item = itemName(replica);
  const all = (ref: ItemRef): boolean => inputs.pool.byId.has(ref.asset);
  const owner = { owns: all };
  const ref = (a: Asset): ItemRef => ({ asset: a.id });
  const first = new LoadoutModel(inputs.pool, owner);
  const wanted: Partial<Record<FitSlot, string>> = {};
  for (const slot of FIT_SLOTS) {
    const part = partsFitting(inputs, replica).find((p) => p.category === FIT_CATEGORY[slot]);
    if (!part) continue;
    first.setFit(replica.id, slot, ref(part));
    wanted[slot] = itemKey(ref(part));
  }
  first.equip('primary', ref(replica));
  const back = new LoadoutModel(inputs.pool, owner);
  const fit = back.fitOf(replica.id);
  const lost = (Object.keys(wanted) as FitSlot[]).filter((s) => (fit[s] ? itemKey(fit[s]!) : null) !== wanted[s]);
  const equipped = back.equipped()[0];
  if (lost.length > 0 || equipped?.asset !== replica.id) {
    return [result('compatibility', 'replica.save', item, 'fail', `A saved kit didn't come back: ${lost.length > 0 ? `the ${lost.join(', ')} slot${lost.length > 1 ? 's' : ''}` : 'the replica itself'}.`)];
  }
  return [result('compatibility', 'replica.save', item, 'pass', `Equipped with a part in every slot (${Object.keys(wanted).length}), it saves and loads unchanged.`)];
}
