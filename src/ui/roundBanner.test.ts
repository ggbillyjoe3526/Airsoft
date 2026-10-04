import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../config/hits';
import { createRoundState, type RoundState } from '../sim/round';
import { vec3 } from '../sim/vec';
import { roundBanner, spokenRoundMessage } from './roundBanner';

const POLE = vec3(10, 0, 0);

function round(mode: 'elimination' | 'attackDefend', patch: Partial<RoundState>): RoundState {
  return Object.assign(createRoundState(ROUNDS, mode, POLE), patch);
}

describe('the round banner', () => {
  it('words elimination results from your side', () => {
    expect(roundBanner(round('elimination', { phase: 'over', winner: 0, reason: 'eliminated' }), 0, false, 3, ROUNDS)).toBe('Your team wins the round · next round in 3');
    expect(roundBanner(round('elimination', { phase: 'over', winner: 1, reason: 'eliminated' }), 0, false, 2, ROUNDS)).toBe('Your team loses the round (Orange wins) · next round in 2');
    expect(roundBanner(round('elimination', { phase: 'over', winner: -1, reason: 'time' }), 0, false, 1, ROUNDS)).toBe("Time's up · draw · next round in 1");
    expect(roundBanner(round('elimination', { number: 3 }), 0, true, 0, ROUNDS)).toBe('Round 3');
  });

  it('says how a flag round was won, and tells you your job at the start', () => {
    expect(roundBanner(round('attackDefend', { phase: 'over', winner: 0, reason: 'captured' }), 0, false, 4, ROUNDS)).toBe('Flag raised · your team wins the round · next round in 4');
    expect(roundBanner(round('attackDefend', { phase: 'over', winner: 1, reason: 'captured' }), 0, false, 4, ROUNDS)).toBe('Orange raised their flag · your team loses the round · next round in 4');
    expect(roundBanner(round('attackDefend', { phase: 'over', winner: 1, reason: 'time' }), 0, false, 4, ROUNDS)).toBe("Time's up · Orange held the pole · next round in 4");
    expect(roundBanner(round('attackDefend', { attackers: 0 }), 0, true, 0, ROUNDS)).toBe('Round 1 · Attack');
    expect(roundBanner(round('attackDefend', { attackers: 1, number: 6 }), 0, true, 0, ROUNDS)).toBe('Round 6 · Defend');
    expect(roundBanner(round('attackDefend', { attackers: 0 }), 0, false, 0, ROUNDS)).toBe('');
  });

  it('announces half-time after the last round before the teams swap, in both modes', () => {
    const text = roundBanner(round('attackDefend', { phase: 'over', number: ROUNDS.halfTimeAfter, winner: 0, reason: 'eliminated' }), 0, false, 4, ROUNDS);
    expect(text).toBe('Your team wins the round · half-time, sides swap · next round in 4');
    expect(roundBanner(round('elimination', { phase: 'over', number: ROUNDS.halfTimeAfter, winner: 0 }), 0, false, 4, ROUNDS)).toBe(
      'Your team wins the round · half-time, ends swap · next round in 4',
    );
    expect(roundBanner(round('elimination', { phase: 'over', number: ROUNDS.halfTimeAfter + 1, winner: 0 }), 0, false, 4, ROUNDS)).not.toContain('half-time');
  });
});

describe('the round message for a screen reader (audit UI-15)', () => {
  it('drops the countdown, so the result is read once', () => {
    expect(spokenRoundMessage('Your team wins the round · next round in 4')).toBe('Your team wins the round');
    expect(spokenRoundMessage('Round 2 · Attack')).toBe('Round 2 · Attack');
    expect(spokenRoundMessage('')).toBe('');
  });
});
