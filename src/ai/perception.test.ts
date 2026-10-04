import { describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import type { Bush } from '../map/foliage';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { visiblePart } from './perception';

const noWalls: WorldQuery = { raycastStatic: () => -1 };
/** A bush big enough to hide a standing player: 1.2 m round, 2.2 m tall. */
const bushAt = (x: number, z: number): Bush => ({ x, y: 0, z, radius: 1.2, height: 2.2 });

describe('bushes hide people from bots (M33e)', () => {
  const viewer = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0); // faces -Z

  it('hides someone standing in the middle of a bush, or behind one', () => {
    const inside = createCharacter(1, vec3(0, 0, -15), 0, LOADOUT, 1);
    expect(visiblePart(viewer, inside, noWalls, BOTS, BODY, HITS)).toBeGreaterThan(0);
    expect(visiblePart(viewer, inside, noWalls, BOTS, BODY, HITS, [bushAt(0, -15)])).toBe(0);
    const behind = createCharacter(1, vec3(0, 0, -20), 0, LOADOUT, 1);
    expect(visiblePart(viewer, behind, noWalls, BOTS, BODY, HITS, [bushAt(0, -15)])).toBe(0);
  });

  it('still sees someone at the edge of a bush, or beside it', () => {
    // Just inside the near rim: less leaf than foliageSeeThrough between the bot and them.
    const edge = createCharacter(1, vec3(0, 0, -15 + 1.2 - BOTS.foliageSeeThrough / 2), 0, LOADOUT, 1);
    expect(visiblePart(viewer, edge, noWalls, BOTS, BODY, HITS, [bushAt(0, -15)])).toBeGreaterThan(0);
    const beside = createCharacter(1, vec3(3, 0, -15), 0, LOADOUT, 1);
    expect(visiblePart(viewer, beside, noWalls, BOTS, BODY, HITS, [bushAt(0, -15)])).toBeGreaterThan(0);
  });

  it('sees a head over a low bush', () => {
    const low: Bush = { x: 0, y: 0, z: -15, radius: 1.2, height: 1.3 };
    const behind = createCharacter(1, vec3(0, 0, -16.5), 0, LOADOUT, 1);
    expect(visiblePart(viewer, behind, noWalls, BOTS, BODY, HITS, [low])).toBe(BOTS.headHeightFraction);
  });

  it('hides no one within closeAwareness', () => {
    const near = createCharacter(1, vec3(0, 0, -(BOTS.closeAwareness - 0.5)), 0, LOADOUT, 1);
    expect(visiblePart(viewer, near, noWalls, BOTS, BODY, HITS, [bushAt(0, -(BOTS.closeAwareness - 0.5))])).toBeGreaterThan(0);
  });
});
