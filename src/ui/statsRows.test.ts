import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../config/bots';
import { MATCH_MODES } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { emptyStats, type PlayerStats } from '../stats/matchStats';
import { addMatch, emptyRecords } from '../stats/records';
import { DEV_CONTENT_NOT_RECORDED, recordsView } from './recordsView';
import { formatAccuracy, formatTime, rosterNames, statsBlocks } from './statsRows';

/** You (0) and Blue 2 (1) against Orange 1 (2) and Orange 2 (3). */
const roster = () => [0, 1, 2, 3].map((id) => createCharacter(id, vec3(), 0, LOADOUT, id < 2 ? 0 : 1));

describe('stats tables (M19)', () => {
  it('names everyone by team and number, and the player "You"', () => {
    const names = rosterNames(roster(), 0);
    expect([...names.values()]).toEqual(['You', 'Blue 2', 'Orange 1', 'Orange 2']);
  });

  it('formats accuracy and time alive', () => {
    expect(formatAccuracy(emptyStats())).toBe('–');
    expect(formatAccuracy({ ...emptyStats(), hits: 1, bbsFired: 3 })).toBe('33%');
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
  });

  it('puts your team first with its rounds won, best hitters first, your line marked', () => {
    const cs = roster();
    const stats = new Map<number, PlayerStats>(cs.map((c) => [c.id, emptyStats()]));
    stats.get(1)!.hits = 2;
    stats.get(3)!.hits = 1;
    const blocks = statsBlocks(cs, rosterNames(cs, 0), (id) => stats.get(id)!, [1, 3], cs[0]!, false);
    expect(blocks.map((b) => b.title)).toEqual(['Blue (you) · 1 round won', 'Orange · 3 rounds won']);
    expect(blocks[0]!.rows.map((r) => r.name)).toEqual(['Blue 2', 'You']);
    expect(blocks[0]!.rows.map((r) => r.you)).toEqual([false, true]);
    expect(blocks[1]!.rows.map((r) => r.name)).toEqual(['Orange 2', 'Orange 1']);
  });

  it('marks players hit this round only when asked (the live scoreboard)', () => {
    const cs = roster();
    cs[2]!.status = 'walkingOff';
    const names = rosterNames(cs, 0);
    const out = (markOut: boolean) => statsBlocks(cs, names, () => emptyStats(), [0, 0], cs[0]!, markOut)[1]!.rows.map((r) => r.out);
    expect(out(true)).toEqual([true, false]);
    expect(out(false)).toEqual([false, false]);
  });
});

describe('records view (M19)', () => {
  it('lists wins and losses per difficulty and mode, marks the one just played, and flags new bests', () => {
    const r = emptyRecords();
    const news = addMatch(r, { difficulty: 'hard', mode: 'attackDefend', won: true, hits: 12, bbsFired: 40 });
    const view = recordsView(r, news, 'hard', 'attackDefend');
    expect(view.modes).toEqual(MATCH_MODES.map((m) => m.label));
    expect(view.rows.map((row) => row.label)).toEqual(['Easy', 'Normal', 'Hard']);
    const hard = view.rows[DIFFICULTIES.findIndex((d) => d.id === 'hard')]!;
    const cell = hard.cells[MATCH_MODES.findIndex((m) => m.id === 'attackDefend')]!;
    expect(cell).toEqual({ text: '1 W · 0 L', current: true });
    expect(view.rows.flatMap((row) => row.cells).filter((c) => c.current)).toHaveLength(1);
    expect(view.rows[0]!.cells[0]!.text).toBe('–');
    expect(view.bests).toEqual([
      { label: 'Best accuracy', value: '30%', isNew: true },
      { label: 'Wins in a row', value: '1 now · best 1', isNew: true },
    ]);
    expect(view.notCounted).toBe('');
  });

  it('has no Pro row while Pro is dev content, since a dev match never enters the records (M36, M35)', () => {
    const r = emptyRecords();
    const news = addMatch(r, { difficulty: 'hard', mode: 'elimination', won: true, hits: 3, bbsFired: 40 });
    const view = recordsView(r, news, 'pro', 'elimination', 'devContent');
    expect(DIFFICULTIES.find((d) => d.id === 'pro')?.tag).toBe('dev');
    expect(view.rows.map((row) => row.label)).toEqual(['Easy', 'Normal', 'Hard']);
    expect(view.rows.flatMap((row) => row.cells).filter((c) => c.current)).toHaveLength(0);
    expect(view.notCounted).toContain('still being built');
  });

  it('marks nothing and says why after a custom match (M20)', () => {
    const r = emptyRecords();
    const news = addMatch(r, { difficulty: 'hard', mode: 'attackDefend', won: true, hits: 12, bbsFired: 40 });
    const view = recordsView(r, news, 'hard', 'attackDefend', 'rules');
    expect(view.rows.flatMap((row) => row.cells).filter((c) => c.current)).toHaveLength(0);
    expect(view.bests.every((b) => !b.isNew)).toBe(true);
    expect(view.notCounted).toContain('3v3 · first to 5');
  });

  it('says Dev settings kept the match out of the records when they did (M24)', () => {
    const view = recordsView(emptyRecords(), { bestAccuracy: true, bestStreak: false }, 'hard', 'attackDefend', 'dev');
    expect(view.notCounted).toContain('Dev settings');
    expect(view.bests.every((b) => !b.isNew)).toBe(true);
  });

  it('says dev content kept the match out of the records, with its own line and nothing marked (M35)', () => {
    const r = emptyRecords();
    const news = addMatch(r, { difficulty: 'hard', mode: 'attackDefend', won: true, hits: 12, bbsFired: 40 });
    const view = recordsView(r, news, 'hard', 'attackDefend', 'devContent');
    expect(view.notCounted).toBe(DEV_CONTENT_NOT_RECORDED);
    expect(view.notCounted).toContain('content still being built');
    expect(view.notCounted).not.toContain('Dev');
    expect(view.notCounted).not.toContain('Custom rules');
    expect(view.notCounted).not.toContain('Dev settings');
    expect(view.rows.flatMap((row) => row.cells).filter((c) => c.current)).toHaveLength(0);
    expect(view.bests.every((b) => !b.isNew)).toBe(true);
    expect(recordsView(r, news, 'hard', 'attackDefend', 'dev').notCounted).not.toBe(DEV_CONTENT_NOT_RECORDED);
    expect(recordsView(r, news, 'hard', 'attackDefend').notCounted).toBe('');
  });
});
