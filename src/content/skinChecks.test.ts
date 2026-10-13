import { describe, expect, it } from 'vitest';
import { BOT_SCHEMES, offeredSchemes, SCHEME_IDS, SCHEMES } from '../config/schemes';
import { type CheckResult, worstVerdict } from './checks';
import { gamePlayImports, schemeNamesIn } from './report/playImports';
import { checkSkin, checkSkinList, checkSkins, defaultSkins, gameSkinContext, mapPalette, pinnedSkins, playReadsNoSkin, readableColours, type SkinContext, type SkinEntry, skinDrawn, skinNumbers, skinOnMap, skinOrangeTip, skinRealistic, skinRules, skinTeams, skinTexture } from './skinChecks';

/**
 * The content toolkit's skin checks (CT4): every skin the game ships passes levels 1 to 3 (all but the maps, which the
 * report measures in the browser), and each check fails on the fault it is there to catch (a context or skin with that
 * fault in it).
 */

const ctx = gameSkinContext(gamePlayImports());
const skinOf = (id: string): SkinEntry => ctx.skins.find((s) => s.id === id)!;
const COBALT = skinOf('cobalt');
const ACID = skinOf('acid');
const HAZARD = skinOf('hazard');
/** A new skin on its way in: dev, unpinned, a new id. The game can't draw it until it is in config/schemes.ts. */
const FRESH: SkinEntry = { id: 'lagoon', scheme: { ...SCHEMES.teal, name: 'Lagoon', tag: 'dev' } };
const withSkin = (skin: SkinEntry, change: Partial<SkinContext> = {}): SkinContext => ({ ...ctx, skins: [...ctx.skins, skin], ...change });

const verdictOf = (results: readonly CheckResult[], check: string): string | undefined => {
  const own = results.filter((r) => r.check === check);
  return own.length > 0 ? worstVerdict(own) : undefined;
};
const saysOf = (results: readonly CheckResult[], check: string): string => results.filter((r) => r.check === check).map((r) => r.says).join(' ');

describe('the skin checks on the game as it ships', () => {
  it.each(SCHEME_IDS)('pass %s', (id) => {
    const results = checkSkin(skinOf(id), ctx);
    const attention = results.filter((r) => r.verdict === 'fail' || r.verdict === 'warn').map((r) => `${r.check}: ${r.says}`);
    // Signal's orange furniture sits beside the GBB Pistol's orange tip (KNOWN_ISSUES › Look, CT4): the owner looks at it.
    expect(attention).toEqual(id === 'signal' ? [expect.stringMatching(/^skin\.orangeTip: The orange tip is drawn, but on the GBB Pistol/)] : []);
    expect(new Set(results.map((r) => r.check))).toEqual(
      new Set(['skin.registered', 'skin.family', 'skin.access', 'skin.id', 'skin.offered', 'skin.claims', 'skin.drawn', 'skin.orangeTip', 'skin.realistic', 'skin.numbers', 'skin.teams', 'skin.texture', 'skin.balance']),
    );
    expect(results.find((r) => r.check === 'skin.balance')?.verdict).toBe('info');
  });

  it('pass the list: pinned ids, defaults and bots, and play reads no skin', () => {
    expect(checkSkinList(ctx).map((r) => `${r.check} ${r.verdict}`)).toEqual(['skin.pinned pass', 'skin.defaults pass', 'skin.looksOnly pass']);
    expect(checkSkins(ctx)).toHaveLength(3 + 13 * SCHEME_IDS.length);
  });

  it('every scheme is a skin and every skin is pinned and public', () => {
    expect(ctx.skins.map((s) => s.id)).toEqual([...SCHEME_IDS]);
    expect([...ctx.shipped].sort()).toEqual([...SCHEME_IDS].sort());
    expect(Object.keys(ctx.publicSkins).sort()).toEqual([...SCHEME_IDS].sort());
    expect(offeredSchemes(false)).toEqual([...SCHEME_IDS]);
  });

  it('find no module of play that reaches the schemes (LV1: config/matchRules.ts was reached through the Armory, now gone)', () => {
    expect(ctx.playImports).toEqual([]);
  });

  it('see what a figure shows: the furniture most, a thin accent line too little to read at a distance', () => {
    const cobalt = readableColours(COBALT, ctx).map((c) => c.colour);
    expect(cobalt[0]).toBe(SCHEMES.cobalt.furniture);
    expect(cobalt).not.toContain(SCHEMES.cobalt.accent);
    expect(readableColours(skinOf('teal'), ctx).map((c) => c.colour)).not.toContain(SCHEMES.teal.accent);
  });
});

