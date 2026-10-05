import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_TORCH, BOTS, NIGHT_SIGHT } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { nightSightRange } from '../map/nightSight';
import { torchSightRange } from '../map/torchLight';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { botLight } from '../pool/botKit';
import { contentPool } from '../pool/contentPool';
import { GAME_POOL } from '../pool/gamePool';
import { isInPlay } from '../sim/elimination';
import { lightInHand } from '../sim/torch';
import { DT, playMatch } from './depotMatchSupport';

/**
 * M33h QA, acceptances 2 and 3 in a real match: bot matches with real physics, every bot carrying the torch the match
 * build gives it (pool/botKit.ts botLight + fitBotLight over the Dev content pool, as matchSession.ts spawnRoster does
 * on a night field; the harness fits it there by itself since M57, audit AI-02). On Woodland at night the bots switch
 * their torches by what they do, never faster than BOT_TORCH.minHold, never lit while out of play, all off as each
 * round starts, and every sighting past the light of the target's spot is one the torchlight explains. On Depot by day
 * the same kits play exactly as kits without torches, and the harness fits none unless asked.
 */

/** A bot's sight is as of its last look: within one think interval and a couple of ticks. */
const STALE_TICKS = Math.ceil(BOTS.thinkInterval / DT) + 2;

const LIGHT = botLight(contentPool(GAME_POOL, true));

describe('bots and their weapon torches in a match (M33h acceptances 2 and 3)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('on Woodland at night: switched by state without strobing, out when hit, off at each round start, sightings explained', { timeout: 45_000 }, () => {
    expect(LIGHT).toBe('weaponTorch');
    const last = new Map<number, number>();
    let ons = 0;
    let offs = 0;
    let strobes = 0;
    let shortest = Number.POSITIVE_INFINITY;
    let litWhileOut = 0;
    let litAtRoundStart = 0;
    let roundStarts = 0;
    let torchSightings = 0;
    let unexplained = 0;
    // By bot and target: the last tick the target's night range, or that or torchlight, let the bot see it.
    const nightAt = new Map<number, number>();
    const explainedAt = new Map<number, number>();
    let carried = -1;
    // Woodland is a night field, so the harness fits every bot its torch as the game does (M57, audit AI-02).
    const stats = playMatch(240, 3, undefined, BOTS, 'elimination', ROUNDS, WOODLAND, 4, HITS, (state, controller) => {
      if (state.tick === 1) carried = state.characters.filter((c) => lightInHand(c) === LIGHT).length;
      for (const e of state.events) {
        if (e.type === 'torch') {
          if (e.on) ons++;
          else offs++;
          const prev = last.get(e.characterId);
          if (prev !== undefined) {
            shortest = Math.min(shortest, state.time - prev);
            if (state.time - prev < BOT_TORCH.minHold - 1e-9) strobes++;
          }
          last.set(e.characterId, state.time);
        }
        if (e.type === 'roundStart') {
          roundStarts++;
          litAtRoundStart += state.characters.filter((c) => c.torchOn).length;
        }
      }
      for (const c of state.characters) if (!isInPlay(c) && c.torchOn) litWhileOut++;
      if (state.round.phase !== 'live') return;
      const sight = controller.worldForTests.sight!;
      for (const b of controller.bots) {
        const me = b.character;
        if (!isInPlay(me)) continue;
        for (const t of state.characters) {
          if (t.team === me.team || !isInPlay(t)) continue;
          const dist = Math.hypot(t.position.x - me.position.x, t.position.z - me.position.z);
          const night = nightSightRange(sight.night!, t.position);
          const key = me.id * 64 + t.id;
          // What the light round the target, or torchlight, lets this bot see this tick (with a step's movement to spare).
          if (dist <= BOTS.closeAwareness || dist <= night + 0.6) nightAt.set(key, state.tick);
          if (dist <= BOTS.closeAwareness || dist <= Math.max(night, torchSightRange(sight.torches!, sight.night!, me, t)) + 0.6) explainedAt.set(key, state.tick);
          if (!b.targetVisible || b.targetId !== t.id || state.tick - (nightAt.get(key) ?? -1e9) <= STALE_TICKS) continue;
          // Seen while beyond the light of the target's spot since the bot's last look (it looks every thinkInterval): only
          // torchlight (a beam on them, or their lens) can explain it.
          torchSightings++;
          if (state.tick - (explainedAt.get(key) ?? -1e9) > STALE_TICKS) unexplained++;
        }
      }
    });
    expect(carried, 'every bot carries the torch in hand').toBe(8);
    // The bots use their torches, both ways, and never strobe.
    expect(ons, 'bots switch their torches on').toBeGreaterThan(0);
    expect(offs, 'and off again').toBeGreaterThan(0);
    expect(strobes, `switches closer than ${BOT_TORCH.minHold} s (shortest ${shortest.toFixed(2)} s)`).toBe(0);
    // Off when hit (acceptance 2), and off as each round starts.
    expect(litWhileOut, 'ticks a character out of play had its torch on').toBe(0);
    expect(roundStarts).toBeGreaterThanOrEqual(1);
    expect(litAtRoundStart).toBe(0);
    // Torchlight is what lets a bot see past its night range (acceptance 3), and nothing else does.
    expect(torchSightings, 'bots see past the night range by torchlight').toBeGreaterThan(0);
    expect(unexplained, `of ${torchSightings} sightings past the target's night range`).toBe(0);
    expect(stats.rounds).toBeGreaterThanOrEqual(1);
    expect(stats.hits).toBeGreaterThan(0);
    expect(NIGHT_SIGHT.lit).toBeLessThanOrEqual(BOTS.viewDistance);
  });

  it('on Depot by day: the same kits with torches play exactly as without, and nobody switches one', { timeout: 30_000 }, () => {
    let switches = 0;
    let carried = -1;
    const withTorches = playMatch(40, 7, undefined, BOTS, 'elimination', ROUNDS, DEPOT, ROUNDS.teamSize, HITS, (state) => {
      if (state.tick === 1) carried = state.characters.filter((c) => lightInHand(c) === LIGHT).length;
      for (const e of state.events) if (e.type === 'torch') switches++;
    }, undefined, true);
    // By day the harness fits none, as the game fits none.
    let carriedByDefault = -1;
    const without = playMatch(40, 7, undefined, BOTS, 'elimination', ROUNDS, DEPOT, ROUNDS.teamSize, HITS, (state) => {
      if (state.tick === 1) carriedByDefault = state.characters.filter((c) => lightInHand(c) !== null).length;
    });
    expect(carried).toBe(2 * ROUNDS.teamSize);
    expect(carriedByDefault).toBe(0);
    expect(switches).toBe(0);
    expect(withTorches.shots).toBeGreaterThan(0);
    expect(withTorches).toEqual(without);
  });
});
