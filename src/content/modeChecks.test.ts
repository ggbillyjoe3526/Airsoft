import { describe, expect, it } from 'vitest';
import budget from '../../pipeline/perf-budget.json';
import { forRoundsMode } from '../ai/depotMatchSupport';
import { DIFFICULTIES } from '../config/bots';
import { MODE_FIT, ROUND_TIME_SETTING, rulesetOf, standardRulesOf } from '../config/matchRules';
import { MATCH_MODES, type MatchMode, MODE_SHAPES, type ModeMapNeed, unknownMode } from '../config/modes';
import { MAPS } from '../map/maps';
import type { MapData } from '../map/mapTypes';
import { mapHosts, modeOffered, playableMode } from '../map/playableMode';
import { type CheckResult, worstVerdict } from './checks';
import { checkMode, checkModes, gameModeContext, hostMaps, type ModeContext, type ModeEntry, modePairings, modeRules, pinnedModes, rowFit, rulesetFit, modePerfCheck, type WiringProbe } from './modeChecks';

/**
 * The content toolkit's mode checks (CT3): every mode the game ships passes levels 1 and 2 (their fast part) and the
 * spec test's perf gate check, and each check fails on the fault it is there to catch (a context with that fault in it).
 */

const ctx = gameModeContext();
const entryOf = (id: MatchMode): ModeEntry => MATCH_MODES.find((m) => m.id === id)!;
const ELIMINATION = entryOf('elimination');
const ATTACK_DEFEND = entryOf('attackDefend');
const EXTRACTION = entryOf('extraction');
/** A new mode on the way in: dev, unpinned, shaped and fitted as Attack / Defend (the id cast, as a mode not yet in MatchMode). */
const FRESH: ModeEntry = { id: 'kingOfTheHill' as MatchMode, label: 'King of the Hill', blurb: 'Hold the hill.', tag: 'dev' };
/** The context with FRESH in it as Attack / Defend: shaped, fitted and the probes answering as for Attack / Defend. */
const withFresh = (change: Partial<ModeContext> = {}): ModeContext => ({
  ...ctx,
  modes: [...ctx.modes, FRESH],
  shapes: { ...ctx.shapes, [FRESH.id]: MODE_SHAPES.attackDefend },
  fit: { ...ctx.fit, [FRESH.id]: MODE_FIT.attackDefend },
  probes: ctx.probes.map((p) => ({ ...p, answer: (mode, map) => p.answer(mode === FRESH.id ? 'attackDefend' : mode, map) })),
  ...change,
});

/** The verdict of check `check` among `results` (undefined when it didn't run). */
const verdictOf = (results: readonly CheckResult[], check: string): string | undefined => {
  const own = results.filter((r) => r.check === check);
  return own.length > 0 ? worstVerdict(own) : undefined;
};
/** A copy of `data` without its flagpole or its Extraction data. */
const without = (data: MapData, key: ModeMapNeed): MapData => {
  const copy = { ...data };
  delete copy[key];
  return copy;
};
const saysOf = (results: readonly CheckResult[], check: string): string => results.filter((r) => r.check === check).map((r) => r.says).join(' ');

