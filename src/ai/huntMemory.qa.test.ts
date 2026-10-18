import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, type BotConfig } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { TEST_YARD } from '../map/testYard';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { isInPlay } from '../sim/elimination';
import { type Vec3, vec3 } from '../sim/vec';
import type { Bot, BotWorld } from './bot';
import type { BotController } from './botController';
import { glance } from './botMovement';
import { playMatch } from './depotMatchSupport';
import { seesSpot } from './perception';
import { skirmish } from './testSupport';

/**
 * M87 QA (playtest notes 15, 19): what huntMemory.test.ts and depotMatch.deadEnds.test.ts leave open. Each team keeps
 * its own memory (acceptance 1, "bots on both teams"); a hunt spot the bot sees empty from where it stands is not
 * picked; a check older than the pick, or the bot's own sector, does not cancel a goal; and in a real match a hunting
 * bot whose goal its team checked meanwhile turns to another at once instead of walking on to it.
 */

const worldOf = (bots: BotController): BotWorld => (bots as unknown as { world: BotWorld }).world;
const glances = (bot: Bot, w: BotWorld, n: number): void => {
  for (let i = 0; i < n; i++) glance(bot, w);
};
const sees = (bot: Bot, w: BotWorld, spot: Vec3): boolean => seesSpot(bot.character, spot, BOTS.huntClearRange, w.query, w.cfg, w.body, w.hits, w.sight);

/**
 * The test yard with four bots: Orange (team 1) A at (8, 12) and B at (8, -12), Blue (team 0) C at (-8, 12) and D at
 * (-8, -12); A and C look up the yard (-z), B and D down it. Blue's character 0 stands in the south-west corner.
 */
function yard(cfg: BotConfig = BOTS) {
  const s = skirmish(TEST_YARD, [[-13, 13, 0], [8, 12, 1], [8, -12, 1], [-8, 12, 0], [-8, -12, 0]], cfg);
  const w = worldOf(s.bots);
  const [a, b, c, d] = s.bots.bots as [Bot, Bot, Bot, Bot];
  a.character.yaw = 0;
  c.character.yaw = 0;
  b.character.yaw = Math.PI;
  d.character.yaw = Math.PI;
  w.time = 5;
  w.live = true;
  return { w, a, b, c, d };
}
const aim = (bot: Bot, x: number, z: number, pickedAt = 1): void => {
  bot.huntGoal.x = x;
  bot.huntGoal.z = z;
  bot.huntPickedAt = pickedAt;
};

describe('each team checks for itself, on both sides (M87, acceptance 1)', () => {
  it("an Orange bot's glances check the spot for Orange only, and a Blue bot's for Blue only", () => {
    const { w, a, b, c, d } = yard();
    expect(a.character.team).toBe(1);
    expect(b.character.team).toBe(1);
    expect(c.character.team).toBe(0);
    expect(d.character.team).toBe(0);
    // Both an Orange and a Blue bot hunt the spot 8 m in front of Orange's A, and one 8 m in front of Blue's C.
    expect(sees(a, w, vec3(8, 0, 4))).toBe(true);
    expect(sees(c, w, vec3(-8, 0, 4))).toBe(true);
    aim(b, 8, 4);
    aim(d, 8, 4);
    glances(a, w, 120);
    expect(w.huntGoalChecked(b)).toBe(true);
    expect(w.huntGoalChecked(d)).toBe(false);
    // Blue's own glances work the same way on Blue's side (both goals picked after A's look).
    w.time = 6;
    aim(b, -8, 4, 5.5);
    aim(d, -8, 4, 5.5);
    expect(w.huntGoalChecked(d)).toBe(false);
    glances(c, w, 120);
    expect(w.huntGoalChecked(d)).toBe(true);
    expect(w.huntGoalChecked(b)).toBe(false);
  });

  it('a check made before the goal was picked does not cancel it, nor does one of the sector the bot stands in', () => {
    const { w, a, b } = yard();
    glances(a, w, 120); // at 5 s
    aim(b, 8, 4, 6); // picked after A looked
    expect(w.huntGoalChecked(b)).toBe(false);
    aim(b, 8, 4, 1); // picked before
    expect(w.huntGoalChecked(b)).toBe(true);
    // Standing in the goal's sector already: the bot is there, so it is not sent elsewhere.
    b.character.position.x = 8;
    b.character.position.z = 4;
    expect(w.huntGoalChecked(b)).toBe(false);
  });
});

