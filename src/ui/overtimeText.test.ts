import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUNDS } from '../config/hits';
import { OVERTIME } from '../config/modes';
import { createRoundState, type RoundState } from '../sim/round';
import { vec3 } from '../sim/vec';
import { overtimeLine } from './flagStatus';
import { isOvertimeStart, isRoundStart, roundBanner, spokenRoundMessage } from './roundBanner';
import { Scoreboard } from './scoreboard';
import { FakeElement } from './testSupport';

/** What the player reads in Elimination's overtime (OT1, Dev 6 item 45): the banner, the strip's line and the scoreboard. */

const POLE = vec3(10, 0, 0);
const round = (patch: Partial<RoundState> = {}): RoundState => Object.assign(createRoundState(ROUNDS, 'elimination', POLE), patch);
/** A round over after an overtime: the flag still up (it stays up through the pause). */
const over = (patch: Partial<RoundState>): RoundState => {
  const r = round({ phase: 'over', ...patch });
  r.overtimeFlag.up = true;
  return r;
};

describe('the round banner in overtime', () => {
  it('says "Overtime · touch the flag" while the round is live and the flag just went up, and never when it is not asked for', () => {
    const r = round();
    r.overtimeFlag.up = true;
    expect(roundBanner(r, 0, false, 0, ROUNDS, true)).toBe('Overtime · touch the flag');
    expect(roundBanner(r, 0, false, 0, ROUNDS, false)).toBe('');
    // Not over a result, and not in Attack / Defend.
    expect(roundBanner(Object.assign(r, { phase: 'over', winner: 0, reason: 'overtimeFlag' }), 0, false, 3, ROUNDS, true)).not.toContain('Overtime');
    expect(roundBanner(createRoundState(ROUNDS, 'attackDefend', POLE), 0, false, 0, ROUNDS, true)).toBe('');
  });

  it('is a headline like a round start: gone by the same test, read once for a screen reader', () => {
    expect(isRoundStart('Overtime · touch the flag')).toBe(true);
    // A size smaller than a round's headline (BP5), so it keeps to one line at 1280 px.
    expect(isOvertimeStart('Overtime · touch the flag')).toBe(true);
    expect(isOvertimeStart('Round 2')).toBe(false);
    expect(isRoundStart('Flag touched · your team wins the round · next round in 3')).toBe(false);
    expect(spokenRoundMessage('Overtime · touch the flag')).toBe('Overtime · touch the flag');
  });

  it('says who took the flag, from your side, with the countdown', () => {
    expect(roundBanner(over({ winner: 0, reason: 'overtimeFlag' }), 0, false, 3, ROUNDS)).toBe('Flag touched · your team wins the round · next round in 3');
    expect(roundBanner(over({ winner: 1, reason: 'overtimeFlag' }), 0, false, 2, ROUNDS)).toBe('Beta touched the flag · your team loses the round · next round in 2');
    expect(roundBanner(over({ winner: 1, reason: 'overtimeFlag' }), 1, false, 2, ROUNDS)).toBe('Flag touched · your team wins the round · next round in 2');
  });

  it('says nobody touched it: a draw played again, or more players left under that rule', () => {
    expect(roundBanner(over({ winner: -1, reason: 'time', number: 2 }), 0, false, 1, ROUNDS)).toBe('Nobody touched the flag · draw · round 2 again in 1');
    expect(roundBanner(over({ winner: 0, reason: 'time' }), 0, false, 3, ROUNDS)).toBe('Nobody touched the flag · your team had more players left · next round in 3');
    expect(roundBanner(over({ winner: 1, reason: 'time' }), 0, false, 3, ROUNDS)).toBe('Nobody touched the flag · Beta had more players left · next round in 3');
  });

  it('keeps the plain time-out and wipe-out words when the flag never went up, and a wipe-out in overtime is a wipe-out', () => {
    expect(roundBanner(round({ phase: 'over', winner: -1, reason: 'time', number: 2 }), 0, false, 1, ROUNDS)).toBe("Time's up · draw · round 2 again in 1");
    expect(roundBanner(over({ winner: 1, reason: 'eliminated' }), 0, false, 2, ROUNDS)).toBe('Your team loses the round (Beta wins) · next round in 2');
  });

  it('adds half-time after an overtime win, and the match result when the flag wins the match', () => {
    expect(roundBanner(over({ winner: 0, reason: 'overtimeFlag', number: ROUNDS.halfTimeAfter }), 0, false, 4, ROUNDS)).toBe(
      'Flag touched · your team wins the round · half-time, ends swap · next round in 4',
    );
    expect(roundBanner(over({ phase: 'matchOver', winner: 0, reason: 'overtimeFlag', matchWinner: 0 }), 0, false, 0, ROUNDS)).toBe('You win the match!');
  });
});

