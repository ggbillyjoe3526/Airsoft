import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../../config/extraction';
import { REALCAP_TEXT } from '../../config/matchRules';
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

const X: ExtractionData = { insertions: [], exits: [], opponentStarts: [], runTime: 480, baseOpponents: 2, cases: [], regens: [], regenDistance: 15 };

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

  it('says hit opponents come back in waves on a map with regen points (M45), and not without', () => {
    const waves = 'come back in waves, out of your sight, and one more joins them with 2:40 left';
    expect(describeRules(RULES, 'extraction', DEPOT.extraction!)).toContain(waves);
    expect(describeRules(RULES, 'extraction', X)).not.toContain('waves');
  });

  it('says the match is played as Elimination on a map without Extraction data', () => {
    expect(describeRules(RULES, 'extraction')).toBe('This map has no Extraction yet: the match is played as Elimination.');
  });

  it('names the Rules picker switches a run plays: semi only, realcap, the factory kit, teammates only on the minimap (M53, audit UI-01)', () => {
    const switches = { winByTwo: true, timeOutToMorePlayers: true, heardOnMinimap: false, semiAutoOnly: true, realcap: true, factoryKit: true };
    const text = describeRules({ ...RULES, switches }, 'extraction', X);
    expect(text).toContain("Every replica fires semi only, bots' too.");
    expect(text).toContain(`Realcap magazines for everyone: ${REALCAP_TEXT}.`);
    expect(text).toContain('Everyone carries the factory rifle and pistol as they come.');
    expect(text).toContain('The minimap shows your teammates only.');
    // A run is one round on its own clock: the overtime and time-out switches are not said.
    expect(text).not.toMatch(/two clear|more players left/);
    // Skirmish's switches add nothing.
    expect(describeRules({ ...RULES, switches: { ...switches, heardOnMinimap: true, semiAutoOnly: false, realcap: false, factoryKit: false } }, 'extraction', X)).toBe(describeRules(RULES, 'extraction', X));
  });

  it('says each switch once, in the same words as the other modes, and still says them in Elimination and Attack/Defend (M53 QA)', () => {
    const switches = { winByTwo: false, timeOutToMorePlayers: false, heardOnMinimap: false, semiAutoOnly: true, realcap: true, factoryKit: true };
    const sentences = ["Every replica fires semi only, bots' too.", `Realcap magazines for everyone: ${REALCAP_TEXT}.`, 'Everyone carries the factory rifle and pistol as they come.', 'The minimap shows your teammates only.'];
    for (const mode of ['extraction', 'elimination', 'attackDefend'] as const) {
      const text = describeRules({ ...RULES, switches }, mode, X);
      for (const sentence of sentences) expect(text.split(sentence).length - 1, `${mode}: ${sentence}`).toBe(1);
      expect(text.endsWith(sentences.map((x) => ' ' + x).join('')), mode).toBe(true);
    }
  });

  it('keeps the switches in the fallback paragraph of a map with no Extraction data (played as Elimination), and a run says nothing of rounds', () => {
    const switches = { winByTwo: true, timeOutToMorePlayers: true, heardOnMinimap: true, semiAutoOnly: true, realcap: false, factoryKit: false };
    expect(describeRules({ ...RULES, switches }, 'extraction')).toBe('This map has no Extraction yet: the match is played as Elimination.');
    expect(describeRules({ ...RULES, switches }, 'extraction', X)).not.toMatch(/First to|rounds wins/);
  });

  it("ignores Extraction data in the other modes' paragraphs", () => {
    for (const mode of ['elimination', 'attackDefend'] as const) {
      expect(describeRules(RULES, mode, X)).toBe(describeRules(RULES, mode));
      expect(describeRules(RULES, mode, X)).not.toContain('home team');
    }
  });
});
