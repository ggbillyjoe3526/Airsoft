import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUNDS } from '../config/hits';
import { TEAMS, teamCss } from '../config/teams';
import { DEPOT } from '../map/depot';
import { MemoryStorage } from '../pool/testStorage';
import { SETTINGS_KEY } from '../settings/storage';
import { attackersInRound, createRoundState, type RoundState } from '../sim/round';
import { loadTeamPick } from './menus/savedChoices';
import { pauseText, resultText } from './matchStopText';
import { roundBanner } from './roundBanner';
import { Scoreboard } from './scoreboard';
import { FakeElement } from './testSupport';

/**
 * M98 QA: the player's team is read, never assumed to be team 0. Old saves, the score bar's YOU tag, and the words of
 * the banner, the result and the pause line from Beta's side in every mode and at half-time.
 */

describe('a save from before the pick (M98 criterion 2)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('loads as Alpha with nothing saved, with a save that has other settings but no playerTeam, and with a null one', () => {
    expect(loadTeamPick()).toBe('alpha');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, difficulty: 'hard', mode: 'attackDefend' }));
    expect(loadTeamPick()).toBe('alpha');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, playerTeam: null }));
    expect(loadTeamPick()).toBe('alpha');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, playerTeam: 1 }));
    expect(loadTeamPick(), 'a number is not a team id').toBe('alpha');
  });

  it('reads a saved beta back, whatever else is saved beside it', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, difficulty: 'hard', playerTeam: 'beta' }));
    expect(loadTeamPick()).toBe('beta');
  });
});

/** A page element that finds any part by selector (one fake each) and keeps the markup it was given. */
class BoardElement extends FakeElement {
  private readonly found = new Map<string, BoardElement>();
  querySelector(selector: string): BoardElement {
    let el = this.found.get(selector);
    if (!el) this.found.set(selector, (el = new BoardElement('div')));
    return el;
  }
  querySelectorAll(): BoardElement[] {
    return [];
  }
}

describe('the score bar marks your side (M98 criterion 1)', () => {
  beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new BoardElement(tag) }));
  afterEach(() => vi.unstubAllGlobals());

  const board = (playerTeam: number): string => {
    const parent = new BoardElement('div');
    new Scoreboard(parent as unknown as HTMLElement, [3, 3], playerTeam);
    return (parent.children[0] as FakeElement).innerHTML;
  };
  const side = (html: string, team: number): string => html.split(`sb-team sb-team-${team}`)[1]!.split('</div>')[0]!;

  it('puts the YOU tag on the team you are on, names the teams Alpha and Beta, each in its own colour', () => {
    for (const team of [0, 1]) {
      const html = board(team);
      expect(side(html, team), `team ${team}`).toContain('<em>you</em>');
      expect(side(html, 1 - team), `team ${team}`).not.toContain('<em>you</em>');
      expect(html.match(/<em>you<\/em>/g)).toHaveLength(1);
      for (const t of [0, 1]) {
        expect(side(html, t)).toContain(`>${TEAMS[t]!.name}`);
        expect(side(html, t)).toContain(`--team:${teamCss(t)}`);
      }
    }
    expect(board(1)).not.toMatch(/Blue|Orange/);
  });
});

describe('the words of a match from Beta\'s side (M98 criterion 3)', () => {
  const play = (mode: RoundState['mode'], over: Partial<RoundState>): RoundState => ({ ...createRoundState(ROUNDS, mode, DEPOT.flag), ...over });

  it('Attack / Defend: Alpha attacks round 1, so Beta defends it, and the jobs swap after half-time', () => {
    const half = ROUNDS.halfTimeAfter;
    for (const team of [0, 1]) {
      for (const number of [1, half, half + 1, half + 2]) {
        const r = play('attackDefend', { number, phase: 'live', attackers: attackersInRound(number, ROUNDS) });
        expect(roundBanner(r, team, true, 0, ROUNDS), `team ${team} round ${number}`).toBe(`Round ${number} · ${r.attackers === team ? 'Attack' : 'Defend'}`);
      }
    }
    expect(roundBanner(play('attackDefend', { number: 1, attackers: 0, phase: 'live' }), 1, true, 0, ROUNDS)).toBe('Round 1 · Defend');
    expect(roundBanner(play('attackDefend', { number: half + 1, attackers: attackersInRound(half + 1, ROUNDS), phase: 'live' }), 1, true, 0, ROUNDS)).toBe(`Round ${half + 1} · Attack`);
  });

  it('round and match results are won by whoever is yours, in either seat', () => {
    for (const mode of ['elimination', 'attackDefend'] as const) {
      for (const team of [0, 1]) {
        const won = play(mode, { phase: 'over', winner: team, reason: 'eliminated', number: 2 });
        expect(roundBanner(won, team, false, 3, ROUNDS)).toMatch(/^Your team wins the round/);
        const lost = play(mode, { phase: 'over', winner: 1 - team, reason: 'eliminated', number: 2 });
        expect(roundBanner(lost, team, false, 3, ROUNDS)).toMatch(new RegExp(`^Your team loses the round \\(${TEAMS[1 - team]!.name} wins\\)`));
        const half = play(mode, { phase: 'over', winner: team, reason: 'eliminated', number: ROUNDS.halfTimeAfter });
        expect(roundBanner(half, team, false, 3, ROUNDS)).toMatch(/half-time, (sides|ends) swap/);
        expect(roundBanner(play(mode, { phase: 'matchOver', matchWinner: team }), team, false, 0, ROUNDS)).toBe('You win the match!');
        expect(roundBanner(play(mode, { phase: 'matchOver', matchWinner: 1 - team }), team, false, 0, ROUNDS)).toBe('You lose the match');
      }
    }
  });

  it('the result line puts your team first with (you), and the pause line scores from your side', () => {
    const r = play('elimination', { phase: 'matchOver', matchWinner: 1, score: [2, 5] });
    const mine = resultText(r, 1);
    expect(mine.headline).toBe('You win!');
    expect(mine.scoreLine).toMatch(/^Beta \(you\) 5 – 2 Alpha/);
    const theirs = resultText(r, 0);
    expect(theirs.headline).toBe('You lose');
    expect(theirs.scoreLine).toMatch(/^Alpha \(you\) 2 – 5 Beta/);
    const live = play('attackDefend', { number: 1, phase: 'live', attackers: 0, score: [1, 3] });
    expect(pauseText(live, 1, ROUNDS)).toContain('you defend');
    expect(pauseText(live, 1, ROUNDS)).toContain('Beta (you) 3 – 1 Alpha');
    expect(pauseText(live, 0, ROUNDS)).toContain('you attack');
    // Between rounds it names next round's job, which swaps at half-time.
    const between = play('attackDefend', { number: ROUNDS.halfTimeAfter, phase: 'over', attackers: 0 });
    expect(pauseText(between, 1, ROUNDS)).toContain('you attack next');
    expect(pauseText(between, 0, ROUNDS)).toContain('you defend next');
  });
});
