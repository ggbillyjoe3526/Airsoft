import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { AIMING, OPTICS } from '../config/optics';
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

describe('aiming down sights (owner, 2026-10-06: every replica, M84)', () => {
  it('works on every replica: down its iron sights with no optic fitted, or through the optic', () => {
    for (const r of LOADOUT) expect(r.look.ironSight, r.id).toBeDefined();
    const c = createCharacter(0, vec3(), 0);
    const cmd = aimCommand();
    stepAiming(c, cmd, DT);
    expect(c.aiming).toBe(true); // the rifle's iron sights
    c.armament.active = PISTOL;
    stepAiming(c, cmd, DT);
    expect(c.aiming).toBe(true); // the pistol's
    c.armament.active = RIFLE;
    fitOptics(c.armament, ['redDot', null]);
    stepAiming(c, cmd, DT);
    expect(c.aiming).toBe(true);
    stepAiming(c, createCommand(), DT);
    expect(c.aiming).toBe(false); // button released
  });

  it('drops the sight while reloading or bringing the replica up', () => {
    const c = createCharacter(0, vec3(), 0);
    c.armament.reload = 1;
    stepAiming(c, aimCommand(), DT);
    expect(c.aiming).toBe(false);
    c.armament.reload = 0;
    c.armament.draw = 0.2;
    stepAiming(c, aimCommand(), DT);
    expect(c.aiming).toBe(false);
  });

  it('raises the sight over the raise time, a scope slower, and lowers it again', () => {
    const c = createCharacter(0, vec3(), 0);
    const ticks = (until: () => boolean, cmd: PlayerCommand) => {
      let n = 0;
      while (!until() && n < 600) {
        stepAiming(c, cmd, DT);
        n++;
      }
      return n * DT;
    };
    expect(ticks(() => c.aimRaise >= 1, aimCommand())).toBeCloseTo(AIMING.raiseTime, 1);
    expect(ticks(() => c.aimRaise <= 0, createCommand())).toBeCloseTo(AIMING.raiseTime, 1);
    fitOptics(c.armament, ['scope2x', null]);
    expect(ticks(() => c.aimRaise >= 1, aimCommand())).toBeCloseTo(AIMING.raiseTime * OPTICS.scope2x.raiseScale, 1);
  });

  /** You, holding `cmd` for 1.5 s on an open floor (an optic on the rifle if `optic`): your pace, footsteps and stance. */
  const walkFor = (cmd: PlayerCommand, optic = false) => {
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(), 0);
    if (optic) fitOptics(c.armament, ['redDot', null]);
    state.characters.push(c);
    const ctx = testContext();
    const commands = new Map([[0, cmd]]);
    let footsteps = 0;
    for (let i = 0; i < 90; i++) {
      stepSimulation(state, commands, ctx, DT);
      footsteps += state.events.filter((e) => e.type === 'footstep').length;
    }
    return { c, footsteps, speed: Math.hypot(c.velocity.x, c.velocity.z) };
  };

  it('slows you to walking pace, quietly, even with sprint held, iron sights or optic', () => {
    for (const optic of [false, true]) {
      const cmd = aimCommand();
      cmd.forward = 1;
      cmd.sprint = true;
      const aimed = walkFor(cmd, optic);
      expect(aimed.c.aiming).toBe(true);
      expect(aimed.c.sprinting).toBe(false);
      expect(aimed.c.walking).toBe(true);
      expect(aimed.speed).toBeCloseTo(MOVEMENT.walkSpeed, 3);
      expect(aimed.footsteps).toBe(0);
    }
  });

  it('slows you below the aiming pace while walk (Shift) is held too, standing and crouched (owner\'s note 8)', () => {
    for (const crouch of [false, true]) {
      const aim = aimCommand();
      aim.forward = 1;
      aim.crouch = crouch;
      const creep = aimCommand();
      creep.forward = 1;
      creep.crouch = crouch;
      creep.walk = true;
      const aimed = walkFor(aim).speed;
      const slow = walkFor(creep);
      expect(slow.speed, `crouched ${crouch}`).toBeCloseTo(aimed * MOVEMENT.aimWalkScale, 3);
      expect(slow.speed).toBeLessThan(aimed - 0.5);
      expect(slow.footsteps).toBe(0);
    }
    // Walk without aiming is the plain walk, as before.
    const walk = createCommand();
    walk.forward = 1;
    walk.walk = true;
    expect(walkFor(walk).speed).toBeCloseTo(MOVEMENT.walkSpeed, 3);
  });

  it('tightens the aim as the sight comes up; from the hip it stays as it was', () => {
    const state = createGameState(1, 16, ROUNDS);
    const aimer = createCharacter(0, vec3(), 0);
    const hip = createCharacter(1, vec3(5, 0, 0), 0);
    state.characters.push(aimer, hip);
    const ctx = testContext();
    const commands = new Map([
      [0, aimCommand()],
      [1, createCommand()],
    ]);
    stepSimulation(state, commands, ctx, DT);
    // Part way up, part of the bonus.
    expect(aimer.spreadScale).toBeLessThan(hip.spreadScale);
    expect(aimer.spreadScale).toBeGreaterThan(hip.spreadScale * MOVEMENT.accuracy.aimed);
    for (let i = 0; i < 60; i++) stepSimulation(state, commands, ctx, DT);
    expect(aimer.aimRaise).toBe(1);
    expect(aimer.spreadScale).toBeCloseTo(hip.spreadScale * MOVEMENT.accuracy.aimed, 6);
    expect(hip.spreadScale).toBeCloseTo(MOVEMENT.accuracy.steady, 6); // the hip's own rule, unchanged
  });

  it('stops once you are hit', () => {
    const c = createCharacter(0, vec3(), 0);
    c.aiming = true;
    c.aimRaise = 1;
    const state = createGameState(1, 16, ROUNDS);
    state.characters.push(c);
    eliminate(c, 5, state.characters, openFieldElimination(DEAD_ZONES));
    const ctx = testContext();
    stepSimulation(state, new Map([[0, aimCommand()]]), ctx, DT);
    expect(c.aiming).toBe(false);
    expect(c.aimRaise).toBe(0);
  });
});
