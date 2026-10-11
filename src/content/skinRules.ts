import { brandsIn, isTitleCase } from './assetRules';
import { type CheckResult, result } from './checks';
import { claimedReplicas, hex, listWords, type SkinContext, type SkinEntry, skinItem, teamName } from './skinCheckSupport';

/** Level 1 of a skin's checks (CT4): its rules (docs/content/skins.md › Checks). */

/** A skin id the saves can key (`scheme.<replica>`): one word in camel case. */
const SKIN_ID = /^[a-z][a-zA-Z0-9]*$/;

const COLOUR_ROLES = ['body', 'furniture', 'detail', 'accent', 'steel'] as const;

/** Registered with a Title Case name that is no brand, a save-key id and real colours; no other skin shares either. */
function registered(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const { name } = skin.scheme;
  const brands = brandsIn(name);
  if (!name.trim()) return result('rules', 'skin.registered', item, 'fail', 'It has no name (config/schemes.ts SCHEMES).');
  if (brands.length > 0) return result('rules', 'skin.registered', item, 'fail', `Its name uses a real brand or model (${brands.join(', ')}). Give it a made-up name.`);
  if (!isTitleCase(name)) return result('rules', 'skin.registered', item, 'fail', 'Its name is not in Title Case (each word starts with a capital).');
  if (!SKIN_ID.test(skin.id)) return result('rules', 'skin.registered', item, 'fail', `Its id "${skin.id}" is not one word in camel case, which a save key needs ("scheme.<replica>" holds it).`);
  if (ctx.skins.filter((s) => s.id === skin.id).length > 1) return result('rules', 'skin.registered', item, 'fail', `Its id "${skin.id}" is used by another skin too. Ids are save keys and never change.`);
  const twin = ctx.skins.find((s) => s !== skin && s.scheme.name.toLowerCase() === name.toLowerCase());
  if (twin) return result('rules', 'skin.registered', item, 'fail', `"${twin.id}" has the same name, so Customise would show two "${name}" tiles.`);
  const bad = COLOUR_ROLES.filter((r) => !(Number.isInteger(skin.scheme[r]) && skin.scheme[r] >= 0 && skin.scheme[r] <= 0xffffff));
  if (bad.length > 0) return result('rules', 'skin.registered', item, 'fail', `Its ${listWords(bad)} ${bad.length === 1 ? 'is not a colour' : 'are not colours'} (0x000000 to 0xffffff).`);
  return result('rules', 'skin.registered', item, 'pass', `Registered as "${skin.id}": ${COLOUR_ROLES.map((r) => `${r} ${hex(skin.scheme[r])}`).join(', ')}${skin.scheme.glow ? ' (the accent glows)' : ''}.`);
}

/** The one plain family Realistic colours turns it into, and that family exists. */
function family(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const f = ctx.families[skin.scheme.family];
  if (!f) return result('rules', 'skin.family', item, 'fail', `Its family "${skin.scheme.family}" is not one of the Realistic colours families (${listWords(Object.keys(ctx.families))}).`);
  return result('rules', 'skin.family', item, 'pass', `Under Realistic colours it turns ${f.name}.`);
}

/** Dev until the public gate; a public skin is in the register; every skin says which. */
function access(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  if (skin.scheme.tag === undefined) return result('rules', 'skin.access', item, 'fail', "It doesn't say whether it is dev or public: give it a `tag` (dev until it passes the public gate).");
  if (skin.scheme.tag === 'dev') return result('rules', 'skin.access', item, 'pass', 'Tagged dev: only you see it, with Dev content on.');
  if (ctx.publicSkins[skin.id]) return result('rules', 'skin.access', item, 'pass', `Public (${ctx.publicSkins[skin.id]}).`);
  return result('rules', 'skin.access', item, 'fail', 'Tagged public without going through the public gate. Tag it dev until it passes.');
}

