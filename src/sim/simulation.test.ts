import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { BODY, MOVEMENT } from '../config/movement';
import { HITS, ROUNDS } from '../config/hits';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { RANGE } from '../config/range';
import { createCharacter, eyeHeight } from './character';
import { createCommand, type PlayerCommand } from './commands';
import type { CharacterMover } from './movement';
import { createSimContext, type SimContext, stepSimulation } from './simulation';
import type { GameEvent } from './events';
import { spawnBB } from './ballistics';
import { eliminate } from './elimination';
import { createRangeTargets } from './rangeTargets';
import { createGameState } from './state';
import { OPEN_NAV, openFieldElimination } from './testSupport';
import { vec3 } from './vec';

const DT = 1 / 60;
const KILL_Y = -10;
const DEAD_ZONES = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 1.2 }]];

/** A world with no level geometry to hit. */
const openSky = { raycastStatic: () => -1 };

function testContext(mover: CharacterMover, killY: number): SimContext {
  return createSimContext({ mover, query: openSky, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, loadout: LOADOUT, killY, hits: HITS, deadZones: DEAD_ZONES, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap });
}

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

describe('stepSimulation', () => {
  it('routes commands by character id, not array order', () => {
    const state = createGameState(1, 16, ROUNDS);
    const a = createCharacter(7, vec3(), 0);
    const b = createCharacter(3, vec3(10, 0, 0), 0);
    state.characters.push(a, b);
    const moveB = createCommand();
    moveB.forward = 1;
    const commands = new Map<number, PlayerCommand>([[3, moveB]]);
    const ctx = testContext(floor, KILL_Y);

    for (let i = 0; i < 30; i++) stepSimulation(state, commands, ctx, DT);

    expect(b.position.z).toBeLessThan(-1);
    expect(a.position.z).toBe(0);
    expect(state.tick).toBe(30);
    expect(state.time).toBeCloseTo(0.5, 9);
  });

  it('lets characters without a command settle under gravity and keep their view', () => {
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(0, 1, 0), 1.25);
    state.characters.push(c);
    const ctx = testContext(floor, KILL_Y);
    for (let i = 0; i < 60; i++) stepSimulation(state, new Map(), ctx, DT);
    expect(c.position.y).toBe(0);
    expect(c.grounded).toBe(true);
    expect(c.yaw).toBe(1.25);
  });

  it('returns a character that falls below killY to its spawn without momentum', () => {
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(2, 0, 3), 0);
    state.characters.push(c);
    const noFloor: CharacterMover = {
      move(_c, d, out) {
        out.x = d.x;
        out.y = d.y;
        out.z = d.z;
        return false;
      },
      probeGround() {
        return Number.NaN;
      },
    };
    const ctx = testContext(noFloor, -5);
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
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(), 0);
    state.characters.push(c);
    const cmd = createCommand();
    cmd.forward = 1;
    const ctx = testContext(floor, KILL_Y);
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    const before = { ...c.position };
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(c.prevPosition).toEqual(before);
    expect(c.position.z).toBeLessThan(before.z);
  });

  it('records the previous crouch amount so the eye height can be interpolated', () => {
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(), 0);
    state.characters.push(c);
    const cmd = createCommand();
    cmd.crouch = true;
    const ctx = testContext(floor, KILL_Y);
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    const after1 = c.crouchAmount;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(c.prevCrouchAmount).toBe(after1);
    expect(c.crouchAmount).toBeGreaterThan(after1);
  });

  it('records the previous view angles so other players turn smoothly between ticks', () => {
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(), 0);
    state.characters.push(c);
    const cmd = createCommand();
    const ctx = testContext(floor, KILL_Y);
    cmd.yaw = 0.3;
    cmd.pitch = 0.1;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    cmd.yaw = 0.5;
    cmd.pitch = -0.2;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(c.prevYaw).toBeCloseTo(0.3, 9);
    expect(c.prevPitch).toBeCloseTo(0.1, 9);
    expect(c.yaw).toBeCloseTo(0.5, 9);
    expect(c.pitch).toBeCloseTo(-0.2, 9);
  });

  it('does not fire while sprinting or in the post-sprint lockout, then fires again', () => {
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(), 0);
    state.characters.push(c);
    const cmd = createCommand();
    cmd.forward = 1;
    cmd.sprint = true;
    cmd.fire = true;
    const ctx = testContext(floor, KILL_Y);
    const shots = () => state.events.filter((e) => e.type === 'shot').length;
    let fired = 0;
    for (let i = 0; i < 60; i++) {
      stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
      fired += shots();
    }
    expect(c.sprinting).toBe(true);
    expect(fired).toBe(0);
    // Stop sprinting but keep the trigger held: still locked out for a moment.
    cmd.sprint = false;
    cmd.forward = 0;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(c.sprintLockout).toBeGreaterThan(0);
    expect(shots()).toBe(0);
    for (let i = 0; i < 90 && fired === 0; i++) {
      stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
      fired += shots();
    }
    expect(fired).toBeGreaterThan(0);
  });

  it('leans while Q / E is held, records the previous lean for smooth rendering, and fires from the leaned eye', () => {
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(), 0); // facing -Z: its right is +X
    state.characters.push(c);
    const cmd = createCommand();
    cmd.lean = 1;
    const ctx = testContext(floor, KILL_Y);
    for (let i = 0; i < 60; i++) stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(c.lean).toBe(1);
    expect(c.prevLean).toBe(1);
    cmd.fire = true;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    const shot = state.events.find((e) => e.type === 'shot');
    expect(shot?.type).toBe('shot');
    if (shot?.type === 'shot') {
      expect(shot.position.x).toBeGreaterThan(0.35); // out past the right shoulder
      expect(shot.position.y).toBeLessThan(c.position.y + BODY.standEyeHeight);
    }
    cmd.lean = 0;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(c.prevLean).toBe(1);
    expect(c.lean).toBeLessThan(1);
  });

  it('clears last tick\'s events at the start of every tick', () => {
    const state = createGameState(1, 16, ROUNDS);
    state.characters.push(createCharacter(0, vec3(), 0));
    const cmd = createCommand();
    cmd.fire = true;
    const ctx = testContext(floor, KILL_Y);
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(state.events.some((e) => e.type === 'shot')).toBe(true);
    cmd.fire = false;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(state.events.some((e) => e.type === 'shot')).toBe(false);
  });
});