describe('the strip line in overtime', () => {
  it('says what wins it, that both teams at it hold each other off, and nothing between rounds', () => {
    expect(overtimeLine('idle', true)).toEqual({ text: 'Overtime · first hand on the flag wins', urgent: false });
    expect(overtimeLine('contested', true)).toEqual({ text: 'Both teams at the flag · nobody takes it', urgent: false });
    expect(overtimeLine('idle', false)).toEqual({ text: '', urgent: false });
    expect(overtimeLine('contested', false)).toEqual({ text: '', urgent: false });
  });
});

/** A page element for the scoreboard: one fake for each selector, so the clock, the aim and the strip can be read. */
class BoardElement extends FakeElement {
  private readonly found = new Map<string, BoardElement>();
  override style = { setProperty: () => {}, removeProperty: () => {} } as unknown as Record<string, string>;
  querySelector(selector: string): BoardElement {
    let el = this.found.get(selector);
    if (!el) this.found.set(selector, (el = new BoardElement('div')));
    return el;
  }
  querySelectorAll(): BoardElement[] {
    return [];
  }
}

describe('the scoreboard in overtime', () => {
  let parent: BoardElement;
  let board: Scoreboard;
  let r: RoundState;
  const part = (selector: string): BoardElement => (parent.children[0] as BoardElement).querySelector(selector);

  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new BoardElement(tag) });
    vi.spyOn(performance, 'now').mockImplementation(() => 0);
    parent = new BoardElement('div');
    board = new Scoreboard(parent as unknown as HTMLElement, [2, 2], 0);
    board.setAim('First to 3');
    board.setOvertime(OVERTIME.time);
    r = round();
    r.clock = 0;
    r.overtimeFlag.left = OVERTIME.time;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('counts the overtime down on the clock under "Overtime", red, and goes back to the match aim and the round clock after', () => {
    board.update(r, []);
    expect(part('.sb-clock').textContent).toBe('0:00');
    expect(part('.sb-aim').textContent).toBe('First to 3');
    r.overtimeFlag.up = true;
    r.overtimeFlag.left = 17.2;
    board.update(r, []);
    expect(part('.sb-clock').textContent).toBe('0:18');
    expect(part('.sb-aim').textContent).toBe('Overtime');
    expect(part('.sb-clock').classList.contains('low')).toBe(true);
    r.overtimeFlag.left = 3;
    board.update(r, []);
    expect(part('.sb-clock').textContent).toBe('0:03');
    // The next round: flag down, the round's own clock.
    r.overtimeFlag.up = false;
    r.clock = 90;
    board.update(r, []);
    expect(part('.sb-clock').textContent).toBe('1:30');
    expect(part('.sb-aim').textContent).toBe('First to 3');
    expect(part('.sb-clock').classList.contains('low')).toBe(false);
  });

  it('shows the strip with its line while the flag is up and live, the contested line when both are at it, and hides it when down', () => {
    const strip = part('.sb-flag');
    board.update(r, []);
    expect(strip.hidden).toBe(true);
    r.overtimeFlag.up = true;
    r.overtimeFlag.left = 20;
    board.update(r, []);
    expect(strip.hidden).toBe(false);
    expect(part('.sb-flag-text').textContent).toBe('Overtime · first hand on the flag wins');
    r.overtimeFlag.status = 'contested';
    board.update(r, []);
    expect(part('.sb-flag-text').textContent).toBe('Both teams at the flag · nobody takes it');
    r.overtimeFlag.status = 'idle';
    board.update(r, []);
    expect(part('.sb-flag-text').textContent).toBe('Overtime · first hand on the flag wins');
  });

  it('says nothing in the strip through the pause after the round (the flag stays up, the banner speaks), then hides it for the next round', () => {
    r.overtimeFlag.up = true;
    r.overtimeFlag.left = 20;
    board.update(r, []);
    r.phase = 'over';
    r.winner = 0;
    r.reason = 'overtimeFlag';
    board.update(r, []);
    expect(part('.sb-flag').hidden).toBe(false);
    expect(part('.sb-flag-text').textContent).toBe('');
    expect(part('.sb-aim').textContent).toBe('Overtime');
    r.phase = 'live';
    r.overtimeFlag.up = false;
    r.clock = 60;
    board.update(r, []);
    expect(part('.sb-flag').hidden).toBe(true);
  });
});