describe('the mode checks on the game as it ships', () => {
  it.each(MATCH_MODES)('pass $label with nothing to look at', (mode) => {
    const results = checkMode(mode, budget, ctx);
    expect(results.filter((r) => r.verdict === 'fail' || r.verdict === 'warn').map((r) => `${r.check}: ${r.says}`)).toEqual([]);
    expect(new Set(results.map((r) => r.check))).toEqual(new Set(['mode.registered', 'mode.access', 'mode.id', 'mode.wiring', 'mode.maps', 'mode.rulesets', 'mode.rows', 'mode.perfGate']));
  });

  it('pass every mode and the pinned ids together', () => {
    const results = checkModes(budget, ctx);
    expect(results.filter((r) => r.verdict !== 'pass').map((r) => `${r.check} ${r.item}: ${r.says}`)).toEqual([]);
    expect(results.filter((r) => r.check === 'mode.pinned')).toHaveLength(1);
    expect(results).toHaveLength(1 + 8 * MATCH_MODES.length);
    expect(pinnedModes(ctx).verdict).toBe('pass');
  });

  it('say what every mode is: MODE_SHAPES and MODE_FIT cover every mode and nothing else', () => {
    expect(Object.keys(MODE_SHAPES).sort()).toEqual(MATCH_MODES.map((m) => m.id).sort());
    expect(Object.keys(MODE_FIT).sort()).toEqual(MATCH_MODES.map((m) => m.id).sort());
    expect(MODE_SHAPES.extraction).toMatchObject({ play: 'run', needs: 'extraction', without: 'hidden' });
    expect(MODE_SHAPES.attackDefend).toMatchObject({ play: 'rounds', needs: 'flag', without: 'elimination' });
  });

  it('answer in Attack / Defend’s and Extraction’s own words where Elimination’s would mislead', () => {
    for (const mode of [ATTACK_DEFEND, EXTRACTION]) expect(saysOf(modeRules(mode, ctx), 'mode.wiring'), mode.id).toMatch(/in its own words/);
  });
});

describe('a mode’s rules: registered', () => {
  it('fail an entry with no label or no blurb', () => {
    expect(verdictOf(modeRules({ ...ATTACK_DEFEND, label: ' ' }, ctx), 'mode.registered')).toBe('fail');
    expect(verdictOf(modeRules({ ...ATTACK_DEFEND, blurb: '' }, ctx), 'mode.registered')).toBe('fail');
  });

  it('fail a real brand in the name or blurb', () => {
    const results = modeRules({ ...ATTACK_DEFEND, blurb: 'Raise the Tokyo Marui flag.' }, ctx);
    expect(verdictOf(results, 'mode.registered')).toBe('fail');
    expect(saysOf(results, 'mode.registered')).toContain('Tokyo Marui');
  });

  it('fail an id that is not one camel-case word, and an id used twice', () => {
    const bad = { ...FRESH, id: 'Attack-defend' as MatchMode };
    expect(verdictOf(modeRules(bad, withFresh({ shapes: { ...ctx.shapes, [bad.id]: MODE_SHAPES.attackDefend }, fit: { ...ctx.fit, [bad.id]: MODE_FIT.attackDefend } })), 'mode.registered')).toBe('fail');
    expect(verdictOf(modeRules(FRESH, withFresh()), 'mode.registered')).toBe('pass');
    expect(verdictOf(modeRules(ATTACK_DEFEND, { ...ctx, modes: [...ctx.modes, ATTACK_DEFEND] }), 'mode.registered')).toBe('fail');
  });

  it('fail a mode with no MODE_SHAPES or no MODE_FIT entry', () => {
    const { attackDefend: _shape, ...shapes } = ctx.shapes;
    const { attackDefend: _fit, ...fit } = ctx.fit;
    const noShape = modeRules(ATTACK_DEFEND, { ...ctx, shapes });
    expect(verdictOf(noShape, 'mode.registered')).toBe('fail');
    expect(saysOf(noShape, 'mode.registered')).toContain('MODE_SHAPES');
    expect(verdictOf(noShape, 'mode.maps')).toBe('fail');
    expect(verdictOf(modeRules(ATTACK_DEFEND, { ...ctx, fit }), 'mode.registered')).toBe('fail');
  });
});

