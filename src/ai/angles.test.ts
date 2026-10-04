import { describe, expect, it } from 'vitest';
import { BOTS, botConfig, DIFFICULTIES, type Difficulty } from '../config/bots';
import { BODY } from '../config/movement';
import { DEPOT } from '../map/depot';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import type { WorldQuery } from '../sim/armament';
import { eyeHeight } from '../sim/character';
import { createCommand } from '../sim/commands';
import { vec3, wrapAngle } from '../sim/vec';
import { lookAngles } from './aim';
import { createHeldAngle, findHeldAngles } from './angles';
import { aimBot } from './botCombat';
import { eyeOf } from './perception';
import { boxQuery, duel, noWalls } from './testSupport';

// Held angles and pre-aimed reactions (M37): where a Pro bot aims while it holds, and what aiming there buys it.

const DEG = Math.PI / 180;
const DT = 1 / 60;
const EYE = 1.6;

/** Several boxes as one world (the nearest hit). */
function boxes(...qs: WorldQuery[]): WorldQuery {
  return {
    raycastStatic(o, d, max) {
      let best = -1;
      for (const q of qs) {
        const t = q.raycastStatic(o, d, max);
        if (t >= 0 && (best < 0 || t < best)) best = t;
      }
      return best;
    },
  };
}

/** Whether nothing static stands between `a` and `b`. */
function clear(q: WorldQuery, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const t = q.raycastStatic(a, vec3((b.x - a.x) / len, (b.y - a.y) / len, (b.z - a.z) / len), len);
  return t < 0 || t >= len - 1e-6;
}

const angles = (n: number) => Array.from({ length: n }, createHeldAngle);

// A wall ahead and to the left (looking down -z, left is -x): its right-hand end at (0, -8) is a corner someone
// could step round. Its far end (x = -30) lies outside the fan.
const CORNER = boxQuery(-15, -8.5, 15, 0.5, 3);

describe('finding held angles', () => {
  it('aims just past a corner, at head height, where someone would step out', () => {
    const eye = vec3(0, EYE, 0);
    const out = angles(2);
    expect(findHeldAngles(CORNER, eye, EYE, 0, BOTS, out)).toBe(1);
    const a = out[0]!;
    expect(a.point.y).toBe(EYE);
    // Beside the wall's end (0, -8), on the open side, about anglePast beyond it, and in plain view.
    expect(a.point.x).toBeGreaterThan(0);
    expect(Math.hypot(a.point.x, a.point.z + 8)).toBeLessThan(1.5);
    expect(Math.hypot(a.point.x, a.point.z)).toBeGreaterThan(8);
    expect(clear(CORNER, eye, a.point)).toBe(true);
    // The yaw and pitch look at that point from the eye.
    const look = { yaw: 0, pitch: 0 };
    lookAngles(eye.x, eye.y, eye.z, a.point.x, a.point.y, a.point.z, look);
    expect(a.yaw).toBeCloseTo(look.yaw);
    expect(a.pitch).toBeCloseTo(look.pitch);
  });

  it('holds both sides of a doorway, best first, and sees nothing to hold in the open', () => {
    // A wall across the way with a 6 m opening straight ahead (a narrower one at this range is held from its middle).
    const wall = boxes(boxQuery(-23, -10, 20, 0.5, 3), boxQuery(23, -10, 20, 0.5, 3));
    const out = angles(2);
    expect(findHeldAngles(wall, vec3(0, EYE, 0), EYE, 0, BOTS, out)).toBe(2);
    expect(out[0]!.score).toBeGreaterThanOrEqual(out[1]!.score);
    // One each side of the doorway, far enough apart to count as two.
    expect(Math.sign(out[0]!.point.x)).not.toBe(Math.sign(out[1]!.point.x));
    expect(Math.abs(wrapAngle(out[0]!.yaw - out[1]!.yaw))).toBeGreaterThanOrEqual(BOTS.angleSeparationDeg * DEG);
    for (const a of out) expect(Math.abs(a.point.z + 10)).toBeLessThan(1.5);
    expect(findHeldAngles(noWalls, vec3(0, EYE, 0), EYE, 0, BOTS, out)).toBe(0);
  });

  it('sees no corner in a long wall seen at a slant, where each ray reaches a little further along it', () => {
    // A wall 8 m away running far to both sides: at the fan's edges the rays meet it metres apart, but it has no end.
    expect(findHeldAngles(boxQuery(0, -8.5, 60, 0.5, 3), vec3(0, EYE, 0), EYE, 0, BOTS, angles(2))).toBe(0);
  });

  it('ignores a corner at arm\'s length and one behind it', () => {
    const out = angles(2);
    // The same corner, closer than angleMinDist.
    expect(findHeldAngles(boxQuery(-15, -1, 15, 0.5, 3), vec3(0, EYE, 0), EYE, 0, BOTS, out)).toBe(0);
    // The same corner, behind: facing the other way, it is outside the fan.
    expect(findHeldAngles(CORNER, vec3(0, EYE, 0), EYE, Math.PI, BOTS, out)).toBe(0);
  });

  it('finds corners worth holding all over Depot, every one in plain view', { timeout: 30_000 }, async () => {
    await initPhysics();
    const physics = new PhysicsWorld(DEPOT, BODY, 1 / 60);
    const out = angles(2);
    let points = 0;
    let withAngles = 0;
    for (const lane of DEPOT.lanes) {
      const from = lane[0]!;
      const to = lane[lane.length - 1]!;
      for (const p of lane) {
        // Both ways along the lane: Orange holding towards Blue's end and Blue towards Orange's.
        for (const [a, b] of [
          [from, to],
          [to, from],
        ] as const) {
          const facingYaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
          const eye = vec3(p.x, p.y + eyeHeight(0, BODY), p.z);
          const n = findHeldAngles(physics, eye, eye.y, facingYaw, BOTS, out);
          points++;
          if (n > 0) withAngles++;
          for (let i = 0; i < n; i++) expect(clear(physics, eye, out[i]!.point)).toBe(true);
        }
      }
    }
    physics.dispose();
    // A yard built around cover and corners: nearly every lane point has an angle to hold.
    expect(withAngles / points, `${withAngles} of ${points}`).toBeGreaterThan(0.8);
  });
});

