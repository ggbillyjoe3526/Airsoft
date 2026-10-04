import { describe, expect, it } from 'vitest';
import { BOTS, NIGHT_SIGHT } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import type { Bush } from '../map/foliage';
import { buildNightField } from '../map/nightSight';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { type SightConditions, visiblePart } from './perception';

const noWalls: WorldQuery = { raycastStatic: () => -1 };
/** A bush big enough to hide a standing player: 1.2 m round, 2.2 m tall. */
/** Daylight sight conditions with these bushes. */
const leaves = (...foliage: Bush[]): SightConditions => ({ foliage, night: null });
const bushAt = (x: number, z: number): Bush => ({ x, y: 0, z, radius: 1.2, height: 2.2 });

describe('bushes hide people from bots (M33e)', () => {
  const viewer = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0); // faces -Z

  it('hides someone standing in the middle of a bush, or behind one', () => {
    const inside = createCharacter(1, vec3(0, 0, -15), 0, LOADOUT, 1);
    expect(visiblePart(viewer, inside, noWalls, BOTS, BODY, HITS)).toBeGreaterThan(0);
    expect(visiblePart(viewer, inside, noWalls, BOTS, BODY, HITS, leaves(bushAt(0, -15)))).toBe(0);
    const behind = createCharacter(1, vec3(0, 0, -20), 0, LOADOUT, 1);
    expect(visiblePart(viewer, behind, noWalls, BOTS, BODY, HITS, leaves(bushAt(0, -15)))).toBe(0);
  });

  it('still sees someone at the edge of a bush, or beside it', () => {
    // Just inside the near rim: less leaf than foliageSeeThrough between the bot and them.
    const edge = createCharacter(1, vec3(0, 0, -15 + 1.2 - BOTS.foliageSeeThrough / 2), 0, LOADOUT, 1);
    expect(visiblePart(viewer, edge, noWalls, BOTS, BODY, HITS, leaves(bushAt(0, -15)))).toBeGreaterThan(0);
    const beside = createCharacter(1, vec3(3, 0, -15), 0, LOADOUT, 1);
    expect(visiblePart(viewer, beside, noWalls, BOTS, BODY, HITS, leaves(bushAt(0, -15)))).toBeGreaterThan(0);
  });

  it('sees a head over a low bush', () => {
    const low: Bush = { x: 0, y: 0, z: -15, radius: 1.2, height: 1.3 };
    const behind = createCharacter(1, vec3(0, 0, -16.5), 0, LOADOUT, 1);
    expect(visiblePart(viewer, behind, noWalls, BOTS, BODY, HITS, leaves(low))).toBe(BOTS.headHeightFraction);
  });

  it('hides no one within closeAwareness', () => {
    const near = createCharacter(1, vec3(0, 0, -(BOTS.closeAwareness - 0.5)), 0, LOADOUT, 1);
    expect(visiblePart(viewer, near, noWalls, BOTS, BODY, HITS, leaves(bushAt(0, -(BOTS.closeAwareness - 0.5))))).toBeGreaterThan(0);
  });
});

describe('bots see less far at night (M33g)', () => {
  const viewer = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0); // faces -Z
  const night: SightConditions = {
    foliage: [],
    night: buildNightField(
      { ...OPEN_FIELD, night: true, lights: [{ position: vec3(0, 2, -35), radius: 4, colour: 0xffd27a }], blocks: [...OPEN_FIELD.blocks, ...[[-1, -15], [1, -15], [0, -14], [0, -16]].map(([x, z]) => ({ kind: 'tree' as const, center: vec3(x!, 4.5, z!), size: vec3(0.5, 9, 0.5) }))] },
      NIGHT_SIGHT,
    ),
  };
  const at = (z: number, x = 3) => createCharacter(1, vec3(x, 0, z), 0, LOADOUT, 1);

  it('sees someone in the moonlit open up to nightSight.open, not beyond, where by day it would', () => {
    expect(visiblePart(viewer, at(-(NIGHT_SIGHT.open - 1)), noWalls, BOTS, BODY, HITS, night)).toBeGreaterThan(0);
    expect(visiblePart(viewer, at(-(NIGHT_SIGHT.open + 3)), noWalls, BOTS, BODY, HITS, night)).toBe(0);
    expect(visiblePart(viewer, at(-(NIGHT_SIGHT.open + 3)), noWalls, BOTS, BODY, HITS)).toBeGreaterThan(0);
  });

  it('sees someone in a light pool as far as by day', () => {
    expect(visiblePart(viewer, at(-35, 0), noWalls, BOTS, BODY, HITS, night)).toBeGreaterThan(0);
  });

  it('sees someone under the trees only within nightSight.canopy', () => {
    expect(NIGHT_SIGHT.canopy).toBeLessThan(15);
    expect(visiblePart(viewer, at(-15, 0), noWalls, BOTS, BODY, HITS, night)).toBe(0);
    const close = createCharacter(0, vec3(0, 0, -15 + NIGHT_SIGHT.canopy - 1), 0, LOADOUT, 0);
    expect(visiblePart(close, at(-15, 0), noWalls, BOTS, BODY, HITS, night)).toBeGreaterThan(0);
  });
});