describe('a skin’s rules', () => {
  it('fail no name, a brand, a name not in Title Case and a name another skin has', () => {
    expect(verdictOf(skinRules({ ...ACID, scheme: { ...ACID.scheme, name: ' ' } }, ctx), 'skin.registered')).toBe('fail');
    const brand = skinRules({ ...ACID, scheme: { ...ACID.scheme, name: 'Magpul Acid' } }, ctx);
    expect(verdictOf(brand, 'skin.registered')).toBe('fail');
    expect(saysOf(brand, 'skin.registered')).toContain('Magpul');
    expect(verdictOf(skinRules({ ...ACID, scheme: { ...ACID.scheme, name: 'acid green' } }, ctx), 'skin.registered')).toBe('fail');
    const twin = { ...FRESH, scheme: { ...FRESH.scheme, name: 'Cobalt' } };
    expect(saysOf(skinRules(twin, withSkin(twin)), 'skin.registered')).toContain('same name');
  });

  it('fail an id that is no save key, an id used twice and a colour that is no colour', () => {
    const bad = { ...FRESH, id: 'Lagoon-2' };
    expect(verdictOf(skinRules(bad, withSkin(bad)), 'skin.registered')).toBe('fail');
    expect(verdictOf(skinRules(COBALT, { ...ctx, skins: [...ctx.skins, COBALT] }), 'skin.registered')).toBe('fail');
    expect(verdictOf(skinRules({ ...ACID, scheme: { ...ACID.scheme, furniture: 0x1000000 } }, ctx), 'skin.registered')).toBe('fail');
    expect(verdictOf(skinRules(FRESH, withSkin(FRESH)), 'skin.registered')).toBe('pass');
  });

  it('fail a family Realistic colours has not', () => {
    const results = skinRules({ ...ACID, scheme: { ...ACID.scheme, family: 'olive' as never } }, ctx);
    expect(verdictOf(results, 'skin.family')).toBe('fail');
    expect(saysOf(results, 'skin.family')).toContain('olive');
  });

  it('keep a new skin dev until the owner makes it public, and fail one that says neither', () => {
    expect(verdictOf(skinRules(FRESH, withSkin(FRESH)), 'skin.access')).toBe('pass');
    const pub = { ...FRESH, scheme: { ...FRESH.scheme, tag: 'public' as const } };
    expect(verdictOf(skinRules(pub, withSkin(pub)), 'skin.access')).toBe('fail');
    expect(verdictOf(skinRules(pub, withSkin(pub, { publicSkins: { ...ctx.publicSkins, lagoon: 'the owner, playtested' } })), 'skin.access')).toBe('pass');
    const { tag: _tag, ...untagged } = FRESH.scheme;
    expect(saysOf(skinRules({ ...FRESH, scheme: untagged }, withSkin(FRESH)), 'skin.access')).toContain('`tag`');
  });

  it('fail a public skin whose id is not pinned, and a pinned id that is no longer a skin', () => {
    expect(verdictOf(skinRules(FRESH, withSkin(FRESH)), 'skin.id')).toBe('pass');
    expect(saysOf(skinRules(COBALT, { ...ctx, shipped: ctx.shipped.filter((id) => id !== 'cobalt') }), 'skin.id')).toContain('SHIPPED_SCHEME_IDS');
    const gone = pinnedSkins({ ...ctx, skins: ctx.skins.filter((s) => s.id !== 'onyx') });
    expect(gone.verdict).toBe('fail');
    expect(gone.says).toContain('"onyx"');
  });

  it('fail Customise offering a dev skin without Dev content, hiding a public one, or never offering it', () => {
    const dev = { ...COBALT, scheme: { ...COBALT.scheme, tag: 'dev' as const } };
    expect(saysOf(skinRules(dev, ctx), 'skin.offered')).toContain('Dev content off');
    expect(verdictOf(skinRules(COBALT, { ...ctx, offered: (on) => (on ? SCHEME_IDS : SCHEME_IDS.filter((s) => s !== 'cobalt')) }), 'skin.offered')).toBe('fail');
    expect(saysOf(skinRules(FRESH, withSkin(FRESH)), 'skin.offered')).toContain('never offers it');
    expect(verdictOf(skinRules(FRESH, withSkin(FRESH, { offered: (on) => (on ? [...SCHEME_IDS, 'lagoon'] : SCHEME_IDS) })), 'skin.offered')).toBe('pass');
  });

  it('fail a skin when no replica takes one', () => {
    expect(verdictOf(skinRules(ACID, { ...ctx, replicas: ctx.replicas.filter((r) => r.config.look.viewmodel === 'cyber') }), 'skin.claims')).toBe('fail');
  });

  it('fail a bot or a new player wearing a dev skin', () => {
    const skins = ctx.skins.map((s) => (s.id === BOT_SCHEMES[1]!.pistol ? { ...s, scheme: { ...s.scheme, tag: 'dev' as const } } : s));
    const r = defaultSkins({ ...ctx, skins });
    expect(r.verdict).toBe('fail');
    expect(r.says).toContain("Beta's bots' pistol (coral)");
  });
});

