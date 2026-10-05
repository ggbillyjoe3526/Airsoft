import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty, TEAMMATE_DIFFICULTIES } from './config/bots';
import type { ContentTag } from './config/content';
import {
  countsForRecords,
  CUSTOM_RULES_PAY_CAP,
  DEFAULT_MATCH_RULES,
  DEFAULT_RULESET,
  type MatchRules,
  recordsKeyOf,
  RULESETS,
  type RulesetId,
  standardRules,
  standardRulesOf,
  TEAM_SIZE_CHOICES,
  WINS_NEEDED_CHOICES,
} from './config/matchRules';
import { matchEarnings } from './pool/armory';
import { resultKey } from './stats/records';
import { matchStanding } from './stats/settleMatch';
import { DEFAULT_MODE, MATCH_MODES } from './config/modes';
import { DEFAULT_MAP, MAPS } from './map/maps';
import { botsMayCarryDev, matchUsesDev, type NewGamePicks, pickTags, picksUseDev, playedPicks, playedTeamSize } from './newGamePicks';
import { EXTRACTION, squadSize } from './config/extraction';
import { BOT_LOADOUTS } from './config/bots';
import { LOADOUT } from './config/replicas';
import { GAME_POOL } from './pool/gamePool';
import { assetOfReplica } from './pool/pool';
import { strayDevPart, withAssets, withTags } from './pool/testSupport';

const picks = (over: Partial<NewGamePicks> = {}, rules: Partial<NewGamePicks['rules']> = {}): NewGamePicks => ({
  map: DEFAULT_MAP,
  mode: DEFAULT_MODE,
  difficulty: DEFAULT_DIFFICULTY,
  teammateDifficulty: DEFAULT_DIFFICULTY,
  ruleset: DEFAULT_RULESET,
  rules: { ...DEFAULT_MATCH_RULES, ...rules },
  ...over,
});

/** The lists are readonly in type only; a test tags an entry dev for its length and puts it back. */
type Taggable = { id: string; tag?: ContentTag | undefined };
const undo: (() => void)[] = [];
function tagDev(list: readonly Taggable[], id: string, tag: ContentTag = 'dev'): void {
  const entry = list.find((o) => o.id === id)!;
  const was = entry.tag;
  (entry as Taggable).tag = tag;
  undo.push(() => void ((entry as Taggable).tag = was));
}
afterEach(() => {
  while (undo.length) undo.pop()!();
});
const devIds = (list: readonly Taggable[]): string[] => list.filter((o) => o.tag === 'dev').map((o) => o.id);

