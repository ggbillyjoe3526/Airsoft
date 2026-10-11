import { describe, expect, it } from 'vitest';
import { BOTS, type BotConfig, botConfig, DIFFICULTIES, NIGHT_SIGHT } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { buildNightField } from '../map/nightSight';
import { TEST_YARD } from '../map/testYard';
import { createCharacter } from '../sim/character';
import { OPEN_FIELD } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import type { Bot, BotWorld } from './bot';
import type { BotController } from './botController';
import { glance } from './botMovement';
import { seesSpot } from './perception';
import { noWalls, skirmish, wallAcrossX } from './testSupport';

/** M87 (playtest notes 15, 19): hunting bots skip spots their team has seen empty lately. */

const worldOf = (bots: BotController): BotWorld => (bots as unknown as { world: BotWorld }).world;

describe('seeing a spot empty (perception.ts seesSpot)', () => {
  const viewer = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0); // faces -Z
  const range = BOTS.huntClearRange;

  it('sees an open spot ahead within range, and not one past it, behind the bot or behind a wall', () => {
    expect(seesSpot(viewer, vec3(0, 0, -10), range, noWalls, BOTS, BODY, HITS)).toBe(true);
    expect(seesSpot(viewer, vec3(3, 0, -12), range, noWalls, BOTS, BODY, HITS)).toBe(true);
    expect(seesSpot(viewer, vec3(0, 0, -(range + 1)), range, noWalls, BOTS, BODY, HITS)).toBe(false);
    expect(seesSpot(viewer, vec3(0, 0, 10), range, noWalls, BOTS, BODY, HITS)).toBe(false);
    expect(seesSpot(viewer, vec3(10, 0, -3), range, wallAcrossX(5), BOTS, BODY, HITS)).toBe(false);
    expect(seesSpot(viewer, vec3(4, 0, -3), range, wallAcrossX(5), BOTS, BODY, HITS)).toBe(true);
  });

  it('checks no spot inside a bush (someone could be hiding in it), and at night none further than the dark allows', () => {
    const bush = { x: 0, y: 0, z: -10, radius: 1.2, height: 2.2 };
    expect(seesSpot(viewer, vec3(0, 0, -10), range, noWalls, BOTS, BODY, HITS, { foliage: [bush], night: null })).toBe(false);
    // Under the trees by night a figure is made out at NIGHT_SIGHT.canopy: 10 m. A spot 14 m off under them goes unchecked.
    const trees = [[-1, -14], [1, -14], [0, -13], [0, -15]].map(([x, z]) => ({ kind: 'tree' as const, center: vec3(x!, 4.5, z!), size: vec3(0.5, 9, 0.5) }));
    const night = { foliage: [], night: buildNightField({ ...OPEN_FIELD, night: true, blocks: [...OPEN_FIELD.blocks, ...trees] }, NIGHT_SIGHT) };
    expect(NIGHT_SIGHT.canopy).toBeLessThan(14);
    expect(seesSpot(viewer, vec3(0.5, 0, -14), range, noWalls, BOTS, BODY, HITS, night)).toBe(false);
    expect(seesSpot(viewer, vec3(0.5, 0, -14), range, noWalls, BOTS, BODY, HITS)).toBe(true);
  });
});

describe('the team shares what it has seen empty (M87, acceptance 1)', () => {
  /** Two Orange bots in the test yard: A by the south wall looking north, B by the north wall looking south. */
  function yard(cfg: BotConfig = BOTS) {
    const s = skirmish(TEST_YARD, [[-12, 12, 0], [8, 12, 1], [8, -12, 1]], cfg);
    const w = worldOf(s.bots);
    const [a, b] = s.bots.bots as [Bot, Bot];
    a.character.yaw = 0; // faces -z: up the yard
    b.character.yaw = Math.PI;
    w.time = 5;
    w.live = true;
    return { w, a, b };
  }
  const glances = (bot: Bot, w: BotWorld, n: number): void => {
    for (let i = 0; i < n; i++) glance(bot, w);
  };

  it("counts a hunt spot as checked for the whole team once one bot's glances see it empty", () => {
    const { w, a, b } = yard();
    // B was sent to a spot 8 m in front of A, and picked it before A looked.
    b.huntGoal.x = 8;
    b.huntGoal.z = 4;
    b.huntPickedAt = 1;
    expect(w.huntGoalChecked(b)).toBe(false);
    glances(a, w, 120);
    expect(w.huntGoalChecked(b)).toBe(true);
  });

  it("checks nothing behind the bot, and nothing with checking by eye off (as before M87)", () => {
    const { w, a, b } = yard();
    b.huntGoal.x = 8;
    b.huntGoal.z = 4;
    b.huntPickedAt = 1;
    a.character.yaw = Math.PI; // facing the wall behind it
    glances(a, w, 120);
    expect(w.huntGoalChecked(b)).toBe(false);
    const off = yard({ ...BOTS, huntClearRange: 0 });
    off.b.huntGoal.x = 8;
    off.b.huntGoal.z = 4;
    off.b.huntPickedAt = 1;
    glances(off.a, off.w, 120);
    expect(off.w.huntGoalChecked(off.b)).toBe(false);
  });

  it('forgets a check after the level\'s huntMemory: a sector checked longer ago is as worth a look as one never checked', () => {
    // The west half checked at 0 s, the east half never; B, facing the south wall, sees none of the spots it draws.
    const pickWest = (cfg: BotConfig, at: number): number => {
      const { w, b } = yard({ ...cfg, huntClearRange: 0 });
      w.time = 0;
      const p = vec3();
      for (let x = -14.5; x < 0; x += 1) for (let z = -14.5; z < 15; z += 1) w.markVisited(b, { x, y: 0, z } as Vec3);
      w.time = at;
      let west = 0;
      for (let i = 0; i < 200; i++) if (w.huntPoint(b, p) && p.x < 0) west++;
      return west;
    };
    const normal = botConfig('normal');
    expect(pickWest(normal, 10)).toBe(0);
    expect(pickWest(normal, normal.huntMemory + 30)).toBeGreaterThan(40);
    // Before M87 a check never went stale: the never-checked half kept every pick.
    expect(pickWest({ ...normal, huntMemory: Number.POSITIVE_INFINITY }, normal.huntMemory + 30)).toBe(0);
  });

  it('remembers longer at the higher levels (note 19: the levels scale)', () => {
    const memory = DIFFICULTIES.map((d) => botConfig(d.id).huntMemory);
    for (let i = 1; i < memory.length; i++) expect(memory[i]!).toBeGreaterThan(memory[i - 1]!);
    expect(BOTS.huntClearRange).toBeGreaterThan(0);
  });
});
