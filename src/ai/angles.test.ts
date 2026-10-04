import { describe, expect, it } from 'vitest';
import { BOT_SKILL, BOTS, botConfig, DIFFICULTIES, type Difficulty } from '../config/bots';
import { BODY } from '../config/movement';
import { DEPOT } from '../map/depot';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import type { WorldQuery } from '../sim/armament';
import { eyeHeight } from '../sim/character';
import { createCommand } from '../sim/commands';
import { vec3, wrapAngle } from '../sim/vec';
import { lookAngles } from './aim';
import { createHeldAngle, findHeldAngles } from './angles';
import { resetBot } from './bot';
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

  it('notes the open side of the edge: -1 for a ray open to the left of the wall, 1 to the right (M38)', () => {
    const out = angles(2);
    // CORNER: the wall runs off to the left, its right-hand end is the corner: the open side is the right.
    expect(findHeldAngles(CORNER, vec3(0, EYE, 0), EYE, 0, BOTS, out)).toBe(1);
    expect(out[0]!.side).toBe(1);
    expect(out[0]!.point.x).toBeGreaterThan(0);
    // Its mirror image: the open side is the left.
    expect(findHeldAngles(boxQuery(15, -8.5, 15, 0.5, 3), vec3(0, EYE, 0), EYE, 0, BOTS, out)).toBe(1);
    expect(out[0]!.side).toBe(-1);
    expect(out[0]!.point.x).toBeLessThan(0);
    // A doorway: the left wall's end is open to the right, the right wall's to the left; copied with the angle into the best slots.
    const door = boxes(boxQuery(-23, -10, 20, 0.5, 3), boxQuery(23, -10, 20, 0.5, 3));
    expect(findHeldAngles(door, vec3(0, EYE, 0), EYE, 0, BOTS, out)).toBe(2);
    for (const a of out) expect(a.side).toBe(a.point.x < 0 ? 1 : -1);
    expect(out[0]!.side).not.toBe(out[1]!.side);
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

describe('leaning while slicing a corner (Pro, M38)', () => {
  const MIRROR = boxQuery(15, -8.5, 15, 0.5, 3);

  /** One aim step of a bot walking down -z from (0, z) in `query`'s world: its lean, and how far it is from the corner it aimed at. */
  function slice(query: WorldQuery, z: number, level: 'hard' | 'pro' = 'pro') {
    const { bot, bots, player } = duel(12, () => {}, query);
    const b = bots.bots[0]!;
    (b as { skill: unknown }).skill = botConfig(level);
    const w = bots.worldForTests;
    bot.position.x = 0;
    bot.position.z = z;
    player.position.x = 30;
    player.position.z = 30;
    (w.enemyYaw as number[])[bot.team] = 0;
    b.mode = 'advance';
    b.hunting = false;
    b.careful = level === 'pro';
    b.hasLastKnown = false;
    b.moveDir.x = 0;
    b.moveDir.z = -1;
    const eye = vec3();
    const cmd = createCommand();
    eyeOf(bot, w.body, w.hits, eye);
    aimBot(b, w, undefined, eye, vec3(), true, cmd, DT);
    const a = b.heldAngles[0]!;
    return { lean: cmd.lean, held: b.heldAngleCount, dist: b.heldAngleCount > 0 ? Math.hypot(a.point.x - bot.position.x, a.point.z - bot.position.z) : Number.NaN };
  }

  it.each([
    ['right', CORNER, 1],
    ['left', MIRROR, -1],
  ] as const)('leans to the open side (%s) once within sliceLeanDistance of the corner, and not before', (_name, query, side) => {
    let leaned = 0;
    let upright = 0;
    for (let z = 0; z >= -5; z -= 0.5) {
      const r = slice(query, z);
      expect(r.held, `z ${z}`).toBeGreaterThan(0);
      if (r.dist <= BOTS.sliceLeanDistance) {
        expect(r.lean, `z ${z}, ${r.dist.toFixed(1)} m off`).toBe(side);
        leaned++;
      } else {
        expect(r.lean, `z ${z}, ${r.dist.toFixed(1)} m off`).toBe(0);
        upright++;
      }
    }
    // The sweep crosses the limit both ways.
    expect(leaned).toBeGreaterThan(2);
    expect(upright).toBeGreaterThan(2);
  });

  it('never leans on Hard, which does not slice, however near the corner', () => {
    for (const z of [0, -2, -4]) {
      const r = slice(CORNER, z, 'hard');
      expect(r.held, `z ${z}`).toBe(0);
      expect(r.lean, `z ${z}`).toBe(0);
    }
  });
});

describe('slicing towards a heard spot (Pro, M38 attempt 3)', () => {
  // A wall across the way with a 6 m doorway straight ahead (two held angles, one each side of it); a spot behind
  // either half of the wall is hidden from the bot at the origin.
  const DOORWAY = boxes(boxQuery(-23, -10, 20, 0.5, 3), boxQuery(23, -10, 20, 0.5, 3));

  /**
   * A bot standing at (x, z) facing -z, walking and careful in search mode towards a spot (`spot`, on the floor), with
   * `teamWait` where the held angles' time switch is; aims for 2 s, returns what it aimed at and how it leaned.
   */
  function search(query: WorldQuery, at: { x: number; z: number }, spot: { x: number; z: number }, teamWait = 0, level: 'hard' | 'pro' = 'pro') {
    const { bot, bots, player } = duel(12, () => {}, query);
    const b = bots.bots[0]!;
    (b as { skill: unknown }).skill = botConfig(level);
    const w = bots.worldForTests;
    bot.position.x = at.x;
    bot.position.z = at.z;
    player.position.x = 30;
    player.position.z = 30;
    (w.enemyYaw as number[])[bot.team] = 0;
    b.mode = 'search';
    b.careful = level === 'pro';
    b.hunting = false;
    b.hasLastKnown = true;
    b.lastKnown.x = spot.x;
    b.lastKnown.y = 0;
    b.lastKnown.z = spot.z;
    b.moveDir.x = 0;
    b.moveDir.z = -1;
    b.teamWait = teamWait;
    const eye = vec3();
    const cmd = createCommand();
    for (let i = 0; i < 2 / DT; i++) {
      eyeOf(bot, w.body, w.hits, eye);
      aimBot(b, w, undefined, eye, vec3(), true, cmd, DT);
    }
    const toSpot = { yaw: 0, pitch: 0 };
    lookAngles(eye.x, eye.y, eye.z, spot.x, BODY.standEyeHeight, spot.z, toSpot);
    /** How far (degrees) the aim is from a held angle. */
    const offAngle = (a: { point: { x: number; y: number; z: number } }) => {
      const look = { yaw: 0, pitch: 0 };
      lookAngles(eye.x, eye.y, eye.z, a.point.x, a.point.y, a.point.z, look);
      return Math.abs(wrapAngle(b.aim.yaw - look.yaw)) / DEG;
    };
    const offSpot = Math.abs(wrapAngle(b.aim.yaw - toSpot.yaw)) / DEG;
    return { b, w, cmd, eye, offAngle, offSpot, toSpot, hidden: !clear(query, eye, vec3(spot.x, BODY.standEyeHeight, spot.z)) };
  }

  it('aims at the held angle nearest the spot, even when the time-based switch would pick the other', () => {
    // Which angle is first, which second (best first, fixed by the doorway), seen with nothing hidden to slice.
    const probe = search(DOORWAY, { x: 0, z: 0 }, { x: 8, z: -12 });
    expect(probe.b.heldAngleCount).toBe(2);
    const [first, second] = probe.b.heldAngles as [typeof probe.b.heldAngles[0], typeof probe.b.heldAngles[0]];
    expect(Math.abs(wrapAngle(first.yaw - second.yaw))).toBeGreaterThan(BOTS.angleSeparationDeg * DEG);
    // A spot behind the wall on the second angle's side, and on the first's, hidden either way.
    for (const [near, far, teamWait] of [
      [second, first, 0], // the time switch is on the first
      [first, second, BOTS.angleSwitchTime + 0.01], // ... and on the second
    ] as const) {
      const spot = { x: Math.sign(near.point.x) * 8, z: -12 };
      const r = search(DOORWAY, { x: 0, z: 0 }, spot, teamWait);
      expect(r.hidden, 'the spot is hidden').toBe(true);
      expect(r.b.heldAngleCount).toBe(2);
      expect(r.offAngle(near), `on the angle nearest the spot, ${near.point.x.toFixed(1)}`).toBeLessThan(4);
      expect(r.offAngle(far), 'and not on the other').toBeGreaterThan(BOTS.angleSeparationDeg);
      // The corner it aims at is not the spot itself either.
      expect(r.offSpot).toBeGreaterThan(5);
    }
  });

  it('with the spot in plain view it watches the spot at head height and does not lean, however close the corner', () => {
    // The corner wall (x from -30 to 0 at z = -8): standing 4 m from its end, a spot ahead and to the right is in view,
    // one behind the wall is not.
    const at = { x: 0, z: -4 };
    const visible = search(CORNER, at, { x: 6, z: -20 });
    expect(visible.hidden).toBe(false);
    expect(visible.cmd.lean).toBe(0);
    expect(Math.abs(wrapAngle(visible.b.aim.yaw - visible.toSpot.yaw))).toBeLessThan(1 * DEG);
    expect(Math.abs(visible.b.aim.pitch - visible.toSpot.pitch)).toBeLessThan(1 * DEG);
    expect(visible.b.heldAngleCount, 'looked for no corner').toBe(0);
    // The same bot, the spot just hidden behind the wall: it slices the corner and leans out past it instead.
    const hidden = search(CORNER, at, { x: -6, z: -20 });
    expect(hidden.hidden).toBe(true);
    expect(hidden.b.heldAngleCount).toBeGreaterThan(0);
    expect(hidden.cmd.lean).toBe(1);
    expect(hidden.offSpot).toBeGreaterThan(5);
    expect(hidden.offAngle(hidden.b.heldAngles[0]!)).toBeLessThan(4);
    // Hard watches the hidden spot as it always did.
    const hard = search(CORNER, at, { x: -6, z: -20 }, 0, 'hard');
    expect(hard.cmd.lean).toBe(0);
    expect(hard.b.heldAngleCount).toBe(0);
    expect(hard.offSpot).toBeLessThan(1);
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

// ---- QA additions (M37) ----

const FIRST_RAY = -(BOTS.angleFanDeg * DEG) / 2;
const RAY_STEP = (BOTS.angleFanDeg * DEG) / (BOTS.angleRays - 1);

/** A world whose static ray at fan index i (facing yaw 0) reaches `profile[i]` metres (a negative or too long one: open). */
function fanWorld(profile: readonly number[], counter?: { rays: number }): WorldQuery {
  return {
    raycastStatic(_o, d, max) {
      if (counter) counter.rays++;
      const yaw = Math.atan2(-d.x, -d.z);
      const i = Math.round((yaw - FIRST_RAY) / RAY_STEP);
      const t = profile[i] ?? -1;
      return t < 0 || t > max ? -1 : t;
    },
  };
}

/** A 29-ray profile: `fill(i)` per ray. */
const profile = (fill: (i: number) => number) => Array.from({ length: BOTS.angleRays }, (_, i) => fill(i));
const rayYaw = (i: number) => FIRST_RAY + i * RAY_STEP;
const OPEN = 25;

describe('keeping the best angles (keepBest through findHeldAngles)', () => {
  // Rays 0-9 meet a wall at d1, 10-11 run on, 12-19 meet a wall at d2, 20-21 run on, 22-28 meet a wall at d3. The edges are
  // at open rays 10 (wall d1 beside it), 11 (d2), 20 (d2) and 21 (d3): two pairs 5 degrees apart, the pairs 45 degrees apart.
  const twoClusters = (d1: number, d2: number, d3: number) => fanWorld(profile((i) => (i < 10 ? d1 : i < 12 ? OPEN : i < 20 ? d2 : i < 22 ? OPEN : d3)));
  const eye = vec3(0, EYE, 0);

  it('keeps one pick per cluster, the better one, when a later candidate beats a nearby worse one', () => {
    // Ray 10's edge is a wall at 3 m (score low), ray 11's a wall at 9.4 m (the best distance): the later one replaces it.
    const out = angles(4);
    const world = twoClusters(3, 9.4, 9.4);
    expect(findHeldAngles(world, eye, EYE, 0, BOTS, out)).toBe(2);
    expect(out[0]!.yaw).toBeCloseTo(rayYaw(11), 2);
    expect(out[0]!.score).toBeCloseTo(Math.cos(rayYaw(11)) - Math.abs(9.4 + BOTS.anglePast - BOTS.angleBestDist) / BOTS.angleMaxDist, 3);
    // The second cluster: ray 20 (wall 9.4) beats ray 21 (same wall, further from the enemy side), best first overall.
    expect(out[1]!.yaw).toBeCloseTo(rayYaw(20), 2);
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
    expect(out[2]!.score).toBe(Number.NEGATIVE_INFINITY);
    expect(out[3]!.score).toBe(Number.NEGATIVE_INFINITY);
  });

  it('keeps the earlier pick when it is the better one, and drops a worse one close to it', () => {
    const out = angles(4);
    // Ray 10's wall at 9.4 m is best; ray 11's at 3 m is worse and within the separation: dropped.
    expect(findHeldAngles(twoClusters(9.4, 3, 9.4), eye, EYE, 0, BOTS, out)).toBe(2);
    expect(out[0]!.yaw).toBeCloseTo(rayYaw(10), 2);
    expect(Math.abs(wrapAngle(out[0]!.yaw - out[1]!.yaw))).toBeGreaterThanOrEqual(BOTS.angleSeparationDeg * DEG);
  });

  it('puts the best two first when there are more candidates than slots, whatever order they are met in', () => {
    // Four slits in a wall at 8 m, 35 degrees apart at fan rays 3, 10, 17, 24 (each makes two edges at one yaw).
    const slits = (at: readonly number[]) => fanWorld(profile((i) => (at.includes(i) ? OPEN : 8)));
    const all = angles(6);
    expect(findHeldAngles(slits([3, 10, 17, 24]), eye, EYE, 0, BOTS, all)).toBe(4);
    for (let i = 1; i < 4; i++) expect(all[i - 1]!.score).toBeGreaterThanOrEqual(all[i]!.score);
    const two = angles(2);
    expect(findHeldAngles(slits([3, 10, 17, 24]), eye, EYE, 0, BOTS, two)).toBe(2);
    // The two slots hold the two best of the four, in the same order.
    expect(two.map((a) => [a.yaw, a.score])).toEqual(all.slice(0, 2).map((a) => [a.yaw, a.score]));
    // The centre-most slits face the enemy side best.
    expect(Math.max(...two.map((a) => Math.abs(a.yaw)))).toBeLessThan(25 * DEG);
    // Mirrored, the same scores come out whichever order the candidates are met in.
    const mirrored = angles(2);
    expect(findHeldAngles(slits([28 - 3, 28 - 10, 28 - 17, 28 - 24]), eye, EYE, 0, BOTS, mirrored)).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(mirrored[i]!.score).toBeCloseTo(two[i]!.score, 6);
      expect(mirrored[i]!.yaw).toBeCloseTo(-two[i]!.yaw, 6);
    }
  });

  it('counts two picks as separate only when they are angleSeparationDeg apart', () => {
    // Open rays 10 and 13 (15 degrees apart) between walls at 8 m.
    const world = fanWorld(profile((i) => (i >= 10 && i <= 13 ? OPEN : 8)));
    expect(findHeldAngles(world, eye, EYE, 0, { ...BOTS, angleSeparationDeg: 10 }, angles(4))).toBe(2);
    const wide = angles(4);
    expect(findHeldAngles(world, eye, EYE, 0, { ...BOTS, angleSeparationDeg: 20 }, wide)).toBe(1);
    expect(wide[1]!.score).toBe(Number.NEGATIVE_INFINITY);
  });

  it('resets the scores of unused slots on every call', () => {
    const out = angles(2);
    const doorway = boxes(boxQuery(-23, -10, 20, 0.5, 3), boxQuery(23, -10, 20, 0.5, 3));
    expect(findHeldAngles(doorway, eye, EYE, 0, BOTS, out)).toBe(2);
    expect(out[1]!.score).toBeGreaterThan(Number.NEGATIVE_INFINITY);
    expect(findHeldAngles(CORNER, eye, EYE, 0, BOTS, out)).toBe(1);
    expect(out[0]!.score).toBeGreaterThan(Number.NEGATIVE_INFINITY);
    expect(out[1]!.score).toBe(Number.NEGATIVE_INFINITY);
    expect(findHeldAngles(noWalls, eye, EYE, 0, BOTS, out)).toBe(0);
    for (const a of out) expect(a.score).toBe(Number.NEGATIVE_INFINITY);
  });

  it('copes with a fan of one ray and with more rays than it has room for', () => {
    expect(findHeldAngles(CORNER, eye, EYE, 0, { ...BOTS, angleRays: 1 }, angles(2))).toBe(0);
    // 100 rays are cut to the scratch size, not run past it; the corner is still found.
    expect(findHeldAngles(CORNER, eye, EYE, 0, { ...BOTS, angleRays: 100 }, angles(2))).toBe(1);
  });
});

describe('holding two angles in turn (Pro)', () => {
  const DOORWAY = boxes(boxQuery(-23, -10, 20, 0.5, 3), boxQuery(23, -10, 20, 0.5, 3));

  /** A bot at the origin facing the doorway, holding, nobody in sight; `view()` steps its aim for `seconds`. */
  function holder(level: Difficulty, query: WorldQuery = DOORWAY) {
    const counter = { rays: 0 };
    const counting: WorldQuery = {
      raycastStatic(o, d, max) {
        counter.rays++;
        return query.raycastStatic(o, d, max);
      },
    };
    const { bot, bots, player } = duel(12, () => {}, counting);
    const b = bots.bots[0]!;
    (b as { skill: unknown }).skill = botConfig(level);
    const w = bots.worldForTests;
    bot.position.x = 0;
    bot.position.z = 0;
    player.position.x = 30;
    player.position.z = 30;
    (w.enemyYaw as number[])[bot.team] = 0;
    b.holding = true;
    const eye = vec3();
    const cmd = createCommand();
    const view = (seconds: number) => {
      for (let i = 0; i < seconds / DT; i++) {
        eyeOf(bot, w.body, w.hits, eye);
        aimBot(b, w, undefined, eye, vec3(), false, cmd, DT);
      }
    };
    /** How far the bot's aim is from `a`, in degrees. */
    const offBy = (a: { point: { x: number; y: number; z: number } }) => {
      const look = { yaw: 0, pitch: 0 };
      lookAngles(eye.x, eye.y, eye.z, a.point.x, a.point.y, a.point.z, look);
      return Math.hypot(wrapAngle(b.aim.yaw - look.yaw), b.aim.pitch - look.pitch) / DEG;
    };
    return { b, w, bot, counter, view, offBy };
  }

  it('looks at the first angle, then the second after angleSwitchTime, then back again', () => {
    const { b, view, offBy } = holder('pro');
    b.teamWait = 0;
    view(3);
    expect(b.heldAngleCount).toBe(2);
    const [first, second] = b.heldAngles as [typeof b.heldAngles[0], typeof b.heldAngles[0]];
    // The two are on different sides of the doorway, so the view has to turn to switch.
    expect(Math.abs(wrapAngle(first.yaw - second.yaw))).toBeGreaterThan(BOTS.angleSeparationDeg * DEG);
    expect(offBy(first)).toBeLessThan(1);
    b.teamWait = BOTS.angleSwitchTime - 0.01;
    view(3);
    expect(offBy(first), 'still on the first just before the switch').toBeLessThan(1);
    b.teamWait = BOTS.angleSwitchTime + 0.01;
    view(3);
    expect(offBy(second), 'on the second just after it').toBeLessThan(1);
    expect(offBy(first)).toBeGreaterThan(BOTS.angleSeparationDeg / 2);
    b.teamWait = 2 * BOTS.angleSwitchTime + 0.01;
    view(3);
    expect(offBy(first), 'and round again').toBeLessThan(1);
  });

  it('works out the angles again once it has moved angleMoveRefresh, and not before', () => {
    const { b, bot, w, counter, view } = holder('pro');
    view(0.1);
    expect(counter.rays).toBe(BOTS.angleRays);
    const at = b.heldAnglesAt;
    view(0.5);
    expect(counter.rays, 'standing still: no new fan').toBe(BOTS.angleRays);
    bot.position.x = BOTS.angleMoveRefresh * 0.8;
    view(0.1);
    expect(counter.rays, 'a small step: no new fan').toBe(BOTS.angleRays);
    bot.position.x = BOTS.angleMoveRefresh * 1.2;
    view(0.1);
    expect(counter.rays, 'a bigger one: a new fan').toBe(2 * BOTS.angleRays);
    expect(b.heldAnglesFrom.x).toBeCloseTo(bot.position.x);
    expect(b.heldAnglesAt).toBe(at); // the clock hadn't moved
    // Later, standing still, it looks again once angleRefresh has passed.
    w.time += BOTS.angleRefresh - 0.1;
    view(0.1);
    expect(counter.rays).toBe(2 * BOTS.angleRays);
    w.time += 0.2;
    view(0.1);
    expect(counter.rays).toBe(3 * BOTS.angleRays);
    expect(b.heldAnglesAt).toBe(w.time);
  });

  it('sweeps the view as before when there is no corner to hold, even as Pro', () => {
    const { b, view } = holder('pro', noWalls);
    b.teamWait = 0;
    view(1);
    expect(b.heldAngleCount).toBe(0);
    expect(Math.abs(b.aim.yaw)).toBeLessThan(1 * DEG); // sweep starts straight ahead
    b.teamWait = BOTS.holdSweepPeriod / 4;
    view(2);
    expect(Math.abs(b.aim.yaw)).toBeGreaterThan(BOTS.holdSweepDeg * DEG * 0.8);
  });

  it('forgets its angles when the round is reset, and looks again straight away', () => {
    const { b, bot, counter, view, offBy } = holder('pro');
    view(1);
    expect(b.heldAngleCount).toBe(2);
    resetBot(b, -1, 0, BOTS);
    expect(b.heldAngleCount).toBe(0);
    expect(b.heldAnglesAt).toBe(Number.NEGATIVE_INFINITY);
    // Holding again in the same place at the same moment: a new fan on the first tick (not two seconds of sweeping).
    b.holding = true;
    b.teamWait = 0;
    bot.position.x = 0;
    bot.position.z = 0;
    const before = counter.rays;
    view(1);
    expect(counter.rays).toBe(before + BOTS.angleRays);
    expect(b.heldAngleCount).toBe(2);
    expect(offBy(b.heldAngles[0]!)).toBeLessThan(1);
  });

  it('is created with no angles held', () => {
    const { b } = holder('pro');
    expect(b.heldAngleCount).toBe(0);
    expect(b.heldAngles).toHaveLength(2);
    expect(b.heldAnglesAt).toBe(Number.NEGATIVE_INFINITY);
  });

  it('does not hold angles on Easy, Normal or Hard: they sweep, however long they hold', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const { b, counter, view } = holder(level);
      b.teamWait = 0;
      view(4);
      expect(b.heldAngleCount, level).toBe(0);
      expect(counter.rays, `${level} casts no fan`).toBe(0);
    }
  });
});

describe('skills below Pro are untouched by M37 (acceptance 5)', () => {
  it('Easy, Normal and Hard hold no angles and react the same pre-aimed or not', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const s = BOT_SKILL[level];
      expect(s.holdsAngles, level).toBe(false);
      expect(s.preAimReactionTime, level).toEqual(s.reactionTime);
      expect(s.preAimSettled, level).toBe(0);
    }
  });

  it('Pro alone holds angles, and its pre-aimed reaction is 0.18-0.28 s with Hard speed or slower otherwise', () => {
    const pro = BOT_SKILL.pro;
    expect(pro.holdsAngles).toBe(true);
    expect(pro.preAimReactionTime[0]).toBeCloseTo(0.18);
    expect(pro.preAimReactionTime[1]).toBeCloseTo(0.28);
    expect(pro.preAimSettled).toBeGreaterThan(0);
    expect(pro.preAimSettled).toBeLessThanOrEqual(1);
    expect(pro.reactionTime[0]).toBeGreaterThanOrEqual(BOT_SKILL.hard.reactionTime[0]);
    expect(pro.reactionTime[1]).toBeGreaterThanOrEqual(BOT_SKILL.hard.reactionTime[1]);
  });
});

describe('pre-aimed means within a few degrees (preAimConeDeg)', () => {
  /** The wait for a fresh sighting at 12 m with the bot's view `off` degrees (yaw) away from the player. */
  function delayAt(off: number, seed: number, level: 'hard' | 'pro' = 'pro') {
    const { state, bot, bots } = duel(12, () => {}, noWalls, BOTS, seed);
    const b = bots.bots[0]!;
    (b as { skill: unknown }).skill = botConfig(level);
    b.aim.yaw = bot.yaw + off * DEG;
    b.aim.pitch = 0;
    b.thinkLeft = 0;
    bots.think(state, DT);
    return b.contact!.reactAt - state.time;
  }

  it('answers in 0.18-0.28 s inside the cone, on either side, and Hard speed or slower outside it', () => {
    const pro = botConfig('pro');
    for (let seed = 1; seed <= 10; seed++) {
      for (const off of [-BOTS.preAimConeDeg + 1.5, 0, BOTS.preAimConeDeg - 1.5]) {
        const d = delayAt(off, seed);
        expect(d, `${off} deg, seed ${seed}`).toBeGreaterThanOrEqual(0.18 - 1e-9);
        expect(d, `${off} deg, seed ${seed}`).toBeLessThanOrEqual(0.28 + 1e-9);
      }
      for (const off of [-BOTS.preAimConeDeg - 2, BOTS.preAimConeDeg + 2, 90, 180]) {
        const d = delayAt(off, seed);
        expect(d, `${off} deg, seed ${seed}`).toBeGreaterThanOrEqual(pro.reactionTime[0]);
        expect(d, `${off} deg, seed ${seed}`).toBeGreaterThanOrEqual(BOT_SKILL.hard.reactionTime[0]);
        expect(d).toBeLessThanOrEqual(BOT_SKILL.hard.reactionTime[1]);
      }
    }
  });

  it('counts a view off in pitch too', () => {
    const { state, bot, bots } = duel(12, () => {}, noWalls, BOTS, 3);
    const b = bots.bots[0]!;
    (b as { skill: unknown }).skill = botConfig('pro');
    b.aim.yaw = bot.yaw;
    b.aim.pitch = (BOTS.preAimConeDeg + 3) * DEG;
    b.thinkLeft = 0;
    bots.think(state, DT);
    expect(b.contact!.reactAt - state.time).toBeGreaterThanOrEqual(botConfig('pro').reactionTime[0]);
  });

  it('only the first sight of someone is pre-aimed: seen again within contactGrace, no new delay', () => {
    const { state, bot, bots } = duel(12, () => {}, noWalls, BOTS, 5);
    const b = bots.bots[0]!;
    (b as { skill: unknown }).skill = botConfig('pro');
    b.aim.yaw = bot.yaw;
    b.thinkLeft = 0;
    bots.think(state, DT);
    const reactAt = b.contact!.reactAt;
    const acquiredAt = b.contact!.acquiredAt;
    b.aim.yaw = bot.yaw + 40 * DEG;
    b.thinkLeft = 0;
    state.time += 0.1;
    bots.think(state, DT);
    expect(b.contact!.reactAt).toBe(reactAt);
    expect(b.contact!.acquiredAt).toBe(acquiredAt);
  });
});

describe('never aiming at someone unseen and unheard, while holding angles', () => {
  it('holds still in the same way, tick for tick, wherever a hidden, silent enemy stands, at every difficulty', () => {
    // As the guard above, but the bot is held at a spot in front of a doorway so the angle code is what runs.
    const world = boxes(
      boxQuery(25, 25, 2, 2, 3),
      boxQuery(-25, 25, 2, 2, 3),
      boxQuery(-23, -4, 20, 0.5, 3),
      boxQuery(23, -4, 20, 0.5, 3),
    );
    const play = (level: Difficulty, seed: number, hutX: number) => {
      const { player, bots, run, commands } = duel(12, () => {}, world, BOTS, seed);
      const b = bots.bots[0]!;
      (b as { skill: unknown }).skill = botConfig(level);
      player.position.x = hutX;
      player.position.z = 25;
      b.holdLeft = 8;
      const cmd = commands.get(b.character.id)!;
      const ticks: string[] = [];
      let holding = 0;
      let angled = 0;
      run(6, () => {
        ticks.push(`${cmd.yaw.toFixed(6)} ${cmd.pitch.toFixed(6)} ${cmd.forward} ${cmd.right} ${cmd.fire}`);
        expect(b.targetVisible).toBe(false);
        if (b.holding) holding++;
        if (b.holding && b.heldAngleCount > 0) angled++;
      });
      return { ticks, holding, angled };
    };
    for (const d of DIFFICULTIES) {
      for (const seed of [1, 2]) {
        const left = play(d.id, seed, -25);
        const right = play(d.id, seed, 25);
        expect(left.ticks, `${d.id}, seed ${seed}`).toEqual(right.ticks);
        // The bot really holds (the guard is no use if it walked off), and Pro looks at angles while it does.
        expect(left.holding, `${d.id} holds`).toBeGreaterThan(200);
        if (d.id === 'pro') expect(left.angled, 'pro holds angles').toBeGreaterThan(200);
        else expect(left.angled, `${d.id} holds none`).toBe(0);
      }
    }
  });
});
