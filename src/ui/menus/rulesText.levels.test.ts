import { describe, expect, it } from 'vitest';
import { DIFFICULTIES as LEVEL_ROWS } from '../../config/bots';
import { EXTRACTION, homeTeamCap } from '../../config/extraction';
import { DEFAULT_MATCH_RULES, runRulesSummary } from '../../config/matchRules';
import { MAPS, mapData } from '../../map/maps';
import type { ExtractionData } from '../../map/mapTypes';
import { describeRules, type MatchRulesText } from './rulesText';

/**
 * M72 QA: the home team's size by its level (BAL-03) as the player reads it: the rules paragraph and the Match button
 * say the number the run starts with, at each level, for each squad, on every map with a run, and never under 1.
 */
const RULES: MatchRulesText = {
  teamSize: 3,
  winsNeeded: 5,
  roundTime: 150,
  playerTeam: 'Blue',
  enemyTeam: 'Orange',
  raiseTime: 5,
  halfTimeAfter: 4,
  attackFirst: true,
  eliminationStartEnd: 1,
  attackDefendStartEnd: 0,
  friendlyFire: true,
  ricochetsCount: false,
};
const X: ExtractionData = { insertions: [], exits: [], opponentStarts: [], runTime: 480, baseOpponents: 2, cases: [], regens: [], regenDistance: 15 };
const DIFFICULTIES = LEVEL_ROWS.map((d) => d.id);
const bots = (text: string) => Number(/against (\d+) Orange bots/.exec(text)?.[1]);
const home = (value: string) => Number(/· (\d+) in the home team/.exec(value)?.[1]);

describe('M72 QA: the rules text and the Match button by level', () => {
  it('says the base plus the squad at Easy and Hard, one fewer at Normal, one more at Pro', () => {
    const said = DIFFICULTIES.map((opponents) => bots(describeRules({ ...RULES, opponents }, 'extraction', X)));
    expect(said).toEqual(DIFFICULTIES.map((l) => 2 + 3 + EXTRACTION.opponentsByLevel[l]));
    expect(said).toEqual([5, 4, 5, 6]);
    const sums = DIFFICULTIES.map((opponents) => home(runRulesSummary({ ...DEFAULT_MATCH_RULES, teamSize: 3 }, { baseOpponents: 2, runTime: 480 }, opponents).value));
    expect(sums).toEqual(said);
  });

  it('never says fewer than 1 bot, for a solo run on a map with no base opponents at Normal', () => {
    const none: ExtractionData = { ...X, baseOpponents: 0 };
    expect(describeRules({ ...RULES, teamSize: 1, opponents: 'normal' }, 'extraction', none)).toMatch(/^Solo: just you \(Blue\), against 1 Orange bots/);
    expect(home(runRulesSummary({ ...DEFAULT_MATCH_RULES, teamSize: 1 }, { baseOpponents: 0, runTime: 480 }, 'normal').value)).toBe(1);
  });

  it('keeps the base plus the squad when the text is given no level, as before', () => {
    expect(bots(describeRules(RULES, 'extraction', X))).toBe(5);
  });

  it('is the same number in the paragraph, the button and homeTeamCap on every map, level and squad', () => {
    let maps = 0;
    for (const { id } of MAPS) {
      const x = mapData(id).extraction;
      if (!x) continue;
      maps++;
      for (const opponents of DIFFICULTIES) {
        for (let teamSize = 1; teamSize <= EXTRACTION.maxSquad; teamSize++) {
          const cap = homeTeamCap(x.baseOpponents, teamSize, opponents);
          const label = `${id} ${opponents} ${teamSize}`;
          expect(Number.isFinite(cap) && cap >= 1, label).toBe(true);
          expect(bots(describeRules({ ...RULES, teamSize, opponents }, 'extraction', x)), label).toBe(cap);
          expect(home(runRulesSummary({ ...DEFAULT_MATCH_RULES, teamSize }, x, opponents).value), label).toBe(cap);
        }
      }
    }
    expect(maps).toBeGreaterThan(0);
  });

  it('does not change the other modes’ paragraphs when a level is given', () => {
    for (const mode of ['elimination', 'attackDefend'] as const) {
      expect(describeRules({ ...RULES, opponents: 'pro' }, mode)).toBe(describeRules(RULES, mode));
    }
  });
});
