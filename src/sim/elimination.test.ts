import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from './character';
import { createCommand } from './commands';
import { eliminate, fillEliminatedCommand, isParked, planWalkOffRoutes } from './elimination';
import { openFieldElimination } from './testSupport';
import { vec3 } from './vec';

const DEAD_ZONES = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]] as const;

function field() {
  const ctx = openFieldElimination(DEAD_ZONES);
  const characters = [0, 1, 2].map((id) => createCharacter(id, vec3(id * 2, 0, 0), 0, LOADOUT, 1));
  return { ctx, characters };
}

describe('walk-off routes (M27, M74)', () => {
  it('a hit plans no route itself; the elimination step plans at most one route a tick', () => {
    const { ctx, characters } = field();
    /** Victims whose route has been planned (a route is never empty once planned). */
    const planned = () => characters.filter((c) => c.walkOffRoute.length > 0).length;
    const before = planned();
    eliminate(characters[0]!, 9, characters, ctx);
    eliminate(characters[1]!, 9, characters, ctx);
    expect(planned()).toBe(before); // nothing inside the hits
    expect(characters[0]!.walkOffRoutePending).toBe(true);
    expect(characters[1]!.walkOffRoutePending).toBe(true);

    expect(planWalkOffRoutes(characters, ctx)).toBe(true);
    expect(planned()).toBe(before + 1); // the first victim's route, this tick
    expect(characters[0]!.walkOffRoutePending).toBe(false);
    expect(characters[0]!.walkOffRoute.length).toBeGreaterThan(0);
    expect(characters[1]!.walkOffRoutePending).toBe(true);

    expect(planWalkOffRoutes(characters, ctx)).toBe(true);
    expect(planned()).toBe(before + 2); // the second victim's route, next tick
    expect(characters[1]!.walkOffRoute.at(-1)).toMatchObject({ x: 30, z: 0 });

    expect(planWalkOffRoutes(characters, ctx)).toBe(false); // nobody waiting: no route
    expect(planned()).toBe(before + 2);
  });

  it('with no route to the spot the victim still heads straight for it', () => {
    const { characters } = field();
    const offGrid = openFieldElimination([[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(400, 0, 400), yaw: 0 }]]);
    eliminate(characters[2]!, 9, characters, offGrid);
    planWalkOffRoutes(characters, offGrid);
    expect(characters[2]!.walkOffRoutePending).toBe(false);
    expect(characters[2]!.walkOffRoute).toEqual([{ x: 400, y: 0, z: 400 }]);
    expect(characters[0]!.walkOffRoute).toEqual([]); // nobody else's route was planned
  });

  it('a second hit on a victim already out changes nothing', () => {
    const { ctx, characters } = field();
    eliminate(characters[0]!, 9, characters, ctx);
    planWalkOffRoutes(characters, ctx);
    const route = [...characters[0]!.walkOffRoute];
    eliminate(characters[0]!, 5, characters, ctx);
    expect(characters[0]!.walkOffRoutePending).toBe(false);
    expect(characters[0]!.walkOffRoute).toEqual(route);
  });
});

describe('the command a hit character follows', () => {
  it('idles every field of a reused command, whatever its controller last set (audit SIM-11)', () => {
    const c = createCharacter(0, vec3(), 0.7, LOADOUT, 1);
    c.status = 'calling';
    const cmd = createCommand();
    Object.assign(cmd, { forward: 1, right: -1, yaw: 2, pitch: 0.4, sprint: true, walk: true, crouch: true, lean: 1, jump: true, aim: true, fire: true, reload: true, switchTo: 1, cycleFireMode: true });
    expect(fillEliminatedCommand(c, HITS, cmd)).toEqual({ ...createCommand(), yaw: 0.7 });
  });
});

describe('a character parked in the dead zone (audit SIM-15)', () => {
  it('is parked once out and standing there since before this tick, never while in play, calling or walking off', () => {
    const c = createCharacter(0, vec3(), 0, LOADOUT, 1);
    c.grounded = true;
    c.statusTime = 1;
    expect(isParked(c)).toBe(false);
    for (const status of ['calling', 'walkingOff', 'leaving'] as const) {
      c.status = status;
      expect(isParked(c)).toBe(false);
    }
    c.status = 'out';
    expect(isParked(c)).toBe(true);
    c.statusTime = 0; // the tick it arrives settles it first
    expect(isParked(c)).toBe(false);
    c.statusTime = 1;
    c.grounded = false; // placed in the air: falls and lands first
    expect(isParked(c)).toBe(false);
  });
});