describe('holding an angle (Pro)', () => {
  /** A holding bot 12 m from the player beside the corner wall; returns its aim after `seconds`. */
  function hold(level: 'hard' | 'pro', seconds = 2) {
    let rays = 0;
    const query: WorldQuery = {
      raycastStatic(o, d, max) {
        rays++;
        return CORNER.raycastStatic(o, d, max);
      },
    };
    const { bot, bots, player } = duel(12, () => {}, query);
    const b = bots.bots[0]!;
    (b as { skill: unknown }).skill = botConfig(level);
    const w = bots.worldForTests;
    // Standing at the origin facing the corner (-z), nobody in sight, nothing heard: holding.
    bot.position.x = 0;
    bot.position.z = 0;
    player.position.x = 30;
    player.position.z = 30;
    (w.enemyYaw as number[])[bot.team] = 0;
    b.holding = true;
    b.teamWait = 0;
    const eye = vec3();
    const aimPoint = vec3();
    const cmd = createCommand();
    rays = 0;
    for (let i = 0; i < seconds / DT; i++) {
      eyeOf(bot, w.body, w.hits, eye);
      aimBot(b, w, undefined, eye, aimPoint, false, cmd, DT);
    }
    return { b, eye, rays };
  }

  it('turns to the corner instead of sweeping the view, and looks for corners only now and then', () => {
    const pro = hold('pro');
    expect(pro.b.heldAngleCount).toBeGreaterThan(0);
    const corner = pro.b.heldAngles[0]!;
    const look = { yaw: 0, pitch: 0 };
    lookAngles(pro.eye.x, pro.eye.y, pro.eye.z, corner.point.x, corner.point.y, corner.point.z, look);
    expect(Math.abs(wrapAngle(pro.b.aim.yaw - look.yaw))).toBeLessThan(1 * DEG);
    // Hard sweeps from the enemy side (straight ahead at the sweep's start), as before.
    const hard = hold('hard');
    expect(hard.b.heldAngleCount).toBe(0);
    expect(Math.abs(wrapAngle(hard.b.aim.yaw))).toBeLessThan(1 * DEG);
    expect(Math.abs(wrapAngle(look.yaw))).toBeGreaterThan(2 * DEG);
    // Two seconds of holding cast at most one fan per angleRefresh (plus the first), not one a tick.
    expect(pro.rays).toBeLessThanOrEqual(BOTS.angleRays * (1 + Math.ceil(2 / BOTS.angleRefresh)));
  });

  it('finds the same corners wherever the enemies are: geometry only, never a peek at them', () => {
    const corners = (px: number, pz: number) => {
      const { bot, bots, player } = duel(12, () => {}, CORNER);
      const b = bots.bots[0]!;
      (b as { skill: unknown }).skill = botConfig('pro');
      const w = bots.worldForTests;
      bot.position.x = 0;
      bot.position.z = 0;
      player.position.x = px;
      player.position.z = pz;
      (w.enemyYaw as number[])[bot.team] = 0;
      b.holding = true;
      const eye = vec3();
      eyeOf(bot, w.body, w.hits, eye);
      aimBot(b, w, undefined, eye, vec3(), false, createCommand(), DT);
      return b.heldAngles.slice(0, b.heldAngleCount).map((a) => ({ ...a, point: { ...a.point } }));
    };
    const behindTheCorner = corners(3, -12);
    expect(behindTheCorner.length).toBeGreaterThan(0);
    expect(corners(-20, 20)).toEqual(behindTheCorner);
    expect(corners(10, -2)).toEqual(behindTheCorner);
  });
});