describe('a mode’s rules: access and pinned ids', () => {
  it('keep a new mode dev until the owner makes it public', () => {
    expect(verdictOf(modeRules(FRESH, withFresh()), 'mode.access')).toBe('pass');
    const pub = { ...FRESH, tag: 'public' as const };
    expect(verdictOf(modeRules(pub, withFresh({ modes: [...ctx.modes, pub] })), 'mode.access')).toBe('fail');
    expect(verdictOf(modeRules(pub, withFresh({ modes: [...ctx.modes, pub], publicModes: { ...ctx.publicModes, [FRESH.id]: 'the owner, playtested' } })), 'mode.access')).toBe('pass');
  });

  it('fail a public mode whose id is not pinned, and pass a dev one on its way in', () => {
    expect(verdictOf(modeRules(FRESH, withFresh()), 'mode.id')).toBe('pass');
    const pub = { ...FRESH, tag: 'public' as const };
    const results = modeRules(pub, withFresh({ modes: [...ctx.modes, pub] }));
    expect(verdictOf(results, 'mode.id')).toBe('fail');
    expect(saysOf(results, 'mode.id')).toContain('SHIPPED_MODE_IDS');
    expect(verdictOf(modeRules(ATTACK_DEFEND, { ...ctx, shipped: ctx.shipped.filter((id) => id !== 'attackDefend') }), 'mode.id')).toBe('fail');
  });

  it('fail a shipped id that is no longer a mode', () => {
    const gone = pinnedModes({ ...ctx, modes: ctx.modes.filter((m) => m.id !== 'extraction') });
    expect(gone.verdict).toBe('fail');
    expect(gone.says).toContain('"extraction"');
    expect(verdictOf(checkModes(budget, { ...ctx, shipped: [...ctx.shipped, 'captureTheFlag'] }), 'mode.pinned')).toBe('fail');
  });
});

describe('a mode’s rules: wiring', () => {
  const swap = (place: string, probe: Partial<WiringProbe>): ModeContext => ({ ...ctx, probes: ctx.probes.map((p) => (p.place === place ? { ...p, ...probe } : p)) });

  it('ask every game place, the briefing and banner in a mode’s own words', () => {
    expect(ctx.probes.map((p) => p.place)).toEqual(['the briefing', 'the round banner', 'the pause line', 'the end screen', 'the perf run’s script']);
    expect(ctx.probes.filter((p) => p.own).map((p) => p.place)).toEqual(['the briefing', 'the round banner']);
  });

  it('fail a place that throws for the mode, or answers with nothing', () => {
    const throws = modeRules(ATTACK_DEFEND, swap('the end screen', { answer: (mode) => (mode === 'attackDefend' ? unknownMode(mode as never) : 'x') }));
    expect(verdictOf(throws, 'mode.wiring')).toBe('fail');
    expect(saysOf(throws, 'mode.wiring')).toContain('No answer for match mode "attackDefend"');
    expect(verdictOf(modeRules(ATTACK_DEFEND, swap('the pause line', { answer: () => '  ' })), 'mode.wiring')).toBe('fail');
    // Elimination is asked too: a place with no answer for it fails it.
    expect(verdictOf(modeRules(ELIMINATION, swap('the pause line', { answer: () => '' })), 'mode.wiring')).toBe('fail');
  });

  it('fail a mode whose briefing or banner says what Elimination says, and allow it where a place may share', () => {
    const banner = ctx.probes.find((p) => p.place === 'the round banner')!;
    const results = modeRules(ATTACK_DEFEND, swap('the round banner', { answer: (mode, map) => banner.answer(mode === 'attackDefend' ? 'elimination' : mode, map) }));
    expect(verdictOf(results, 'mode.wiring')).toBe('fail');
    expect(saysOf(results, 'mode.wiring')).toContain('the round banner');
    expect(verdictOf(modeRules(EXTRACTION, swap('the briefing', { answer: () => 'Win.' })), 'mode.wiring')).toBe('fail');
    // The same answer in a place that may share Elimination's is no fault.
    const shared = modeRules(EXTRACTION, swap('the pause line', { answer: () => 'Paused.' }));
    expect(verdictOf(shared, 'mode.wiring')).toBe('pass');
    expect(saysOf(shared, 'mode.wiring')).toContain("the pause line as Elimination's");
  });

  it('let Elimination share with itself', () => {
    expect(verdictOf(modeRules(ELIMINATION, swap('the briefing', { answer: () => 'Win.' })), 'mode.wiring')).toBe('pass');
  });
});

