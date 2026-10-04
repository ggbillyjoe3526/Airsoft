import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { stepAiming } from './aiming';
import { fitOptics } from './armament';
import { createCharacter, respawnCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { eliminate } from './elimination';
import type { CharacterMover } from './movement';
import { createSimContext, type SimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { OPEN_NAV, openFieldElimination } from './testSupport';
import { vec3 } from './vec';

const DT = 1 / 60;
const RIFLE = LOADOUT.findIndex((r) => r.look.aimHold !== undefined);
const PISTOL = LOADOUT.findIndex((r) => r.look.aimHold === undefined);

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

const DEAD_ZONES = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]];

function testContext(): SimContext {
  return createSimContext({ mover: floor, query: { raycastStatic: () => -1 }, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: -10, hits: HITS, deadZones: DEAD_ZONES, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
}

function aimCommand(): PlayerCommand {
  const cmd = createCommand();
  cmd.aim = true;
  return cmd;
}

describe('fitting an optic', () => {
  it('goes only on replicas with a mount for one, and stays on between rounds', () => {
    expect(RIFLE).toBeGreaterThanOrEqual(0);
    expect(PISTOL).toBeGreaterThanOrEqual(0);
    const c = createCharacter(0, vec3(), 0);
    expect(c.armament.optics.every((o) => o === null)).toBe(true); // bare replicas by default
    fitOptics(c.armament, ['redDot', null]);
    expect(c.armament.optics[RIFLE]).toBe('redDot');
    expect(c.armament.optics[PISTOL]).toBeNull();
    respawnCharacter(c);
    expect(c.armament.optics[RIFLE]).toBe('redDot');
    fitOptics(c.armament, [null, null]);
    expect(c.armament.optics[RIFLE]).toBeNull();
  });
});

describe('aiming down sights (owner, 2026-10-03)', () => {
  it('works only with an optic fitted to the replica in hand', () => {
    const c = createCharacter(0, vec3(), 0);
    const cmd = aimCommand();
    stepAiming(c, cmd);
    expect(c.aiming).toBe(false); // iron sights only: no aiming down sights
    fitOptics(c.armament, ['redDot', null]);
    stepAiming(c, cmd);
    expect(c.aiming).toBe(true);
    c.armament.active = PISTOL;
    stepAiming(c, cmd);
    expect(c.aiming).toBe(false);
    c.armament.active = RIFLE;
    stepAiming(c, createCommand());
    expect(c.aiming).toBe(false); // button released
  });

  it('drops the sight while reloading or bringing the replica up', () => {
    const c = createCharacter(0, vec3(), 0);
    fitOptics(c.armament, ['redDot', null]);
    c.armament.reload = 1;
    stepAiming(c, aimCommand());
    expect(c.aiming).toBe(false);
    c.armament.reload = 0;
    c.armament.draw = 0.2;
    stepAiming(c, aimCommand());
    expect(c.aiming).toBe(false);
  });

  it('slows you to walking pace, quietly, even with sprint held, and an optic-less aim changes nothing', () => {
    const run = (optic: boolean) => {
      const state = createGameState(1, 16, ROUNDS);
      const c = createCharacter(0, vec3(), 0);
      if (optic) fitOptics(c.armament, ['redDot', null]);
      state.characters.push(c);
      const cmd = aimCommand();
      cmd.forward = 1;
      cmd.sprint = true;
      const ctx = testContext();
      const commands = new Map([[0, cmd]]);
      let footsteps = 0;
      for (let i = 0; i < 90; i++) {
        stepSimulation(state, commands, ctx, DT);
        footsteps += state.events.filter((e) => e.type === 'footstep').length;
      }
      return { c, footsteps, speed: Math.hypot(c.velocity.x, c.velocity.z) };
    };
    const aimed = run(true);
    expect(aimed.c.aiming).toBe(true);
    expect(aimed.c.sprinting).toBe(false);
    expect(aimed.c.walking).toBe(true);
    expect(aimed.speed).toBeCloseTo(MOVEMENT.walkSpeed, 3);
    expect(aimed.footsteps).toBe(0);
    const bare = run(false);
    expect(bare.c.aiming).toBe(false);
    expect(bare.c.sprinting).toBe(true);
    expect(bare.speed).toBeCloseTo(MOVEMENT.sprintSpeed, 3);
  });

  it('gives no accuracy bonus of its own: standing still stays the accuracy rule', () => {
    const state = createGameState(1, 16, ROUNDS);
    const aimer = createCharacter(0, vec3(), 0);
    const hip = createCharacter(1, vec3(5, 0, 0), 0);
    fitOptics(aimer.armament, ['redDot', null]);
    state.characters.push(aimer, hip);
    const ctx = testContext();
    const commands = new Map([
      [0, aimCommand()],
      [1, createCommand()],
    ]);
    for (let i = 0; i < 60; i++) stepSimulation(state, commands, ctx, DT);
    expect(aimer.aiming).toBe(true);
    expect(aimer.spreadScale).toBeCloseTo(hip.spreadScale, 9);
  });

  it('stops once you are hit', () => {
    const c = createCharacter(0, vec3(), 0);
    fitOptics(c.armament, ['redDot', null]);
    c.aiming = true;
    const state = createGameState(1, 16, ROUNDS);
    state.characters.push(c);
    eliminate(c, 5, state.characters, openFieldElimination(DEAD_ZONES));
    const ctx = testContext();
    stepSimulation(state, new Map([[0, aimCommand()]]), ctx, DT);
    expect(c.aiming).toBe(false);
  });
});