describe('reacting from a held angle', () => {
  /** A fresh sighting at 12 m on `level`, the bot's view on the player or `off` degrees away. */
  function sighting(level: 'hard' | 'pro', off: number, seed: number) {
    const { state, bot, bots } = duel(12, () => {}, noWalls, BOTS, seed);
    const b = bots.bots[0]!;
    (b as { skill: unknown }).skill = botConfig(level);
    b.aim.yaw = bot.yaw + off * DEG;
    b.aim.pitch = 0;
    b.thinkLeft = 0;
    bots.think(state, DT);
    expect(b.contact).toBeDefined();
    return { delay: b.contact!.reactAt - state.time, settled: state.time - b.contact!.acquiredAt };
  }

  it('answers sooner and steadier when someone steps out where a Pro bot already aims', () => {
    const pro = botConfig('pro');
    for (let seed = 1; seed <= 20; seed++) {
      const aimed = sighting('pro', 0, seed);
      expect(aimed.delay).toBeGreaterThanOrEqual(pro.preAimReactionTime[0]);
      expect(aimed.delay).toBeLessThanOrEqual(pro.preAimReactionTime[1]);
      expect(aimed.settled).toBeCloseTo(pro.preAimSettled * pro.aimSettleTime);
      // Surprised (looking well away): Pro's slower reaction and an unsettled aim.
      const surprised = sighting('pro', 30, seed);
      expect(surprised.delay).toBeGreaterThanOrEqual(pro.reactionTime[0]);
      expect(surprised.delay).toBeLessThanOrEqual(pro.reactionTime[1]);
      expect(surprised.settled).toBe(0);
    }
    // Pre-aimed is faster than surprised, which is the reason to slice corners slowly.
    expect(pro.preAimReactionTime[1]).toBeLessThan(pro.reactionTime[1]);
  });

  it('changes nothing below Pro: Hard reacts the same aimed or not', () => {
    const hard = botConfig('hard');
    for (let seed = 1; seed <= 10; seed++) {
      const aimed = sighting('hard', 0, seed);
      const surprised = sighting('hard', 30, seed);
      expect(aimed.delay).toBe(surprised.delay);
      expect(aimed.settled).toBe(0);
      expect(aimed.delay).toBeGreaterThanOrEqual(hard.reactionTime[0]);
      expect(aimed.delay).toBeLessThanOrEqual(hard.reactionTime[1]);
    }
  });
});

describe('never aiming at someone unseen and unheard', () => {
  it('plays the same, tick for tick, wherever a hidden, silent enemy stands, at every difficulty', () => {
    // Two closed huts; the player stands still and silent inside one or the other. Whatever a bot does (advance,
    // hold, hunt, aim at angles), its commands must not depend on which: it can't see or hear into either.
    const huts = boxes(boxQuery(25, 25, 2, 2, 3), boxQuery(-25, 25, 2, 2, 3));
    const play = (level: Difficulty, seed: number, hutX: number) => {
      const { player, bots, run, commands } = duel(12, () => {}, huts, BOTS, seed);
      const b = bots.bots[0]!;
      (b as { skill: unknown }).skill = botConfig(level);
      player.position.x = hutX;
      player.position.z = 25;
      const cmd = commands.get(b.character.id)!;
      const ticks: string[] = [];
      run(10, () => {
        ticks.push(`${cmd.yaw.toFixed(6)} ${cmd.pitch.toFixed(6)} ${cmd.forward} ${cmd.right} ${cmd.fire} ${cmd.crouch} ${cmd.lean}`);
        expect(b.targetVisible).toBe(false);
      });
      // It isn't idle: it moves and looks about all the while.
      expect(new Set(ticks).size).toBeGreaterThan(20);
      return ticks;
    };
    for (const d of DIFFICULTIES) {
      for (const seed of [1, 2]) expect(play(d.id, seed, -25), `${d.id}, seed ${seed}`).toEqual(play(d.id, seed, 25));
    }
  });
});
