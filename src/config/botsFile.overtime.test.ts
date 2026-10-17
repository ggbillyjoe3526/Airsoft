import { describe, expect, it } from 'vitest';
import botsText from '../../data/bots.md?raw';
import { loadBotsFile, NEUTRAL_STYLE } from './botsFile';

/** bots.md's optional Habits column "Watches the flag first (s)" (OT1, Dev 6 item 45). */

function mini(cell: string | null): string {
  const header = '| Personality | Pushes in | Waits for the team | Own lane | Holds until (s left) | Aims from cover | Holds angles | Slices corners |' + (cell === null ? '' : ' Watches the flag first (s) |');
  const sep = '|---|---|---|---|---|---|---|---|' + (cell === null ? '' : '---|');
  const row = '| Rusher | yes | no | no | 45 | no | – | yes |' + (cell === null ? '' : ` ${cell} |`);
  return [
    '## Roster', '| Name | Personality |', '|---|---|', '| Dash | Rusher |', '',
    '## Personalities', '| Personality | Card note |', '|---|---|', '| Rusher | {name} rushes. |', '',
    '## How they move',
    '| Personality | Lane pause (×) | Cover at a lane point (×) | Cover on contact from (×) | Walk the last (×) | Flank chance (+) | Burst (×) | Burst pause (×) | Watch where you ducked (s) |',
    '|---|---|---|---|---|---|---|---|---|',
    '| Rusher | 1 | 1 | 1 | 1 | 0 | 1 | 1 | – |', '',
    '## Habits', header, sep, row,
  ].join('\n');
}

describe('bots.md › Habits › Watches the flag first', () => {
  it('reads seconds, 0 and the top of its range', () => {
    for (const [cell, want] of [['6', 6], ['0', 0], ['60', 60], ['2.5', 2.5]] as const) {
      const f = loadBotsFile(mini(cell));
      expect(f.errors, cell).toEqual([]);
      expect(f.styles.get('rusher')!.overtimeWatch, cell).toBe(want);
    }
  });

  it('reads "–" or an empty cell, or a file with no such column, as going straight for the flag', () => {
    for (const cell of ['–', '', null]) {
      const f = loadBotsFile(mini(cell));
      expect(f.errors, String(cell)).toEqual([]);
      expect(f.styles.get('rusher')!.overtimeWatch, String(cell)).toBeNull();
    }
  });

  it('plays a cell out of range or not a number neutral, and names its line', () => {
    for (const cell of ['61', '-1', 'long']) {
      const f = loadBotsFile(mini(cell));
      expect(f.errors, cell).toHaveLength(1);
      expect(f.errors[0], cell).toMatch(/^bots\.md:\d+: Watches the flag first \(s\): ".*" is not seconds from 0 to 60, or –$/);
      expect(f.styles.get('rusher')!.overtimeWatch, cell).toBe(NEUTRAL_STYLE.overtimeWatch);
      expect(f.styles.get('rusher')!.holdUntil, cell).toBe(45); // the rest of the row stands
    }
  });

  it('is shipped for the anchor and the careful bot only', () => {
    const f = loadBotsFile(botsText);
    const watch = Object.fromEntries([...f.styles].map(([k, s]) => [k, s.overtimeWatch]));
    expect(watch.anchor).toBeGreaterThan(0);
    expect(watch.careful).toBeGreaterThan(0);
    expect(watch.rusher).toBeNull();
    expect(watch.flanker).toBeNull();
  });
});
