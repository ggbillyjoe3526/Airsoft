import { describe, expect, it } from 'vitest';
import { FOOTSTEPS } from '../config/footsteps';
import { MOVEMENT } from '../config/movement';
import { type Character, createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import type { GameEvent } from './events';
import { stepFootsteps } from './footsteps';
import { type CharacterMover, createMovementScratch, stepMovement } from './movement';
import { copy, vec3 } from './vec';

const DT = 1 / 60;
const scratch = createMovementScratch();

/** Endless flat floor at y = 0. */
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

/** Moves `c` for `seconds` (as the simulation does: remember the last position, move, then footsteps). */
function run(c: Character, cmd: PlayerCommand, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    copy(c.prevPosition, c.position);
    stepMovement(c, cmd, MOVEMENT, DT, floor, scratch);
    stepFootsteps(c, FOOTSTEPS, events);
  }
  return events;
}

function moving(setup: (cmd: PlayerCommand) => void = () => {}): PlayerCommand {
  const cmd = createCommand();
  cmd.forward = 1;
  setup(cmd);
  return cmd;
}

const kinds = (events: GameEvent[]) => events.map((e) => (e.type === 'footstep' ? e.kind : e.type));

describe('footsteps', () => {
  it('a runner steps once per stride', () => {
    const c = createCharacter(0, vec3(), 0);
    run(c, createCommand(), 0.5); // settle on the floor
    const events = run(c, moving(), 4);
    const expected = (MOVEMENT.runSpeed * 4) / FOOTSTEPS.strideRun;
    expect(kinds(events).every((k) => k === 'run')).toBe(true);
    expect(events.length).toBeGreaterThan(expected - 2);
    expect(events.length).toBeLessThanOrEqual(expected);
    for (const e of events) expect(e.type === 'footstep' && e.characterId).toBe(0);
  });

  it('a sprinter steps as "sprint", with longer strides', () => {
    const c = createCharacter(0, vec3(), 0);
    run(c, createCommand(), 0.5);
    const events = run(c, moving((cmd) => (cmd.sprint = true)), 4);
    expect(kinds(events).every((k) => k === 'sprint')).toBe(true);
    expect(events.length).toBeLessThanOrEqual((MOVEMENT.sprintSpeed * 4) / FOOTSTEPS.strideSprint);
  });

  it('walking, moving crouched and standing still are silent', () => {
    for (const setup of [(cmd: PlayerCommand) => (cmd.walk = true), (cmd: PlayerCommand) => (cmd.crouch = true)]) {
      const c = createCharacter(0, vec3(), 0);
      run(c, createCommand(), 0.5);
      expect(run(c, moving(setup), 4)).toEqual([]);
    }
    const still = createCharacter(0, vec3(), 0);
    expect(run(still, createCommand(), 4)).toEqual([]);
  });

  it('landing a jump thuds once; spawning onto the floor does not', () => {
    const c = createCharacter(0, vec3(0, 0.05, 0), 0);
    expect(run(c, createCommand(), 0.5)).toEqual([]);
    const jump = createCommand();
    jump.jump = true;
    const events = run(c, jump, DT);
    jump.jump = false;
    events.push(...run(c, jump, 1.5));
    expect(kinds(events)).toEqual(['land']);
  });

  it('keeps stride progress across silent stretches rather than stepping straight away', () => {
    const c = createCharacter(0, vec3(), 0);
    run(c, createCommand(), 0.5);
    const first = run(c, moving(), 1);
    const walked = run(c, moving((cmd) => (cmd.walk = true)), 1);
    expect(first.length).toBeGreaterThan(0);
    expect(walked).toEqual([]);
    expect(c.stepDistance).toBeLessThan(FOOTSTEPS.strideRun);
  });
});
