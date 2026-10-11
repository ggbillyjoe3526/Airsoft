import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { botConfig, type Difficulty } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { AEG, bbMass, muzzleVelocity } from '../config/replicas';
import { flightTimeEstimate } from '../sim/ballistics';
import { characterHitVolume, createHitVolume, rayCharacter } from '../sim/hitbox';
import { leanedEye } from '../sim/lean';
import { createRng, rngGaussian } from '../sim/rng';
import { vec3 } from '../sim/vec';
import { lookAngles } from './aim';
import { bodyPoint } from './perception';
import { duel, noWalls } from './testSupport';

/**
 * M84 (the owner's playtest note 16): aiming down sights (iron sights here, no optic) is more accurate than hip fire,
 * and hip fire stays a viable way to play, measured on Normal against bots; Easy, Hard and Pro still scale. You stand
 * and fire single AEG shots at a bot's chest, led by the BB's flight, with a player's own aim error on top (HAND, the
 * same aimed or not: what the sight changes in the sim is the replica's spread), from the hip or down the sights.
 * Measured 2026-10-11 (aimed ×0.5): against a bot holding still, 15 / 25 / 35 m, 75 / 44 / 23% of hip BBs hit and
 * 79 / 51 / 32% aimed; against one that strafes and fires back the strafe, not the spread, decides most misses (49 /
 * 31 / 14% hip, 51 / 25 / 14% aimed, where the aimed shots start a raise later, at a bot already moving).
 */
const SEEDS = 30;
/** Your own aim error per shot (degrees, standard deviation): a steady player's, the same from the hip or aimed. */
const HAND = 0.3;
/** Your reaction to the bot at the start (seconds): you pull the first shot (or raise the sight) after this. */
const REACTION = 0.3;
const DEG = Math.PI / 180;
const eye = vec3();
const chest = vec3();
const dir = vec3();
const look = { yaw: 0, pitch: 0 };

interface Duels {
  /** Share of the duels you win (your hit first). */
  won: number;
  /** Share of your BBs that hit the bot (its body, until it is hit and walks off). */
  hitRate: number;
}

/**
 * `level`'s bot `dist` metres away, you from the hip or aimed. `still`: the bot stands still and doesn't shoot back
 * (only the spread and your hand decide; it is a ghost, so every BB flies through and each is judged on its own).
 */
function duels(level: Difficulty, dist: number, aim: boolean, still = false): Duels {
  let won = 0;
  let shots = 0;
  let hits = 0;
  const volume = createHitVolume();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { state, player, bot, run, commands } = duel(dist, () => {}, noWalls, botConfig(level), seed);
    if (still) {
      bot.ghost = true;
      player.ghost = true;
    }
    const hand = createRng(seed * 7919);
    const cmd = commands.get(0)!;
    cmd.aim = aim;
    let winner = -1;
    const counted = new Set<number>();
    run(still ? 4 : 8, () => {
      for (const e of state.events) {
        if (e.type === 'shot' && e.characterId === player.id) shots++;
        if (e.type === 'characterHit' && winner < 0) winner = e.victimId === bot.id ? 0 : 1;
        if (e.type === 'characterHit' && e.shooterId === player.id && e.victimId === bot.id) hits++;
        // BBs fired before the hit that land on the body as it calls it.
        if (e.type === 'bbImpact' && e.ownerId === player.id && Math.hypot(e.position.x - bot.position.x, e.position.z - bot.position.z) < 0.6) hits++;
      }
      if (still) {
        characterHitVolume(bot, HITS, volume);
        for (const b of state.bbs.bbs) {
          if (!b.active || b.ownerId !== player.id || counted.has(b.serial)) continue;
          const dx = b.position.x - b.prevPosition.x;
          const dy = b.position.y - b.prevPosition.y;
          const dz = b.position.z - b.prevPosition.z;
          const len = Math.hypot(dx, dy, dz);
          if (len === 0) continue;
          dir.x = dx / len;
          dir.y = dy / len;
          dir.z = dz / len;
          if (rayCharacter(b.prevPosition, dir, len, volume) >= 0) {
            counted.add(b.serial);
            hits++;
          }
        }
      }
      leanedEye(player, BODY, HITS, eye);
      bodyPoint(bot, HITS, 0.7, chest);
      const flight = flightTimeEstimate(Math.hypot(chest.x - eye.x, chest.z - eye.z), muzzleVelocity(AEG), bbMass(AEG), BALLISTICS);
      chest.x += bot.velocity.x * flight;
      chest.z += bot.velocity.z * flight;
      lookAngles(eye.x, eye.y, eye.z, chest.x, chest.y, chest.z, look);
      cmd.aim = aim && state.time >= REACTION;
      // Single shots, one every tenth of a second once you react and the sight is up (straight away from the hip).
      const pull = (still || winner < 0) && state.time >= REACTION && (!aim || player.aimRaise >= 1) && Math.round(state.time * 60) % 6 === 0;
      cmd.yaw = look.yaw + (pull ? rngGaussian(hand) * HAND * DEG : 0);
      cmd.pitch = look.pitch + (pull ? rngGaussian(hand) * HAND * DEG : 0);
      cmd.fire = pull;
    });
    if (winner === 0) won++;
  }
  return { won: won / SEEDS, hitRate: hits / Math.max(1, shots) };
}
const report = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.AIM_REPORT;

describe('aiming down sights against Normal bots (M84)', () => {
  it('down the sights more of your BBs hit a bot holding still, and further out the more so', { timeout: 120_000 }, () => {
    const rows: string[] = [];
    for (const [dist, gain] of [[15, 1], [25, 1.15], [35, 1.2]] as const) {
      const hip = duels('normal', dist, false, true);
      const aimed = duels('normal', dist, true, true);
      rows.push(`${dist} m: hip ${hip.hitRate.toFixed(2)}, aimed ${aimed.hitRate.toFixed(2)}`);
      expect(aimed.hitRate, rows.join('; ')).toBeGreaterThan(hip.hitRate * gain);
      // Hip fire stays viable: most BBs hit at a CQB range.
      if (dist === 15) expect(hip.hitRate, rows.join('; ')).toBeGreaterThan(0.6);
    }
    if (report) console.log(rows.join('\n'));
  });

  it('you win most duels against a Normal bot that fights back, from the hip and down the sights', { timeout: 120_000 }, () => {
    const rows: string[] = [];
    const results: [Duels, Duels][] = [];
    for (const dist of [15, 25, 35]) {
      const hip = duels('normal', dist, false);
      const aimed = duels('normal', dist, true);
      results.push([hip, aimed]);
      rows.push(`${dist} m: hip won ${hip.won.toFixed(2)} (BBs ${hip.hitRate.toFixed(2)}), aimed ${aimed.won.toFixed(2)} (${aimed.hitRate.toFixed(2)})`);
    }
    if (report) console.log(rows.join('\n'));
    for (const [hip, aimed] of results) {
      expect(hip.won, rows.join('; ')).toBeGreaterThanOrEqual(0.8);
      expect(aimed.won, rows.join('; ')).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('Easy, Normal, Hard and Pro still scale against a player aiming down the sights', { timeout: 120_000 }, () => {
    const won = (['easy', 'normal', 'hard', 'pro'] as const).map((level) => duels(level, 35, true).won);
    if (report) console.log('won at 35 m, aimed, Easy to Pro:', won.join(' '));
    for (let i = 1; i < won.length; i++) expect(won[i], won.join(' ')).toBeLessThanOrEqual(won[i - 1]!);
    expect(won[3], won.join(' ')).toBeLessThan(won[0]!);
  });
});