describe('a mode’s rules: maps', () => {
  const noFlag = ctx.maps.map((m) => ({ ...m, data: without(m.data, 'flag') }));

  it('fail a mode no map has what it needs for', () => {
    const results = modeRules(ATTACK_DEFEND, { ...ctx, maps: noFlag });
    expect(verdictOf(results, 'mode.maps')).toBe('fail');
    expect(saysOf(results, 'mode.maps')).toContain('a flagpole, and no map has it');
    // Elimination needs nothing from a map.
    expect(verdictOf(modeRules(ELIMINATION, { ...ctx, maps: noFlag }), 'mode.maps')).toBe('pass');
  });

  it('fail a public mode only dev maps host, and pass a dev one there', () => {
    const devHosted = ctx.maps.map((m) => (m.entry.tag === 'public' ? { ...m, data: without(m.data, 'flag') } : m));
    expect(devHosted.some((m) => m.data.flag)).toBe(true);
    expect(verdictOf(modeRules(ATTACK_DEFEND, { ...ctx, maps: devHosted }), 'mode.maps')).toBe('fail');
    const devMode = { ...ATTACK_DEFEND, tag: 'dev' as const };
    expect(verdictOf(modeRules(devMode, { ...ctx, maps: devHosted }), 'mode.maps')).toBe('pass');
  });

  it('list the hosts, and say what happens on a map without what it needs', () => {
    const someNoFlag = ctx.maps.map((m, i) => (i === ctx.maps.length - 1 ? { ...m, data: without(m.data, 'flag') } : m));
    expect(saysOf(modeRules(ATTACK_DEFEND, { ...ctx, maps: someNoFlag }), 'mode.maps')).toContain('it plays as Elimination');
    const someNoRun = ctx.maps.map((m, i) => (i === 0 ? { ...m, data: without(m.data, 'extraction') } : m));
    expect(saysOf(modeRules(EXTRACTION, { ...ctx, maps: someNoRun }), 'mode.maps')).toContain("don't offer it");
    expect(hostMaps({ ...ctx, maps: someNoRun }, 'extraction')).toHaveLength(MAPS.length - 1);
    expect(hostMaps(ctx, 'noSuchMode')).toEqual([]);
  });
});

describe('a mode’s fit with the rulesets and rows', () => {
  it('fail a ruleset that does not exist, the default ruleset left out, and no MODE_FIT entry', () => {
    const fit = (rulesets: string[]) => ({ ...ctx, fit: { ...ctx.fit, attackDefend: { ...MODE_FIT.attackDefend, rulesets } } }) as ModeContext;
    expect(rulesetFit(ATTACK_DEFEND, fit(['skirmish', 'speedball'])).verdict).toBe('fail');
    expect(rulesetFit(ATTACK_DEFEND, fit(['skirmish', 'speedball'])).says).toContain('speedball');
    expect(rulesetFit(ATTACK_DEFEND, fit(['tournament', 'custom'])).verdict).toBe('fail');
    expect(rulesetFit(ATTACK_DEFEND, fit(['tournament', 'custom'])).says).toContain('Skirmish');
    const { attackDefend: _gone, ...without } = ctx.fit;
    expect(rulesetFit(ATTACK_DEFEND, { ...ctx, fit: without }).verdict).toBe('fail');
  });

  it('say which rulesets the Rules row hides while the mode is picked', () => {
    const r = rulesetFit(EXTRACTION, ctx);
    expect(r.verdict).toBe('pass');
    expect(r.says).toContain(`hides ${rulesetOf('tournament').label}`);
  });

  it('fail a hidden row that is no match row', () => {
    const r = rowFit(ATTACK_DEFEND, { ...ctx, fit: { ...ctx.fit, attackDefend: { ...MODE_FIT.attackDefend, ignores: ['timeOutToMorePlayers', 'respawns' as never] } } });
    expect(r.verdict).toBe('fail');
    expect(r.says).toContain('respawns');
    expect(rowFit(ATTACK_DEFEND, ctx).says).toContain('Time-out');
    expect(rowFit(ELIMINATION, ctx).says).toBe('Every Match pop-up row plays a part in it.');
  });
});

