import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, TEAMMATE_DIFFICULTIES } from './config/bots';
import type { ContentTag } from './config/content';
import { DEFAULT_MATCH_RULES, TEAM_SIZE_CHOICES, WINS_NEEDED_CHOICES } from './config/matchRules';
import { DEFAULT_MODE, MATCH_MODES } from './config/modes';
import { DEFAULT_MAP, MAPS } from './map/maps';
import { botsMayCarryDev, matchUsesDev, type NewGamePicks, pickTags, picksUseDev, playedPicks } from './newGamePicks';
import { BOT_LOADOUTS } from './config/bots';
import { GAME_POOL } from './pool/gamePool';
import { strayDevPart, withAssets, withTags } from './pool/testSupport';

const picks = (over: Partial<NewGamePicks> = {}, rules: Partial<NewGamePicks['rules']> = {}): NewGamePicks => ({
  map: DEFAULT_MAP,
  mode: DEFAULT_MODE,
  difficulty: DEFAULT_DIFFICULTY,
  teammateDifficulty: DEFAULT_DIFFICULTY,
  rules: { ...DEFAULT_MATCH_RULES, ...rules },
  ...over,
});

/** The lists are readonly in type only; a test tags an entry dev for its length and puts it back. */
type Taggable = { id: string; tag?: ContentTag | undefined };
const undo: (() => void)[] = [];
function tagDev(list: readonly Taggable[], id: string): void {
  const entry = list.find((o) => o.id === id)!;
  const was = entry.tag;
  (entry as Taggable).tag = 'dev';
  undo.push(() => void ((entry as Taggable).tag = was));
}
afterEach(() => {
  while (undo.length) undo.pop()!();
});

describe('New game picks and dev content (M35)', () => {
  it('has every real option public today, so no pick uses dev content', () => {
    for (const map of MAPS) expect(map.tag).toBe('public');
    for (const list of [MATCH_MODES, DIFFICULTIES, TEAMMATE_DIFFICULTIES]) for (const o of list) expect(o.tag).toBe('public');
    for (const list of [WINS_NEEDED_CHOICES, TEAM_SIZE_CHOICES]) for (const o of list) expect(o.tag ?? 'public').toBe('public');
    expect(pickTags(picks()).every((t) => t === 'public')).toBe(true);
    expect(picksUseDev(picks())).toBe(false);
  });

  it('plays every real option as picked, with Dev content off or on', () => {
    for (const devContent of [false, true]) {
      for (const map of MAPS) for (const mode of MATCH_MODES) {
        const p = picks({ map: map.id, mode: mode.id });
        expect(playedPicks(p, devContent)).toEqual(p);
      }
      for (const d of DIFFICULTIES) for (const t of TEAMMATE_DIFFICULTIES) {
        const p = picks({ difficulty: d.id, teammateDifficulty: t.id });
        expect(playedPicks(p, devContent)).toEqual(p);
      }
      for (const w of WINS_NEEDED_CHOICES) for (const s of TEAM_SIZE_CHOICES) {
        const p = picks({}, { winsNeeded: Number(w.id), teamSize: Number(s.id) });
        expect(playedPicks(p, devContent)).toEqual(p);
        expect(picksUseDev(playedPicks(p, devContent))).toBe(false);
      }
    }
  });

  it('keeps the other rules as they are', () => {
    const p = picks({}, { roundTime: 90, friendlyFire: false, ricochetsCount: true, winsNeeded: 3 });
    expect(playedPicks(p, false).rules).toEqual(p.rules);
  });

  it('plays a dev mode and a dev difficulty as the defaults while off, and as picked while on', () => {
    tagDev(MATCH_MODES, 'attackDefend');
    tagDev(DIFFICULTIES, 'hard');
    tagDev(TEAMMATE_DIFFICULTIES, 'easy');
    const p = picks({ mode: 'attackDefend', difficulty: 'hard', teammateDifficulty: 'easy' });
    expect(playedPicks(p, false)).toEqual(picks());
    expect(playedPicks(p, true)).toEqual(p);
    expect(playedPicks(picks({ mode: 'elimination', difficulty: 'easy' }), false)).toEqual(picks({ difficulty: 'easy' }));
  });

  it('plays a dev Match pop-up choice as the default rule while off', () => {
    tagDev(WINS_NEEDED_CHOICES, '10');
    tagDev(TEAM_SIZE_CHOICES, '3');
    const p = picks({}, { winsNeeded: 10, teamSize: 3 });
    expect(playedPicks(p, false).rules).toMatchObject({ winsNeeded: DEFAULT_MATCH_RULES.winsNeeded, teamSize: DEFAULT_MATCH_RULES.teamSize });
    expect(playedPicks(p, true).rules).toMatchObject({ winsNeeded: 10, teamSize: 3 });
  });

  it('tags a dev map, mode, difficulty and Match choice, and says the picks use dev content', () => {
    tagDev(MATCH_MODES, 'attackDefend');
    expect(pickTags(picks({ mode: 'attackDefend' }))).toContain('dev');
    expect(picksUseDev(picks({ mode: 'attackDefend' }))).toBe(true);
    expect(picksUseDev(picks())).toBe(false);
    tagDev(DIFFICULTIES, 'hard');
    expect(picksUseDev(picks({ difficulty: 'hard' }))).toBe(true);
    tagDev(WINS_NEEDED_CHOICES, '7');
    expect(picksUseDev(picks({}, { winsNeeded: 7 }))).toBe(true);
    tagDev(MAPS, 'depot');
    expect(picksUseDev(picks())).toBe(true);
  });

  it('does not count the teammates difficulty in a 1v1, which has no teammates, and does from 2v2 up', () => {
    tagDev(TEAMMATE_DIFFICULTIES, 'hard');
    const dev = { teammateDifficulty: 'hard' as const };
    expect(picksUseDev(picks(dev, { teamSize: 1 }))).toBe(false);
    expect(pickTags(picks(dev, { teamSize: 1 }))).not.toContain('dev');
    expect(picksUseDev(picks(dev, { teamSize: 2 }))).toBe(true);
    expect(picksUseDev(picks(dev, { teamSize: 3 }))).toBe(true);
    // The opponents' difficulty is its own list, still public here.
    expect(picksUseDev(picks({ difficulty: 'hard' }, { teamSize: 1 }))).toBe(false);
  });

  it('restores the lists after a test tagged an entry (the real lists stay public)', () => {
    for (const o of [...MAPS, ...MATCH_MODES, ...DIFFICULTIES, ...TEAMMATE_DIFFICULTIES]) expect(o.tag).toBe('public');
  });
});

