import { describe, expect, it } from 'vitest';
import { ADAPTIVE } from '../config/adaptiveDifficulty';
import { BOT_SKILL } from '../config/bots';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { AdaptiveRun } from './adaptiveRun';
import { matchScore, ratingAfter, roundScore } from './adaptiveSkill';

/** You are 0 on Alpha (team 0) with teammate 1; the other team is 2 and 3 on Beta. */
const TEAMS: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 1 };
const teamOf = (id: number): number | undefined => TEAMS[id];
const YOU = { id: 0, team: 0 };

const hit = (shooterId: number, victimId: number): GameEvent => ({ type: 'characterHit', shooterId, victimId, position: vec3(), direction: vec3(0, 0, -1), ricochet: false });
const roundOver = (winner: number): GameEvent => ({ type: 'roundOver', winner, reason: 'eliminated' });

describe('one adaptive match (AD1)', () => {
  it('starts at its rating, playing as its level', () => {
    const run = new AdaptiveRun(1, 2, 'normal', YOU);
    expect(run.rating).toBe(1);
    expect(run.skill()).toEqual(BOT_SKILL.normal);
  });

  it('counts your hits on the other team and being hit by them, not friendly hits, and scores each round', () => {
    const run = new AdaptiveRun(1, 2, 'normal', YOU);
    // Your hit on a teammate and a teammate's on you count for nothing; one hit on Beta, and Beta hit you.
    expect(run.observe([hit(0, 1), hit(1, 0), hit(0, 2), hit(3, 0)], teamOf)).toBe(false);
    expect(run.observe([hit(2, 1), roundOver(0)], teamOf)).toBe(true);
    expect(run.roundScores()).toEqual([roundScore(1, 1, true)]);
    // The counts start again each round: a round lost with nothing to show.
    run.observe([hit(2, 0), roundOver(1)], teamOf);
    run.observe([roundOver(-1)], teamOf);
    expect(run.roundScores()).toEqual([roundScore(1, 1, true), roundScore(-1, 0, true), roundScore(0, 0, false)]);
  });

  it('drifts the other team sharper after rounds you win and gentler after ones you lose, within its limit', () => {
    const run = new AdaptiveRun(1, 2, 'normal', YOU);
    run.observe([hit(0, 2), hit(0, 3), roundOver(0)], teamOf);
    expect(run.rating).toBeCloseTo(1 + ADAPTIVE.round.up, 9);
    expect(run.skill().turnRate).toBeGreaterThan(BOT_SKILL.normal.turnRate);
    for (let i = 0; i < 20; i++) run.observe([hit(0, 2), hit(0, 3), roundOver(0)], teamOf);
    expect(run.rating).toBeCloseTo(1 + ADAPTIVE.round.maxDrift, 9);
    for (let i = 0; i < 40; i++) run.observe([hit(2, 0), roundOver(1)], teamOf);
    expect(run.rating).toBeCloseTo(1 - ADAPTIVE.round.maxDrift, 9);
    expect(run.skill().turnRate).toBeLessThan(BOT_SKILL.normal.turnRate);
    // Whatever the drift, it plays as Normal throughout: its switches never change mid-match.
    expect(run.skill().keepsDark).toBe(BOT_SKILL.normal.keepsDark);
  });

  it('eases off at once after a lost round at the top or climbs at once off the bottom', () => {
    const top = new AdaptiveRun(2, 2, 'hard', YOU);
    for (let i = 0; i < 5; i++) top.observe([hit(0, 2), hit(0, 3), roundOver(0)], teamOf);
    expect(top.rating).toBe(2);
    top.observe([hit(2, 0), roundOver(1)], teamOf);
    expect(top.rating).toBeCloseTo(2 - ADAPTIVE.round.down, 9);
    const bottom = new AdaptiveRun(0, 2, 'easy', YOU);
    for (let i = 0; i < 5; i++) bottom.observe([hit(2, 0), roundOver(1)], teamOf);
    expect(bottom.rating).toBe(0);
    bottom.observe([hit(0, 2), hit(0, 3), roundOver(0)], teamOf);
    expect(bottom.rating).toBeCloseTo(ADAPTIVE.round.up, 9);
  });

  it("works out the next match's start from this one's start and the whole match, not from its drift", () => {
    const run = new AdaptiveRun(1.2, 2, 'normal', YOU);
    run.observe([hit(0, 2), hit(0, 3), roundOver(0)], teamOf);
    run.observe([hit(2, 0), roundOver(1)], teamOf);
    run.observe([hit(0, 2), roundOver(0)], teamOf);
    expect(run.next(true)).toBeCloseTo(ratingAfter(1.2, matchScore(true, run.roundScores()), 2), 9);
    expect(run.next(true)).toBeGreaterThan(1.2);
    expect(run.next(false)).toBeLessThan(run.next(true));
  });

  it('plays from Beta too: the round result and hits are by your own team', () => {
    const run = new AdaptiveRun(1, 2, 'normal', { id: 2, team: 1 });
    run.observe([hit(2, 0), roundOver(1)], teamOf);
    expect(run.roundScores()).toEqual([roundScore(1, 1, false)]);
  });
});
