import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { AEG, LOADOUT } from '../config/replicas';
import type { MapBlock } from '../map/mapTypes';
import { targetSpreadScale } from './accuracy';
import type { WorldQuery } from './armament';
import { type Character, createCharacter, eyeHeight, respawnCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { restReady, restTop, stepCoverRest } from './coverRest';
import { buildLevelRay, castLevelRay } from './levelRay';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { OPEN_NAV } from './testSupport';
import { vec3 } from './vec';

const R = MOVEMENT.rest;
const DT = 1 / 60;
const DEG = Math.PI / 180;
const STAND_EYE = BODY.standEyeHeight;
const CROUCH_EYE = BODY.crouchEyeHeight;

const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, kind: MapBlock['kind'] = 'crate'): MapBlock => ({
  kind,
  center: vec3(cx, cy, cz),
  size: vec3(sx, sy, sz),
});
/** A block standing on the floor (y = 0) with its near face `near` metres ahead of the origin (towards -Z). */
const standing = (near: number, height: number, depth = 0.6, width = 1.2): MapBlock => box(0, height / 2, -near - depth / 2, width, height, depth);
const FLOOR = box(0, -0.25, 0, 20, 0.5, 20, 'floor');

/** The level's own ray (sim/levelRay.ts, as the physics world answers it): with surfaces, or blocks only. */
function levelQuery(blocks: readonly MapBlock[], surfaces = true): WorldQuery & { casts: number } {
  const level = buildLevelRay([FLOOR, ...blocks]);
  const q = {
    casts: 0,
    raycastStatic(o: Parameters<WorldQuery['raycastStatic']>[0], d: Parameters<WorldQuery['raycastStatic']>[1], m: number) {
      q.casts++;
      return castLevelRay(level, o, d, m);
    },
  } as WorldQuery & { casts: number };
  if (surfaces) {
    q.raycastSurface = (o, d, m, out) => {
      q.casts++;
      return castLevelRay(level, o, d, m, out);
    };
  }
  return q;
}

/** restTop for someone at the origin facing -Z (yaw 0), eye `eye` above the floor. */
const topAhead = (q: WorldQuery, eye = STAND_EYE, yaw = 0, pitch = 0) => restTop(0, 0, eye, yaw, pitch, R, q);

describe('finding cover to rest on (M104)', () => {
  it('finds a chest-high crate top standing, and a waist-high one crouched', () => {
    expect(topAhead(levelQuery([standing(0.45, 1.2)]))).toBeCloseTo(1.2, 6);
    const low = levelQuery([standing(0.45, 0.8)]);
    expect(topAhead(low, STAND_EYE)).toBeNaN(); // 0.82 m below a standing eye: out of reach
    expect(topAhead(low, CROUCH_EYE)).toBeCloseTo(0.8, 6);
  });

  it('takes a top between minDrop and maxDrop below the eye, and nothing above or below', () => {
    for (const drop of [R.minDrop + 0.01, 0.3, R.maxDrop - 0.01]) expect(topAhead(levelQuery([standing(0.45, STAND_EYE - drop)])), `${drop}`).toBeCloseTo(STAND_EYE - drop, 6);
    // Too high to see over (a wall at eye height is cover, not a rest), and too low to reach down to.
    for (const drop of [R.minDrop - 0.02, -0.4, R.maxDrop + 0.02]) expect(topAhead(levelQuery([standing(0.45, STAND_EYE - drop)])), `${drop}`).toBeNaN();
  });

  it('needs the cover straight ahead and within reach', () => {
    const q = levelQuery([standing(0.45, 1.2)]);
    expect(topAhead(q, STAND_EYE, Math.PI)).toBeNaN(); // facing away
    expect(topAhead(q, STAND_EYE, Math.PI / 2)).toBeNaN(); // side on
    expect(topAhead(levelQuery([standing(R.reach - 0.05, 1.2)]))).toBeCloseTo(1.2, 6);
    expect(topAhead(levelQuery([standing(R.reach + 0.05, 1.2)]))).toBeNaN();
  });

  it('rests on a window sill, but not under a lintel that blocks the aim, nor on a thin wall it cannot see over', () => {
    // A 0.2 m wall with a window from 1.1 m to 2 m: the sill is a rest.
    const sill = standing(0.4, 1.1, 0.2, 3);
    const lintel = box(0, 2.3, -0.5, 3, 0.6, 0.2, 'wall');
    expect(topAhead(levelQuery([sill, lintel]))).toBeCloseTo(1.1, 6);
    // A lintel down to 1.5 m crosses the sight line: the BBs' way is blocked.
    expect(topAhead(levelQuery([sill, box(0, 1.9, -0.5, 3, 0.8, 0.2, 'wall')]))).toBeNaN();
    // A thin barrier (5 cm) still has a top to find past its face.
    expect(topAhead(levelQuery([standing(0.5, 1.25, 0.05)]))).toBeCloseTo(1.25, 6);
  });

  it('never rests on cover with something right behind it in the aim, or when aiming down into it', () => {
    const crate = standing(0.45, 1.2);
    // A barrier with a wall 10 cm behind it: within clearAhead of its face.
    expect(topAhead(levelQuery([standing(0.45, 1.2, 0.2), standing(0.45 + 0.2 + 0.1, 3, 0.3)]))).toBeNaN();
    expect(topAhead(levelQuery([standing(0.45, 1.2, 0.2), standing(0.45 + R.clearAhead + 0.1, 3, 0.3)]))).toBeCloseTo(1.2, 6);
    expect(topAhead(levelQuery([crate]), STAND_EYE, 0, -30 * DEG)).toBeNaN();
    expect(topAhead(levelQuery([crate]), STAND_EYE, 0, -3 * DEG)).toBeCloseTo(1.2, 6); // a target a little lower is fine
  });

  it('takes no ramp ahead for a ledge when the query reports surfaces', () => {
    // A ramp rising 0.5 m in 1 m towards -Z, just ahead of a crouched player.
    const ramp: MapBlock = { kind: 'ramp', center: vec3(0, 0.25, -0.9), size: vec3(2, 0.5, 1), rise: '-z' };
    expect(topAhead(levelQuery([ramp]), CROUCH_EYE)).toBeNaN();
  });
});

