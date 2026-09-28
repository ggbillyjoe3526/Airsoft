import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import type { CharacterMover } from './movement';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { vec3 } from './vec';

const DT = 1 / 60;
const KILL_Y = -10;

const floor: CharacterMover = {
  move(c, d, out) {
    out.x = d.x;
    out.z = d.z;
    const y = c.position.y + d.y;
    out.y = y <= 0 ? -c.position.y : d.y;
    return y <= 0;
  },
};

describe('stepSimulation', () => {
  it('routes commands by character id, not array order', () => {
    const state = createGameState(1);
    const a = createCharacter(7, vec3(), 0);
    const b = createCharacter(3, vec3(10, 0, 0), 0);
    state.characters.push(a, b);
    const moveB = createCommand();
    moveB.forward = 1;
    const commands = new Map<number, PlayerCommand>([[3, moveB]]);
    const ctx = createSimContext(floor, MOVEMENT, KILL_Y);

    for (let i = 0; i < 30; i++) stepSimulation(state, commands, ctx, DT);

    expect(b.position.z).toBeLessThan(-1);
    expect(a.position.z).toBe(0);
    expect(state.tick).toBe(30);
    expect(state.time).toBeCloseTo(0.5, 9);
  });

  it('lets characters without a command settle under gravity and keep their view', () => {
    const state = createGameState(1);
    const c = createCharacter(0, vec3(0, 1, 0), 1.25);
    state.characters.push(c);
    const ctx = createSimContext(floor, MOVEMENT, KILL_Y);
    for (let i = 0; i < 60; i++) stepSimulation(state, new Map(), ctx, DT);
    expect(c.position.y).toBe(0);
    expect(c.grounded).toBe(true);
    expect(c.yaw).toBe(1.25);
  });

  it('returns a character that falls below killY to its spawn without momentum', () => {
    const state = createGameState(1);
    const c = createCharacter(0, vec3(2, 0, 3), 0);
    state.characters.push(c);
    const noFloor: CharacterMover = {
      move(_c, d, out) {
        out.x = d.x;
        out.y = d.y;
        out.z = d.z;
        return false;
      },
    };
    const ctx = createSimContext(noFloor, MOVEMENT, -5);
    let rescued = false;
    for (let i = 0; i < 120 && !rescued; i++) {
      stepSimulation(state, new Map(), ctx, DT);
      rescued = c.position.y === 0 && state.tick > 1;
    }
    expect(rescued).toBe(true);
    expect(c.position).toEqual({ x: 2, y: 0, z: 3 });
    expect(c.prevPosition).toEqual({ x: 2, y: 0, z: 3 });
    expect(c.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('records the previous position for interpolation', () => {
    const state = createGameState(1);
    const c = createCharacter(0, vec3(), 0);
    state.characters.push(c);
    const cmd = createCommand();
    cmd.forward = 1;
    const ctx = createSimContext(floor, MOVEMENT, KILL_Y);
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    const before = { ...c.position };
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(c.prevPosition).toEqual(before);
    expect(c.position.z).toBeLessThan(before.z);
  });

  it('records the previous crouch amount so the eye height can be interpolated', () => {
    const state = createGameState(1);
    const c = createCharacter(0, vec3(), 0);
    state.characters.push(c);
    const cmd = createCommand();
    cmd.crouch = true;
    const ctx = createSimContext(floor, MOVEMENT, KILL_Y);
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    const after1 = c.crouchAmount;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(c.prevCrouchAmount).toBe(after1);
    expect(c.crouchAmount).toBeGreaterThan(after1);
  });
});