describe('a mode’s spec test: the perf gate', () => {
  it('pass a mode the matrix runs, or one with a stand-in, and fail one with neither', () => {
    expect(modePerfCheck(EXTRACTION, budget, ctx).verdict).toBe('pass');
    expect(modePerfCheck(ATTACK_DEFEND, budget, ctx).says).toContain('Elimination');
    expect(modePerfCheck(ATTACK_DEFEND, budget, { ...ctx, perfStandIns: {} }).verdict).toBe('fail');
    const noRuns = modePerfCheck(EXTRACTION, { ...budget, matrix: budget.matrix.filter((r) => r.mode !== 'extraction') }, ctx);
    expect(noRuns.verdict).toBe('fail');
    expect(noRuns.says).toContain('"mode": "extraction"');
  });

  it('count only runs on the budget preset', () => {
    const offPreset = { ...budget, matrix: budget.matrix.map((r) => (r.mode === 'extraction' ? { ...r, preset: 'high' } : r)) };
    expect(modePerfCheck(EXTRACTION, offPreset, ctx).verdict).toBe('fail');
  });
});

describe('a new mode answers everywhere', () => {
  it('throws for a mode the code has no answer for', () => {
    expect(() => unknownMode('captureTheFlag' as never)).toThrow('No answer for match mode "captureTheFlag"');
  });

  it('refuses Extraction in the bot-match guards: it plays as runs', () => {
    expect(forRoundsMode('elimination', { elimination: 1, attackDefend: 2 })).toBe(1);
    expect(forRoundsMode('attackDefend', { elimination: 1, attackDefend: 2 })).toBe(2);
    expect(() => forRoundsMode('extraction', { elimination: 1, attackDefend: 2 })).toThrow(/Extraction plays as runs/);
    expect(() => forRoundsMode('captureTheFlag' as MatchMode, { elimination: 1, attackDefend: 2 })).toThrow(/No answer for match mode/);
  });
});