describe('hit calling and round flow', () => {
  /** Blue shooter (id 0) facing -Z at the origin; one Orange target (id 1) 8 m ahead. */
  function duel() {
    const state = createGameState(1, 16, ROUNDS);
    const shooter = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
    const target = createCharacter(1, vec3(0, 0, -8), 0, LOADOUT, 1);
    state.characters.push(shooter, target);
    const ctx = testContext(floor, KILL_Y);
    const fire = createCommand();
    fire.fire = true;
    const commands = new Map([[0, fire]]);
    return { state, shooter, target, ctx, commands, fire };
  }

  const ticksFor = (seconds: number) => Math.ceil(seconds / DT) + 1;

  it('a hit character stops, calls the hit, walks off, then waits in the dead zone', () => {
    const { state, target, ctx, commands, fire } = duel();
    state.characters.push(createCharacter(2, vec3(50, 0, 0), 0, LOADOUT, 1)); // keeps the round live
    for (let i = 0; i < 30 && target.status === 'alive'; i++) stepSimulation(state, commands, ctx, DT);
    expect(target.status).toBe('calling');
    fire.fire = false;

    // Calling: stands still with no say over its own movement.
    const called = { ...target.position };
    const orders = createCommand();
    orders.forward = 1;
    commands.set(1, orders);
    for (let i = 0; i < ticksFor(HITS.callTime) - 2; i++) stepSimulation(state, commands, ctx, DT);
    expect(target.status).toBe('calling');
    expect(Math.hypot(target.position.x - called.x, target.position.z - called.z)).toBeLessThan(0.05);

    // Walking off: heads for its dead-zone spot (x = +30).
    for (let i = 0; i < 5 && target.status === 'calling'; i++) stepSimulation(state, commands, ctx, DT);
    expect(target.status).toBe('walkingOff');
    for (let i = 0; i < 30; i++) stepSimulation(state, commands, ctx, DT);
    expect(target.position.x).toBeGreaterThan(called.x + 0.5);

    // Walks all the way to its dead-zone spot (x = 30), turns to face the way the spot faces, and stays.
    for (let i = 0; i < ticksFor(HITS.walkOffTime) && target.status === 'walkingOff'; i++) stepSimulation(state, commands, ctx, DT);
    expect(target.status).toBe('out');
    expect(Math.hypot(target.position.x - 30, target.position.z)).toBeLessThan(0.01); // on the spot itself
    expect(target.yaw).toBe(DEAD_ZONES[1]![0]!.yaw);
    const parked = { ...target.position };
    for (let i = 0; i < 30; i++) stepSimulation(state, commands, ctx, DT);
    expect(Math.hypot(target.position.x - parked.x, target.position.z - parked.z)).toBeLessThan(0.01);
  });

  it('a hit character cannot shoot', () => {
    const { state, target, ctx, commands } = duel();
    for (let i = 0; i < 30 && target.status === 'alive'; i++) stepSimulation(state, commands, ctx, DT);
    const theirFire = createCommand();
    theirFire.fire = true;
    commands.set(1, theirFire);
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      stepSimulation(state, commands, ctx, DT);
      shots += state.events.filter((e) => e.type === 'shot' && e.characterId === 1).length;
    }
    expect(shots).toBe(0);
  });

  it('ends the round when a team is wiped out, then respawns everyone with full magazines', () => {
    const { state, shooter, target, ctx, commands, fire } = duel();
    let over: GameEvent | undefined;
    for (let i = 0; i < 30 && !over; i++) {
      stepSimulation(state, commands, ctx, DT);
      over = state.events.find((e) => e.type === 'roundOver');
    }
    expect(over).toEqual({ type: 'roundOver', winner: 0, reason: 'eliminated' });
    expect(state.round.phase).toBe('over');
    fire.fire = false;
    expect(shooter.armament.ammo[0]!.mag).toBeLessThan(LOADOUT[0]!.magSize);

    let started: GameEvent | undefined;
    for (let i = 0; i < ticksFor(ROUNDS.resetDelay) && !started; i++) {
      stepSimulation(state, commands, ctx, DT);
      started = state.events.find((e) => e.type === 'roundStart');
    }
    expect(started).toEqual({ type: 'roundStart', round: 2 });
    expect(state.round.phase).toBe('live');
    expect(target.status).toBe('alive');
    expect(target.position).toEqual(target.spawnPosition);
    expect(shooter.armament.ammo[0]!.mag).toBe(LOADOUT[0]!.magSize);
    expect(state.bbs.bbs.every((b) => !b.active)).toBe(true);
  });

  it('is a cease-fire once the round is decided: no shots, and BBs in flight hit nobody', () => {
    const state = createGameState(1, 16, ROUNDS);
    const blue = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
    const mate = createCharacter(1, vec3(0, 0, -6), 0, LOADOUT, 0);
    const orange = createCharacter(2, vec3(40, 0, 0), 0, LOADOUT, 1);
    state.characters.push(blue, mate, orange);
    const ctx = testContext(floor, KILL_Y);
    // A BB already on its way to the teammate when Orange is eliminated.
    spawnBB(state.bbs, 0, vec3(0, 1.2, -1), vec3(0, 0, -1), 88, 0, 0.25e-3);
    eliminate(orange, 0, state.characters, openFieldElimination(DEAD_ZONES));
    stepSimulation(state, new Map(), ctx, DT);
    expect(state.round.phase).toBe('over');
    expect(state.bbs.bbs.some((b) => b.active)).toBe(true);
    const fire = createCommand();
    fire.fire = true;
    let shots = 0;
    for (let i = 0; i < 30; i++) {
      stepSimulation(state, new Map([[0, fire]]), ctx, DT);
      shots += state.events.filter((e) => e.type === 'shot').length;
    }
    expect(state.round.phase).toBe('over');
    expect(shots).toBe(0);
    expect(mate.status).toBe('alive');
  });

  it('a walk-off blocked by cover gives up early and leaves the field instead of grinding', () => {
    const state = createGameState(1, 16, ROUNDS);
    const target = createCharacter(1, vec3(0, 0, -8), 0, LOADOUT, 1);
    state.characters.push(createCharacter(0, vec3(), 0, LOADOUT, 0), target, createCharacter(2, vec3(50, 0, 0), 0, LOADOUT, 1));
    // Everything horizontal is blocked, like walking into a wall.
    const wall: CharacterMover = {
      move(c, d, out) {
        out.x = 0;
        out.z = 0;
        const y = c.position.y + d.y;
        out.y = y <= 0 ? -c.position.y : d.y;
        return y <= 0;
      },
      probeGround: floor.probeGround,
    };
    const ctx = testContext(wall, KILL_Y);
    eliminate(target, 0, state.characters, openFieldElimination(DEAD_ZONES));
    let ticks = 0;
    while (target.status !== 'out' && ticks < 1000) {
      stepSimulation(state, new Map(), ctx, DT);
      ticks++;
    }
    const walkOff = ticks * DT - HITS.callTime;
    expect(walkOff).toBeLessThan(HITS.stuckTime + HITS.vanishTime + 0.1);
    expect(walkOff).toBeLessThan(HITS.walkOffTime);
    expect(target.position.x).toBeCloseTo(30, 3); // in its dead-zone spot
  });

  it('hits cover right in front of the shooter in the same tick instead of shooting through it', () => {
    const state = createGameState(1, 16, ROUNDS);
    state.characters.push(createCharacter(0, vec3(), 0, LOADOUT, 0));
    const wallAt = 0.2;
    const ctx = createSimContext({
      mover: floor,
      query: { raycastStatic: (_o, _d, max) => (wallAt <= max ? wallAt : -1) },
      movement: MOVEMENT,
      footsteps: FOOTSTEPS,
      body: BODY,
      ballistics: BALLISTICS,
      loadout: LOADOUT,
      killY: KILL_Y,
      hits: HITS,
      deadZones: DEAD_ZONES,
      rounds: ROUNDS,
      nav: OPEN_NAV,
      navSnap: NAV.snap,
    });
    const fire = createCommand();
    fire.fire = true;
    stepSimulation(state, new Map([[0, fire]]), ctx, DT);
    expect(state.events.filter((e) => e.type === 'shot')).toHaveLength(1);
    const impact = state.events.find((e) => e.type === 'bbImpact');
    expect(impact?.type === 'bbImpact' && impact.position.z).toBeCloseTo(-wallAt, 4);
    expect(state.bbs.bbs.some((b) => b.active)).toBe(false);
  });

  it('hits someone at point-blank range, even standing right inside the shooter', () => {
    for (const gap of [0.05, 0.3, 1]) {
      const state = createGameState(1, 16, ROUNDS);
      const shooter = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
      const target = createCharacter(1, vec3(0, 0, -gap), 0, LOADOUT, 1);
      state.characters.push(shooter, target, createCharacter(2, vec3(50, 0, 0), 0, LOADOUT, 1));
      const ctx = testContext(floor, KILL_Y);
      const fire = createCommand();
      fire.fire = true;
      fire.pitch = -0.3; // aimed at the body
      for (let i = 0; i < 3 && target.status === 'alive'; i++) stepSimulation(state, new Map([[0, fire]]), ctx, DT);
      expect(target.status, `target ${gap} m away`).toBe('calling');
    }
  });
});

