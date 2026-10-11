import type { MatchMode } from '../config/modes';
import { brandsIn } from './assetRules';
import { type CheckResult, result } from './checks';
import { hostMaps, listWords, type ModeContext, type ModeEntry, modeItem } from './modeCheckSupport';

/** Level 1 of a mode's checks (CT3): its rules (docs/content/modes.md › Checks). */

/** A mode id the records can key (stats/records.ts RESULT_KEY: a camel-case word). */
const MODE_ID = /^[a-z][a-zA-Z0-9]*$/;

/** Registered with a label, a blurb and a unique id the records can key; what it is and what fits it are said. */
function registered(mode: ModeEntry, ctx: ModeContext): CheckResult {
  const item = modeItem(mode);
  const missing = [!mode.label.trim() && 'a label', !mode.blurb.trim() && 'a blurb'].filter(Boolean);
  const brands = brandsIn(`${mode.label} ${mode.blurb}`);
  const unsaid = [!ctx.shapes[mode.id] && 'what it is (config/modes.ts MODE_SHAPES)', !ctx.fit[mode.id] && 'what fits it (config/matchRules.ts MODE_FIT)'].filter(Boolean);
  if (missing.length > 0) return result('rules', 'mode.registered', item, 'fail', `Its entry in config/modes.ts MATCH_MODES has no ${missing.join(' or ')}.`);
  if (brands.length > 0) return result('rules', 'mode.registered', item, 'fail', `Its name or blurb uses a real brand (${brands.join(', ')}).`);
  if (!MODE_ID.test(mode.id)) return result('rules', 'mode.registered', item, 'fail', `Its id "${mode.id}" is not one word in camel case, which the records' cells need ("normal.${mode.id}").`);
  if (ctx.modes.filter((m) => m.id === mode.id).length > 1) return result('rules', 'mode.registered', item, 'fail', `Its id "${mode.id}" is used by another mode too. Ids are save keys and never change.`);
  if (unsaid.length > 0) return result('rules', 'mode.registered', item, 'fail', `Nothing says ${listWords(unsaid as string[])}.`);
  return result('rules', 'mode.registered', item, 'pass', `Registered as "${mode.id}": "${mode.blurb}"`);
}

/** Dev until the public gate; a public mode is in the register. */
function access(mode: ModeEntry, ctx: ModeContext): CheckResult {
  const item = modeItem(mode);
  if (mode.tag === 'dev') return result('rules', 'mode.access', item, 'pass', 'Tagged dev: only you see it, with Dev content on.');
  if (ctx.publicModes[mode.id]) return result('rules', 'mode.access', item, 'pass', `Public (${ctx.publicModes[mode.id]}).`);
  return result('rules', 'mode.access', item, 'fail', 'Tagged public without going through the public gate. Tag it dev until it passes.');
}

/** Its id is pinned once it ships (saved picks and the records use it); a public mode has shipped. */
function pinned(mode: ModeEntry, ctx: ModeContext): CheckResult {
  const item = modeItem(mode);
  if (ctx.shipped.includes(mode.id)) return result('rules', 'mode.id', item, 'pass', `Pinned: "${mode.id}" is in players' saves, so it never changes.`);
  if (mode.tag === 'public') return result('rules', 'mode.id', item, 'fail', `Public, but "${mode.id}" is not pinned: add it to config/contentRules.ts SHIPPED_MODE_IDS.`);
  return result('rules', 'mode.id', item, 'pass', `A new id; it joins config/contentRules.ts SHIPPED_MODE_IDS when it first ships in a build, and never changes after.`);
}

/**
 * Every place that says something of its own answers for it (GAME_PROBES): an answer, and in its own words where the
 * rulebook asks for them. The rest of the places are held at compile time (the never-check) or go by its id, listed in
 * the report.
 */