describe('the compatibility grid', () => {
  const depot = MAPS.find((m) => m.id === 'depot')!;

  it('starts at the standard match, then changes one thing at a time for a rounds mode', () => {
    const pairings = modePairings('attackDefend', depot, ctx.defaultRuleset, MODE_FIT.attackDefend.rulesets);
    expect(pairings[0]).toMatchObject({ label: 'the standard match', ruleset: 'skirmish', level: 'normal' });
    expect(pairings[0]!.rules).toEqual({ ...standardRulesOf('skirmish'), teamSize: depot.teamSize.standard });
    const labels = pairings.map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining([rulesetOf('tournament').label, rulesetOf('proCqb').label, ...DIFFICULTIES.filter((d) => d.id !== 'normal').map((d) => d.label), '1v1', `Custom, ${ROUND_TIME_SETTING.min} s rounds`]));
    expect(new Set(labels).size).toBe(labels.length);
    // Every other team size Depot offers, and every other Rounds to win; Depot's standard team is its largest: no 3v3.
    expect(labels).toEqual(expect.arrayContaining(['1v1', '2v2', 'first to 3', 'first to 7', 'first to 10']));
    expect(labels).not.toContain('3v3');
    expect(labels).not.toContain('first to 5');
    expect(pairings.find((p) => p.label === 'first to 10')).toMatchObject({ ruleset: 'skirmish', rules: { winsNeeded: 10, teamSize: depot.teamSize.standard } });
    // Attack / Defend's time-out is the defenders' whatever the switch: the Match pop-up hides it, so no pairing plays it.
    expect(labels.some((l) => /time-out/.test(l))).toBe(false);
    const oneVOne = pairings.find((p) => p.label === '1v1')!;
    expect(oneVOne).toMatchObject({ ruleset: 'skirmish', level: 'normal', rules: { teamSize: 1 } });
    const ff = pairings.find((p) => p.label.startsWith('Custom, friendly fire'))!;
    expect(ff.ruleset).toBe('custom');
    expect(ff.rules.friendlyFire).toBe(!standardRulesOf('custom').friendlyFire);
    for (const p of pairings.filter((x) => x.label.startsWith('Custom'))) expect(p.ruleset, p.label).toBe('custom');
    const short = pairings.find((p) => p.label.endsWith('s rounds'))!;
    expect(short.rules.roundTime).toBe(ROUND_TIME_SETTING.min);
  });

  it('plays a team size it offers above the standard on a map with room, and none under its smallest', () => {
    const woodland = MAPS.find((m) => m.id === 'woodland')!;
    const labels = modePairings('elimination', woodland, ctx.defaultRuleset, MODE_FIT.elimination.rulesets).map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining([`${woodland.teamSize.max}v${woodland.teamSize.max}`]));
    expect(labels).not.toContain(`${woodland.teamSize.standard}v${woodland.teamSize.standard}`);
    // Woodland is played 5v5 or 6v6 (M88): the game clamps a smaller pick up, so the grid never plays one (BP3).
    for (let n = 1; n < woodland.teamSize.min; n++) expect(labels).not.toContain(`${n}v${n}`);
    expect(labels.filter((l) => /time-out/.test(l))).toHaveLength(1);
  });

  it('plays Extraction only under what it offers: no round rows, no Tournament, its squad sizes', () => {
    const pairings = modePairings('extraction', depot, ctx.defaultRuleset, MODE_FIT.extraction.rulesets);
    const labels = pairings.map((p) => p.label);
    expect(labels[0]).toBe('the standard match');
    expect(labels).toContain('1v1');
    expect(labels).not.toContain(rulesetOf('tournament').label);
    expect(labels.some((l) => /win by two|time-out|s rounds|first to/.test(l))).toBe(false);
    expect(labels).toEqual(expect.arrayContaining(['Custom, friendly fire off', expect.stringMatching(/^Custom, ricochets/), expect.stringMatching(/^Custom, (semi only|any fire mode)$/)]));
    // A run ignores its rounds rows: every pairing plays them at the ruleset's standard.
    for (const p of pairings) expect(p.rules.winsNeeded, p.label).toBe(standardRulesOf(p.ruleset).winsNeeded);
    // Woodland's largest pick makes no bigger squad than its standard: no 5v5 pairing.
    const woodland = MAPS.find((m) => m.id === 'woodland')!;
    expect(modePairings('extraction', woodland, ctx.defaultRuleset, MODE_FIT.extraction.rulesets).map((p) => p.label)).not.toContain(`${woodland.teamSize.max}v${woodland.teamSize.max}`);
  });
});

describe('which maps host a mode', () => {
  const bare: Pick<MapData, 'flag' | 'extraction'> = {};
  const depotData = ctx.maps.find((m) => m.entry.id === 'depot')!.data;

  it('a map without a flag or Extraction data hosts only Elimination', () => {
    expect(mapHosts(bare, 'elimination')).toBe(true);
    expect(mapHosts(bare, 'attackDefend')).toBe(false);
    expect(mapHosts(bare, 'extraction')).toBe(false);
    for (const mode of ['elimination', 'attackDefend', 'extraction'] as const) expect(mapHosts(depotData, mode), mode).toBe(true);
  });

  it('plays Attack / Defend there as Elimination, and offers neither it nor Extraction (MR1)', () => {
    expect(playableMode(bare, 'attackDefend')).toBe('elimination');
    expect(playableMode(bare, 'extraction')).toBe('elimination');
    expect(playableMode(depotData, 'attackDefend')).toBe('attackDefend');
    expect(modeOffered(bare, 'elimination')).toBe(true);
    expect(modeOffered(bare, 'attackDefend')).toBe(false);
    expect(modeOffered(bare, 'extraction')).toBe(false);
    expect(modeOffered(depotData, 'extraction')).toBe(true);
  });
});
