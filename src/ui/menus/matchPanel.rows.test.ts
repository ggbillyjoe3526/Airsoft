import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MATCH_RULES, type RulesetId } from '../../config/matchRules';
import { PLAY_TEXT } from '../../config/menus';
import type { MatchMode } from '../../config/modes';
import { type NewGamePicks, playedPicks } from '../../newGamePicks';
import { MemoryStorage } from '../../pool/testStorage';
import { findAll } from '../testSupport';
import { type MatchModel, MatchPanel } from './matchPanel';
import { EventNode } from './menuTestSupport';

/** MR1 QA: the Match panel's compact rows: rows the ruleset fixes are locked, rows the mode ignores are gone, the help line follows the row. */
beforeEach(() => {
  vi.stubGlobal('document', { createElement: (tag: string) => new EventNode(tag) });
  vi.stubGlobal('localStorage', new MemoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

const model = (picks: NewGamePicks): MatchModel => ({ picks: () => picks, setRuleset: () => {}, setRules: () => {}, setDifficulty: () => {}, setTeammates: () => {}, setTeam: () => {} });

function build(mode: MatchMode, ruleset: RulesetId, rules = { ...DEFAULT_MATCH_RULES }) {
  const picks: NewGamePicks = { map: 'depot', mode, difficulty: 'normal', teammateDifficulty: 'normal', ruleset, rules };
  const p = new MatchPanel(model(picks));
  const played = playedPicks(picks, true);
  p.refresh({ played, devContent: true, run: false, sizeMin: 1, sizeMax: 6 });
  const root = p.root as unknown as EventNode;
  const row = (name: string): EventNode => (findAll(root, 'menu-row') as EventNode[]).find((r) => findAll(r, 'menu-row-label')[0]?.text === name)!;
  const help = findAll(root, 'match-help')[0] as EventNode;
  return { p, picks, played, root, row, help, refresh: () => p.refresh({ played: playedPicks(picks, true), devContent: true, run: false, sizeMin: 1, sizeMax: 6 }) };
}
const lockText = (row: EventNode): string => findAll(row, 'match-fixed')[0]!.text;
const FIXED_ROWS = ['Win by two', 'Time-out', 'Minimap', 'Fire modes', 'Magazines', 'Kit'];
const OWN_ROWS = ['Rounds to win', 'Round time', 'Team size', 'Friendly fire', 'Ricochets count'];

describe('locked rows under a ruleset (MR1)', () => {
  it('shows the rows Skirmish sets as "value · set by Skirmish", marked is-fixed, and leaves the picks free', () => {
    const { row } = build('elimination', 'skirmish');
    for (const name of FIXED_ROWS) {
      const r = row(name);
      expect(r, name).toBeDefined();
      expect(r.hidden, name).toBe(false);
      expect(r.classList.contains('is-fixed'), name).toBe(true);
      const lock = findAll(r, 'match-fixed')[0]!;
      expect(lock.hidden, name).toBe(false);
      expect(lockText(r), name).toBe(PLAY_TEXT.setBy(lockText(r).split(' · ')[0]!, 'Skirmish'));
      expect(lockText(r), name).toMatch(/ · set by Skirmish$/);
    }
    for (const name of OWN_ROWS) {
      expect(row(name).classList.contains('is-fixed'), name).toBe(false);
      expect(findAll(row(name), 'match-fixed')[0]!.hidden, name).toBe(true);
    }
    expect(lockText(row('Minimap'))).toMatch(/^Heard · /);
  });

  it('shows the Tournament values it sets, and no lock at all under Custom', () => {
    const t = build('elimination', 'tournament');
    expect(lockText(t.row('Rounds to win'))).toBe('7 · set by Tournament');
    expect(lockText(t.row('Minimap'))).toMatch(/^Teammates only · set by Tournament$/);
    expect(lockText(t.row('Friendly fire'))).toMatch(/set by Tournament/);
    const c = build('elimination', 'custom');
    for (const name of [...FIXED_ROWS, ...OWN_ROWS]) {
      expect(c.row(name).hidden, name).toBe(false);
      expect(c.row(name).classList.contains('is-fixed'), name).toBe(false);
    }
  });

  it('hides a row the mode never reads even when the ruleset would fix it, and shows the lock again in a mode that reads it', () => {
    const t = build('attackDefend', 'skirmish');
    expect(t.row('Time-out').hidden).toBe(true);
    expect(t.row('Win by two').hidden).toBe(false);
    const e = build('extraction', 'skirmish');
    for (const name of ['Rounds to win', 'Round time', 'Win by two', 'Time-out']) expect(e.row(name).hidden, name).toBe(true);
    expect(e.row('Friendly fire').hidden).toBe(false);
  });

  it('follows a ruleset change on refresh: locks appear and go', () => {
    const b = build('elimination', 'custom');
    expect(b.row('Rounds to win').classList.contains('is-fixed')).toBe(false);
    b.picks.ruleset = 'tournament';
    b.refresh();
    expect(b.row('Rounds to win').classList.contains('is-fixed')).toBe(true);
    b.picks.ruleset = 'custom';
    b.refresh();
    expect(b.row('Rounds to win').classList.contains('is-fixed')).toBe(false);
    expect(findAll(b.row('Rounds to win'), 'match-fixed')[0]!.hidden).toBe(true);
  });
});

describe('the teammates row at team size 1 (MR1)', () => {
  it('is hidden for a team of one and back for a bigger team', () => {
    const solo = build('elimination', 'custom', { ...DEFAULT_MATCH_RULES, teamSize: 1 });
    expect(solo.row('Teammates').hidden).toBe(true);
    expect(solo.row('Opponents').hidden).toBe(false);
    const team = build('elimination', 'custom', { ...DEFAULT_MATCH_RULES, teamSize: 3 });
    expect(team.row('Teammates').hidden).toBe(false);
  });
});

describe('the help line (MR1)', () => {
  const parts = (help: EventNode): [string, string] => [help.children[0]!.textContent, help.children[1]!.textContent];

  it('starts on the ruleset line, follows the hovered row, and goes back when the pointer leaves the grid', () => {
    const b = build('elimination', 'skirmish');
    const [lead0, text0] = parts(b.help);
    expect(lead0).toBe('Skirmish.');
    expect(text0).toContain('The match as you know it');
    const r = b.row('Friendly fire');
    r.fire('mouseenter');
    const [lead, text] = parts(b.help);
    expect(lead).toBe('Friendly fire.');
    expect(text).toContain('Whether your BBs can hit your own team.');
    // The picked option's own line follows the explanation.
    expect(text.length).toBeGreaterThan('Whether your BBs can hit your own team.'.length);
    (findAll(b.root, 'match-grid')[0] as EventNode).fire('mouseleave');
    expect(parts(b.help)).toEqual([lead0, text0]);
  });

  it('follows keyboard focus into a row too', () => {
    const b = build('elimination', 'custom');
    b.row('Round time').fire('focusin');
    expect(parts(b.help)[0]).toBe('Round time.');
  });

  it('says only the explanation for a locked row, not the option line of a pick the ruleset overrides', () => {
    const b = build('elimination', 'skirmish');
    b.row('Magazines').fire('mouseenter');
    expect(parts(b.help)).toEqual(['Magazines.', 'For everyone, bots included.']);
  });

  it('falls back to the ruleset line when the hovered row is hidden by a mode change', () => {
    const b = build('elimination', 'skirmish');
    b.row('Time-out').fire('mouseenter');
    expect(parts(b.help)[0]).toBe('Time-out.');
    b.picks.mode = 'attackDefend';
    b.refresh();
    expect(b.row('Time-out').hidden).toBe(true);
    expect(parts(b.help)[0]).toBe('Skirmish.');
  });
});