describe('a hunt spot the bot sees empty from where it stands is not picked (M87, acceptance 1)', () => {
  /** Of `n` hunt picks by Orange's A (looking up the yard), how many it can see from where it stands. */
  function inView(cfg: BotConfig, n: number): number {
    const { w, a } = yard(cfg);
    const p = vec3();
    let count = 0;
    for (let i = 0; i < n; i++) {
      expect(w.huntPoint(a, p)).toBe(true);
      if (sees(a, w, p)) count++;
    }
    return count;
  }

  it('picks almost no spot in view, where before M87 a good share of its picks were', () => {
    const before = inView({ ...BOTS, huntClearRange: 0, huntMemory: Number.POSITIVE_INFINITY }, 100);
    const now = inView(BOTS, 100);
    // The measure is not blind: a third or so of the yard lies in A's view.
    expect(before).toBeGreaterThan(15);
    // Only when all twelve candidates drawn are in view does one get picked.
    expect(now).toBeLessThanOrEqual(2);
  });

  it('counts the spots it saw while picking as checked for its team', () => {
    const { w, a, b } = yard();
    aim(b, 8, 4);
    const p = vec3();
    for (let i = 0; i < 40; i++) w.huntPoint(a, p);
    expect(w.huntGoalChecked(b)).toBe(true);
  });
});

describe('a hunting bot whose goal its team checked meanwhile turns to another (M87, acceptance 1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  /**
   * Over a Woodland 5v5 (the open field, where a glance reaches furthest), the longest a hunting bot kept walking
   * (advance, route in hand) to a goal its team had checked since it picked it (s), and the ticks spent so. A pause at
   * a point it reached (holdLeft) is not walking: the re-pick comes as it sets off (M88 QA: on seeds 2 and 3 a teammate
   * checked the next goal during such a pause). `blind`: the bots are not told of the team's checks (huntGoalChecked
   * answers no), as if the re-pick were not there; the measure still asks the real one.
   */
  function staleWalks(seed: number, blind: boolean): { longest: number; ticks: number; hunting: number } {
    const since = new Map<number, number>();
    let checked: ((b: Bot) => boolean) | undefined;
    const out = { longest: 0, ticks: 0, hunting: 0 };
    // Bots without personalities (BN1), passed last: this measures the hunt's re-pick, and with personalities drawn
    // fewer bots hunt (anchors hold, rushers push in), so the blind bots' longest stale walk fell to 1.45 s on seed 1.
    playMatch(150, seed, undefined, BOTS, 'elimination', ROUNDS, WOODLAND, 5, undefined, (state, controller) => {
      const w = worldOf(controller);
      if (!checked) {
        checked = w.huntGoalChecked;
        if (blind) w.huntGoalChecked = () => false;
      }
      for (const b of controller.bots) {
        const hunting = isInPlay(b.character) && state.round.phase === 'live' && b.mode === 'advance' && b.hunting && b.role === 'none';
        if (hunting) out.hunting++;
        if (!hunting || b.holdLeft > 0 || b.routeState !== 'ok' || !checked(b)) {
          since.delete(b.character.id);
          continue;
        }
        out.ticks++;
        const t0 = since.get(b.character.id) ?? state.time;
        since.set(b.character.id, t0);
        out.longest = Math.max(out.longest, state.time - t0);
      }
    }, undefined, undefined, new Map());
    return out;
  }

  it('on Woodland, never walks on to a goal its team already checked for longer than a moment', { timeout: 60_000 }, () => {
    // Two seeds of 150 s keep this file to seconds in the fast project. One was enough until Woodland's lanes lost
    // their points at the fort's baffles (M88 QA, 2026-10-11): on seed 1 the blind bots' longest stale walk is now 1.8
    // s. Seeds 1 and 4 since MS1 (2026-10-16): with Woodland's bushes cut to crouch height its bots see each other
    // sooner, and on seed 2 no bot hunts at all (the premise below), where seed 4 hunts for 6 600 ticks. Seeds 1 and 6
    // since MV2 (2026-10-17): with the holstered run at 5.4 m/s, seed 4's bots hunt for 297 ticks and seed 1's blind
    // longest walk is 1.78 s; seed 6's is 5.5 s, over 5 600 ticks of hunting either way.
    const before = [staleWalks(1, true), staleWalks(6, true)];
    const now = [staleWalks(1, false), staleWalks(6, false)];
    console.log(`QA M87 stale hunt walks: without the re-pick ${JSON.stringify(before)}, with it ${JSON.stringify(now)}`);
    // The measure is not blind: told nothing, bots walk on for seconds to spots their team has seen empty.
    expect(Math.max(...before.map((r) => r.longest))).toBeGreaterThan(2);
    const ticks = (rs: typeof now): number => rs.reduce((n, r) => n + r.ticks, 0);
    expect(ticks(before)).toBeGreaterThan(200);
    expect(ticks(now)).toBeLessThan(ticks(before) / 10);
    for (const r of now) {
      expect(r.hunting).toBeGreaterThan(500);
      // One think (thinkInterval) to notice, and a tick or two for the new route to be asked for.
      expect(r.longest).toBeLessThanOrEqual(BOTS.thinkInterval + 0.1);
    }
  });
});