describe('when a character rests (M104)', () => {
  function ready(): Character {
    const c = createCharacter(0, vec3(), 0);
    c.grounded = true;
    c.aiming = true;
    return c;
  }

  it('is aiming, on the ground, still and upright', () => {
    const stillBelow = MOVEMENT.accuracy.stillBelow;
    expect(restReady(ready(), R, stillBelow)).toBe(true);
    const notAiming = ready();
    notAiming.aiming = false;
    const inAir = ready();
    inAir.grounded = false;
    const moving = ready();
    moving.velocity.x = stillBelow + 0.05;
    const leaning = ready();
    leaning.lean = R.maxLean + 0.05;
    for (const c of [notAiming, inAir, moving, leaning]) expect(restReady(c, R, stillBelow)).toBe(false);
  });

  it('settles over settleTime and comes off over releaseTime, and casts no rays unless ready', () => {
    const q = levelQuery([standing(0.45, 1.2)]);
    const c = ready();
    const ticksIn = Math.round(R.settleTime / DT);
    for (let i = 0; i < ticksIn - 1; i++) stepCoverRest(c, BODY, R, MOVEMENT.accuracy.stillBelow, q, DT);
    expect(c.coverRest).toBeGreaterThan(0.8);
    expect(c.coverRest).toBeLessThan(1);
    stepCoverRest(c, BODY, R, MOVEMENT.accuracy.stillBelow, q, DT);
    expect(c.coverRest).toBeCloseTo(1, 6);
    c.aiming = false;
    const casts = q.casts;
    for (let i = 0; i < Math.round(R.releaseTime / DT); i++) stepCoverRest(c, BODY, R, MOVEMENT.accuracy.stillBelow, q, DT);
    expect(c.coverRest).toBeCloseTo(0, 6);
    expect(q.casts).toBe(casts);
  });

  it('steadies the spread by rest.spread once settled, on top of stance and aim', () => {
    const c = ready();
    c.aimRaise = 1;
    const aimed = targetSpreadScale(c, MOVEMENT);
    c.coverRest = 1;
    expect(targetSpreadScale(c, MOVEMENT)).toBeCloseTo(aimed * R.spread, 9);
    c.coverRest = 0.5;
    expect(targetSpreadScale(c, MOVEMENT)).toBeCloseTo(aimed * (1 + (R.spread - 1) * 0.5), 9);
  });
});

