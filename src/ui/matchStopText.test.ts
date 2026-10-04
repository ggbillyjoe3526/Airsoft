import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../config/hits';
import { vec3 } from '../sim/vec';
import { createRoundState, type RoundState } from '../sim/round';
import { pauseText, resultText } from './matchStopText';

/** A match in `mode` with these fields set over round 1's state. */
function round(mode: RoundState['mode'], over: Partial<RoundState>): RoundState {
  return Object.assign(createRoundState(ROUNDS, mode, mode === 'attackDefend' ? vec3(0, 0, 20) : undefined), over);
}

describe('the result screen text (audit CORE-05: composed outside Game.pause)', () => {
  it('names the winner from your side, your team first, with the rounds played and drawn', () => {
    const won = resultText(round('elimination', { phase: 'matchOver', score: [5, 3], draws: 2, matchWinner: 0 }), 0);
    expect(won).toEqual({ headline: 'You win!', scoreLine: 'Blue (you) 5 – 3 Orange · 10 rounds, 2 drawn', result: 'You win! · Blue (you) 5 – 3 Orange' });
    const lost = resultText(round('elimination', { phase: 'matchOver', score: [2, 5], draws: 0, matchWinner: 1 }), 0);
    expect(lost.headline).toBe('You lose');
    expect(lost.scoreLine).toBe('Blue (you) 2 – 5 Orange · 7 rounds');
  });

  it('reads the score from your team when you are on Orange', () => {
    const r = round('elimination', { phase: 'matchOver', score: [5, 3], matchWinner: 0 });
    expect(resultText(r, 1).result).toBe('You lose · Orange (you) 3 – 5 Blue');
  });
});

describe('the pause screen line', () => {
  it('gives the round, the score and the wins needed in Elimination', () => {
    expect(pauseText(round('elimination', { number: 3, score: [1, 1] }), 0, ROUNDS)).toBe('Round 3 · Blue (you) 1 – 1 Orange · first to 5');
    expect(pauseText(round('elimination', { number: 3, phase: 'over', score: [2, 1] }), 0, ROUNDS)).toBe('After round 3 · Blue (you) 2 – 1 Orange · first to 5');
  });

  it('says your role in Attack / Defend, and between rounds the one you will have next, after half-time too', () => {
    const first = ROUNDS.flag.firstAttackers;
    const you = (attack: boolean) => (attack ? 'attack' : 'defend');
    expect(pauseText(round('attackDefend', { number: 2, attackers: first }), 0, ROUNDS)).toContain(`you ${you(first === 0)} ·`);
    // After the last round before half-time the roles swap for the next one.
    const before = round('attackDefend', { number: ROUNDS.halfTimeAfter, phase: 'over', attackers: first });
    expect(pauseText(before, 0, ROUNDS)).toBe(`After round ${ROUNDS.halfTimeAfter} · attack / defend, you ${you(first !== 0)} next · Blue (you) 0 – 0 Orange · first to 5`);
  });
});

describe('Extraction result and pause text (M43 acceptance 5)', () => {
  const RUN_TIME = 480;
  const over = (reason: RoundState['reason'], clock: number): RoundState => round('extraction', { phase: 'matchOver', reason, clock, matchWinner: reason === 'extracted' ? 0 : 1 });

  it('says extracted with how long the run took', () => {
    expect(resultText(over('extracted', 125), 0, RUN_TIME)).toEqual({
      headline: 'Extracted!',
      scoreLine: 'Extraction · Counted out after 5:55',
      result: 'Extracted! · Counted out after 5:55',
    });
  });

  it('says caught out with the run time when the clock ran out', () => {
    expect(resultText(over('time', 0), 0, RUN_TIME)).toEqual({
      headline: 'Caught out',
      scoreLine: 'Extraction · Still in when time ran out (8:00)',
      result: 'Caught out · Still in when time ran out (8:00)',
    });
  });

  it('says out of the run after the hit with no respawn left', () => {
    const r = resultText(over('out', 300), 0, RUN_TIME);
    expect(r.headline).toBe('Out of the run');
    expect(r.scoreLine).toBe('Extraction · Hit with no respawn left after 3:00');
  });

  it('never shows a score or a round count for a run, and reads the same from either team', () => {
    for (const reason of ['extracted', 'time', 'out'] as const) {
      const text = resultText(over(reason, 100), 0, RUN_TIME);
      expect(text.result).not.toMatch(/–|rounds|You win|You lose/);
      expect(resultText(over(reason, 100), 1, RUN_TIME)).toEqual(text);
    }
  });

  it('does not report a negative time if the clock is above the run time', () => {
    expect(resultText(over('extracted', RUN_TIME + 5), 0, RUN_TIME).scoreLine).toBe('Extraction · Counted out after 0:00');
  });

  it('pauses with the time left, rounded up, instead of rounds and score', () => {
    expect(pauseText(round('extraction', { clock: 215.2 }), 0, ROUNDS)).toBe('Extraction · 3:36 left');
    expect(pauseText(round('extraction', { clock: 60 }), 0, ROUNDS)).toBe('Extraction · 1:00 left');
  });

  it('leaves Elimination results alone when the run time is passed or not', () => {
    const r = round('elimination', { phase: 'matchOver', score: [5, 3], matchWinner: 0 });
    expect(resultText(r, 0, 480)).toEqual(resultText(r, 0));
    expect(resultText(r, 0).headline).toBe('You win!');
  });
});
