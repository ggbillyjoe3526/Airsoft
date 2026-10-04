import { describe, expect, it } from 'vitest';
import { nextSessionAction, type PlayPress, type SessionAction } from './sessionPlan';

type Row = [started: boolean, practice: boolean, loaded: PlayPress['loaded'], matchOver: boolean, setupChanged: boolean, loadoutChanged: boolean, action: SessionAction];

/** Every combination Game can reach when Play is pressed with the graphics context in place, and what Play does. */
const TABLE: Row[] = [
  // The title's Practice range or Tutorial: a fresh range, whatever is loaded.
  [false, true, null, false, false, false, 'buildRange'],
  [false, true, null, false, false, true, 'buildRange'],
  [false, true, null, false, true, false, 'buildRange'],
  [false, true, null, false, true, true, 'buildRange'],
  [false, true, 'match', false, false, false, 'buildRange'],
  [false, true, 'match', false, false, true, 'buildRange'],
  [false, true, 'match', false, true, false, 'buildRange'],
  [false, true, 'match', false, true, true, 'buildRange'],
  [false, true, 'range', false, false, false, 'buildRange'],
  [false, true, 'range', false, false, true, 'buildRange'],
  [false, true, 'range', false, true, false, 'buildRange'],
  [false, true, 'range', false, true, true, 'buildRange'],
  // New game's Play with nothing loaded.
  [false, false, null, false, false, false, 'buildMatch'],
  [false, false, null, false, false, true, 'buildMatch'],
  [false, false, null, false, true, false, 'buildMatch'],
  [false, false, null, false, true, true, 'buildMatch'],
  // A match built for a Play whose mouse lock was refused (audit L-33).
  [false, false, 'match', false, false, false, 'reuse'],
  [false, false, 'match', false, false, true, 'reuse'],
  // New game changed since that match was built.
  [false, false, 'match', false, true, false, 'buildMatch'],
  [false, false, 'match', false, true, true, 'buildMatch'],
  // A range left from a refused lock: New game's Play is a match.
  [false, false, 'range', false, false, false, 'buildMatch'],
  [false, false, 'range', false, false, true, 'buildMatch'],
  [false, false, 'range', false, true, false, 'buildMatch'],
  [false, false, 'range', false, true, true, 'buildMatch'],
  // Play Again: a new match with its own seed (audit SIM-08).
  [true, false, 'match', true, false, false, 'buildMatch'],
  [true, false, 'match', true, false, true, 'buildMatch'],
  [true, false, 'match', true, true, false, 'buildMatch'],
  [true, false, 'match', true, true, true, 'buildMatch'],
  // Resume: the match carries on (changes wait for the next match).
  [true, false, 'match', false, false, false, 'reuse'],
  [true, false, 'match', false, false, true, 'reuse'],
  [true, false, 'match', false, true, false, 'reuse'],
  [true, false, 'match', false, true, true, 'reuse'],
  // Resume after the Loadout: the range with the new kit, where you stood.
  [true, true, 'range', false, false, true, 'rebuildRange'],
  [true, true, 'range', false, true, true, 'rebuildRange'],
  // Resume on the range.
  [true, true, 'range', false, false, false, 'reuse'],
  [true, true, 'range', false, true, false, 'reuse'],
];

const press = ([started, practice, loaded, matchOver, setupChanged, loadoutChanged]: Row, graphicsLost = false): PlayPress => ({
  graphicsLost,
  started,
  practice,
  loaded,
  matchOver,
  setupChanged,
  loadoutChanged,
});

/**
 * The combinations Game can reach (game.ts): play has begun only in something loaded; on the range `practice` stays
 * set and in a match it is cleared (New game's Play clears it); only a match that has been played can be decided.
 */
function reachable(): PlayPress[] {
  const out: PlayPress[] = [];
  const both = [false, true];
  for (const started of both)
    for (const practice of both)
      for (const loaded of [null, 'match', 'range'] as const)
        for (const matchOver of both)
          for (const setupChanged of both)
            for (const loadoutChanged of both) {
              if (started && (loaded === null || practice !== (loaded === 'range'))) continue;
              if (matchOver && !(started && loaded === 'match')) continue;
              out.push({ graphicsLost: false, started, practice, loaded, matchOver, setupChanged, loadoutChanged });
            }
  return out;
}

describe('nextSessionAction (what Play does, audit CORE-05)', () => {
  it('does what the table says for every row', () => {
    for (const row of TABLE) expect(nextSessionAction(press(row)), JSON.stringify(row)).toBe(row[6]);
  });

  it('has a row for every combination Game can reach, and only those', () => {
    const key = (p: PlayPress) => JSON.stringify(p);
    const rows = new Set(TABLE.map((r) => key(press(r))));
    expect(rows.size).toBe(TABLE.length);
    expect([...rows].sort()).toEqual(reachable().map(key).sort());
  });

  it('does nothing while the graphics context is lost, whatever else holds', () => {
    for (const row of TABLE) expect(nextSessionAction(press(row, true))).toBe('none');
  });
});
