import { describe, expect, it } from 'vitest';
import { ADAPTIVE, ADAPTIVE_BLENDED, ADAPTIVE_FROM_LEVEL } from '../config/adaptiveDifficulty';
import { BOT_SKILL, type BotSkill, DIFFICULTIES } from '../config/bots';
import { clampRating, driftAfter, levelAt, levelRating, matchScore, ratingAfter, ratingWords, roundScore, skillAt, topRating } from './adaptiveSkill';

describe('adaptive difficulty: the skill at a rating (AD1)', () => {
  it('sorts every BotSkill field into exactly one list: blended, or from the level played as', () => {
    const fields = new Set(Object.values(BOT_SKILL).flatMap((s) => Object.keys(s)));
    const blended = new Set<string>(ADAPTIVE_BLENDED);
    const fromLevel = new Set<string>(ADAPTIVE_FROM_LEVEL);
    for (const f of fields) expect(blended.has(f) !== fromLevel.has(f), f).toBe(true);
    for (const f of [...blended, ...fromLevel]) expect(fields.has(f), f).toBe(true);
    // A blended field is a number or a pair at every level; a whole number never blends.
    for (const f of ADAPTIVE_BLENDED) for (const s of Object.values(BOT_SKILL)) expect(typeof s[f] === 'number' || Array.isArray(s[f]), f).toBe(true);
  });

  it('puts the levels on a scale, Easy 0 to Pro 3, and offers Pro only with Dev content on', () => {
    expect(DIFFICULTIES.map((d) => levelRating(d.id))).toEqual([0, 1, 2, 3]);
    expect(topRating(false)).toBe(2);
    expect(topRating(true)).toBe(3);
    expect(clampRating(-0.4, 2)).toBe(0);
    expect(clampRating(2.7, 2)).toBe(2);
    expect(clampRating(Number.NaN, 2)).toBe(0);
  });

  it('plays as the nearest level, a half going up', () => {
    expect([0, 0.49, 0.5, 1.2, 1.5, 2.49, 2.5, 3].map(levelAt)).toEqual(['easy', 'easy', 'normal', 'normal', 'hard', 'hard', 'pro', 'pro']);
  });

  it("is exactly each fixed level's own skill at that level: the fixed levels never change", () => {
    for (const d of DIFFICULTIES) expect(skillAt(levelRating(d.id), d.id)).toEqual(BOT_SKILL[d.id]);
  });

  it("blends the numbers between two levels and takes everything else from the level it plays as", () => {
    const s = skillAt(1.5, 'hard');
    const n = BOT_SKILL.normal;
    const h = BOT_SKILL.hard;
    expect(s.turnRate).toBeCloseTo((n.turnRate + h.turnRate) / 2, 9);
    expect(s.aimErrorSettledDeg).toBeCloseTo((n.aimErrorSettledDeg + h.aimErrorSettledDeg) / 2, 9);
    expect(s.reactionTime[0]).toBeCloseTo((n.reactionTime[0] + h.reactionTime[0]) / 2, 9);
    expect(s.reactionTime[1]).toBeCloseTo((n.reactionTime[1] + h.reactionTime[1]) / 2, 9);
    for (const f of ADAPTIVE_FROM_LEVEL) expect(s[f], f).toEqual(h[f]);
    // A quarter of the way from Hard to Pro, playing as Hard: Pro's switches stay off.
    const q = skillAt(2.25, 'hard');
    expect(q.holdsAngles).toBe(false);
    expect(q.teamPlay).toBe(false);
    expect(q.leadFactor).toBeCloseTo(BOT_SKILL.hard.leadFactor + (BOT_SKILL.pro.leadFactor - BOT_SKILL.hard.leadFactor) / 4, 9);
    // Easy's own field (a torch left on while advancing) comes only with Easy.
    expect(skillAt(0.4, 'easy').torchOnTheMove).toBe(true);
    expect(skillAt(0.6, 'normal').torchOnTheMove).toBeUndefined();
  });

  it('gets sharper step by step from Easy to Pro: quicker, steadier, better at leading', () => {
    const keys = ['aimErrorStartDeg', 'aimErrorSettledDeg', 'aimSettleTime', 'aimErrorStartMetres', 'aimErrorMovingDeg', 'aimErrorTracking'] as const;
    let last: BotSkill | null = null;
    for (let r = 0; r <= 3; r += 0.25) {
      const s = skillAt(r, levelAt(r));
      if (last) {
        for (const k of keys) expect(s[k], `${k} at ${r}`).toBeLessThanOrEqual(last[k]);
        expect(s.reactionTime[0], `reaction at ${r}`).toBeLessThanOrEqual(last.reactionTime[0]);
        expect(s.turnRate, `turn rate at ${r}`).toBeGreaterThanOrEqual(last.turnRate);
        expect(s.leadFactor, `lead at ${r}`).toBeGreaterThanOrEqual(last.leadFactor);
      }
      last = s;
    }
  });
});

