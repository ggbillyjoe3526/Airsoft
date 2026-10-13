import { describe, expect, it } from 'vitest';
import SHIPPED from '../../callouts.md?raw';
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
  });

  it('has a line for a bot that has no area to name, for every event that can come without one', () => {
    // Last one names a place only when the team saw them lately; the others always have one on a named map.
    expect(CALLOUT_LINES.lines.lastOne.some((l) => l.who === '' && !l.needsArea)).toBe(true);
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
