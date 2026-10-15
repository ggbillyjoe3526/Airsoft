import { describe, expect, it } from 'vitest';
import { FOOTSTEPS } from '../config/footsteps';
import { MOVEMENT } from '../config/movement';
import { NOISE } from '../config/noise';
import type { FloorSurface } from '../config/sounds';
import { fitParts, type WorldQuery } from './armament';
import { type Character, createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import type { GameEvent } from './events';
import { stepFootsteps } from './footsteps';
import { type CharacterMover, createMovementScratch, stepMovement } from './movement';
import { createPropNoiseContext, noisyPropsOf, ringProp, stepPropBump } from './propNoise';
import { LOADOUT } from '../config/replicas';
import { copy, vec3 } from './vec';

/**
 * NP1 gaps: which footsteps carry their ground (AC4), and that nothing is allocated or pushed while nothing sounds (AC6).
 */

const DT = 1 / 60;
const scratch = createMovementScratch();
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
/** A world whose ground is gravel wherever you stand; `calls` counts the questions. */
function gravel(): WorldQuery & { calls: number } {
  const q = { calls: 0, raycastStatic: () => -1, surfaceUnder: (): FloorSurface => (q.calls++, 'gravel') };
  return q;
}

function run(c: Character, cmd: PlayerCommand, seconds: number, query?: WorldQuery): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    copy(c.prevPosition, c.position);
    stepMovement(c, cmd, MOVEMENT, DT, floor, scratch);
    stepFootsteps(c, FOOTSTEPS, events, query);
  }
  return events;
}
const moving = (setup: (cmd: PlayerCommand) => void = () => {}): PlayerCommand => {
  const cmd = createCommand();
  cmd.forward = 1;
  setup(cmd);
  return cmd;
};
const footsteps = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'footstep' }> => e.type === 'footstep');

describe('a footstep carries its ground only when it is a run, sprint or landing (NP1 AC4)', () => {
  it('names the ground on a run and on a sprint', () => {
    for (const [setup, kind] of [[(cmd: PlayerCommand) => void cmd, 'run'], [(cmd: PlayerCommand) => (cmd.sprint = true), 'sprint']] as const) {
      const c = createCharacter(0, vec3(), 0);
      run(c, createCommand(), 0.5, gravel());
      const steps = footsteps(run(c, moving(setup), 3, gravel()));
      expect(steps.length, kind).toBeGreaterThan(1);
      for (const s of steps) {
        expect(s.kind).toBe(kind);
        expect(s.surface, kind).toBe('gravel');
      }
    }
  });

  it('names the ground on a landing', () => {
    const c = createCharacter(0, vec3(0, 0.05, 0), 0);
    const q = gravel();
    run(c, createCommand(), 0.5, q);
    const jump = createCommand();
    jump.jump = true;
    const events = run(c, jump, DT, q);
    jump.jump = false;
    events.push(...run(c, jump, 1.5, q));
    expect(footsteps(events).map((e) => [e.kind, e.surface])).toEqual([['land', 'gravel']]);
  });

  it("names no ground on a hi-cap's rattle, even asked while running quiet, and the world is not asked for it", () => {
    const q = gravel();
    for (const setup of [(cmd: PlayerCommand) => (cmd.walk = true), (cmd: PlayerCommand) => (cmd.crouch = true)]) {
      const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
      fitParts(c.armament, [{ grip: 'none', magazine: 'hiCap' }]);
      run(c, createCommand(), 0.5, q);
      const steps = footsteps(run(c, moving(setup), 3, q));
      expect(steps.length).toBeGreaterThan(1);
      for (const s of steps) {
        expect(s.kind).toBe('rattle');
        expect(s.surface).toBeUndefined();
      }
    }
    expect(q.calls).toBe(0);
  });

  it('walking and crouching on gravel make no footstep at all', () => {
    for (const setup of [(cmd: PlayerCommand) => (cmd.walk = true), (cmd: PlayerCommand) => (cmd.crouch = true)]) {
      const c = createCharacter(0, vec3(), 0);
      run(c, createCommand(), 0.5, gravel());
      expect(run(c, moving(setup), 3, gravel())).toEqual([]);
    }
  });

  it('leaves the ground unnamed in a world that cannot tell (no surfaceUnder), run, sprint and landing alike', () => {
    const bare: WorldQuery = { raycastStatic: () => -1 };
    for (const query of [bare, undefined]) {
      const c = createCharacter(0, vec3(0, 0.05, 0), 0);
      run(c, createCommand(), 0.5, query);
      const jump = createCommand();
      jump.jump = true;
      const events = run(c, jump, DT, query);
      jump.jump = false;
      events.push(...run(c, jump, 1.5, query));
      events.push(...run(c, moving(), 2, query), ...run(c, moving((cmd) => (cmd.sprint = true)), 2, query));
      const steps = footsteps(events);
      expect(new Set(steps.map((s) => s.kind))).toEqual(new Set(['land', 'run', 'sprint']));
      for (const s of steps) expect(s.surface, s.kind).toBeUndefined();
      // The key is present-or-undefined, never a made-up default such as concrete.
      expect(steps.some((s) => s.surface === ('concrete' as FloorSurface))).toBe(false);
    }
  });

  it('asks the world where the feet are, once per step', () => {
    const c = createCharacter(0, vec3(), 0);
    const q = gravel();
    run(c, createCommand(), 0.5, q);
    const steps = footsteps(run(c, moving(), 3, q));
    expect(q.calls).toBe(steps.length);
  });
});

describe('nothing is made while nothing sounds (NP1 AC6)', () => {
  const props = noisyPropsOf([{ kind: 'crate', center: vec3(0, 0.6, -3), size: vec3(1.2, 1.2, 1.2) }], NOISE.props);

  it('a bump with no block, a walk, or no props pushes no event and leaves propQuiet as it was', () => {
    const ctx = createPropNoiseContext(NOISE, props);
    const quiet = ctx.quiet;
    const before = [...quiet];
    const c = createCharacter(0, vec3(0, 0, -2.5), 0);
    const intent = vec3(0, 0, -MOVEMENT.runSpeed * DT);
    for (let i = 0; i < 600; i++) {
      stepPropBump(c, intent, intent, DT, 0.3, 1.7, ctx); // nothing lost: no block
      stepPropBump(c, intent, vec3(0, 0, 0), DT, 0.3, 1.7, createPropNoiseContext(NOISE, [])); // blocked, but no props
      ringProp(vec3(5, 5, 5), 100, 0, ctx); // far from the crate
      ringProp(vec3(0, 0.6, -3), 5, 0, ctx); // on it, but too slow
      ringProp(vec3(0, 0.6, -3), 100, 0, ctx); // fast, but a crate does not ring
    }
    expect(ctx.events).toEqual([]);
    expect(ctx.quiet).toBe(quiet);
    expect(ctx.quiet).toEqual(before);
  });

  it('when something does sound, it is one event and a stamped slot, and the same blow within the quiet adds nothing', () => {
    const ctx = createPropNoiseContext(NOISE, props);
    const c = createCharacter(0, vec3(0, 0, -2.08), 0);
    const want = vec3(0, 0, -MOVEMENT.runSpeed * DT);
    const got = vec3(0, 0, -0.001);
    stepPropBump(c, want, got, DT, 0.3, 1.7, ctx);
    stepPropBump(c, want, got, DT, 0.3, 1.7, ctx);
    expect(ctx.events).toHaveLength(1);
    ctx.time += NOISE.quiet + 0.01;
    stepPropBump(c, want, got, DT, 0.3, 1.7, ctx);
    expect(ctx.events).toHaveLength(2);
  });
});
