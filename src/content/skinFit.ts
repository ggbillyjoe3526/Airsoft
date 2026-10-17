import type { ReplicaPaint, SchemeId } from '../config/schemes';
import type { MaterialKey } from '../render/replicas/replicaBuilder';
import { type CheckResult, num, result } from './checks';
import { colourDistance } from './colour';
import { claimedReplicas, hex, listWords, type SkinContext, type SkinEntry, skinItem, type SkinReplica } from './skinCheckSupport';
import { DETAILS, surveyViewmodel, type ViewmodelSurvey } from './skinDraw';

/**
 * Level 2 of a skin's checks (CT4; docs/content/skins.md): it is drawn on every replica it claims at Low and High (and
 * from each model file the context gives), the orange tip still shows with it, Realistic colours turns it into its one
 * family, and it never changes a number (the kit is the same with it and without, and nothing that decides play reads
 * a skin's colours).
 */

/** A drawn colour is the scheme's when they are this close (ΔE00): the builders' brightening rounds a little. */
const SAME = 1.5;

/** The colour each painted material of a replica is drawn in, by the scheme's roles (render/replicas/replicaBuilder.ts paintedMaterials). */
const ROLE_OF: Partial<Record<MaterialKey, 'body' | 'furniture' | 'detail' | 'steel' | 'accent'>> = {
  polymer: 'body',
  furniture: 'furniture',
  detail: 'detail',
  metal: 'steel',
  accent: 'accent',
};

/** The materials a scheme paints (the stippled panels are the furniture's colour, a shade darker). */
const SCHEME_KEYS = new Set<MaterialKey>(['polymer', 'furniture', 'detail', 'metal', 'stipple', 'accent']);

/** The model files' variant of a draw: the built-in models, and each replica's file when the context gives one. */
function sources(ctx: SkinContext, r: SkinReplica): { label: string; files: SkinContext['files'] | undefined }[] {
  return [{ label: '', files: undefined }, ...(ctx.files.has(r.config.id) ? [{ label: ' from its model file', files: ctx.files }] : [])];
}

const memo = new Map<string, ViewmodelSurvey | Error>();

/** `r` drawn in first person with `skin` (realistic or not), memoised; an Error when the game can't draw it. */
export function drawn(ctx: SkinContext, r: SkinReplica, skin: string | null, realistic: boolean, detail: (typeof DETAILS)[number], files?: SkinContext['files']): ViewmodelSurvey | Error {
  const key = `${r.config.id}|${skin}|${realistic}|${detail.id}|${files ? 'file' : 'built'}`;
  const known = memo.get(key);
  if (known) return known;
  let out: ViewmodelSurvey | Error;
  try {
    const paint: ReplicaPaint | null = skin === null ? null : { schemes: [skin as SchemeId], realistic };
    out = surveyViewmodel(r.config, paint, detail.detail, ctx.rules.tipReach, files);
  } catch (e) {
    out = e instanceof Error ? e : new Error(String(e));
  }
  memo.set(key, out);
  return out;
}

/** The painted parts not in the colours `expected` gives their role; [] when all are. */
function offColour(survey: ViewmodelSurvey, expected: (role: 'body' | 'furniture' | 'detail' | 'steel' | 'accent') => number): string[] {
  return survey.parts.flatMap((p) => {
    const role = ROLE_OF[p.key];
    if (!role) return [];
    const want = expected(role);
    return colourDistance(p.colour, want) > SAME ? [`its ${role} is ${hex(p.colour)}, not ${hex(want)}`] : [];
  });
}

