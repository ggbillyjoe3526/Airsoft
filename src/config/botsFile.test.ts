import { describe, expect, it } from 'vitest';
import botsText from '../../data/bots.md?raw';
import { loadBotsFile, NAME_MAX_LENGTH, NEUTRAL_STYLE } from './botsFile';

/**
 * BN1: bots.md, the hand-edited roster and personalities. The file as shipped reads cleanly and gives the game enough
 * to work with; a broken cell plays neutral and names its line.
 */
const bots = loadBotsFile(botsText);

/** A small bots.md: the five tables, with `edit` applied to the text (one personality, Rusher, unless edited). */
function mini(edit: (text: string) => string = (t) => t): string {
  return edit(
    [
      '## Roster',
      '| Name | Personality |',
      '|---|---|',
      '| Dash | Rusher |',
      '| Owl | Rusher |',
      '',
      '## Personalities',
      '| Personality | Card note |',
      '|---|---|',
      '| Rusher | {name} rushes. |',
      '',
      '## How they move',
      '| Personality | Lane pause (×) | Cover at a lane point (×) | Cover on contact from (×) | Walk the last (×) | Flank chance (+) | Burst (×) | Burst pause (×) | Watch where you ducked (s) |',
      '|---|---|---|---|---|---|---|---|---|',
      '| Rusher | 0.3 | 0.5 | 1 | 0.25 | −0.25 | 1.2 | 0.8 | 1–2 |',
      '',
      '## Habits',
      '| Personality | Pushes in | Waits for the team | Own lane | Holds until (s left) | Aims from cover | Holds angles | Slices corners |',
      '|---|---|---|---|---|---|---|---|',
      '| Rusher | yes | no | no | 45 | no | – | yes |',
    ].join('\n'),
  );
}

describe('bots.md as shipped (BN1)', () => {
  it('reads without a single problem', () => {
    expect(bots.errors).toEqual([]);
  });

  it('has the four personalities, each with names enough for a full team of them', () => {
    expect([...bots.styles.keys()]).toEqual(['rusher', 'anchor', 'flanker', 'careful']);
    // The largest match (6v6, M88) has 11 bots; dealt round, a personality comes at most twice to a team of 6.
    expect(bots.roster.length).toBeGreaterThanOrEqual(11);
    for (const key of bots.styles.keys()) expect(bots.roster.filter((e) => e.personality === key).length, key).toBeGreaterThanOrEqual(4);
  });

  it('has short, unique, made-up names', () => {
    const names = bots.roster.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const e of bots.roster) expect(e.name.length, e.name).toBeLessThanOrEqual(NAME_MAX_LENGTH);
  });

  it('gives every personality a scoreboard tag and a card note naming the bot', () => {
    for (const [key, s] of bots.styles) {
      expect(s.label.toLowerCase(), key).toBe(key);
      expect(s.cardNote, key).toContain('{name}');
    }
  });

  it('makes the four play differently from each other', () => {
    const shapes = [...bots.styles.values()].map((s) => JSON.stringify({ ...s, label: '', cardNote: '' }));
    expect(new Set(shapes).size).toBe(shapes.length);
    for (const s of bots.styles.values()) expect(s, s.label).not.toEqual({ ...NEUTRAL_STYLE, label: s.label, cardNote: s.cardNote });
  });
});

