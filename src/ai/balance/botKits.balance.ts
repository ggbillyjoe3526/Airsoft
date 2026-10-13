import { beforeAll, it } from 'vitest';
import { botConfig, type Difficulty } from '../../config/bots';
import { initPhysics } from '../../physics/physicsWorld';
import { botKitSeed, kittedBot, pickBotKit } from '../../pool/botKit';
import { GAME_BOT_KITS } from '../../pool/gameBotKits';
import { GAME_POOL } from '../../pool/gamePool';
import { playMatch } from '../depotMatchSupport';
import { LEVELS_BAND, reportMeasure, share } from './balanceSupport';

beforeAll(async () => {
  await initPhysics();
});

/**
 * BG1: how much the bots' kits (bot-kits.md) are worth in a fight. Orange carries the kits the game picks for its
 * level (pickBotKit, each bot its own, seeded as a match seeds them); Blue the same level on the factory loadout, as your
 * teammates carry it. The ends swap at half time, so Orange's share of the decided rounds is the kits' worth. The band
 * is the levels' end band: a kit helps, but never decides a match by itself (the player's gear grows the same way).
 * Measured 2026-10-13 on 32 seeds: Easy 52.8 % (66 of 125; 31 of 96 bots carried parts), Normal 52.0 % (64 of 123;
 * 69 of 96), Hard 55.8 % (87 of 156; 87 of 96). On 12 seeds the same read 60.0, 45.7 and 60.0 %: noise.
 */
const SEEDS = 32;

for (const level of ['easy', 'normal', 'hard'] as const satisfies readonly Difficulty[]) {
  it(`measures ${level} bots on their kits against the same level on the factory loadout (Depot, Elimination)`, { timeout: 600_000 }, (ctx) => {
    let won = 0;
    let decided = 0;
    let kitted = 0;
    let bots = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const stats = playMatch(150, seed, undefined, botConfig(level), 'elimination', undefined, undefined, undefined, undefined, undefined, (id, team) => {
        if (team !== 1) return undefined;
        bots++;
        const kit = pickBotKit(GAME_BOT_KITS, level, GAME_POOL, botKitSeed(seed, id));
        if (!kit) return undefined;
        if (kit.slots.some((s) => s.parts.length > 0)) kitted++;
        return kittedBot(id, team, GAME_POOL, kit);
      });
      for (const r of stats.results) {
        if (r.winner < 0) continue;
        decided++;
        if (r.winner === 1) won++;
      }
    }
    reportMeasure(ctx, {
      label: `Depot, Elimination, ${level}: the side on bot-kits.md's kits, its share of the decided rounds against the factory loadout`,
      value: share(won, decided),
      of: decided,
      band: LEVELS_BAND,
      detail: `${won} of ${decided} decided; ${kitted} of ${bots} bots carried parts`,
    });
  });
}