describe('New game picks and dev content (M35)', () => {
  it('tags only Woodland, 4v4, 5v5 (M33d), Pro (M36), Neon Heights (M34c) and Extraction (M43) dev today, so the default picks use no dev content', () => {
    expect(devIds(MAPS)).toEqual(['woodland', 'neonHeights']);
    expect(devIds(MATCH_MODES)).toEqual(['extraction']);
    expect(devIds(WINS_NEEDED_CHOICES)).toEqual([]);
    for (const list of [DIFFICULTIES, TEAMMATE_DIFFICULTIES]) expect(devIds(list)).toEqual(['pro']);
    expect(devIds(TEAM_SIZE_CHOICES)).toEqual(['4', '5']);
    expect(pickTags(picks()).every((t) => t === 'public')).toBe(true);
    expect(picksUseDev(picks())).toBe(false);
  });

  it('plays every real option as picked with Dev content on, and a dev one as its default with it off', () => {
    for (const map of MAPS) for (const mode of MATCH_MODES) {
      const p = picks({ map: map.id, mode: mode.id });
      // Extraction plays only on a map with its data (M43); elsewhere it plays as the default mode.
      const offered = mode.id !== 'extraction' || map.data.extraction !== undefined;
      expect(playedPicks(p, true)).toEqual(offered ? p : { ...p, mode: DEFAULT_MODE });
      expect(playedPicks(p, false).map).toBe(map.tag === 'dev' ? DEFAULT_MAP : map.id);
      expect(playedPicks(p, false).mode).toBe(mode.tag === 'dev' ? DEFAULT_MODE : mode.id);
      expect(picksUseDev(playedPicks(p, false))).toBe(false);
    }
    // Pro (dev, M36) plays as the default level with Dev content off.
    for (const devContent of [false, true]) for (const d of DIFFICULTIES) for (const t of TEAMMATE_DIFFICULTIES) {
      const plays = (o: { id: Difficulty; tag: string }) => (devContent || o.tag === 'public' ? o.id : DEFAULT_DIFFICULTY);
      const p = picks({ difficulty: d.id, teammateDifficulty: t.id });
      expect(playedPicks(p, devContent)).toEqual(picks({ difficulty: plays(d), teammateDifficulty: plays(t) }));
    }
    for (const w of WINS_NEEDED_CHOICES) for (const s of TEAM_SIZE_CHOICES) {
      const p = picks({}, { winsNeeded: Number(w.id), teamSize: Number(s.id) });
      expect(playedPicks(p, true)).toEqual(p);
      expect(picksUseDev(playedPicks(p, true))).toBe(s.tag === 'dev');
      expect(playedPicks(p, false).rules.teamSize).toBe(s.tag === 'dev' ? DEFAULT_MATCH_RULES.teamSize : Number(s.id));
      expect(picksUseDev(playedPicks(p, false))).toBe(false);
    }
  });

  it('keeps the other rules as they are', () => {
    const p = picks({}, { roundTime: 90, friendlyFire: false, ricochetsCount: true, winsNeeded: 3 });
    expect(playedPicks(p, false).rules).toEqual(p.rules);
  });

  it('plays a dev mode and a dev difficulty as the defaults while off, and as picked while on', () => {
    tagDev(MATCH_MODES, 'attackDefend');
    tagDev(DIFFICULTIES, 'hard');
    tagDev(TEAMMATE_DIFFICULTIES, 'easy');
    const p = picks({ mode: 'attackDefend', difficulty: 'hard', teammateDifficulty: 'easy' });
    expect(playedPicks(p, false)).toEqual(picks());
    expect(playedPicks(p, true)).toEqual(p);
    expect(playedPicks(picks({ mode: 'elimination', difficulty: 'easy' }), false)).toEqual(picks({ difficulty: 'easy' }));
  });

  it('plays a dev Match pop-up choice as the default rule while off', () => {
    tagDev(WINS_NEEDED_CHOICES, '10');
    tagDev(TEAM_SIZE_CHOICES, '3');
    const p = picks({}, { winsNeeded: 10, teamSize: 3 });
    expect(playedPicks(p, false).rules).toMatchObject({ winsNeeded: DEFAULT_MATCH_RULES.winsNeeded, teamSize: DEFAULT_MATCH_RULES.teamSize });
    expect(playedPicks(p, true).rules).toMatchObject({ winsNeeded: 10, teamSize: 3 });
  });

  it('tags a dev map, mode, difficulty and Match choice, and says the picks use dev content', () => {
    tagDev(MATCH_MODES, 'attackDefend');
    expect(pickTags(picks({ mode: 'attackDefend' }))).toContain('dev');
    expect(picksUseDev(picks({ mode: 'attackDefend' }))).toBe(true);
    expect(picksUseDev(picks())).toBe(false);
    tagDev(DIFFICULTIES, 'hard');
    expect(picksUseDev(picks({ difficulty: 'hard' }))).toBe(true);
    tagDev(WINS_NEEDED_CHOICES, '7');
    expect(picksUseDev(picks({}, { winsNeeded: 7 }))).toBe(true);
    tagDev(MAPS, 'depot');
    expect(picksUseDev(picks())).toBe(true);
  });

  it('does not count the teammates difficulty in a 1v1, which has no teammates, and does from 2v2 up', () => {
    tagDev(TEAMMATE_DIFFICULTIES, 'hard');
    const dev = { teammateDifficulty: 'hard' as const };
    expect(picksUseDev(picks(dev, { teamSize: 1 }))).toBe(false);
    expect(pickTags(picks(dev, { teamSize: 1 }))).not.toContain('dev');
    expect(picksUseDev(picks(dev, { teamSize: 2 }))).toBe(true);
    expect(picksUseDev(picks(dev, { teamSize: 3 }))).toBe(true);
    // The opponents' difficulty is its own list, still public here.
    expect(picksUseDev(picks({ difficulty: 'hard' }, { teamSize: 1 }))).toBe(false);
  });

  it('restores the lists after a test tagged an entry (only the real dev entries stay dev)', () => {
    expect(devIds(MAPS)).toEqual(['woodland', 'neonHeights']);
    expect(devIds(MATCH_MODES)).toEqual(['extraction']);
    for (const list of [DIFFICULTIES, TEAMMATE_DIFFICULTIES]) expect(devIds(list)).toEqual(['pro']);
  });

  it('plays an Extraction run with at most a trio, on a map with its data only (M43)', () => {
    expect(EXTRACTION.maxSquad).toBe(3);
    expect([1, 2, 3, 4, 5].map((n) => squadSize(n))).toEqual([1, 2, 3, 3, 3]);
    expect(playedTeamSize(picks({ mode: 'extraction' }, { teamSize: 2 }))).toBe(2);
    expect(playedTeamSize(picks({ mode: 'extraction' }, { teamSize: 3 }))).toBe(3);
    // Woodland has room for 5v5 and Extraction data since M48: a run there is still a trio at most, while its other
    // modes keep the team size picked. (A map without the data plays Elimination: extractionData.test.ts.)
    expect(playedPicks(picks({ map: 'woodland', mode: 'extraction' }), true).mode).toBe('extraction');
    expect(playedPicks(picks({ map: 'depot', mode: 'extraction' }), true).mode).toBe('extraction');
    expect(playedTeamSize(picks({ map: 'woodland', mode: 'extraction' }, { teamSize: 5 }))).toBe(3);
    expect(playedTeamSize(picks({ map: 'woodland' }, { teamSize: 5 }))).toBe(5);
  });

  it('plays Extraction (dev, M43) only with Dev content on, and counts it as dev content', () => {
    const p = picks({ mode: 'extraction' });
    expect(playedPicks(p, false).mode).toBe(DEFAULT_MODE);
    expect(playedPicks(p, true).mode).toBe('extraction');
    expect(picksUseDev(playedPicks(p, true))).toBe(true);
  });
});

