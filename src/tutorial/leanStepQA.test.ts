import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS, coachText } from '../config/tutorial';
import { HITS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { RANGE_MAP } from '../map/range';
import { boxQuery } from '../ai/testSupport';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { stepLean } from '../sim/lean';
import { vec3 } from '../sim/vec';
import { keySegments, TutorialTracker } from './tutorial';

/** QA for TT2: the lean step on the real practice range, the coach text, saves and skips. */
const DT = 1 / 60;
const walls = RANGE_MAP.blocks.filter((k) => k.kind !== 'floor').map((k) => boxQuery(k.center.x, k.center.z, k.size.x / 2, k.size.z / 2, k.center.y + k.size.y / 2));
const rangeQuery: WorldQuery = {
  raycastStatic(o, d, max) {
    let best = -1;
    for (const q of walls) {
      const t = q.raycastStatic(o, d, max);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best;
  },
};

function leanFully(x: number, z: number, dir: number): number {
  const c = createCharacter(0, vec3(x, 0, z), 0, LOADOUT, 0);
  c.grounded = true;
  const cmd = createCommand();
  cmd.lean = dir;
  for (let i = 0; i < 60; i++) stepLean(c, cmd, BODY, HITS, MOVEMENT, rangeQuery, DT);
  return c.lean;
}

describe('TT2: the lean goal is reachable on the practice range', () => {
  const goal = TUTORIAL_STEPS.find((s) => s.id === 'lean')!.goal;
  if (goal.kind !== 'lean') throw new Error('lean step has a lean goal');

  it('reaches the asked amount to both sides from the spawn and along the firing line', () => {
    const spawn = RANGE_MAP.spawns[0][0]!.position;
    for (const [x, z] of [[spawn.x, spawn.z], [0, 0], [-6, 1], [6, 1], [-3, 3], [3, 3]] as const) {
      expect(Math.abs(leanFully(x, z, -1)), `left at ${x},${z}`).toBeGreaterThanOrEqual(goal.amount);
      expect(Math.abs(leanFully(x, z, 1)), `right at ${x},${z}`).toBeGreaterThanOrEqual(goal.amount);
    }
  });

  it('ticks the lean step when the real stepLean output feeds the tracker', () => {
    const player = createCharacter(0, vec3(0, 0, 2), 0, LOADOUT, 0);
    player.grounded = true;
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 'lean');
    const view = { dt: DT, player, events: [], targets: [] };
    const cmd = createCommand();
    for (const dir of [-1, 0, 1]) {
      cmd.lean = dir;
      for (let i = 0; i < 40; i++) {
        stepLean(player, cmd, BODY, HITS, MOVEMENT, rangeQuery, DT);
        t.observe(view);
      }
    }
    expect(t.showingDone).toBe(true);
  });
});

describe('TT2: the lean card names the real bindings', () => {
  it('shows each key by its own action, so both {leanLeft} and {leanRight} get a key', () => {
    const lean = TUTORIAL_STEPS.find((s) => s.id === 'lean')!;
    const asked: string[] = [];
    const segs = keySegments(coachText(lean, true), (a) => {
      asked.push(a);
      return a === 'leanLeft' ? 'Q' : 'E';
    });
    expect(asked).toEqual(['leanLeft', 'leanRight']);
    expect(segs.filter((s) => s.key).map((s) => s.text)).toEqual(['Q', 'E']);
  });
});

describe('TT2: saves and skips around the lean step', () => {
  it('resumes on lean from a saved id, with the lean progress empty', () => {
    const player = createCharacter(0, vec3(0, 0, 2), 0, LOADOUT, 0);
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 'lean');
    const view = { dt: DT, player, events: [], targets: [] };
    player.lean = 1;
    t.observe(view);
    expect(t.showingDone).toBe(false); // one side only
  });

  it('skip during the lean step\'s done tick brings the next card up, and a lean held through it does not tick that step', () => {
    const player = createCharacter(0, vec3(0, 0, 2), 0, LOADOUT, 0);
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 'lean');
    const view = { dt: DT, player, events: [], targets: [] };
    player.lean = -1;
    t.observe(view);
    player.lean = 1;
    t.observe(view);
    expect(t.showingDone).toBe(true);
    const next = TUTORIAL_STEPS[TUTORIAL_STEPS.findIndex((s) => s.id === 'lean') + 1]!;
    t.skip();
    expect(t.showingDone).toBe(false);
    expect(t.step?.id).toBe(next.id);
    // Leaning to both sides stays a no-op on a non-lean step.
    player.lean = -1;
    t.observe(view);
    player.lean = 1;
    t.observe(view);
    expect(t.step?.id).toBe(next.id);
    expect(t.showingDone).toBe(false);
  });
});
