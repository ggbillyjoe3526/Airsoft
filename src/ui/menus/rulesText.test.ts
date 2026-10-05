import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../../config/extraction';
import { DEPOT } from '../../map/depot';
import type { ExtractionData } from '../../map/mapTypes';
import { describeRules, type MatchRulesText } from './rulesText';

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

const X: ExtractionData = { insertions: [], exits: [], opponentStarts: [], runTime: 480, baseOpponents: 2 };

describe('the Extraction rules shown on New game (M43)', () => {
  it('explain the squad, the home team, the clock, the stand, the late exit and the one respawn', () => {
    const text = describeRules(RULES, 'extraction', X);
    expect(text).toContain('You and 2 bot teammates, who follow you (Blue)');
    expect(text).toContain('against 5 Orange bots of the home team');
    expect(text).toContain('8:00 to get to an open exit');
    expect(text).toContain(`stand in it for ${EXTRACTION.extractTime} s`);
    expect(text).toContain('pauses the count');
    expect(text).toContain('A late exit opens with 3:00 left');
    expect(text).toContain("Hit once and you're back at the insertion straight away; hit again and you're out of the run");
  });

  it('follows the squad size: solo, one teammate, and the home team grows with it', () => {
    expect(describeRules({ ...RULES, teamSize: 1 }, 'extraction', X)).toMatch(/^Solo: just you \(Blue\), against 3 Orange bots/);
    const two = describeRules({ ...RULES, teamSize: 2 }, 'extraction', X);
    expect(two).toContain('You and 1 bot teammate, who follow you');
    expect(two).toContain('against 4 Orange bots');
  });

  it("uses the map's run time and base opponents", () => {
    const text = describeRules(RULES, 'extraction', { ...X, runTime: 900, baseOpponents: 1 });
    expect(text).toContain('15:00 to get to an open exit');
    expect(text).toContain('against 4 Orange bots');
  });

  it("matches Depot's own data", () => {
    const x = DEPOT.extraction!;
    expect(describeRules({ ...RULES, teamSize: 2 }, 'extraction', x)).toContain(`against ${x.baseOpponents + 2} Orange bots`);
  });

  it('says the match is played as Elimination on a map without Extraction data', () => {
    expect(describeRules(RULES, 'extraction')).toBe('This map has no Extraction yet: the match is played as Elimination.');
  });

  it("ignores Extraction data in the other modes' paragraphs", () => {
    for (const mode of ['elimination', 'attackDefend'] as const) {
      expect(describeRules(RULES, mode, X)).toBe(describeRules(RULES, mode));
      expect(describeRules(RULES, mode, X)).not.toContain('home team');
    }
  });
});
