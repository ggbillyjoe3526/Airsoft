import { describe, expect, it } from 'vitest';
import SHIPPED from '../../data/callouts.md?raw';
import { AREA_NAME_MAX_LENGTH } from '../map/areas';
import { BOT_PERSONALITIES } from './botPersonalities';
import { CALLOUT_LINES } from './calloutLines';
import { CALLOUT_EVENTS, CALLOUT_LINE_MAX, fillLine, loadCalloutsFile, numberWord } from './calloutsFile';

/** CL1: callouts.md, the hand-edited table of what the bots call, is read whole and never stops the game. */

const PEOPLE = new Set(['rusher', 'careful']);

/** What a small file's errors are besides the events it leaves out on purpose. */
const besidesMissing = (errors: readonly string[]): string[] => errors.filter((e) => !/When they call: no row for/.test(e));

/** A small file with every table (but only some events), for the cases below: `lines` replaces the Lines table's rows. */
function file(lines = '| Contact | Any | Contact, {area}! |', when = '| Contact | 1 | 3 |\n| Down | 0.5 | 0 |'): string {
  return [
    '## When they call',
    '',
    '| Event | Chance | Team gap (s) |',
    '|---|---|---|',
    when,
    '',
    '## Pace',
    '',
    '| Rule | Seconds |',
    '|---|---|',
    "| One bot's calls apart | 4 |",
    "| The team's calls apart | 1.5 |",
    '| The same enemy again after | 10 |',
    '| A call waits at most | 1.5 |',
    '',
    '## Marks',
    '',
    '| Rule | Value |',
    '|---|---|',
    '| A sighting is marked (chance) | 0.35 |',
    "| The team's marks apart (s) | 12 |",
    '',
    '## Personalities',
    '',
    '| Personality | Talks (×) |',
    '|---|---|',
    '| Rusher | 1.2 |',
    '| Careful | 0.8 |',
    '',
    '## Lines',
    '',
    '| Event | Who | Line |',
    '|---|---|---|',
    lines,
    '| Down | Any | {left} left! |',
  ].join('\n');
}

describe('the shipped callouts.md', () => {
  it('reads clean against bots.md, and is the file the game loads', () => {
    const read = loadCalloutsFile(SHIPPED, new Set(BOT_PERSONALITIES.styles.keys()));
    expect(read.errors).toEqual([]);
    expect(CALLOUT_LINES.errors).toEqual([]);
    expect(CALLOUT_LINES.rules).toEqual(read.rules);
  });

  it('rules every event, gives each an Any line, and a Talks for every personality', () => {
    for (const e of CALLOUT_EVENTS) {
      expect(CALLOUT_LINES.rules[e.id].chance, e.name).toBeGreaterThan(0);
      expect(CALLOUT_LINES.lines[e.id].some((l) => l.who === ''), e.name).toBe(true);
    }
    for (const key of BOT_PERSONALITIES.styles.keys()) expect(CALLOUT_LINES.talks.get(key), key).toBeGreaterThan(0);
  });

  it('keeps the urgent calls first: a hit before a sighting before chatter', () => {
    const r = CALLOUT_LINES.rules;
    expect(r.lastOne.priority).toBeLessThan(r.down.priority);
    expect(r.down.priority).toBeLessThan(r.contact.priority);
    expect(r.contacts.priority).toBeLessThan(r.contact.priority);
    expect(r.contact.priority).toBeLessThan(r.checking.priority);
    // The answers to your ping (PG1) after every hit's call, before every other.
    expect(Math.max(r.lastOne.priority, r.down.priority, r.tagged.priority)).toBeLessThan(r.pingGoing.priority);
    expect(r.pingGoing.priority).toBeLessThan(r.pingWatching.priority);
    for (const e of CALLOUT_EVENTS) if (!['lastOne', 'down', 'tagged', 'pingGoing', 'pingWatching'].includes(e.id)) expect(r.pingWatching.priority, e.name).toBeLessThan(r[e.id].priority);
  });

  it('has a line for a bot that has no area to name, for every event that can come without one', () => {
    // Last one names a place only when the team saw them lately; the others always have one on a named map.
    expect(CALLOUT_LINES.lines.lastOne.some((l) => l.who === '' && !l.needsArea)).toBe(true);
    // A ping (PG1) can be anywhere, outside every named area too, and is always answered.
    expect(CALLOUT_LINES.lines.pingGoing.some((l) => l.who === '' && !l.needsArea)).toBe(true);
    expect(CALLOUT_LINES.lines.pingWatching.some((l) => l.who === '' && !l.needsArea)).toBe(true);
  });

  it('marks some sightings for the team (PG1), and never every one', () => {
    expect(CALLOUT_LINES.marks.chance).toBeGreaterThan(0);
    expect(CALLOUT_LINES.marks.chance).toBeLessThan(1);
    expect(CALLOUT_LINES.marks.gap).toBeGreaterThan(CALLOUT_LINES.pace.teamGap);
  });
});