describe('whether the opponents may carry dev gear and whether a match uses dev content (M35)', () => {
  const kitOf = (...names: string[]) => names.map((n) => ({ asset: GAME_POOL.assets.find((a) => a.name === n)!.id, tier: 'common' }));
  const devPool = withTags(GAME_POOL, { 'Red Dot': 'dev' });
  const strayPool = withAssets(GAME_POOL, [strayDevPart(GAME_POOL)]);

  it('rolls the bots\' kits on hard and pro only (the premise of the rest)', () => {
    expect(BOT_LOADOUTS).toEqual({ easy: 'factory', normal: 'factory', hard: 'random', pro: 'random' });
  });

  it('says no for the real pool, on every difficulty, with Dev content off or on', () => {
    for (const devContent of [false, true]) for (const d of DIFFICULTIES) expect(botsMayCarryDev(GAME_POOL, devContent, d.id)).toBe(false);
  });

  it('says yes only with Dev content on, on a difficulty that rolls kits, and dev gear a kit could hold', () => {
    expect(botsMayCarryDev(devPool, true, 'hard')).toBe(true);
    expect(botsMayCarryDev(devPool, false, 'hard')).toBe(false);
    expect(botsMayCarryDev(devPool, true, 'easy')).toBe(false);
    expect(botsMayCarryDev(devPool, true, 'normal')).toBe(false);
    expect(botsMayCarryDev(withTags(GAME_POOL, { 'Gas Pistol': 'dev' }), true, 'hard')).toBe(true);
  });

  it('says yes for a dev chase replica the player owns (M32: one opponent may carry it), with Dev content on, on hard', () => {
    const cyber = GAME_POOL.assets.find((a) => a.name === 'Cyber Pistol')!.id;
    const devCyber = withTags(GAME_POOL, { 'Cyber Pistol': 'dev' });
    expect(botsMayCarryDev(devCyber, true, 'hard', [cyber])).toBe(true);
    expect(botsMayCarryDev(devCyber, false, 'hard', [cyber])).toBe(false);
    expect(botsMayCarryDev(devCyber, true, 'normal', [cyber])).toBe(false);
    expect(botsMayCarryDev(devCyber, true, 'hard', [])).toBe(false);
    expect(botsMayCarryDev(GAME_POOL, true, 'hard', [cyber])).toBe(false);
    expect(matchUsesDev(picks({ difficulty: 'hard' }), [], devCyber, true, [cyber])).toBe(true);
    expect(matchUsesDev(picks({ difficulty: 'hard' }), [], devCyber, true)).toBe(false);
  });

  it('says no when the only dev asset fits no LOADOUT replica', () => {
    expect(botsMayCarryDev(strayPool, true, 'hard')).toBe(false);
  });

  it('uses no dev content when nothing is dev, whatever the kit, public difficulty or switch; Pro is dev (M36)', () => {
    const kit = kitOf('AEG Rifle', 'Gas Pistol', 'Red Dot');
    for (const devContent of [false, true]) for (const d of DIFFICULTIES) {
      expect(matchUsesDev(picks({ difficulty: d.id }), kit, GAME_POOL, devContent)).toBe(d.id === 'pro');
    }
    expect(matchUsesDev(picks(), [null, null], GAME_POOL, true)).toBe(false);
  });

  it('uses dev content when a pick is dev (a real entry tagged for the test)', () => {
    tagDev(MATCH_MODES, 'attackDefend');
    expect(matchUsesDev(picks({ mode: 'attackDefend' }), [], GAME_POOL, false)).toBe(true);
    expect(matchUsesDev(picks({ mode: 'attackDefend' }), [], GAME_POOL, true)).toBe(true);
    expect(matchUsesDev(picks(), [], GAME_POOL, true)).toBe(false);
  });

  it('uses dev content when an item in the kit is dev, null slots skipped', () => {
    const kit = kitOf('AEG Rifle', 'Red Dot');
    expect(matchUsesDev(picks(), [null, ...kit], devPool, false)).toBe(true);
    expect(matchUsesDev(picks(), [null, ...kit], devPool, true)).toBe(true);
    expect(matchUsesDev(picks(), kitOf('AEG Rifle'), devPool, false)).toBe(false);
  });

  it("uses dev content when the opponents may roll dev gear, on hard with Dev content on only", () => {
    expect(matchUsesDev(picks({ difficulty: 'hard' }), [], devPool, true)).toBe(true);
    expect(matchUsesDev(picks({ difficulty: 'hard' }), [], devPool, false)).toBe(false);
    expect(matchUsesDev(picks({ difficulty: 'normal' }), [], devPool, true)).toBe(false);
    expect(matchUsesDev(picks({ difficulty: 'hard' }), [], strayPool, true)).toBe(false);
  });
});

