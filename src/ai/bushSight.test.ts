import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { type Bush, foliageDepth } from '../map/foliage';
import type { MapData } from '../map/mapTypes';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { DT, playMatch } from './depotMatchSupport';
import { eyeOf, visiblePart } from './perception';

/**
 * M33e QA, acceptance 1 with the real pieces: Rapier's level query (not a stub that sees nothing), bots playing a
 * headless match through BotController -> BotWorld -> perceive -> visiblePart.
 */

/** A bush that hides a standing player: 1.5 m round, 2.2 m tall. */
const HIDING: Bush = { x: 0, y: 0, z: 0, radius: 1.5, height: 2.2 };
const standing = (id: number, team: number, x: number, z: number) => createCharacter(id, vec3(x, 0, z), 0, LOADOUT, team);

describe('a bot looking through bushes, with the real level query (M33e, acceptance 1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  const world = (foliage?: readonly Bush[], extra: MapData['blocks'] = []): MapData => ({ ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, ...extra], ...(foliage ? { foliage } : {}) });

  it('does not see someone in the middle of a bush, or behind one, but sees them with no bush there', () => {
    const map = world([{ ...HIDING, z: -15 }]);
    const physics = new PhysicsWorld(map, BODY, DT);
    const viewer = standing(0, 0, 0, 0); // faces -Z
    for (const z of [-15, -16.4, -19]) {
      const target = standing(1, 1, 0, z);
      expect(visiblePart(viewer, target, physics, BOTS, BODY, HITS, { foliage: map.foliage ?? [], night: null }), `target at z=${z}`).toBe(0);
      expect(visiblePart(viewer, target, physics, BOTS, BODY, HITS), `target at z=${z}, no bushes`).toBeGreaterThan(0);
    }
    physics.dispose();
  });

  it('still sees someone in front of the bush, or well to the side of it', () => {
    const map = world([{ ...HIDING, z: -15 }]);
    const physics = new PhysicsWorld(map, BODY, DT);
    const viewer = standing(0, 0, 0, 0);
    expect(visiblePart(viewer, standing(1, 1, 0, -12), physics, BOTS, BODY, HITS, { foliage: map.foliage ?? [], night: null })).toBeGreaterThan(0);
    expect(visiblePart(viewer, standing(1, 1, 3.5, -15), physics, BOTS, BODY, HITS, { foliage: map.foliage ?? [], night: null })).toBeGreaterThan(0);
    physics.dispose();
  });

  it('draws the line at foliageSeeThrough: a bush half that thick through the middle is seen through, a bit more is not', () => {
    const viewer = standing(0, 0, 0, 0);
    const thin = (factor: number): Bush => ({ x: 0, y: 0, z: -15, radius: (BOTS.foliageSeeThrough / 2) * factor, height: 3 });
    for (const [factor, seen] of [
      [0.9, true],
      [1.1, false],
    ] as const) {
      const bush = thin(factor);
      const map = world([bush]);
      const physics = new PhysicsWorld(map, BODY, DT);
      // Target standing just behind the bush on its centre line: the line crosses the bush's whole diameter.
      const target = standing(1, 1, 0, -15 - bush.radius - 0.05);
      const part = visiblePart(viewer, target, physics, BOTS, BODY, HITS, { foliage: map.foliage ?? [], night: null });
      expect(part > 0, `diameter ${(bush.radius * 2).toFixed(2)} m`).toBe(seen);
      physics.dispose();
    }
  });

  it('is blocked by a wall as before, bushes or not, and a bush in front of a wall adds nothing', () => {
    const wall = { kind: 'wall' as const, center: vec3(0, 1.5, -10), size: vec3(6, 3, 0.4) };
    const map = world([{ ...HIDING, x: 8, z: -8 }], [wall]);
    const physics = new PhysicsWorld(map, BODY, DT);
    const viewer = standing(0, 0, 0, 0);
    const target = standing(1, 1, 0, -15);
    expect(visiblePart(viewer, target, physics, BOTS, BODY, HITS, { foliage: map.foliage ?? [], night: null })).toBe(0);
    // Off to the side of the wall the same bush (not in the way) hides nobody.
    expect(visiblePart(viewer, standing(1, 1, 10, -15), physics, BOTS, BODY, HITS, { foliage: map.foliage ?? [], night: null })).toBeGreaterThan(0);
    physics.dispose();
  });

  it('hides no one within closeAwareness, with the bush right round them', () => {
    const z = -(BOTS.closeAwareness - 0.3);
    const map = world([{ ...HIDING, z }]);
    const physics = new PhysicsWorld(map, BODY, DT);
    expect(visiblePart(standing(0, 0, 0, 0), standing(1, 1, 0, z), physics, BOTS, BODY, HITS, { foliage: map.foliage ?? [], night: null })).toBeGreaterThan(0);
    // Just past closeAwareness the same bush hides them.
    const far = -(BOTS.closeAwareness + 0.3);
    const farMap = world([{ ...HIDING, z: far }]);
    expect(visiblePart(standing(0, 0, 0, 0), standing(1, 1, 0, far), physics, BOTS, BODY, HITS, { foliage: farMap.foliage ?? [], night: null })).toBe(0);
    physics.dispose();
  });

  it('is the same with an empty list of bushes as with none (a map without foliage)', () => {
    const physics = new PhysicsWorld(world(), BODY, DT);
    const viewer = standing(0, 0, 0, 0);
    for (let i = 0; i < 40; i++) {
      const target = standing(1, 1, -20 + i, -4 - i * 0.7);
      expect(visiblePart(viewer, target, physics, BOTS, BODY, HITS, { foliage: [], night: null })).toBe(visiblePart(viewer, target, physics, BOTS, BODY, HITS));
    }
    physics.dispose();
  });
});