describe('adaptive difficulty: how results move it (AD1)', () => {
  it('weighs each score to stay within -1 and 1', () => {
    expect(ADAPTIVE.roundWeights.result + ADAPTIVE.roundWeights.personal).toBeCloseTo(1, 9);
    expect(ADAPTIVE.matchWeights.result + ADAPTIVE.matchWeights.rounds).toBeCloseTo(1, 9);
  });

  it('scores a round by its result and your own part: hits on the other team, less being hit', () => {
    expect(roundScore(1, 2, false)).toBeCloseTo(1, 9);
    expect(roundScore(-1, 0, true)).toBeCloseTo(-1, 9);
    expect(roundScore(0, 0, false)).toBe(0);
    // A traded hit counts for nothing either way; a round won while you were out still counts for the win.
    expect(roundScore(1, 1, true)).toBeCloseTo(ADAPTIVE.roundWeights.result, 9);
    expect(roundScore(1, 0, true)).toBeCloseTo(ADAPTIVE.roundWeights.result - ADAPTIVE.roundWeights.personal, 9);
    // Lost, but you took two with you.
    expect(roundScore(-1, 3, true)).toBeCloseTo(-ADAPTIVE.roundWeights.result + ADAPTIVE.roundWeights.personal, 9);
  });

  it('drifts a little after each round, easing off faster than it climbs, never past its limit', () => {
    const { up, down, maxDrift } = ADAPTIVE.round;
    expect(driftAfter(0, 1)).toBeCloseTo(up, 9);
    expect(driftAfter(0, -1)).toBeCloseTo(-down, 9);
    expect(down).toBeGreaterThan(up);
    let d = 0;
    for (let i = 0; i < 20; i++) d = driftAfter(d, 1);
    expect(d).toBe(maxDrift);
    for (let i = 0; i < 40; i++) d = driftAfter(d, -1);
    expect(d).toBe(-maxDrift);
    // A drift is gentle: well under half a level either way.
    expect(maxDrift).toBeLessThan(0.5);
  });

  it('scores a match by its result and its rounds, and moves the next start by it', () => {
    expect(matchScore(true, [1, 1, 1])).toBeCloseTo(1, 9);
    expect(matchScore(false, [-1, -1])).toBeCloseTo(-1, 9);
    expect(matchScore(true, [])).toBeCloseTo(ADAPTIVE.matchWeights.result, 9);
    // A clear win a step up, a clear loss a slightly bigger step down.
    expect(ratingAfter(1, 1, 2)).toBeCloseTo(1 + ADAPTIVE.match.up, 9);
    expect(ratingAfter(1, -1, 2)).toBeCloseTo(1 - ADAPTIVE.match.down, 9);
    // A narrow win moves it less than a clear one.
    expect(ratingAfter(1, matchScore(true, [1, -1, 1, -1, 0.2]), 2)).toBeLessThan(ratingAfter(1, 1, 2));
    // Never off the scale: no easier than Easy, no harder than the top level offered.
    expect(ratingAfter(0.1, -1, 2)).toBe(0);
    expect(ratingAfter(1.95, 1, 2)).toBe(2);
    expect(ratingAfter(2.9, 1, 3)).toBe(3);
  });

  it('settles where you win a little over half your matches', () => {
    // Even steps: winning p of the time, the mean move p·up − (1 − p)·down is zero at p = down / (up + down).
    const p = ADAPTIVE.match.down / (ADAPTIVE.match.up + ADAPTIVE.match.down);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.6);
  });

  it('says a rating in words', () => {
    expect(ratingWords(1)).toBe('Normal');
    expect(ratingWords(1.1)).toBe('Normal');
    expect(ratingWords(1.2)).toBe('Normal, a little sharper');
    expect(ratingWords(1.5)).toBe('between Normal and Hard');
    expect(ratingWords(1.7)).toBe('Hard, a little gentler');
    expect(ratingWords(1.9)).toBe('Hard');
    expect(ratingWords(0)).toBe('Easy');
    expect(ratingWords(2.3)).toBe('Hard, a little sharper');
    expect(ratingWords(3)).toBe('Pro');
  });
});
