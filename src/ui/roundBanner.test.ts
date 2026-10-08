import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../config/hits';
import { createRoundState, type RoundState } from '../sim/round';
import { vec3 } from '../sim/vec';
import { isRoundStart, respawnBanner, roundBanner, spokenRoundMessage } from './roundBanner';

const POLE = vec3(10, 0, 0);

function round(mode: 'elimination' | 'attackDefend' | 'extraction', patch: Partial<RoundState>): RoundState {
  return Object.assign(createRoundState(ROUNDS, mode, POLE), patch);
}

describe('the round banner', () => {
  it('words elimination results from your side', () => {
    expect(roundBanner(round('elimination', { phase: 'over', winner: 0, reason: 'eliminated' }), 0, false, 3, ROUNDS)).toBe('Your team wins the round · next round in 3');
    expect(roundBanner(round('elimination', { phase: 'over', winner: 1, reason: 'eliminated' }), 0, false, 2, ROUNDS)).toBe('Your team loses the round (Orange wins) · next round in 2');
    expect(roundBanner(round('elimination', { phase: 'over', winner: -1, reason: 'time', number: 2 }), 0, false, 1, ROUNDS)).toBe("Time's up · draw · round 2 again in 1");
    expect(roundBanner(round('elimination', { number: 3 }), 0, true, 0, ROUNDS)).toBe('Round 3');
  });

  it('says a time-out went to the team with more players left (Tournament; BP2)', () => {
    expect(roundBanner(round('elimination', { phase: 'over', winner: 0, reason: 'time' }), 0, false, 3, ROUNDS)).toBe("Time's up · your team had more players left · next round in 3");
    expect(roundBanner(round('elimination', { phase: 'over', winner: 1, reason: 'time' }), 0, false, 2, ROUNDS)).toBe("Time's up · Orange had more players left · next round in 2");
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
    // A draw in the last round before half-time is played again: no swap yet (audit SIM-19).
    expect(roundBanner(round('elimination', { phase: 'over', number: ROUNDS.halfTimeAfter, winner: -1, reason: 'time' }), 0, false, 4, ROUNDS)).toBe(
      `Time's up · draw · round ${ROUNDS.halfTimeAfter} again in 4`,
    );
  });
});

describe('the round message for a screen reader (audit UI-15)', () => {
  it('drops the countdown, so the result is read once', () => {
    expect(spokenRoundMessage('Your team wins the round · next round in 4')).toBe('Your team wins the round');
    expect(spokenRoundMessage('Round 2 · Attack')).toBe('Round 2 · Attack');
    expect(spokenRoundMessage('')).toBe('');
  });
});

describe('the run banner (M43 acceptance 5)', () => {
  it('tells you the job at the start and goes quiet while the run is on', () => {
    expect(roundBanner(round('extraction', {}), 0, true, 0, ROUNDS)).toBe('Extraction · get to an exit');
    expect(roundBanner(round('extraction', {}), 0, false, 0, ROUNDS)).toBe('');
  });

  it('words how the run ended, whatever the countdown to a next round says (there is none)', () => {
    const over = (reason: RoundState['reason'], winner: number): RoundState => round('extraction', { phase: 'matchOver', matchWinner: winner, winner, reason });
    expect(roundBanner(over('extracted', 0), 0, false, 5, ROUNDS)).toBe('Counted out · you made it!');
    expect(roundBanner(over('time', 1), 0, false, 5, ROUNDS)).toBe("Caught out · time's up");
    expect(roundBanner(over('out', 1), 0, false, 5, ROUNDS)).toBe('Out of the run');
    expect(roundBanner(over('out', 1), 0, true, 5, ROUNDS)).toBe('Out of the run');
  });

  it('has no Elimination or flag wording in it', () => {
    const banners = [roundBanner(round('extraction', {}), 0, true, 0, ROUNDS), roundBanner(round('extraction', { phase: 'matchOver', reason: 'out' }), 0, false, 0, ROUNDS)];
    for (const b of banners) expect(b).not.toMatch(/round|match|win|lose/i);
  });

  it('keeps the other modes\' banners as they were', () => {
    expect(roundBanner(round('elimination', { phase: 'matchOver', matchWinner: 0 }), 0, false, 0, ROUNDS)).toBe('You win the match!');
    expect(roundBanner(round('attackDefend', { phase: 'matchOver', matchWinner: 1 }), 0, false, 0, ROUNDS)).toBe('You lose the match');
  });

  it('says how many respawns you have left when you are back at the insertion', () => {
    expect(respawnBanner(0)).toBe('Back in at the insertion · no respawn left');
    expect(respawnBanner(1)).toBe('Back in at the insertion · 1 respawn left');
    expect(respawnBanner(2)).toBe('Back in at the insertion · 2 respawns left');
  });
});

// G4 (owner, 2026-10-08): "Round 1" becomes the banner's headline, "ROUND 1". The words stay as written.
describe('the round banner\'s headline (G4)', () => {
  it('is what each mode says as a round starts, written as before (the capitals are the stylesheet\'s)', () => {
    const starts = [
      roundBanner(round('elimination', { number: 1 }), 0, true, 0, ROUNDS),
      roundBanner(round('elimination', { number: 11 }), 1, true, 0, ROUNDS),
      roundBanner(round('attackDefend', { attackers: 0 }), 0, true, 0, ROUNDS),
      roundBanner(round('attackDefend', { attackers: 1, number: 6 }), 0, true, 0, ROUNDS),
    ];
    expect(starts).toEqual(['Round 1', 'Round 11', 'Round 1 · Attack', 'Round 6 · Defend']);
    for (const text of starts) expect(isRoundStart(text), text).toBe(true);
  });

  it('is nothing else the banner says: results, countdowns, the match, the run, a respawn, nothing', () => {
    const others = [
      roundBanner(round('elimination', { phase: 'over', winner: 0, reason: 'eliminated' }), 0, false, 3, ROUNDS),
      roundBanner(round('elimination', { phase: 'over', winner: -1, reason: 'time', number: 2 }), 0, false, 1, ROUNDS),
      roundBanner(round('elimination', { phase: 'matchOver', matchWinner: 0 }), 0, false, 0, ROUNDS),
      roundBanner(round('extraction', {}), 0, true, 0, ROUNDS),
      respawnBanner(1),
      'ROUND 1',
      '',
    ];
    for (const text of others) expect(isRoundStart(text), text).toBe(false);
  });
});
