import { describe, expect, it } from 'vitest';
import { BOT_BEHAVIOUR } from './bots';
import botsSource from './bots.ts?raw';
import extractionSource from './botsExtraction.ts?raw';
import movementSource from './botsMovement.ts?raw';
import sensesSource from './botsSenses.ts?raw';
import squadSource from './botsSquad.ts?raw';

// M41 gathered every Pro-only bot number into one "Pro tuning" block of BOT_BEHAVIOUR: keys moved, no value changed
// (checked once against the M40 source when the block was made; a snapshot here would fail every future tuning change).
// DX7 split BOT_BEHAVIOUR by concern into the files bots.ts spreads in this order; the block is in botsSquad.ts.

/** BOT_BEHAVIOUR's source as bots.ts gathers it: each part's object, in spread order, then bots.ts's own keys. */
const source = [
  [sensesSource, 'BOT_SENSES'],
  [movementSource, 'BOT_MOVEMENT'],
  [squadSource, 'BOT_SQUAD'],
  [extractionSource, 'BOT_EXTRACTION'],
  [botsSource, 'BOT_BEHAVIOUR'],
]
  .map(([text, name]) => {
    const lines = text!.split('\n');
    const start = lines.findIndex((l) => l.startsWith(`export const ${name} = {`));
    const end = lines.findIndex((l, i) => i > start && l.startsWith('} as const'));
    return lines.slice(start + 1, end).join('\n');
  })
  .join('\n');

/** The keys of BOT_BEHAVIOUR as the source lists them (top-level `  name:` lines), with the line each is on. */
function behaviourKeys(): { key: string; line: number }[] {
  const lines = source.split('\n');
  const keys: { key: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {2}([A-Za-z0-9]+):/.exec(lines[i]!);
    if (m) keys.push({ key: m[1]!, line: i });
  }
  return keys;
}

describe('the Pro tuning move (M41)', () => {
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