describe('whether the opponents may carry dev gear and whether a match uses dev content (M35)', () => {
  const kitOf = (...names: string[]) => names.map((n) => ({ asset: GAME_POOL.assets.find((a) => a.name === n)!.id, tier: 'common' }));
  const devPool = withTags(GAME_POOL, { 'Red Dot': 'dev' });
  const strayPool = withAssets(GAME_POOL, [strayDevPart(GAME_POOL)]);

  it('rolls the bots\' kits on hard only (the premise of the rest)', () => {
    expect(BOT_LOADOUTS).toEqual({ easy: 'factory', normal: 'factory', hard: 'random' });
  });

  it('says no for the real pool, on every difficulty, with Dev content off or on', () => {
    for (const devContent of [false, true]) for (const d of DIFFICULTIES) expect(botsMayCarryDev(GAME_POOL, devContent, d.id)).toBe(false);
  });

  it('says yes only with Dev content on, on a difficulty that rolls kits, and dev gear a kit could hold', () => {
    expect(botsMayCarryDev(devPool, true, 'hard')).toBe(true);
    expect(botsMayCarryDev(devPool, false, 'hard')).toBe(false);
    expect(botsMayCarryDev(devPool, true, 'easy')).toBe(false);
    expect(botsMayCarryDev(devPool, true, 'normal')).toBe(false);
    expect(botsMayCarryDev(withTags(GAME_POOL, { 'Gas Pistol': 'dev' }), true, 'hard')).toBe(true);
  });

  it('says no when the only dev asset fits no LOADOUT replica', () => {
    expect(botsMayCarryDev(strayPool, true, 'hard')).toBe(false);
  });

  it('uses no dev content when nothing is dev, whatever the kit, difficulty or switch', () => {
    const kit = kitOf('AEG Rifle', 'Gas Pistol', 'Red Dot');
    for (const devContent of [false, true]) for (const d of DIFFICULTIES) expect(matchUsesDev(picks({ difficulty: d.id }), kit, GAME_POOL, devContent)).toBe(false);
    expect(matchUsesDev(picks(), [null, null], GAME_POOL, true)).toBe(false);
  });

  it('uses dev content when a pick is dev (a real entry tagged for the test)', () => {
    tagDev(MATCH_MODES, 'attackDefend');
    expect(matchUsesDev(picks({ mode: 'attackDefend' }), [], GAME_POOL, false)).toBe(true);
    expect(matchUsesDev(picks({ mode: 'attackDefend' }), [], GAME_POOL, true)).toBe(true);
    expect(matchUsesDev(picks(), [], GAME_POOL, true)).toBe(false);
  });

  it('uses dev content when an item in the kit is dev, null slots skipped', () => {
    const kit = kitOf('AEG Rifle', 'Red Dot');
    expect(matchUsesDev(picks(), [null, ...kit], devPool, false)).toBe(true);
    expect(matchUsesDev(picks(), [null, ...kit], devPool, true)).toBe(true);
    expect(matchUsesDev(picks(), kitOf('AEG Rifle'), devPool, false)).toBe(false);
  });

  it("uses dev content when the opponents may roll dev gear, on hard with Dev content on only", () => {
    expect(matchUsesDev(picks({ difficulty: 'hard' }), [], devPool, true)).toBe(true);
    expect(matchUsesDev(picks({ difficulty: 'hard' }), [], devPool, false)).toBe(false);
    expect(matchUsesDev(picks({ difficulty: 'normal' }), [], devPool, true)).toBe(false);
    expect(matchUsesDev(picks({ difficulty: 'hard' }), [], strayPool, true)).toBe(false);
  });
});
