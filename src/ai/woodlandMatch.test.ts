import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import type { MatchMode } from '../config/modes';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { expectGrounded, playMatch } from './depotMatchSupport';

/** Woodland plays 4v4 (M33d); one seed and a few minutes of game time keep this file to a few seconds of wall time. */
const TEAM_SIZE = 4;
const SECONDS = 200;
/** A bot that is moving about stays further than this (m) from where it stood a moment ago. */
const STILL_RADIUS = 1;
/**
 * The longest a bot that has to advance (every bot in Elimination, the attackers in Attack / Defend) may stand about
 * while alive in a live round without firing (s): one trading shots from behind cover is fighting, not stuck.
 */
const LONGEST_STILL = 25;
/** Attackers get at least this close (m) to the flag: through a gap of the fort, whose walls stand about 7 m out. */
const WOODLAND_FORT_REACH = 8;

describe('a 4v4 bot match on Woodland (M33d, acceptance 5)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it.each(['elimination', 'attackDefend'] as MatchMode[])('plays %s: rounds finish, everyone leaves the camp, nobody stands stuck or falls off the field', { timeout: 40_000 }, (mode) => {
    const anchor = new Map<number, { x: number; z: number; since: number }>();
    let longestStill = 0;
    let closestToFlag = Number.POSITIVE_INFINITY;
    const flag = WOODLAND.flag!;
    const stats = playMatch(SECONDS, 1, undefined, BOTS, mode, ROUNDS, WOODLAND, TEAM_SIZE, HITS, (state) => {
      for (const c of state.characters) {
        if (mode === 'attackDefend' && c.team === state.round.attackers && c.status === 'alive') closestToFlag = Math.min(closestToFlag, Math.hypot(c.position.x - flag.x, c.position.z - flag.z));
        const firing = state.events.some((e) => e.type === 'shot' && e.characterId === c.id);
        // Defenders in Attack / Defend hold their ground by design; every other bot has somewhere to go.
        const advancing = mode === 'elimination' || c.team === state.round.attackers;
        if (!advancing || firing || state.round.phase !== 'live' || c.status !== 'alive') {
          anchor.delete(c.id);
          continue;
        }
        const a = anchor.get(c.id);
        if (!a || Math.hypot(c.position.x - a.x, c.position.z - a.z) > STILL_RADIUS) anchor.set(c.id, { x: c.position.x, z: c.position.z, since: state.time });
        else longestStill = Math.max(longestStill, state.time - a.since);
      }
    });
    // At least one round was played to its end, inside the round clock (plus overtime).
    expect(stats.rounds, mode).toBeGreaterThanOrEqual(1);
    for (const r of stats.results) expect(r.length, mode).toBeLessThanOrEqual(ROUNDS.roundTime + ROUNDS.flag.maxOvertime + 0.1);
    // They fought: BBs flew and hit someone.
    expect(stats.shots, mode).toBeGreaterThan(50);
    expect(stats.hits, mode).toBeGreaterThan(0);
    // Every bot that is meant to advance did so: nobody stayed in the camp or wedged on a log, a tree or a slope.
    expect(longestStill, mode).toBeLessThan(LONGEST_STILL);
    const attackers = mode === 'elimination' ? stats.farthestFromSpawn : stats.farthestFromSpawn.slice(0, TEAM_SIZE);
    for (const [i, d] of attackers.entries()) expect(d, `${mode} bot ${i} left its spawn`).toBeGreaterThan(20);
    // In Attack / Defend the attackers got up the Knoll to the fort. (How often they take the flag is balance:
    // KNOWN_ISSUES, measured over many seeds, not one.)
    if (mode === 'attackDefend') expect(closestToFlag, mode).toBeLessThan(WOODLAND_FORT_REACH);
    // On the ground the whole time, and never below the field's lowest point (the creek) or above the Knoll.
    expectGrounded(stats, WOODLAND);
  });
});