describe('the replicas every bot carries (M35)', () => {
  it('are public in pool.md: teammates and Easy or Normal opponents carry them whatever the Dev content switch says', () => {
    for (const r of LOADOUT) expect(assetOfReplica(GAME_POOL, r)?.tag).toBe('public');
  });
});

describe('the Rules picker and dev content, records and pay (M39)', () => {
  const economy = GAME_POOL.economy;
  /** What a match of these picks (as played) would do: count, pay and file where. */
  function settle(p: NewGamePicks, devContent: boolean) {
    const played = playedPicks(p, devContent);
    const standing = matchStanding({
      standardRules: countsForRecords(played.rules, played.difficulty, played.teammateDifficulty, played.ruleset),
      devAssisted: false,
      devContentUsed: matchUsesDev(played, [], GAME_POOL, devContent),
    });
    const customRules = !standardRules(played.ruleset, played.rules);
    const pay = matchEarnings(economy, { won: true, roundsWon: 7, hits: 0, winsNeeded: played.rules.winsNeeded, difficulty: played.difficulty, teammateDifficulty: played.teammateDifficulty, ...(customRules ? { customRules } : {}) });
    const key = recordsKeyOf(played.ruleset);
    return { played, standing, multiplier: pay.multiplier, cell: key === null ? null : resultKey(played.difficulty, played.mode, key) };
  }
  const on = (ruleset: RulesetId, difficulty: 'easy' | 'normal' | 'hard' | 'pro' = 'normal', rules: Partial<MatchRules> = {}) =>
    picks({ ruleset, difficulty, teammateDifficulty: difficulty }, rules);

  it('tags Tournament and Pro CQB dev, and plays them as Skirmish while Dev content is off', () => {
    expect(devIds(RULESETS)).toEqual(['tournament', 'proCqb']);
    for (const r of ['tournament', 'proCqb'] as const) {
      expect(picksUseDev(playedPicks(on(r), true))).toBe(true);
      expect(playedPicks(on(r), false)).toEqual(picks());
      expect(picksUseDev(playedPicks(on(r), false))).toBe(false);
    }
    expect(playedPicks(on('custom'), false).ruleset).toBe('custom');
    expect(picksUseDev(on('custom'))).toBe(false);
  });

  it('plays the ruleset\'s own switches over the Match pop-up\'s picks', () => {
    const p = on('proCqb', 'pro', { winsNeeded: 3, roundTime: 300, teamSize: 2 });
    expect(playedPicks(p, true).rules).toEqual({ ...standardRulesOf('proCqb'), teamSize: 2 });
    // Skirmish keeps today's picks and the new switches off, whatever Custom saved.
    const s = picks({}, { winsNeeded: 3, semiAutoOnly: true, factoryKit: true });
    expect(playedPicks(s, true).rules).toEqual({ ...DEFAULT_MATCH_RULES, winsNeeded: 3 });
  });

  it('keeps every match on Pro or a dev ruleset unpaid and out of the records while they are dev (M35)', () => {
    for (const r of ['tournament', 'proCqb'] as const) {
      expect(settle(on(r, 'hard'), true).standing).toEqual({ notCounted: 'devContent', unpaid: 'devContent' });
    }
    expect(settle(on('skirmish', 'pro'), true).standing.unpaid).toBe('devContent');
    expect(settle(on('custom', 'pro'), true).standing).toEqual({ notCounted: 'rules', unpaid: 'devContent' });
  });

  it('once public: named rulesets get their own cells on every level and pay ×2 on Pro; Custom on Pro pays ×1.5 and never counts', () => {
    tagDev(DIFFICULTIES, 'pro', 'public');
    tagDev(TEAMMATE_DIFFICULTIES, 'pro', 'public');
    tagDev(RULESETS, 'tournament', 'public');
    tagDev(RULESETS, 'proCqb', 'public');
    for (const d of ['easy', 'normal', 'hard', 'pro'] as const) {
      for (const r of ['tournament', 'proCqb'] as const) {
        const m = settle(on(r, d), false);
        expect(m.standing).toEqual({ notCounted: '', unpaid: null });
        expect(m.cell).toBe(`${d}.elimination.${r}`);
        expect(m.multiplier).toBe(economy.difficulty[d]);
      }
      // Skirmish files as it always did.
      expect(settle(on('skirmish', d), false).cell).toBe(`${d}.elimination`);
      // Custom never counts and pays its level's rate, capped at ×1.5.
      const c = settle(on('custom', d), false);
      expect(c.standing).toEqual({ notCounted: 'rules', unpaid: null });
      expect(c.multiplier).toBe(Math.min(economy.difficulty[d], CUSTOM_RULES_PAY_CAP));
    }
    expect(settle(on('tournament', 'pro'), false).multiplier).toBe(2);
    expect(settle(on('proCqb', 'pro'), false).multiplier).toBe(2);
    expect(settle(on('custom', 'pro'), false).multiplier).toBe(1.5);
    // A named ruleset with its team size changed is custom rules: not recorded, and paid as Custom on Pro.
    const small = settle(on('tournament', 'pro', { teamSize: 2 }), false);
    expect(small.standing.notCounted).toBe('rules');
    expect(small.multiplier).toBe(1.5);
  });

  it('pays and records Easy, Normal and Hard Skirmish exactly as before M39', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const m = settle(on('skirmish', d), false);
      expect(m.standing).toEqual({ notCounted: '', unpaid: null });
      expect(m.multiplier).toBe(economy.difficulty[d]);
      const custom = settle(on('skirmish', d, { teamSize: 1 }), false);
      expect(custom.standing.notCounted).toBe('rules');
      expect(custom.multiplier).toBe(economy.difficulty[d]);
    }
  });

  it('leaves both kits out of the dev check under the factory kit rule: everyone carries LOADOUT as it comes', () => {
    const devPool = withTags(GAME_POOL, { 'Red Dot': 'dev' });
    const kit = [{ asset: GAME_POOL.assets.find((a) => a.name === 'Red Dot')!.id, tier: 'common' }];
    expect(matchUsesDev(on('custom', 'hard'), kit, devPool, true)).toBe(true);
    expect(matchUsesDev(on('custom', 'hard', { factoryKit: true }), kit, devPool, true)).toBe(false);
  });
});
