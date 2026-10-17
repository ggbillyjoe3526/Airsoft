import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOT_BEHAVIOUR, BOT_SKILL } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { type Bot, type BotWorld, createBot } from '../ai/bot';
import { holsterBot } from '../ai/botHolster';
import { createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { OPEN_NAV } from './testSupport';
import type { WorldQuery } from './armament';
import { vec3, type Vec3 } from './vec';

/**
 * MV1 (acceptance 3 and 6): nothing rests on cover, for the player or a bot, and a bot's commands move it by the same
 * holster rules as the player's. Driven through stepSimulation.
 */

const DT = 1 / 60;
const floor: CharacterMover = {
  move(c, d, out) {
    out.x = d.x;
    out.z = d.z;
    const y = c.position.y + d.y;
    out.y = y <= 0 ? -c.position.y : d.y;
    return y <= 0;
  },
  probeGround: (c, maxDrop) => (c.position.y <= maxDrop ? -c.position.y : Number.NaN),
};

/** A crate-high ledge (top 1.0 m, 0.5 m thick) 0.4 m ahead on each side of the origin, wide enough to cover any aim. */
const BOXES = [
  { min: vec3(-3, 0, 0.4), max: vec3(3, 1.0, 0.9) },
  { min: vec3(-3, 0, -0.9), max: vec3(3, 1.0, -0.4) },
  { min: vec3(0.4, 0, -3), max: vec3(0.9, 1.0, 3) },
  { min: vec3(-0.9, 0, -3), max: vec3(-0.4, 1.0, 3) },
];
function slab(o: Vec3, d: Vec3, maxDist: number): number {
  let best = -1;
  for (const b of BOXES) {
    let t0 = 0;
    let t1 = maxDist;
    for (const ax of ['x', 'y', 'z'] as const) {
      if (Math.abs(d[ax]) < 1e-9) {
        if (o[ax] < b.min[ax] || o[ax] > b.max[ax]) t1 = -1;
        continue;
      }
      const a = (b.min[ax] - o[ax]) / d[ax];
      const c = (b.max[ax] - o[ax]) / d[ax];
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
    }
    if (t1 >= t0 && (best < 0 || t0 < best)) best = t0;
  }
  return best;
}

function world(query: WorldQuery) {
  const ctx = createSimContext({ mover: floor, query, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]], rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
  const state = createGameState(3, BALLISTICS.maxBBs, ROUNDS);
  state.round.phase = 'live';
  const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
  state.characters.push(c);
  const tick = (act: (cmd: PlayerCommand) => void = () => {}): void => {
    const cmd = createCommand();
    act(cmd);
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
  };
  const run = (n: number, act?: (cmd: PlayerCommand) => void): void => {
    for (let i = 0; i < n; i++) tick(act);
  };
  return { state, c, tick, run };
}

const OPEN: WorldQuery = { raycastStatic: () => -1 };
const LEDGE: WorldQuery = { raycastStatic: slab };

describe('no resting on cover (acceptance 3)', () => {
  it('the ledge ray test is real: it meets the crate ahead', () => {
    expect(slab(vec3(0, 1.6, 0), vec3(0, 0, 1), 5)).toBe(-1); // the sight line clears a crate-high top
    const d = Math.hypot(0.5, 0.6);
    expect(slab(vec3(0, 1.6, 0), vec3(0, -0.6 / d, 0.5 / d), 5)).toBeGreaterThan(0); // a ray down at the top meets it
    expect(slab(vec3(0, 0.5, 0), vec3(0, 0, 1), 5)).toBeCloseTo(0.4, 6);
  });

  it('a character has no coverRest and the movement config no rest', () => {
    expect('coverRest' in createCharacter(0, vec3(), 0, LOADOUT, 0)).toBe(false);
    expect('rest' in MOVEMENT).toBe(false);
  });

  for (const [name, crouch] of [['standing', false], ['crouched', true]] as const) {
    it(`aiming still ${name} at a ledge gives the same spread as in the open`, () => {
      const open = world(OPEN);
      const ledge = world(LEDGE);
      const act = (k: PlayerCommand): void => {
        k.aim = true;
        k.crouch = crouch;
      };
      open.run(120, act);
      ledge.run(120, act);
      expect(ledge.c.spreadScale).toBeCloseTo(open.c.spreadScale, 12);
      // Steadier only by the still, aimed and crouched factors: nothing of a ledge in it.
      const A = MOVEMENT.accuracy;
      expect(ledge.c.spreadScale).toBeCloseTo(A.steady * A.aimed * (crouch ? A.crouched : 1), 6);
    });

    it(`a burst fired ${name} at a ledge kicks and spreads exactly as in the open`, () => {
      const open = world(OPEN);
      const ledge = world(LEDGE);
      const act = (k: PlayerCommand): void => {
        k.aim = true;
        k.crouch = crouch;
        k.fire = true;
      };
      open.run(90, act);
      ledge.run(90, act);
      expect(ledge.c.spreadScale).toBeCloseTo(open.c.spreadScale, 12);
      expect(ledge.c.pitch).toBeCloseTo(open.c.pitch, 12);
      expect(ledge.c.yaw).toBeCloseTo(open.c.yaw, 12);
      expect(ledge.state.events.length).toBe(open.state.events.length);
    });
  }

  it('Shift walking costs no spread over standing still before it steadies (walk is 1.0)', () => {
    expect(MOVEMENT.accuracy.walk).toBe(1);
    const w = world(OPEN);
    w.run(10, (k) => {
      k.forward = 1;
      k.walk = true;
    });
    expect(w.c.spreadScale).toBeCloseTo(1, 6);
  });
});

describe('a bot moves by the same holster rules, through its command (acceptance 1, 6)', () => {

  it('holstered by holsterBot after a calm sprint: it then runs at holsterRunSpeed, sprints at sprintSpeed, never faster', () => {
    const w = world(OPEN);
    const bot: Bot = createBot(w.c, 1, BOT_BEHAVIOUR, BOT_SKILL.normal);
    const bw = { cfg: BOT_BEHAVIOUR, live: true, time: 100, inEnemyHalf: () => false } as unknown as BotWorld & { time: number };
    const speed = (): number => Math.hypot(w.c.velocity.x, w.c.velocity.z);
    let peak = 0;
    const botTick = (sprint: boolean): void => {
      w.tick((cmd) => {
        cmd.forward = 1;
        cmd.sprint = sprint;
        cmd.switchTo = 0;
        bw.time += DT;
        holsterBot(bot, bw, cmd, DT);
      });
      peak = Math.max(peak, speed());
    };
    for (let i = 0; i < Math.ceil((BOT_BEHAVIOUR.holsterAfter + 0.5) / DT); i++) botTick(true);
    expect(w.c.armament.holstered).toBe(true);
    expect(speed()).toBeCloseTo(MOVEMENT.sprintSpeed, 3);
    // Easing off the sprint (but not for long enough to draw): the holstered run, faster than the armed one.
    for (let i = 0; i < 20; i++) botTick(false);
    expect(w.c.armament.holstered).toBe(true);
    expect(speed()).toBeCloseTo(MOVEMENT.holsterRunSpeed, 3);
    expect(speed()).toBeGreaterThan(MOVEMENT.runSpeed);
    expect(peak).toBeLessThanOrEqual(MOVEMENT.sprintSpeed + 1e-6);
    // Drawn again by its own rule (a long walk without sprinting): back to the armed run.
    for (let i = 0; i < Math.ceil((BOT_BEHAVIOUR.holsterDrawAfter + 1.5) / DT); i++) botTick(false);
    expect(w.c.armament.holstered).toBe(false);
    expect(speed()).toBeCloseTo(MOVEMENT.runSpeed, 3);
  });

  it('the player at the same state moves identically: same speed holstered, same ordering against the sprint', () => {
    const w = world(OPEN);
    w.tick((k) => (k.holster = true));
    w.run(60, (k) => (k.forward = 1));
    const run = Math.hypot(w.c.velocity.x, w.c.velocity.z);
    w.run(60, (k) => {
      k.forward = 1;
      k.sprint = true;
    });
    const sprint = Math.hypot(w.c.velocity.x, w.c.velocity.z);
    expect(run).toBeCloseTo(MOVEMENT.holsterRunSpeed, 3);
    expect(sprint).toBeCloseTo(MOVEMENT.sprintSpeed, 3);
    expect(run).toBeLessThan(sprint);
  });
});
