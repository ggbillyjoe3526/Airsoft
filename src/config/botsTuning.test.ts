import { describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR, BOT_LOADOUTS, BOT_PART_CHANCE, BOT_SKILL, DIFFICULTIES, NIGHT_SIGHT, RANDOM_LOADOUT, botConfig } from './bots';
import source from './bots.ts?raw';
import { BOTS_BEFORE_M41 } from './testSupport';

// M41 gathered every Pro-only bot number into one "Pro tuning" block of BOT_BEHAVIOUR: keys moved, no value changed.

/** The keys of BOT_BEHAVIOUR as the source lists them (top-level `  name:` lines), with the line each is on. */
function behaviourKeys(): { key: string; line: number }[] {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l.startsWith('export const BOT_BEHAVIOUR'));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('} as const'));
  const keys: { key: string; line: number }[] = [];
  for (let i = start + 1; i < end; i++) {
    const m = /^ {2}([A-Za-z0-9]+):/.exec(lines[i]!);
    if (m) keys.push({ key: m[1]!, line: i });
  }
  return keys;
}

describe('the Pro tuning move (M41)', () => {
  it('leaves BOT_BEHAVIOUR with exactly the keys and values it had before the move', () => {
    expect(BOT_BEHAVIOUR).toStrictEqual(BOTS_BEFORE_M41.BOT_BEHAVIOUR);
    expect(Object.keys(BOT_BEHAVIOUR).sort()).toEqual(Object.keys(BOTS_BEFORE_M41.BOT_BEHAVIOUR).sort());
  });

  it('leaves every difficulty\'s skill and the rest of the bot tuning as it was', () => {
    expect(BOT_SKILL).toStrictEqual(BOTS_BEFORE_M41.BOT_SKILL);
    expect(BOT_LOADOUTS).toStrictEqual(BOTS_BEFORE_M41.BOT_LOADOUTS);
    expect(RANDOM_LOADOUT).toStrictEqual(BOTS_BEFORE_M41.RANDOM_LOADOUT);
    expect(BOT_PART_CHANCE).toStrictEqual(BOTS_BEFORE_M41.BOT_PART_CHANCE);
    expect(NIGHT_SIGHT).toStrictEqual(BOTS_BEFORE_M41.NIGHT_SIGHT);
    // The assembled per-difficulty config is the shared behaviour plus that skill, nothing else.
    for (const d of DIFFICULTIES) expect(botConfig(d.id), d.id).toStrictEqual({ ...BOTS_BEFORE_M41.BOT_BEHAVIOUR, ...BOTS_BEFORE_M41.BOT_SKILL[d.id] });
  });

  it('lists every Pro-only behaviour key (held angles, pre-aim, slicing, trades, bounds, crossfire, late push, middle hunt, dark spots) in the one block', () => {
    const keys = behaviourKeys();
    const marker = source.split('\n').findIndex((l) => l.includes('// ---- Pro tuning'));
    expect(marker, 'a "Pro tuning" heading inside BOT_BEHAVIOUR').toBeGreaterThan(0);
    const proOnly = /^(angle|preAimCone|trade|sliceLean|bound|crossfire|latePush|huntMiddleBias|darkSpot)/;
    const pro = keys.filter((k) => proOnly.test(k.key));
    expect(pro.length).toBeGreaterThan(30);
    // All after the heading, and none of the shared keys (above it) is a Pro one.
    for (const k of pro) expect(k.line, k.key).toBeGreaterThan(marker);
    for (const k of keys.filter((k) => k.line < marker)) expect(proOnly.test(k.key), k.key).toBe(false);
    // The parse saw the same keys the object has.
    expect(keys.map((k) => k.key).sort()).toEqual(Object.keys(BOT_BEHAVIOUR).sort());
  });
});
