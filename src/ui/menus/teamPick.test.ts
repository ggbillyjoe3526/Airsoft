import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MATCH_RULES } from '../../config/matchRules';
import { TEAMS, TEAM_PICKS, teamCss, teamOfPick } from '../../config/teams';
import type { NewGamePicks } from '../../newGamePicks';
import { MemoryStorage } from '../../pool/testStorage';
import { SETTINGS_KEY } from '../../settings/storage';
import { FakeElement, findAll } from '../testSupport';
import { type MatchModel, MatchPanel, type MatchShown } from './matchPanel';
import { loadTeamPick } from '../../settings/savedChoices';

/** The Match screen's Your team row (M98), on the fake DOM: Alpha by default, saved as picked, gone for an Extraction run. */

beforeEach(() => {
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeElement(tag) });
  vi.stubGlobal('localStorage', new MemoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

const panel = (team?: NewGamePicks['team']) => {
  const picked: NewGamePicks = { map: 'depot', mode: 'elimination', difficulty: 'normal', teammateDifficulty: 'normal', ...(team ? { team } : {}), ruleset: 'skirmish', rules: { ...DEFAULT_MATCH_RULES } };
  const set: string[] = [];
  const model: MatchModel = {
    picks: () => picked,
    setRuleset: () => {},
    setRules: () => {},
    setDifficulty: () => {},
    setTeammates: () => {},
    setTeam: (t) => {
      picked.team = t;
      set.push(t);
    },
  };
  const p = new MatchPanel(model);
  const root = p.root as unknown as FakeElement;
  const row = findAll(root, 'menu-row').find((r) => findAll(r, 'menu-row-label')[0]?.text === 'Your team')!;
  const buttons = findAll(row, 'picker-button');
  const shown = (run: boolean): MatchShown => ({ played: picked, devContent: false, run, sizeMin: 1, sizeMax: 5 });
  return { p, row, buttons, set, shown, pressed: () => buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent) };
};

describe('Your team on the Match screen (M98)', () => {
  it('offers Alpha and Beta by name, each with its team colour, Alpha picked until another is saved', () => {
    const { row, buttons, pressed } = panel();
    expect(row).toBeDefined();
    expect(buttons.map((b) => b.textContent)).toEqual(['Alpha', 'Beta']);
    expect(TEAM_PICKS.map((t) => t.label)).toEqual(TEAMS.map((t) => t.name));
    // The swatch follows the colour set in force (the HUD's custom property), not a fixed colour.
    expect(buttons.map((b) => b.children[0]!.style.background)).toEqual([teamCss(0), teamCss(1)]);
    expect(pressed()).toEqual(['Alpha']);
    expect(loadTeamPick()).toBe('alpha');
  });

  it('saves the pick and tells the model, and reads it back on the next visit', () => {
    const first = panel();
    first.buttons[1]!.click();
    expect(first.set).toEqual(['beta']);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({ playerTeam: 'beta' });
    expect(loadTeamPick()).toBe('beta');
    expect(teamOfPick(loadTeamPick())).toBe(1);
    // The next visit: the menus are built from the saved pick.
    expect(panel(loadTeamPick()).pressed()).toEqual(['Beta']);
  });

  it('ignores a saved team that is not one', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, playerTeam: 'blue' }));
    expect(loadTeamPick()).toBe('alpha');
  });

  it('is not shown for an Extraction run, whose squad is Alpha, and is for the other modes', () => {
    const { p, row, shown } = panel('beta');
    p.refresh(shown(true));
    expect(row.hidden).toBe(true);
    p.refresh(shown(false));
    expect(row.hidden).toBe(false);
  });
});