/** Its id is pinned once it ships (players' saved picks use it); a public skin has shipped. */
function pinned(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  if (ctx.shipped.includes(skin.id)) return result('rules', 'skin.id', item, 'pass', `Pinned: "${skin.id}" is in players' saves, so it never changes.`);
  if (skin.scheme.tag === 'public') return result('rules', 'skin.id', item, 'fail', `Public, but "${skin.id}" is not pinned: add it to config/contentRules.ts SHIPPED_SCHEME_IDS.`);
  return result('rules', 'skin.id', item, 'pass', 'A new id; it joins config/contentRules.ts SHIPPED_SCHEME_IDS when it first ships in a build, and never changes after.');
}

/** Customise offers it as its tag says: a public skin to everyone, a dev one only with Dev content on. */
function offered(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const off = ctx.offered(false).includes(skin.id);
  const on = ctx.offered(true).includes(skin.id);
  if (!on) return result('rules', 'skin.offered', item, 'fail', 'Customise never offers it, even with Dev content on (config/schemes.ts offeredSchemes).');
  if (skin.scheme.tag === 'dev' && off) return result('rules', 'skin.offered', item, 'fail', 'Tagged dev, but Customise offers it with Dev content off.');
  if (skin.scheme.tag !== 'dev' && !off) return result('rules', 'skin.offered', item, 'fail', 'Public, but Customise hides it with Dev content off.');
  return result('rules', 'skin.offered', item, 'pass', skin.scheme.tag === 'dev' ? 'Customise offers it only with Dev content on; a saved pick of it plays as the default without.' : 'Customise offers it to everyone.');
}

/** The replicas it is drawn on: every replica that takes a skin, which must be some. */
function claims(skin: SkinEntry, ctx: SkinContext): CheckResult {
  const item = skinItem(skin);
  const on = claimedReplicas(ctx);
  const own = ctx.replicas.filter((r) => !on.includes(r)).map((r) => r.name);
  if (on.length === 0) return result('rules', 'skin.claims', item, 'fail', 'No replica in the pool takes a skin, so it is drawn on nothing.');
  return result('rules', 'skin.claims', item, 'pass', `It fits ${listWords(on.map((r) => `the ${r.name}`))}${own.length > 0 ? `; ${listWords(own.map((n) => `the ${n}`))} ${own.length === 1 ? 'keeps its' : 'keep their'} own colours` : ''}.`);
}

/** Level 1 for one skin. */
export function skinRules(skin: SkinEntry, ctx: SkinContext): CheckResult[] {
  return [registered(skin, ctx), family(skin, ctx), access(skin, ctx), pinned(skin, ctx), offered(skin, ctx), claims(skin, ctx)];
}

/** Every pinned id is still a skin: a save's picks would otherwise point at nothing. */
export function pinnedSkins(ctx: SkinContext): CheckResult {
  const gone = ctx.shipped.filter((id) => !ctx.skins.some((s) => s.id === id));
  if (gone.length > 0) return result('rules', 'skin.pinned', 'Every skin', 'fail', `${listWords(gone.map((g) => `"${g}"`))} ${gone.length === 1 ? 'is' : 'are'} in players' saves but no longer a skin. A skin id never goes away.`);
  return result('rules', 'skin.pinned', 'Every skin', 'pass', `All ${ctx.shipped.length} ids in players' saves are still skins.`);
}

/** A new player's replicas and the bots' wear public skins: a dev one would show to everyone. */
export function defaultSkins(ctx: SkinContext): CheckResult {
  const uses = [
    ...Object.entries(ctx.defaults).map(([model, id]) => ({ id, who: `a new player's ${model}` })),
    ...ctx.bots.flatMap((b, team) => Object.entries(b).map(([model, id]) => ({ id, who: `${teamName(ctx, team)}'s bots' ${model}` }))),
  ];
  const bad = uses.filter((u) => ctx.skins.find((s) => s.id === u.id)?.scheme.tag !== 'public');
  if (bad.length > 0) return result('rules', 'skin.defaults', 'Every skin', 'fail', `${listWords(bad.map((b) => `${b.who} (${b.id})`))} ${bad.length === 1 ? 'is' : 'are'} not a public skin: everyone would see ${bad.length === 1 ? 'it' : 'them'}.`);
  return result('rules', 'skin.defaults', 'Every skin', 'pass', `A new player's replicas and the bots' wear public skins (${listWords([...new Set(uses.map((u) => u.id))])}).`);
}
