/**
 * Simulation seeds: unsigned 32-bit integers. A game starts from a fresh random seed each page load, or
 * from the one the URL names (`?seed=N`) to replay a session; streams derived from it (the bots' plans,
 * each bot) use exact 32-bit arithmetic, so every bit of the seed counts.
 */

export const MAX_SEED = 0xffffffff;

/**
 * How the separate random streams are derived from the game seed: seed × multiplier + offset, mod 2^32.
 * The numbers are arbitrary primes; they only need to keep the streams apart. Changing them changes every
 * seeded bot decision (and the numbers the bot-only guard tests were measured with).
 */
const PLAN_STREAM = { multiplier: 15485863, offset: 12345 };
const BOT_STREAM = { multiplier: 7919, perCharacter: 104729 };

/** The seed a `?seed=` value names, or undefined unless it is a whole number from 0 to MAX_SEED. */
export function parseSeed(value: string | null): number | undefined {
  if (value === null || !/^\d{1,10}$/.test(value)) return undefined;
  const n = Number(value);
  return n <= MAX_SEED ? n : undefined;
}

/** A fresh random seed (the browser's crypto source: this only picks the seed, it's not simulation randomness). */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

/** `seed × multiplier + add`, wrapped to 32 bits exactly (a plain multiply loses low bits past 2^53). */
export function deriveSeed(seed: number, multiplier: number, add: number): number {
  return (Math.imul(seed, multiplier) + add) >>> 0;
}

/** The seed of the bots' team-plan stream for a game seeded with `seed`. */
export function planSeed(seed: number): number {
  return deriveSeed(seed, PLAN_STREAM.multiplier, PLAN_STREAM.offset);
}

/** The seed of bot `characterId`'s own stream for a game seeded with `seed`. */
export function botSeed(seed: number, characterId: number): number {
  return deriveSeed(seed, BOT_STREAM.multiplier, Math.imul(characterId, BOT_STREAM.perCharacter));
}