/** Drawn on every replica it claims, at Low and High: every painted part in its colours, which cover most of the replica. */
export function skinDrawn(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const wrong: string[] = [];
  const shares: number[] = [];
  const on = claimedReplicas(ctx);
  for (const r of on) {
    for (const d of DETAILS) {
      for (const src of sources(ctx, r)) {
        const where = `the ${r.name} on ${d.label}${src.label}`;
        const s = drawn(ctx, r, skin.id, false, d, src.files);
        if (s instanceof Error) {
          wrong.push(`the game can't draw it on ${where} (${s.message})`);
          continue;
        }
        const off = offColour(s, (role) => skin.scheme[role]);
        if (off.length > 0) wrong.push(`on ${where} ${off.join(', ')}`);
        const total = s.parts.reduce((a, p) => a + p.area, 0);
        const share = total > 0 ? s.parts.filter((p) => SCHEME_KEYS.has(p.key)).reduce((a, p) => a + p.area, 0) / total : 0;
        if (!s.parts.some((p) => p.key === 'polymer')) wrong.push(`on ${where} its body is not drawn`);
        else if (share < ctx.rules.drawnShare) wrong.push(`on ${where} its colours cover ${num(100 * share, 0)} % of the replica (at least ${num(100 * ctx.rules.drawnShare, 0)} %)`);
        shares.push(share);
      }
    }
  }
  // A replica with its own colours keeps them whatever the skin.
  const fixed = ctx.replicas.filter((r) => !on.includes(r));
  for (const r of fixed) {
    const s = drawn(ctx, r, skin.id, false, DETAILS[1]!);
    const own = drawn(ctx, r, null, false, DETAILS[1]!);
    if (s instanceof Error || own instanceof Error) continue;
    const changed = s.parts.filter((p) => !own.parts.some((o) => o.key === p.key && colourDistance(o.colour, p.colour) <= SAME));
    if (changed.length > 0) wrong.push(`the ${r.name} keeps its own colours, but with it its ${listWords(changed.map((p) => p.key))} change`);
  }
  if (wrong.length > 0) return result('compatibility', 'skin.drawn', item, 'fail', `Not drawn as it is: ${wrong.slice(0, 3).join('; ')}${wrong.length > 3 ? `; and ${wrong.length - 3} more` : ''}.`);
  return result('compatibility', 'skin.drawn', item, 'pass', `Drawn on ${listWords(on.map((r) => `the ${r.name}`))} at Low and High${on.some((r) => ctx.files.has(r.config.id)) ? ' (and from the model files)' : ''}, every painted part in its colours, which cover ${num(100 * Math.min(...shares), 0)} to ${num(100 * Math.max(...shares), 0)} % of the replica${fixed.length > 0 ? `; ${listWords(fixed.map((r) => `the ${r.name}`))} ${fixed.length === 1 ? 'keeps its' : 'keep their'} own colours` : ''}.`);
}

/** With the orange tip setting on, the tip is still drawn, and stands apart from the colours around it. */
export function skinOrangeTip(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const missing: string[] = [];
  const close: { where: string; d: number; colour: number }[] = [];
  let nearest = Infinity;
  for (const r of claimedReplicas(ctx)) {
    for (const d of DETAILS) {
      for (const src of sources(ctx, r)) {
        const where = `the ${r.name} on ${d.label}${src.label}`;
        const s = drawn(ctx, r, skin.id, false, d, src.files);
        if (s instanceof Error) continue; // skin.drawn says why
        const tip = s.parts.find((p) => p.key === 'orange');
        if (!s.tip || !tip) {
          missing.push(where);
          continue;
        }
        for (const c of s.tip.around) {
          const dist = colourDistance(c, tip.colour);
          nearest = Math.min(nearest, dist);
          if (dist < ctx.rules.tipApart) close.push({ where, d: dist, colour: c });
        }
      }
    }
  }
  if (missing.length > 0) return result('compatibility', 'skin.orangeTip', item, 'fail', `With the orange tip setting on, no tip is drawn on ${listWords(missing)}.`);
  if (close.length > 0) {
    const worst = close.sort((a, b) => a.d - b.d)[0]!;
    const wheres = [...new Set(close.map((c) => c.where))];
    return result('compatibility', 'skin.orangeTip', item, 'warn', `The orange tip is drawn, but on ${listWords(wheres)} it sits against ${hex(worst.colour)}, only ${num(worst.d, 0)} apart in colour (at least ${ctx.rules.tipApart} reads): with the setting on, the tip hardly shows there.`);
  }
  return result('compatibility', 'skin.orangeTip', item, 'pass', `With the orange tip setting on, the tip is drawn on every replica and stands at least ${num(nearest, 0)} apart in colour from the colours around it (${ctx.rules.tipApart} reads).`);
}

