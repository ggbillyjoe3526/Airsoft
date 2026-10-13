import { describe, expect, it } from 'vitest';
import { drawIdentities } from '../ai/botRoster';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { loadBotsFile } from '../config/botsFile';
import { TEAMS } from '../config/teams';
import type { Character } from '../sim/character';
import { createHitFacts } from '../sim/hitFacts';
import { rosterNames, rosterTags, statsBlocks } from './statsRows';
import { sampleBot } from './tutorialShowcase';
import { whatGotYouText } from './whatGotYou';

/** BN1 acceptance 1, 2 and 6 end to end with the real bots.md: a match's draw through every table that names a bot. */

/** `per` characters a team, ids 0.., the player id 0 on team 0, as the session lays them out. */
const characters = (per: number): Character[] =>
  [0, 1].flatMap((team) => Array.from({ length: per }, (_, i) => ({ id: team * per + i, team }) as Character));
const botsOf = (cs: Character[]) => cs.filter((c) => c.id !== 0).map((c) => ({ id: c.id, team: c.team }));

describe('the drawn roster as the tables show it (BN1)', () => {
  it('names no bot "Alpha 2" or "Beta 1" any more, uniquely, and the same for a seed', () => {
    for (const per of [3, 5, 6]) {
      const cs = characters(per);
      for (let seed = 1; seed <= 10; seed++) {
        const names = rosterNames(cs, 0, drawIdentities(seed, botsOf(cs)));
        const bots = cs.filter((c) => c.id !== 0).map((c) => names.get(c.id)!);
        expect(names.get(0)).toBe('You');
        expect(new Set(bots).size).toBe(bots.length);
        for (const n of bots) expect(n, `${per}v${per} seed ${seed}`).not.toMatch(new RegExp(`^(${TEAMS.map((t) => t.name).join('|')}) \\d+$`));
        expect([...rosterNames(cs, 0, drawIdentities(seed, botsOf(cs))).values()]).toEqual([...names.values()]);
      }
    }
  });

  it('keeps the old numbered names with no roster', () => {
    const cs = characters(3);
    const names = rosterNames(cs, 0, drawIdentities(5, botsOf(cs), loadBotsFile('')));
    expect([...names.values()]).toEqual(['You', `${TEAMS[0].name} 2`, `${TEAMS[0].name} 3`, `${TEAMS[1].name} 1`, `${TEAMS[1].name} 2`, `${TEAMS[1].name} 3`]);
    expect(sampleBot(0, 1, 1, loadBotsFile(''))).toEqual({ name: `${TEAMS[1].name} 1`, tag: '' });
  });

  it('tags every bot row on the scoreboard with the label of the personality its name plays', () => {
    const cs = characters(3);
    const ids = drawIdentities(9, botsOf(cs));
    const blocks = statsBlocks(cs, rosterNames(cs, 0, ids), () => ({ hits: 0, timesHit: 0, bbsFired: 0, bbsHit: 0, timeAlive: 0 }) as never, [0, 0], cs[0]!, false, false, [], rosterTags(ids));
    for (const row of blocks.flatMap((b) => b.rows)) {
      if (row.you) {
        expect(row.tag).toBe('');
        continue;
      }
      const entry = BOT_PERSONALITIES.roster.find((e) => e.name === row.name)!;
      expect(row.tag).toBe(BOT_PERSONALITIES.styles.get(entry.personality)!.label);
      expect(row.tag).not.toBe('');
    }
  });

  it('gives a team three different personalities in a 3v3 (the player counts as no bot)', () => {
    const cs = characters(3);
    for (let seed = 1; seed <= 20; seed++) {
      const ids = drawIdentities(seed, botsOf(cs));
      const enemies = [3, 4, 5].map((id) => ids.get(id)!.personality);
      expect(new Set(enemies).size).toBe(3);
      expect(new Set([1, 2].map((id) => ids.get(id)!.personality)).size).toBe(2);
    }
  });
});

describe('the "What got you" card for each personality of the real bots.md (BN1)', () => {
  const facts = createHitFacts();
  for (const [key, style] of BOT_PERSONALITIES.styles) {
    it(`says by name how a ${key} plays, as the card's last line`, () => {
      const entry = BOT_PERSONALITIES.roster.find((e) => e.personality === key)!;
      const text = whatGotYouText({ ...facts, held: true, inView: 1, moving: false }, entry.name, 0, style.cardNote);
      const last = text.notes[text.notes.length - 1]!;
      expect(last).toContain(entry.name);
      expect(last).not.toContain('{name}');
      expect(last).toBe(style.cardNote.replaceAll('{name}', entry.name));
      expect(text.where.startsWith(entry.name)).toBe(true);
    });
  }
});
