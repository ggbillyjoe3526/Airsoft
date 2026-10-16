import { ADAPTIVE, ADAPTIVE_BLENDED, ADAPTIVE_TEXT } from '../config/adaptiveDifficulty';
import { BOT_SKILL, type BotSkill, DIFFICULTIES, type Difficulty } from '../config/bots';
import { isAvailable } from '../config/content';
import { lerp } from '../core/math';

/**
 * Adaptive difficulty's arithmetic (AD1; tuning in config/adaptiveDifficulty.ts): a skill rating on the difficulty
 * scale (each level's place in DIFFICULTIES, 0 Easy to 3 Pro), the bots' skill at a rating, and how a round and a match
 * move it. Pure: the match keeps its own state (adaptiveRun.ts), the game saves the rating (settings/adaptiveRating.ts).
 */

const LEVELS: readonly Difficulty[] = DIFFICULTIES.map((d) => d.id);

/** A level's place on the rating scale: Easy 0, Normal 1, Hard 2, Pro 3. */
export function levelRating(d: Difficulty): number {
  return LEVELS.indexOf(d);
}

/** The highest rating on offer: the top level that is (Hard; Pro too with Dev content on, as Pro is dev content). */
export function topRating(devContent: boolean): number {
  let top = 0;
  DIFFICULTIES.forEach((d, i) => {
    if (isAvailable(d.tag, devContent)) top = i;
  });
  return top;
}

/** `r` kept on the scale, from Easy to `top`. */
export function clampRating(r: number, top: number): number {
  return Math.min(Math.max(Number.isFinite(r) ? r : 0, 0), top);
}

/** The level a rating plays as (its switches, kits, records label): the nearest one, a half going up. */
export function levelAt(rating: number): Difficulty {
  return LEVELS[Math.min(Math.max(Math.round(rating), 0), LEVELS.length - 1)]!;
}


/** A blended field's value: a number, or a pair blended end by end. */
type Blended = BotSkill[(typeof ADAPTIVE_BLENDED)[number]];

function blend(x: Blended, y: Blended, t: number): Blended {
  if (typeof x === 'number') return lerp(x, y as number, t);
  const p = y as readonly [number, number];
  return [lerp(x[0], p[0], t), lerp(x[1], p[1], t)];
}

/**
 * The bots' skill at `rating`, playing as `playedAs`: each of ADAPTIVE_BLENDED's numbers the blend of the two levels
 * around the rating (at a level, exactly its own), every other field `playedAs`'s own. A fresh object.
 */
export function skillAt(rating: number, playedAs: Difficulty): BotSkill {
  const r = clampRating(rating, LEVELS.length - 1);
  const lower = Math.floor(r);
  const t = r - lower;
  const a = BOT_SKILL[LEVELS[lower]!];
  const b = BOT_SKILL[LEVELS[Math.min(lower + 1, LEVELS.length - 1)]!];
  const out: Record<string, unknown> = { ...BOT_SKILL[playedAs] };
  for (const key of ADAPTIVE_BLENDED) out[key] = blend(a[key], b[key], t);
  return out as unknown as BotSkill;
}

/**
 * How one round scored you, -1 to 1: `result` 1 won, 0 drawn, -1 lost; `hits` your hits on the other team; `wasHit`
 * whether they hit you (ADAPTIVE.roundWeights).
 */
export function roundScore(result: -1 | 0 | 1, hits: number, wasHit: boolean): number {
  const personal = Math.min(Math.max(hits - (wasHit ? 1 : 0), -1), 1);
  return ADAPTIVE.roundWeights.result * result + ADAPTIVE.roundWeights.personal * personal;
}

/** The match's drift after a round that scored `score`: up or down a little, never past ADAPTIVE.round.maxDrift. */
export function driftAfter(drift: number, score: number): number {
  const { up, down, maxDrift } = ADAPTIVE.round;
  const next = drift + score * (score >= 0 ? up : down);
  return Math.min(Math.max(next, -maxDrift), maxDrift);
}

/** How a whole match scored you, -1 to 1: won or lost, and its rounds' mean score (ADAPTIVE.matchWeights). */
export function matchScore(won: boolean, roundScores: readonly number[]): number {
  const mean = roundScores.length > 0 ? roundScores.reduce((s, x) => s + x, 0) / roundScores.length : 0;
  return ADAPTIVE.matchWeights.result * (won ? 1 : -1) + ADAPTIVE.matchWeights.rounds * mean;
}

/** The next match's rating after one that started at `rating` and scored `score` (ADAPTIVE.match), kept up to `top`. */
export function ratingAfter(rating: number, score: number, top: number): number {
  const { up, down } = ADAPTIVE.match;
  return clampRating(rating + score * (score >= 0 ? up : down), top);
}

/** A rating in words: "Normal", "Normal, a little sharper", "between Normal and Hard", "Hard, a little gentler". */
export function ratingWords(rating: number): string {
  const r = clampRating(rating, LEVELS.length - 1);
  const lower = Math.floor(r);
  const past = r - lower;
  const label = (i: number): string => DIFFICULTIES[Math.min(i, LEVELS.length - 1)]!.label;
  const w = ADAPTIVE.words;
  if (past < w.sharper) return label(lower);
  if (past < w.between) return ADAPTIVE_TEXT.sharper(label(lower));
  if (past <= w.gentler) return ADAPTIVE_TEXT.between(label(lower), label(lower + 1));
  if (past < w.level) return ADAPTIVE_TEXT.gentler(label(lower + 1));
  return label(lower + 1);
}