describe('reading bots.md (BN1)', () => {
  it('says so when a blank line cuts the roster short, rather than dropping every name after it unsaid (BP5)', () => {
    const f = loadBotsFile(mini((t) => t.replace('| Owl | Rusher |', '\n| Owl | Rusher |')));
    expect(f.roster.map((e) => e.name)).toEqual(['Dash']);
    expect(f.errors.some((e) => /^bots.md:6: row outside its table/.test(e))).toBe(true);
  });

  it('reads every column of a row', () => {
    const f = loadBotsFile(mini());
    expect(f.errors).toEqual([]);
    expect(f.roster).toEqual([
      { name: 'Dash', personality: 'rusher' },
      { name: 'Owl', personality: 'rusher' },
    ]);
    expect(f.styles.get('rusher')).toEqual({
      label: 'Rusher',
      cardNote: '{name} rushes.',
      holdTime: 0.3,
      holdCoverChance: 0.5,
      contactCoverMinDistance: 1,
      searchWalkDistance: 0.25,
      flankChance: -0.25, // a Unicode minus, as a word processor writes it
      burst: 1.2,
      burstPause: 0.8,
      peekWatchTime: [1, 2],
      pushesIn: true,
      waitsForTeam: false,
      ownLane: false,
      holdUntil: 45,
      aimsFromCover: false,
      holdsAngles: null,
      slicesCorners: true,
      overtimeWatch: null, // its column left out: nobody watches the overtime flag first
    });
  });

  it('plays a cell it cannot read neutral, and says which line', () => {
    const f = loadBotsFile(mini((t) => t.replace('| Rusher | 0.3 | 0.5 |', '| Rusher | fast | 9 |').replace('| 45 |', '| soon |').replace('| no | – | yes |', '| maybe | – | yes |')));
    const lineOf = (needle: string) => mini().split('\n').findIndex((l) => l.startsWith(needle)) + 1;
    const moveLine = lineOf('| Rusher | 0.3');
    const habitLine = lineOf('| Rusher | yes');
    expect(f.errors).toEqual([
      `bots.md:${moveLine}: Lane pause (×): "fast" is not a number from 0 to 5`,
      `bots.md:${moveLine}: Cover at a lane point (×): "9" is not a number from 0 to 5`,
      `bots.md:${habitLine}: Aims from cover: "maybe" is not yes, no or –`,
      `bots.md:${habitLine}: Holds until (s left): "soon" is not seconds from 0 to 600, or –`,
    ]);
    const s = f.styles.get('rusher')!;
    expect(s.holdTime).toBe(NEUTRAL_STYLE.holdTime);
    expect(s.holdCoverChance).toBe(NEUTRAL_STYLE.holdCoverChance);
    expect(s.aimsFromCover).toBe(NEUTRAL_STYLE.aimsFromCover);
    expect(s.holdUntil).toBe(NEUTRAL_STYLE.holdUntil);
    // The cells it could read stand.
    expect(s.burst).toBe(1.2);
    expect(s.pushesIn).toBe(true);
  });

  it('plays a personality a table leaves out neutral there, and says so', () => {
    const f = loadBotsFile(mini((t) => t.replace('\n| Rusher | yes | no | no | 45 | no | – | yes |', '')));
    expect(f.errors).toHaveLength(1);
    expect(f.errors[0]).toMatch(/Habits: no row for rusher, so it plays neutral there$/);
    const s = f.styles.get('rusher')!;
    expect(s.pushesIn).toBe(false);
    expect(s.waitsForTeam).toBe(true);
    expect(s.holdUntil).toBeNull();
    expect(s.holdTime).toBe(0.3);
  });

  it('reports a missing table, and reads the rest', () => {
    const f = loadBotsFile(mini((t) => t.replace('## Habits', '## Ways')));
    expect(f.errors).toEqual(['bots.md:1: no "Habits" table (a "## Habits" heading over it)']);
    expect(f.styles.get('rusher')!.pushesIn).toBe(false);
    expect(f.styles.get('rusher')!.holdTime).toBe(0.3);
  });

  it('leaves out a roster name that is too long, not a name, twice, or of a personality nobody described', () => {
    const f = loadBotsFile(
      mini((t) => t.replace('| Owl | Rusher |', ['| Owl | Rusher |', '| Bartholomew-Jones | Rusher |', '| R2-D2 | Rusher |', '| dash | Rusher |', '| Specs | Sniper |'].join('\n'))),
    );
    expect(f.roster.map((e) => e.name)).toEqual(['Dash', 'Owl']);
    expect(f.errors).toHaveLength(4);
    expect(f.errors[0]).toContain(`at most ${NAME_MAX_LENGTH}`);
    expect(f.errors[1]).toContain('"R2-D2" is not a name');
    expect(f.errors[2]).toContain('dash is on the roster twice');
    expect(f.errors[3]).toContain('"Sniper" is not in the Personalities table');
  });

  it('reads – as "the level decides" for angles and corners, and as no hold and no watch', () => {
    const f = loadBotsFile(mini((t) => t.replace('| 1–2 |', '| – |').replace('| 45 | no | – | yes |', '| – | no | – | – |')));
    expect(f.errors).toEqual([]);
    const s = f.styles.get('rusher')!;
    expect(s.peekWatchTime).toBeNull();
    expect(s.holdUntil).toBeNull();
    expect(s.holdsAngles).toBeNull();
    expect(s.slicesCorners).toBeNull();
  });

  it('never throws, even on an empty file', () => {
    const f = loadBotsFile('');
    expect(f.roster).toEqual([]);
    expect(f.styles.size).toBe(0);
    expect(f.errors.length).toBeGreaterThan(0);
  });
});