describe('the shipped callouts.md: the magazine hand-off (MG1)', () => {
  const MAG_EVENTS = ['needMag', 'magComing', 'magThanks'] as const;

  it('has lines for Need a mag, Mag coming and Thanks for the mag, none past the 48 characters of a feed line', () => {
    for (const id of MAG_EVENTS) {
      const lines = CALLOUT_LINES.lines[id];
      expect(lines.length, id).toBeGreaterThan(0);
      for (const l of lines) {
        expect(l.text.length, l.text).toBeLessThanOrEqual(CALLOUT_LINE_MAX);
        expect(l.text, l.text).not.toMatch(/[{}]/); // they fill nothing
      }
    }
  });

  it("gives every personality's voice a line for each, besides the Any ones", () => {
    for (const id of MAG_EVENTS) {
      for (const key of BOT_PERSONALITIES.styles.keys()) expect(CALLOUT_LINES.lines[id].some((l) => l.who === key), `${id} / ${key}`).toBe(true);
    }
  });

  it('asks and answers on every ask (chance 1), and thanks most of the time', () => {
    expect(CALLOUT_LINES.rules.needMag.chance).toBe(1);
    expect(CALLOUT_LINES.rules.magComing.chance).toBe(1);
    expect(CALLOUT_LINES.rules.magThanks.chance).toBeGreaterThan(0);
  });
});