/** Under Realistic colours it is drawn in its one family's colours, on every replica it claims, at Low and High. */
export function skinRealistic(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const family = ctx.families[skin.scheme.family];
  if (!family) return result('compatibility', 'skin.realistic', item, 'fail', 'It has no Realistic colours family to turn into (skin.family says why).');
  const wrong: string[] = [];
  for (const r of claimedReplicas(ctx)) {
    for (const d of DETAILS) {
      for (const src of sources(ctx, r)) {
        const s = drawn(ctx, r, skin.id, true, d, src.files);
        if (s instanceof Error) continue; // skin.drawn says why
        const off = offColour(s, (role) => family[role]);
        if (off.length > 0) wrong.push(`on the ${r.name} on ${d.label}${src.label} ${off.join(', ')}`);
      }
    }
  }
  if (wrong.length > 0) return result('compatibility', 'skin.realistic', item, 'fail', `Realistic colours doesn't turn it ${family.name} throughout: ${wrong.slice(0, 3).join('; ')}.`);
  return result('compatibility', 'skin.realistic', item, 'pass', `Realistic colours turns it ${family.name} throughout, on every replica, with no other family mixed in.`);
}

/** The match plays the same kit with it and without: every number of each replica it claims, as carried. */
export function skinNumbers(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const differ: string[] = [];
  const cannot: string[] = [];
  for (const r of claimedReplicas(ctx)) {
    const plain = ctx.defaults[r.config.look.model] ?? ctx.shipped[0]!;
    try {
      if (ctx.kitWith(r.id, skin.id) !== ctx.kitWith(r.id, plain)) differ.push(r.name);
    } catch (e) {
      cannot.push(`the ${r.name} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  if (cannot.length > 0) return result('compatibility', 'skin.numbers', item, 'fail', `A player can't carry it on ${listWords(cannot)}.`);
  if (differ.length > 0) return result('compatibility', 'skin.numbers', item, 'fail', `The ${listWords(differ)} ${differ.length === 1 ? 'plays' : 'play'} differently with it: a skin never changes a number.`);
  return result('compatibility', 'skin.numbers', item, 'pass', `Every number of ${listWords(claimedReplicas(ctx).map((r) => `the ${r.name}`))} is the same with it and with the default colour.`);
}

/** What only passes a scheme's id along, and never reads its colours (config/schemes.ts). */
export const SCHEME_ID_NAMES: readonly string[] = ['defaultScheme', 'botScheme', 'isSchemeId', 'offeredSchemes', 'SCHEME_IDS'];

/**
 * Nothing that decides play (the simulation, the bots, physics, the nav grid and the kit's numbers, and everything they
 * reach) reads a skin: those that reach the schemes at all only pass a scheme's id along.
 */
export function playReadsNoSkin(ctx: SkinContext): CheckResult {
  const readers = ctx.playImports.filter((i) => i.names.some((n) => !SCHEME_ID_NAMES.includes(n)));
  if (readers.length > 0) return result('compatibility', 'skin.looksOnly', 'Every skin', 'fail', `Code that decides play reads the colour schemes: ${readers.map((r) => `${r.file} (${r.names.filter((n) => !SCHEME_ID_NAMES.includes(n)).join(', ')})`).join('; ')}. A skin must never reach a number.`);
  const carriers = ctx.playImports.map((i) => `${i.file} (${i.names.join(', ')})`);
  return result('compatibility', 'skin.looksOnly', 'Every skin', 'pass', `Nothing that decides play reads a skin's colours${carriers.length > 0 ? `; only ${listWords(carriers)} ${carriers.length === 1 ? 'passes' : 'pass'} a scheme's id along` : ''}.`);
}
