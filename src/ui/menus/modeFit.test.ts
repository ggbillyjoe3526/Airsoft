import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MATCH_RULES,
  DEFAULT_RULESET,
  type MatchRules,
  matchRulesSummary,
  MODE_FIT,
  offersRow,
  RULESETS,
  rulesetFits,
  standardRules,
  standardRulesOf,
} from '../../config/matchRules';
import { MATCH_MODES } from '../../config/modes';
import { MAPS, mapData } from '../../map/maps';
import { modeOffered } from '../../map/playableMode';
import { type NewGamePicks, playedPicks } from '../../newGamePicks';
import { MemoryStorage } from '../../pool/testStorage';
import { fakeDocument, type FakeElement } from '../testSupport';
import { MatchPanel, type MatchShown } from './matchPanel';

/**
 * M89 (the owner's playtest note 18): every mode against every ruleset and Match row. What doesn't fit a mode is hidden
 * while it is picked, and a saved pick of it plays no part.
 */
const FIELDS = Object.keys(DEFAULT_MATCH_RULES) as (keyof MatchRules)[];

/** Every rule away from the standard: a pick that a hidden row would otherwise carry into the match. */
const OFF_STANDARD: MatchRules = Object.fromEntries(
  FIELDS.map((f) => {
    const v = DEFAULT_MATCH_RULES[f];
    // Team size stays a size every map has; it is a row every mode reads.
    if (f === 'teamSize') return [f, v];
    return [f, typeof v === 'boolean' ? !v : f === 'winsNeeded' ? 2 : (v as number) + 30];
  }),
) as unknown as MatchRules;

describe('M89: modes and match settings fit together', () => {
  it('has a row for every mode, offering only real rulesets, Elimination all of them', () => {
    expect(Object.keys(MODE_FIT).sort()).toEqual(MATCH_MODES.map((m) => m.id).sort());
    for (const fit of Object.values(MODE_FIT)) for (const r of fit.rulesets) expect(RULESETS.map((x) => x.id)).toContain(r);
    expect(MODE_FIT.elimination.rulesets).toEqual(RULESETS.map((r) => r.id));
    for (const fit of Object.values(MODE_FIT)) expect(fit.rulesets).toContain(DEFAULT_RULESET);
  });

  it('keeps Tournament and Pro CQB out of Extraction, and the time-out switch out of Attack and Defend', () => {
    expect(rulesetFits('extraction', 'tournament')).toBe(false);
    expect(rulesetFits('extraction', 'proCqb')).toBe(false);
    expect(rulesetFits('extraction', 'custom')).toBe(true);
    expect(offersRow('custom', 'timeOutToMorePlayers', 'attackDefend')).toBe(false);
    expect(offersRow('custom', 'timeOutToMorePlayers', 'elimination')).toBe(true);
    for (const f of ['winsNeeded', 'roundTime', 'winByTwo', 'timeOutToMorePlayers'] as const) expect(offersRow('custom', f, 'extraction'), f).toBe(false);
    // The Match line doesn't promise a time-out rule Attack and Defend never plays.
    expect(matchRulesSummary(standardRulesOf('tournament'), 'elimination').detail).toContain('Time-out: more players left wins.');
    expect(matchRulesSummary(standardRulesOf('tournament'), 'attackDefend').detail).not.toContain('Time-out');
  });

  it('walks every map, mode and ruleset: a pick that does not fit never plays', () => {
    for (const map of MAPS)
      for (const mode of MATCH_MODES)
        for (const ruleset of RULESETS) {
          const picks: NewGamePicks = { map: map.id, mode: mode.id, difficulty: 'normal', teammateDifficulty: 'normal', ruleset: ruleset.id, rules: { ...OFF_STANDARD } };
          const played = playedPicks(picks, true);
          const at = `${map.id} ${mode.id} ${ruleset.id}`;
          expect(played.mode, at).toBe(modeOffered(mapData(map.id), mode.id) ? mode.id : 'elimination');
          // A ruleset the mode doesn't offer plays as Skirmish.
          expect(played.ruleset, at).toBe(rulesetFits(played.mode, ruleset.id) ? ruleset.id : DEFAULT_RULESET);
          expect(rulesetFits(played.mode, played.ruleset), at).toBe(true);
          // A row the Match screen hides plays at the ruleset's standard, whatever was saved. strictMarshal is inert and
          // never offered (KNOWN_ISSUES), so Custom keeps it as saved.
          const std = standardRulesOf(played.ruleset);
          for (const f of FIELDS) if (f !== 'strictMarshal' && !offersRow(played.ruleset, f, played.mode)) expect(played.rules[f], `${at} ${f}`).toBe(std[f]);
        }
  });

  it('counts a Skirmish Extraction run for the records whatever the hidden round rows were saved as', () => {
    const extraction = MAPS.find((m) => mapData(m.id).extraction);
    expect(extraction).toBeDefined();
    const saved = { ...DEFAULT_MATCH_RULES, winsNeeded: 2, roundTime: DEFAULT_MATCH_RULES.roundTime + 30, winByTwo: true };
    const played = playedPicks({ map: extraction!.id, mode: 'extraction', difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'skirmish', rules: saved }, true);
    expect(standardRules('skirmish', played.rules)).toBe(true);
    // The same picks in Elimination are custom rules, as before.
    const elim = playedPicks({ map: extraction!.id, mode: 'elimination', difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'skirmish', rules: saved }, true);
    expect(standardRules('skirmish', elim.rules)).toBe(false);
  });
});