describe('reading callouts.md', () => {
  it('reads chances, gaps, pace, talks and lines, the row order the priority', () => {
    const read = loadCalloutsFile(file(), PEOPLE);
    expect(besidesMissing(read.errors)).toEqual([]);
    expect(read.errors).toHaveLength(CALLOUT_EVENTS.length - 2);
    expect(read.rules.contact).toEqual({ chance: 1, teamGap: 3, priority: 0 });
    expect(read.rules.down).toEqual({ chance: 0.5, teamGap: 0, priority: 1 });
    expect(read.pace).toEqual({ botGap: 4, teamGap: 1.5, sameEnemyGap: 10, maxWait: 1.5 });
    expect(read.talks.get('careful')).toBe(0.8);
    expect(read.lines.contact).toEqual([{ who: '', text: 'Contact, {area}!', needsArea: true }]);
  });

  it('never throws: a missing table, an unknown event or personality, a bad number, each reported with its line', () => {
    expect(() => loadCalloutsFile('', PEOPLE)).not.toThrow();
    expect(loadCalloutsFile('', PEOPLE).errors.some((e) => /no "When they call" table/.test(e))).toBe(true);
    const bad = loadCalloutsFile(file('| Contact | Any | Contact, {area}! |', '| Contact | 2 | 3 |\n| Shouting | 1 | 1 |\n| Down | 0.5 | -1 |'), PEOPLE);
    expect(bad.errors.some((e) => /^callouts\.md:5: Chance: "2"/.test(e))).toBe(true);
    expect(bad.errors.some((e) => /^callouts\.md:6: "Shouting" is not an event/.test(e))).toBe(true);
    expect(bad.errors.some((e) => /Team gap \(s\): "-1"/.test(e))).toBe(true);
    // An event without a row is never called.
    expect(bad.rules.contact.chance).toBe(0);
    expect(bad.rules.heard.chance).toBe(0);
  });

  it('leaves out a line that fills what its event has not, an unknown fill, a stray brace, or one too long', () => {
    const rows = [
      '| Contact | Any | Contact, {area}! |',
      '| Contact | Any | {left} left, {area}! |',
      '| Contact | Any | Contact, {place}! |',
      '| Contact | Any | Contact { |',
      `| Contact | Any | ${'a'.repeat(CALLOUT_LINE_MAX - AREA_NAME_MAX_LENGTH)}{area}! |`,
      '| Contact | Sniper | Contact, {area}! |',
    ].join('\n');
    const read = loadCalloutsFile(file(rows), PEOPLE);
    expect(read.lines.contact.map((l) => l.text)).toEqual(['Contact, {area}!']);
    expect(besidesMissing(read.errors)).toHaveLength(5);
    expect(read.errors.join('\n')).toMatch(/"\{left\}" is not filled in for this event/);
    expect(read.errors.join('\n')).toMatch(/"\{place\}" is not something a line fills in/);
    expect(read.errors.join('\n')).toMatch(/a brace with nothing to fill in/);
    expect(read.errors.join('\n')).toMatch(/is too long \(49 characters/);
    expect(read.errors.join('\n')).toMatch(/Who: "Sniper" is not Any or a personality/);
  });

  it('reads the Marks table (PG1), and reports a bad, unknown, doubled or missing rule, keeping its fallback', () => {
    expect(loadCalloutsFile(file(), PEOPLE).marks).toEqual({ chance: 0.35, gap: 12 });
    const bad = loadCalloutsFile(file().replace('| A sighting is marked (chance) | 0.35 |', '| A sighting is marked (chance) | 1.5 |\n| Marked twice | 1 |'), PEOPLE);
    expect(bad.marks.chance).toBe(0.35);
    expect(bad.errors.join('\n')).toMatch(/A sighting is marked \(chance\): "1\.5" is not/);
    expect(bad.errors.join('\n')).toMatch(/"Marked twice" is not a marks rule/);
    expect(bad.errors.join('\n')).toMatch(/Marks: no row for A sighting is marked \(chance\), so it is 0\.35/);
    const twice = loadCalloutsFile(file().replace("| The team's marks apart (s) | 12 |", "| The team's marks apart (s) | 12 |\n| The team's marks apart (s) | 3 |"), PEOPLE);
    expect(twice.marks.gap).toBe(12);
    expect(besidesMissing(twice.errors)).toHaveLength(1);
    const none = loadCalloutsFile(file().replace(/## Marks[\s\S]*?## Personalities/, '## Personalities'), PEOPLE);
    expect(none.marks).toEqual({ chance: 0.35, gap: 12 });
    expect(none.errors.some((e) => /no "Marks" table/.test(e))).toBe(true);
  });

  it('reports a personality bots.md has that the file leaves out (it talks × 1), and one bots.md lacks', () => {
    const read = loadCalloutsFile(file(), new Set(['rusher', 'careful', 'anchor']));
    expect(read.errors.some((e) => /no row for anchor, so it talks × 1/.test(e))).toBe(true);
    expect(loadCalloutsFile(file(), new Set(['rusher'])).errors.some((e) => /"Careful" is not in bots\.md/.test(e))).toBe(true);
  });
});

describe('filling a line in', () => {
  it('puts the area in, and numbers as words, a capital only where a sentence starts', () => {
    expect(fillLine('Contact, {area}!', 'Dock', 0, 0)).toBe('Contact, Dock!');
    expect(fillLine('{count}, {area}!', 'Bay', 3, 0)).toBe('Three, Bay!');
    expect(fillLine('Contact, {count}, {area}!', 'Bay', 2, 0)).toBe('Contact, two, Bay!');
    expect(fillLine('Got one! {left} left.', '', 0, 2)).toBe('Got one! Two left.');
    expect(fillLine('{area} is clear', 'back lot', 0, 0)).toBe('Back lot is clear');
  });

  it('says numbers to twelve in words, and digits past it', () => {
    expect(numberWord(1)).toBe('One');
    expect(numberWord(12)).toBe('Twelve');
    expect(numberWord(13)).toBe('13');
  });
});