describe('practice range', () => {
  /** You alone on the range (M21): practice context, the range's targets, standing at the origin facing downrange. */
  function range() {
    const state = createGameState(1, 64, ROUNDS);
    state.targets = createRangeTargets();
    const player = createCharacter(0, vec3(), 0, LOADOUT, 0);
    state.characters.push(player);
    const ctx = createSimContext({ mover: floor, query: openSky, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, loadout: LOADOUT, killY: KILL_Y, hits: HITS, deadZones: DEAD_ZONES, rounds: ROUNDS, nav: OPEN_NAV, navSnap: NAV.snap, practice: true });
    return { state, player, ctx };
  }

  it('never runs the round clock down or respawns anyone: it stays live, and you stay where you are', () => {
    const { state, player, ctx } = range();
    player.armament.ammo[0]!.mag = 3; // a respawn would fill it
    const start = { ...player.position };
    const roundEvents: string[] = [];
    for (let i = 0; i < Math.ceil((ROUNDS.roundTime + 1) / DT); i++) {
      stepSimulation(state, new Map(), ctx, DT);
      for (const e of state.events) if (e.type === 'roundStart' || e.type === 'roundOver' || e.type === 'matchOver') roundEvents.push(e.type);
    }
    expect(roundEvents).toEqual([]);
    expect(state.round.number).toBe(1);
    expect(state.round.phase).toBe('live');
    expect(player.position).toEqual(start);
    expect(player.armament.ammo[0]!.mag).toBe(3);
  });

  it('BBs hit the targets: a figure 10 m out goes down, then stands up again after figureDownTime', () => {
    const { state, player, ctx } = range();
    const figure = state.targets.find((t) => t.kind === 'figure' && !t.crouched && t.distance === 10)!;
    // Aim from the eye at the middle of the figure's body.
    const dx = figure.position.x - player.position.x;
    const dz = figure.position.z - player.position.z;
    const cmd = createCommand();
    cmd.yaw = Math.atan2(-dx, -dz);
    cmd.pitch = Math.atan2(HITS.bodyTop / 2 - eyeHeight(0, BODY), Math.hypot(dx, dz));
    cmd.fire = true;
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(state.events.filter((e) => e.type === 'shot')).toHaveLength(1);
    cmd.fire = false;
    let hit: GameEvent | undefined;
    for (let i = 0; i < 60 && !hit; i++) {
      stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
      hit = state.events.find((e) => e.type === 'targetHit');
    }
    expect(hit?.type === 'targetHit' && hit.targetId).toBe(figure.id);
    expect(figure.down).toBeGreaterThan(0);
    for (let i = 0; i < Math.ceil(RANGE.figureDownTime / DT) + 1; i++) stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    expect(figure.down).toBe(0);
  });

  it('keeps the spare magazines full every tick while you shoot the loaded one empty and reload', () => {
    const { state, player, ctx } = range();
    const ammo = player.armament.ammo[0]!;
    const size = player.armament.handling[0]!.magSize;
    const cmd = createCommand();
    cmd.fire = true;
    let emptied = false;
    for (let i = 0; i < 60 * 30 && !emptied; i++) {
      stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
      expect(ammo.pouch.every((m) => m === size)).toBe(true);
      emptied = ammo.mag === 0;
    }
    expect(emptied).toBe(true);
    // A reload takes a full magazine from the pouch, which is topped up again by the end of the tick.
    cmd.fire = false;
    cmd.reload = true;
    for (let i = 0; i < 60 * 5 && ammo.mag === 0; i++) {
      stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
      cmd.reload = false;
      expect(ammo.pouch.every((m) => m === size)).toBe(true);
    }
    expect(ammo.mag).toBe(size);
  });
});

