import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../config/hits';
import { createRoundState, type RoundState } from '../sim/round';
import { vec3 } from '../sim/vec';
import { roundBanner } from './roundBanner';

const FLAG = ROUNDS.flag;
const SPOTS = [vec3(-10, 0, 0), vec3(10, 0, 0)];

function round(mode: 'elimination' | 'attackDefend', patch: Partial<RoundState>): RoundState {
  return Object.assign(createRoundState(ROUNDS, mode, SPOTS), patch);
}

describe('the round banner', () => {
  it('words elimination results from your side', () => {
    expect(roundBanner(round('elimination', { phase: 'over', winner: 0, reason: 'eliminated' }), 0, false, 3, FLAG)).toBe('Your team wins the round · next round in 3');
    expect(roundBanner(round('elimination', { phase: 'over', winner: 1, reason: 'eliminated' }), 0, false, 2, FLAG)).toBe('Your team loses the round (Orange wins) · next round in 2');
    expect(roundBanner(round('elimination', { phase: 'over', winner: -1, reason: 'time' }), 0, false, 1, FLAG)).toBe("Time's up · draw · next round in 1");
    expect(roundBanner(round('elimination', { number: 3 }), 0, true, 0, FLAG)).toBe('Round 3');
  });

  it('says how a flag round was won, and tells you your job at the start', () => {
    expect(roundBanner(round('attackDefend', { phase: 'over', winner: 0, reason: 'captured' }), 0, false, 4, FLAG)).toBe('Flag raised · your team wins the round · next round in 4');
    expect(roundBanner(round('attackDefend', { phase: 'over', winner: 1, reason: 'captured' }), 0, false, 4, FLAG)).toBe('Orange raised their flag · your team loses the round · next round in 4');
    expect(roundBanner(round('attackDefend', { phase: 'over', winner: 1, reason: 'time' }), 0, false, 4, FLAG)).toBe("Time's up · Orange held the pole · next round in 4");
    expect(roundBanner(round('attackDefend', { attackers: 0 }), 0, true, 0, FLAG)).toBe('Round 1 · Attack: raise your flag on their pole');
    expect(roundBanner(round('attackDefend', { attackers: 1, number: 6 }), 0, true, 0, FLAG)).toBe('Round 6 · Defend your pole');
    expect(roundBanner(round('attackDefend', { attackers: 0 }), 0, false, 0, FLAG)).toBe('');
  });

  it('announces half-time after the last round before the sides swap', () => {
    const text = roundBanner(round('attackDefend', { phase: 'over', number: FLAG.halfTimeAfter, winner: 0, reason: 'eliminated' }), 0, false, 4, FLAG);
    expect(text).toBe('Your team wins the round · half-time, sides swap · next round in 4');
    expect(roundBanner(round('elimination', { phase: 'over', number: FLAG.halfTimeAfter, winner: 0 }), 0, false, 4, FLAG)).not.toContain('half-time');
  });
});
