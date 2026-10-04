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