describe('M89: the Match section shows only what fits the mode', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  // Test files share a worker's modules (isolate: false), so the fake DOM goes when each test ends.
  afterEach(() => vi.unstubAllGlobals());

  const panelFor = (picks: NewGamePicks): MatchPanel =>
    new MatchPanel({ picks: () => picks, setRuleset: () => {}, setRules: () => {}, setDifficulty: () => {}, setTeammates: () => {}, setTeam: () => {} });
  const buttons = (root: FakeElement, group: string): FakeElement[] => {
    const find = (n: FakeElement): FakeElement | undefined => (n.getAttribute('aria-label') === group ? n : n.children.map(find).find(Boolean));
    return find(root)!.children.filter((c) => c.tag === 'button');
  };

  it('hides the rulesets and the rows the mode as played has no use for', () => {
    const extraction = MAPS.find((m) => mapData(m.id).extraction)!;
    for (const mode of MATCH_MODES) {
      const picks: NewGamePicks = { map: extraction.id, mode: mode.id, difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'custom', rules: { ...DEFAULT_MATCH_RULES } };
      const played = playedPicks(picks, true);
      const panel = panelFor(picks);
      const shown: MatchShown = { played, devContent: true, run: played.mode === 'extraction', sizeMax: 6 };
      panel.refresh(shown);
      const root = panel.root as unknown as FakeElement;
      expect(buttons(root, 'Rules').map((b) => !b.hidden), mode.id).toEqual(RULESETS.map((r) => rulesetFits(played.mode, r.id)));
      // Each rule's row shows exactly while the ruleset leaves it to you and the mode reads it.
      const rows = (panel as unknown as { switchRows: { field: keyof MatchRules; row: FakeElement }[] }).switchRows;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(!r.row.hidden, `${mode.id} ${r.field}`).toBe(offersRow(played.ruleset, r.field, played.mode));
    }
  });
});

describe('M89: a saved pick that does not fit, and difficulty left alone', () => {
  it('plays a saved Tournament or Pro CQB pick as Skirmish in Extraction, and as itself in Elimination', () => {
    const map = MAPS.find((m) => mapData(m.id).extraction)!;
    for (const ruleset of ['tournament', 'proCqb'] as const) {
      const base = { map: map.id, difficulty: 'normal', teammateDifficulty: 'normal', ruleset, rules: { ...DEFAULT_MATCH_RULES } } as const;
      expect(playedPicks({ ...base, mode: 'extraction' }, true).ruleset).toBe('skirmish');
      expect(playedPicks({ ...base, mode: 'elimination' }, true).ruleset).toBe(ruleset);
    }
  });

  it('leaves the bot and teammate difficulty as picked in every mode and ruleset', () => {
    const map = MAPS.find((m) => mapData(m.id).extraction)!;
    for (const mode of MATCH_MODES)
      for (const ruleset of RULESETS)
        for (const difficulty of ['easy', 'hard', 'pro'] as const) {
          const played = playedPicks({ map: map.id, mode: mode.id, difficulty, teammateDifficulty: difficulty, ruleset: ruleset.id, rules: { ...DEFAULT_MATCH_RULES } }, true);
          expect(played.difficulty, `${mode.id} ${ruleset.id}`).toBe(difficulty);
          expect(played.teammateDifficulty, `${mode.id} ${ruleset.id}`).toBe(difficulty);
        }
  });
});