function wiring(mode: ModeEntry, ctx: ModeContext): CheckResult {
  const item = modeItem(mode);
  const map = hostMaps(ctx, mode.id)[0]?.data ?? ctx.maps[0]?.data;
  if (!map) return result('rules', 'mode.wiring', item, 'fail', 'No map to ask the places about.');
  const ask = (probe: (typeof ctx.probes)[number], id: MatchMode): string | Error => {
    try {
      const said = probe.answer(id, map);
      return said.trim() ? said : new Error('an empty answer');
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  };
  const silent: string[] = [];
  const asElimination: string[] = [];
  const shared: string[] = [];
  for (const probe of ctx.probes) {
    const said = ask(probe, mode.id);
    if (said instanceof Error) {
      silent.push(`${probe.place} (${probe.where}: ${said.message})`);
      continue;
    }
    if (mode.id === 'elimination') continue;
    if (said === ask(probe, 'elimination')) (probe.own ? asElimination : shared).push(probe.place);
  }
  if (silent.length > 0) return result('rules', 'mode.wiring', item, 'fail', `No answer for it in ${listWords(silent)}.`);
  if (asElimination.length > 0) return result('rules', 'mode.wiring', item, 'fail', `It says what Elimination says in ${listWords(asElimination)}: a mode played as Elimination is not finished.`);
  const own = ctx.probes.length - shared.length;
  return result('rules', 'mode.wiring', item, 'pass', `${ctx.probes.length} places answer for it${mode.id === 'elimination' ? '' : `, ${own} in its own words${shared.length > 0 ? `, ${listWords(shared)} as Elimination's` : ''}`}; every other place answers at compile time or by its id.`);
}

/** What it needs from a map, and which maps have it: at least one, and a public map for a public mode. */
function maps(mode: ModeEntry, ctx: ModeContext): CheckResult {
  const item = modeItem(mode);
  const shape = ctx.shapes[mode.id];
  if (!shape) return result('rules', 'mode.maps', item, 'fail', 'Nothing says what it needs from a map (config/modes.ts MODE_SHAPES).');
  const hosts = hostMaps(ctx, mode.id);
  const needs = shape.needs === null ? 'nothing from a map' : shape.needs === 'flag' ? 'a flagpole' : 'its Extraction data (the insertion, exits and cases)';
  const names = hosts.map((m) => `${m.entry.label}${m.entry.tag === 'dev' ? ' (dev)' : ''}`);
  if (hosts.length === 0) return result('rules', 'mode.maps', item, 'fail', `It needs ${needs}, and no map has it.`);
  if (mode.tag === 'public' && !hosts.some((m) => m.entry.tag === 'public')) return result('rules', 'mode.maps', item, 'fail', `Public, but only dev maps host it (${listWords(names)}).`);
  const others = ctx.maps.filter((m) => !hosts.includes(m)).map((m) => m.entry.label);
  const without = others.length === 0 ? '' : shape.without === 'elimination' ? ` On ${listWords(others)} it plays as Elimination.` : ` ${listWords(others)} don't offer it.`;
  return result('rules', 'mode.maps', item, 'pass', `It needs ${needs}; ${listWords(names)} ${hosts.length === 1 ? 'has' : 'have'} it (each map's own checks look after that data).${without}`);
}

/** Level 1 for one mode. */
export function modeRules(mode: ModeEntry, ctx: ModeContext): CheckResult[] {
  return [registered(mode, ctx), access(mode, ctx), pinned(mode, ctx), wiring(mode, ctx), maps(mode, ctx)];
}

/** Every pinned id is still a mode: a save's picks and records would otherwise point at nothing. */
export function pinnedModes(ctx: ModeContext): CheckResult {
  const gone = ctx.shipped.filter((id) => !ctx.modes.some((m) => m.id === id));
  if (gone.length > 0) return result('rules', 'mode.pinned', 'Every mode', 'fail', `${listWords(gone.map((g) => `"${g}"`))} ${gone.length === 1 ? 'is' : 'are'} in players' saves but no longer a mode. A mode id never goes away.`);
  return result('rules', 'mode.pinned', 'Every mode', 'pass', `All ${ctx.shipped.length} ids in players' saves are still modes.`);
}