describe('bots in a headless match cannot see a player hiding in a bush (M33e, acceptance 1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  /** Blue's lone player hides at the origin; Orange's three bots start 30 m east and play towards the other end. */
  const field = (foliage: readonly Bush[]): MapData => ({
    ...OPEN_FIELD,
    spawns: [
      [{ position: vec3(-30, 0, -3), yaw: 0 }, { position: vec3(-30, 0, 0), yaw: 0 }, { position: vec3(-30, 0, 3), yaw: 0 }],
      [{ position: vec3(30, 0, -3), yaw: Math.PI / 2 }, { position: vec3(30, 0, 0), yaw: Math.PI / 2 }, { position: vec3(30, 0, 3), yaw: Math.PI / 2 }],
    ],
    deadZones: [[{ position: vec3(-45, 0, 0), yaw: 0 }], [{ position: vec3(45, 0, 0), yaw: 0 }]],
    foliage,
  });
  const HIDER = vec3(0, 0, 0);
  const hide = (foliage: readonly Bush[], seconds: number) => {
    let seenFar = 0;
    let seenNear = 0;
    let deepest = 0;
    const stats = playMatch(seconds, 5, HIDER, BOTS, 'elimination', { ...ROUNDS, eliminationFirstEnd: 0 }, field(foliage), 3, HITS, (state, controller) => {
      const hider = state.characters[0]!;
      if (hider.status !== 'alive' || state.round.phase !== 'live') return;
      // Only while hiding: once found (since Audit 2 every level hunts the middle, where the bush is, so the first round
      // ends), the next round starts the hider at its spawn in the open.
      if (Math.hypot(hider.position.x - HIDER.x, hider.position.z - HIDER.z) > HIDING.radius) return;
      for (const b of controller.bots) {
        if (!b.targetVisible || b.targetId !== hider.id) continue;
        const d = Math.hypot(b.character.position.x - hider.position.x, b.character.position.z - hider.position.z);
        if (d > BOTS.closeAwareness) {
          seenFar++;
          // The bush's depth along the line to the hider's chest, from the bot's eyes.
          const eye = vec3();
          eyeOf(b.character, BODY, HITS, eye);
          const chest = vec3(hider.position.x, hider.position.y + 1, hider.position.z);
          deepest = Math.max(deepest, foliageDepth(foliage, eye, chest));
        } else seenNear++;
      }
    });
    return { seenFar, seenNear, deepest, stats };
  };

  it('has the bots walk right past the bush without a single sighting from beyond closeAwareness; with no bush they see the player from afar', { timeout: 40_000 }, () => {
    const control = hide([], 60);
    expect(control.seenFar, 'no bush: bots see the hider from afar').toBeGreaterThan(0);
    const hidden = hide([HIDING], 60);
    expect(hidden.seenFar, 'in the bush: never seen from beyond closeAwareness').toBe(0);
    // Whenever a bot did see the hider it was close, or the line through the leaves was short.
    expect(hidden.deepest).toBeLessThanOrEqual(BOTS.foliageSeeThrough);
  });

  it('still plays rounds to their end: the bots find the player once they are close, so a bush is no place to sit out a round', { timeout: 40_000 }, () => {
    const hidden = hide([HIDING], 150);
    expect(hidden.seenFar).toBe(0);
    expect(hidden.stats.firstRoundEnd).toBeGreaterThan(0);
  });
});