describe('a skin’s fit: drawn, the tip, Realistic colours', () => {
  it('fail a skin the game draws in other colours, or can\'t draw at all', () => {
    const wrong = skinDrawn({ ...COBALT, scheme: { ...COBALT.scheme, furniture: 0x22a196 } }, ctx);
    expect(wrong.verdict).toBe('fail');
    expect(wrong.says).toContain('its furniture is #2f6fd6, not #22a196');
    expect(skinDrawn(FRESH, withSkin(FRESH)).says).toContain("the game can't draw it");
  });

  it('ask for a look where the tip sits against its own orange, and pass when the colours stand apart', () => {
    const signal = skinOrangeTip(skinOf('signal'), ctx);
    expect(signal.verdict).toBe('warn');
    expect(signal.says).toContain('#ff5a1f');
    expect(skinOrangeTip(skinOf('signal'), { ...ctx, rules: { ...ctx.rules, tipApart: 3 } }).verdict).toBe('pass');
    expect(skinOrangeTip(ACID, { ...ctx, rules: { ...ctx.rules, tipApart: 100 } }).verdict).toBe('warn');
  });

  it('fail Realistic colours turning it another family than it says', () => {
    const r = skinRealistic({ ...COBALT, scheme: { ...COBALT.scheme, family: 'tan' } }, ctx);
    expect(r.verdict).toBe('fail');
    expect(r.says).toContain('Tan');
  });
});

describe('a skin is looks only', () => {
  it('fail a kit that plays differently with it, or that can\'t carry it', () => {
    expect(skinNumbers(ACID, { ...ctx, kitWith: (r, s) => `${r}${s === 'acid' ? '+1' : ''}` }).verdict).toBe('fail');
    expect(skinNumbers(FRESH, withSkin(FRESH)).says).toContain("can't carry it");
  });

  it('fail code that decides play reading the schemes, by name or by a re-export', () => {
    const reads = playReadsNoSkin({ ...ctx, playImports: [...ctx.playImports, { file: 'src/sim/armament.ts', names: ['SCHEMES'] }] });
    expect(reads.verdict).toBe('fail');
    expect(reads.says).toContain('src/sim/armament.ts (SCHEMES)');
    expect(playReadsNoSkin({ ...ctx, playImports: [{ file: 'src/ai/x.ts', names: ['*'] }] }).verdict).toBe('fail');
  });

  it('read the names an import takes, leaving out type-only ones', () => {
    expect(schemeNamesIn("import { defaultScheme, type SchemeId } from './schemes';\nimport { x } from './other';")).toEqual(['defaultScheme']);
    expect(schemeNamesIn("import type { Scheme } from '../config/schemes';")).toEqual([]);
    expect(schemeNamesIn("import {\n  SCHEMES as S,\n  botScheme,\n} from '../config/schemes';")).toEqual(['SCHEMES', 'botScheme']);
  });
});

describe('a skin’s spec test: teams and texture memory', () => {
  it('fail a team colour in a player’s hands with no reason written down', () => {
    const r = skinTeams(HAZARD, { ...ctx, teamColourSkins: {} });
    expect(r.verdict).toBe('fail');
    expect(r.says).toContain("reads as Beta's");
    expect(r.says).toContain('TEAM_COLOUR_SKINS');
  });

  it('fail a bot carrying another team’s colour, whatever the reasons say', () => {
    const swapped = { ...ctx, bots: [BOT_SCHEMES[1]!, BOT_SCHEMES[0]!] };
    const r = skinTeams(COBALT, swapped);
    expect(r.verdict).toBe('fail');
    expect(r.says).toContain("Beta's bots carry it");
  });

  it('fail a skin over its texture budget', () => {
    expect(skinTexture(ACID, { ...ctx, rules: { ...ctx.rules, textureMB: -1 } }).verdict).toBe('fail');
  });
});

describe('a skin against each map’s colours', () => {
  const field = (colours: number[]): { map: string; label: string; buckets: { colour: number; share: number }[] } => ({ map: 'test', label: 'Test Field', buckets: colours.map((colour) => ({ colour, share: 1 / colours.length })) });

  it('merge near buckets into one colour and keep the common ones', () => {
    const p = mapPalette([{ colour: 0x808080, share: 0.3 }, { colour: 0x828282, share: 0.3 }, { colour: 0x2f6fd6, share: 0.38 }, { colour: 0xff0000, share: 0.02 }], 0.05);
    expect(p).toEqual([{ colour: 0x808080, share: 0.6 }, { colour: 0x2f6fd6, share: 0.38 }]);
  });

  it('pass a skin that stands out, ask for a look at one a bot carries that blends in, note one only a player carries', () => {
    const cobalt = readableColours(COBALT, ctx).map((c) => c.colour);
    expect(skinOnMap(COBALT, ctx, field([0x777777, 0x3a5a2a])).verdict).toBe('pass');
    const blend = skinOnMap(COBALT, ctx, field(cobalt));
    expect(blend.verdict).toBe('warn');
    expect(blend.says).toContain('Blends in');
    expect(skinOnMap(ACID, ctx, field(readableColours(ACID, ctx).map((c) => c.colour))).verdict).toBe('info');
    expect(skinOnMap(ACID, ctx, field([])).verdict).toBe('warn');
  });
});
