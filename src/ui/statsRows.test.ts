import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../config/bots';
import { MATCH_MODES } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { emptyStats, type PlayerStats } from '../stats/matchStats';
import { addMatch, emptyRecords, noNews } from '../stats/records';
import { DEV_CONTENT_NOT_RECORDED, extractionBests, recordsRulesetShown, recordsView } from './recordsView';
import { standardMatchText } from '../config/matchRules';
import { formatAccuracy, formatTime, rosterNames, rosterTags, statsBlocks } from './statsRows';

/** You (0) and Alpha 2 (1) against Beta 1 (2) and Beta 2 (3). */
const roster = () => [0, 1, 2, 3].map((id) => createCharacter(id, vec3(), 0, LOADOUT, id < 2 ? 0 : 1));

describe('stats tables (M19)', () => {
  it('names everyone by team and number, and the player "You"', () => {
    const names = rosterNames(roster(), 0);
    expect([...names.values()]).toEqual(['You', 'Alpha 2', 'Beta 1', 'Beta 2']);
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
    expect(blocks.map((b) => b.title)).toEqual(['Alpha (you) · 1 round won', 'Beta · 3 rounds won']);
    expect(blocks[0]!.rows.map((r) => r.name)).toEqual(['Alpha 2', 'You']);
    expect(blocks[0]!.rows.map((r) => r.you)).toEqual([false, true]);
    expect(blocks[1]!.rows.map((r) => r.name)).toEqual(['Beta 2', 'Beta 1']);
  });

  it('names the teams by side in an Extraction run, not by rounds won (M43)', () => {
    const cs = roster();
    const blocks = statsBlocks(cs, rosterNames(cs, 0), () => emptyStats(), [1, 0], cs[0]!, false, true);
    expect(blocks.map((b) => b.title)).toEqual(['Alpha (you) · your squad', 'Beta · home team']);
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

describe('the bots\' names and personalities on the tables (BN1)', () => {
  const who = (name: string, label: string) => ({ name, style: { label } });

  it('names each bot by its roster name, keeps "You", and numbers a bot the roster had no name for', () => {
    const cs = roster();
    const identities = new Map([
      [1, who('Rook', 'Anchor')],
      [3, who('Dash', 'Rusher')],
    ]);
    expect([...rosterNames(cs, 0, identities).values()]).toEqual(['You', 'Rook', 'Beta 1', 'Dash']);
  });

  it('tags each bot\'s row with its personality, and nobody else\'s', () => {
    const cs = roster();
    const identities = new Map([
      [1, who('Rook', 'Anchor')],
      [2, who('Owl', 'Careful')],
      [3, who('Nobody', '')],
    ]);
    const tags = rosterTags(identities);
    expect([...tags]).toEqual([
      [1, 'Anchor'],
      [2, 'Careful'],
    ]);
    const blocks = statsBlocks(cs, rosterNames(cs, 0, identities), () => emptyStats(), [0, 0], cs[0]!, false, false, [], tags);
    expect(blocks[0]!.rows.map((r) => [r.name, r.tag])).toEqual([
      ['You', ''],
      ['Rook', 'Anchor'],
    ]);
    expect(blocks[1]!.rows.map((r) => [r.name, r.tag])).toEqual([
      ['Owl', 'Careful'],
      ['Nobody', ''],
    ]);
  });
});

const NO_NEWS_FOR_TEST = noNews();

describe('records view (M19)', () => {
  it('lists wins and losses per difficulty and mode, marks the one just played, and flags new bests', () => {
    const r = emptyRecords();
    const news = addMatch(r, { difficulty: 'hard', mode: 'attackDefend', won: true, hits: 12, bbsFired: 40 });
    const view = recordsView(r, news, 'hard', 'attackDefend');
    const modes = MATCH_MODES.filter((m) => m.tag === 'public');
    const difficulties = DIFFICULTIES.filter((d) => d.tag === 'public');
    expect(view.modes).toEqual(modes.map((m) => m.label));
    expect(view.rows.map((row) => row.label)).toEqual(difficulties.map((d) => d.label));
    const hard = view.rows[difficulties.findIndex((d) => d.id === 'hard')]!;
    const cell = hard.cells[modes.findIndex((m) => m.id === 'attackDefend')]!;
    expect(cell).toEqual({ text: '1 W · 0 L', current: true });
    expect(view.rows.flatMap((row) => row.cells).filter((c) => c.current)).toHaveLength(1);
    expect(view.rows[0]!.cells[0]!.text).toBe('–');
    expect(view.bests).toEqual([
      { label: 'Best accuracy', value: '30%', isNew: true },
      { label: 'Wins in a row', value: '1 now · best 1', isNew: true },
    ]);
    expect(view.notCounted).toBe('');
  });

  it('has no Extraction column while it is dev content, since a dev match never enters the records (M43, M35)', () => {
    const r = emptyRecords();
    expect(MATCH_MODES.find((m) => m.id === 'extraction')?.tag).toBe('dev');
    const view = recordsView(r, NO_NEWS_FOR_TEST, 'normal', 'extraction', 'devContent');
    expect(view.modes).toEqual(['Elimination', 'Attack and Defend']);
    expect(view.rows.every((row) => row.cells.length === 2)).toBe(true);
    expect(view.rows.flatMap((row) => row.cells).filter((c) => c.current)).toHaveLength(0);
  });

  it('has no Extraction bests while it is dev content either (M47)', () => {
    const view = recordsView(emptyRecords(), NO_NEWS_FOR_TEST, 'normal', 'extraction', 'devContent');
    expect(view.bests.map((b) => b.label)).toEqual(['Best accuracy', 'Wins in a row']);
  });

  it('reads Extraction’s bests: the best haul, extractions in a row and the fastest with a find (M47)', () => {
    const r = emptyRecords();
    expect(extractionBests(r, NO_NEWS_FOR_TEST)).toEqual([
      { label: 'Best haul', value: '–', isNew: false },
      { label: 'Extractions in a row', value: '0 now · best 0', isNew: false },
      { label: 'Fastest extraction with a case', value: '–', isNew: false },
    ]);
    const news = addMatch(r, { difficulty: 'normal', mode: 'extraction', won: true, hits: 0, bbsFired: 0, run: { haulXp: 1250, finds: 2, seconds: 95.4 } });
    expect(extractionBests(r, news)).toEqual([
      { label: 'Best haul', value: '1,250 XP', isNew: true },
      { label: 'Extractions in a row', value: '1 now · best 1', isNew: true },
      { label: 'Fastest extraction with a case', value: '1:35', isNew: true },
    ]);
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
    const view = recordsView(emptyRecords(), { ...noNews(), bestAccuracy: true }, 'hard', 'attackDefend', 'dev');
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

  it("shows a named ruleset's own cells and quotes its standard match after its match (M39, KI1)", () => {
    const r = emptyRecords();
    addMatch(r, { difficulty: 'hard', mode: 'elimination', won: true, hits: 3, bbsFired: 40 });
    const news = addMatch(r, { difficulty: 'hard', mode: 'elimination', ruleset: 'tournament', won: false, hits: 1, bbsFired: 30 });
    const modes = MATCH_MODES.filter((m) => m.tag === 'public');
    const hardRow = DIFFICULTIES.filter((d) => d.tag === 'public').findIndex((d) => d.id === 'hard');
    const elim = modes.findIndex((m) => m.id === 'elimination');
    const view = recordsView(r, news, 'hard', 'elimination', '', 'tournament');
    expect(view.title).toBe('Your Tournament records');
    expect(view.rows[hardRow]!.cells[elim]).toEqual({ text: '0 W · 1 L', current: true });
    const custom = recordsView(r, news, 'hard', 'elimination', 'rules', 'tournament');
    expect(custom.notCounted).toContain(standardMatchText('tournament'));
    expect(custom.notCounted).toContain('Tournament records');
    // Skirmish, Custom (no cells of its own) and an Extraction run show the plain cells and Skirmish's standard match.
    for (const [ruleset, mode] of [['skirmish', 'elimination'], ['custom', 'elimination'], ['tournament', 'extraction']] as const) {
      expect(recordsRulesetShown(ruleset, mode)).toBe('skirmish');
    }
    const plain = recordsView(r, news, 'hard', 'elimination', 'rules', 'custom');
    expect(plain.title).toBe('Your records');
    expect(plain.rows[hardRow]!.cells[elim]!.text).toBe('1 W · 0 L');
    expect(plain.notCounted).toContain(standardMatchText());
  });
});

describe('statsBlocks leaves out the benched (BP3: Extraction\'s reserve until it joins)', () => {
  const cs = roster();
  const stats = (): PlayerStats => emptyStats();

  it('lists a team without the characters marked in benched, by character id', () => {
    const blocks = statsBlocks(cs, rosterNames(cs, 0), stats, [0, 0], cs[0]!, false, true, [false, false, false, true]);
    expect(blocks[0]!.rows.map((r) => r.name)).toEqual(['You', 'Alpha 2']);
    expect(blocks[1]!.rows.map((r) => r.name)).toEqual(['Beta 1']);
  });

  it('lists everyone when nobody is benched, or the array is left out or short', () => {
    for (const benched of [undefined, [], [false], [false, false, false, false]]) {
      const blocks = statsBlocks(cs, rosterNames(cs, 0), stats, [0, 0], cs[0]!, false, true, benched);
      expect(blocks.map((b) => b.rows.length)).toEqual([2, 2]);
    }
  });

  it('brings the character back once it is no longer benched', () => {
    const benched = [false, false, false, true];
    const names = rosterNames(cs, 0);
    expect(statsBlocks(cs, names, stats, [0, 0], cs[0]!, false, true, benched)[1]!.rows).toHaveLength(1);
    benched[3] = false;
    expect(statsBlocks(cs, names, stats, [0, 0], cs[0]!, false, true, benched)[1]!.rows).toHaveLength(2);
  });
});