describe('resting on cover in the simulation (M104)', () => {
  /** A flat floor at y = 0 the mover keeps everyone on; the level (for rays) is the floor and `blocks`. */
  const floor: CharacterMover = {
    move(c, d, out) {
      out.x = d.x;
      out.z = d.z;
      const y = c.position.y + d.y;
      out.y = y <= 0 ? -c.position.y : d.y;
      return y <= 0;
    },
    probeGround(c, maxDrop) {
      return c.position.y <= maxDrop ? -c.position.y : Number.NaN;
    },
  };
  const DEAD_ZONES = [[{ position: vec3(-8, 0, 8), yaw: 0 }], [{ position: vec3(8, 0, 8), yaw: 0 }]];

  /** The player (character 0) at the origin facing -Z, a 1.2 m crate 0.45 m ahead, `cmd` its command. */
  function scene(blocks: readonly MapBlock[] = [standing(0.45, 1.2)]) {
    const state = createGameState(5, 64, ROUNDS);
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    state.characters.push(c);
    state.round.phase = 'live';
    const ctx = createSimContext({ mover: floor, query: levelQuery(blocks), movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEAD_ZONES, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
    const cmd = createCommand();
    const commands = new Map<number, PlayerCommand>([[0, cmd]]);
    const run = (ticks: number) => {
      for (let i = 0; i < ticks; i++) stepSimulation(state, commands, ctx, DT);
    };
    return { state, c, cmd, run };
  }

  it("rests the player's replica on the crate while aiming, steadier and with half the kick", () => {
    const rest = scene();
    const open = scene([]);
    for (const s of [rest, open]) {
      s.cmd.aim = true;
      s.run(30);
    }
    expect(rest.c.coverRest).toBe(1);
    expect(open.c.coverRest).toBe(0);
    expect(rest.c.spreadScale).toBeCloseTo(open.c.spreadScale * R.spread, 6);
    // One shot each: the kick is the replica's, halved on the rest.
    for (const s of [rest, open]) {
      s.cmd.fire = true;
      s.run(1);
    }
    expect(open.c.armament.recoil).toBeCloseTo(AEG.recoilDeg * DEG, 9);
    expect(rest.c.armament.recoil).toBeCloseTo(AEG.recoilDeg * R.kick * DEG, 9);
  });

  it('comes off the cover as soon as the player moves, lets go of the aim or reloads, and settles again after', () => {
    const s = scene();
    s.cmd.aim = true;
    s.run(30);
    s.cmd.right = 1;
    s.run(Math.round(R.releaseTime / DT) + 1);
    expect(s.c.coverRest).toBe(0);
    s.cmd.right = 0;
    s.run(60);
    expect(s.c.coverRest).toBe(1);
    s.cmd.aim = false;
    s.run(Math.round(R.releaseTime / DT) + 1);
    expect(s.c.coverRest).toBe(0);
    s.cmd.aim = true;
    s.run(60);
    expect(s.c.coverRest).toBe(1);
    s.c.armament.ammo[s.c.armament.active]!.mag = 0;
    s.cmd.reload = true;
    s.run(1);
    s.cmd.reload = false;
    s.run(Math.round(R.releaseTime / DT) + 1);
    expect(s.c.armament.reload).toBeGreaterThan(0);
    expect(s.c.coverRest).toBe(0);
  });

  it('rests crouched at a waist-high wall, where standing it would not', () => {
    const s = scene([standing(0.45, 0.85, 0.3, 3)]);
    s.cmd.aim = true;
    s.run(30);
    expect(s.c.coverRest).toBe(0);
    s.cmd.crouch = true;
    s.run(30);
    expect(eyeHeight(s.c.crouchAmount, BODY)).toBeCloseTo(CROUCH_EYE, 6);
    expect(s.c.coverRest).toBe(1);
  });

  it('never rests someone who is out, and starts each round off the cover', () => {
    const s = scene();
    s.cmd.aim = true;
    s.run(30);
    expect(s.c.coverRest).toBe(1);
    s.c.status = 'calling';
    s.run(1);
    expect(s.c.coverRest).toBe(0);
    const next = scene();
    next.cmd.aim = true;
    next.run(30);
    respawnCharacter(next.c);
    expect(next.c.coverRest).toBe(0);
  });

  it('is a bot rule too, but a bot never aims down sights, so it never rests (bots fire from the hip)', () => {
    const s = scene();
    s.cmd.aim = false; // what botBrain sends
    s.cmd.fire = true;
    s.run(60);
    expect(s.c.coverRest).toBe(0);
  });
});
