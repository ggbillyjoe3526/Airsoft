import { describe, expect, it } from 'vitest';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from './character';
import { eliminate, planWalkOffRoutes } from './elimination';
import { openFieldElimination } from './testSupport';
import { vec3 } from './vec';

const DEAD_ZONES = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]] as const;

function field() {
  const ctx = openFieldElimination(DEAD_ZONES);
  const characters = [0, 1, 2].map((id) => createCharacter(id, vec3(id * 2, 0, 0), 0, LOADOUT, 1));
  return { ctx, characters };
}

describe('walk-off route searches (M27)', () => {
  it('a hit searches no route itself; the elimination step searches at most one route a tick', () => {
    const { ctx, characters } = field();
    const searches = () => ctx.navSearch.generation;
    const before = searches();
    eliminate(characters[0]!, 9, characters, ctx);
    eliminate(characters[1]!, 9, characters, ctx);
    expect(searches()).toBe(before); // nothing inside the hits
    expect(characters[0]!.walkOffRoutePending).toBe(true);
    expect(characters[1]!.walkOffRoutePending).toBe(true);

    expect(planWalkOffRoutes(characters, ctx)).toBe(true);
    expect(searches()).toBe(before + 1); // the first victim's route, this tick
    expect(characters[0]!.walkOffRoutePending).toBe(false);
    expect(characters[0]!.walkOffRoute.length).toBeGreaterThan(0);
    expect(characters[1]!.walkOffRoutePending).toBe(true);

    expect(planWalkOffRoutes(characters, ctx)).toBe(true);
    expect(searches()).toBe(before + 2); // the second victim's route, next tick
    expect(characters[1]!.walkOffRoute.at(-1)).toMatchObject({ x: 30, z: 0 });

    expect(planWalkOffRoutes(characters, ctx)).toBe(false); // nobody waiting: no search
    expect(searches()).toBe(before + 2);
  });

  it('with no route to the spot the victim still heads straight for it', () => {
    const { ctx, characters } = field();
    const offGrid = openFieldElimination([[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(400, 0, 400), yaw: 0 }]]);
    eliminate(characters[2]!, 9, characters, offGrid);
    planWalkOffRoutes(characters, offGrid);
    expect(characters[2]!.walkOffRoutePending).toBe(false);
    expect(characters[2]!.walkOffRoute).toEqual([{ x: 400, y: 0, z: 400 }]);
    expect(ctx.navSearch.generation).toBe(0); // the other context was never touched
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
