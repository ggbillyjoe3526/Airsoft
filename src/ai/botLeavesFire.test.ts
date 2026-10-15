import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS as BOT_CFG } from '../config/bots';
import { BODY } from '../config/movement';
import { HITS } from '../config/hits';
import { type Bush, foliageDepth } from '../map/foliage';
import { createCommand } from '../sim/commands';
import { vec3 } from '../sim/vec';
import { shootBot } from './botCombat';
import { bodyPoint, eyeOf } from './perception';
import { duel, noWalls } from './testSupport';

/** Dev 6 item 44, acceptance 4: a bot holds fire through more bush than it shoots through; Easy fires into the leaves. */
const DT = 1 / 60;
const THROUGH = BOT_CFG.foliageFireThrough;
const STOP = BALLISTICS.leaves.stopDepth;

/** A tall bush across the line between the bot (z = -20) and the player (z = 0), with radius `r`. */
const bushOf = (r: number): Bush => ({ x: 0, y: -4, z: -10, radius: r, height: 10 });

function shooter(foliage: readonly Bush[] | undefined, firesIntoLeaves: boolean) {
  const query = foliage ? { ...noWalls, foliage } : noWalls;
  const d = duel(20, () => {}, query);
  const b = d.bots.bots[0]!;
  const w = d.bots.worldForTests;
  (b as { skill: unknown }).skill = { ...b.skill, firesIntoLeaves };
  b.targetVisible = true;
  b.contact = { seenAt: d.state.time, acquiredAt: 0, firstSeenAt: d.state.time, held: false, reactAt: 0 };
  w.live = true;
  w.time = d.state.time;
  const eye = eyeOf(d.bot, BODY, HITS, vec3());
  const aim = bodyPoint(d.player, HITS, BOT_CFG.aimHeightFraction, vec3());
  const yaw = Math.atan2(-(aim.x - eye.x), -(aim.z - eye.z));
  const pitch = Math.atan2(aim.y - eye.y, Math.hypot(aim.x - eye.x, aim.z - eye.z));
  const depth = foliage ? foliageDepth(foliage, eye, aim) : 0;
  const fires = (): boolean => {
    const cmd = createCommand();
    b.aim.yaw = yaw;
    b.aim.pitch = pitch;
    b.burstLeft = 0;
    b.pauseLeft = 0;
    shootBot(b, w, d.player, eye, aim, 0, cmd, DT);
    return cmd.fire;
  };
  return { fires, depth };
}

describe('a bot holds fire through more leaves than foliageFireThrough', () => {
  it('fires with no bush, and with an empty list of bushes', () => {
    expect(shooter(undefined, false).fires()).toBe(true);
    expect(shooter([], false).fires()).toBe(true);
  });

  it('fires when the line only clips a bush by up to foliageFireThrough, holds fire past it', () => {
    const thin = shooter([bushOf(THROUGH / 2 - 0.02)], false);
    expect(thin.depth).toBeLessThan(THROUGH);
    expect(thin.fires()).toBe(true);
    const thick = shooter([bushOf(THROUGH / 2 + 0.1)], false);
    expect(thick.depth).toBeGreaterThan(THROUGH);
    expect(thick.fires()).toBe(false);
  });

  it('fires once the line is clear: a bush well to one side does not matter', () => {
    const aside: Bush = { x: 6, y: -4, z: -10, radius: 2, height: 10 };
    expect(shooter([aside], false).fires()).toBe(true);
  });

  it('adds up the leaves of two bushes in the line', () => {
    const each = THROUGH * 0.7;
    const two = [{ ...bushOf(each / 2) }, { ...bushOf(each / 2), z: -14 }];
    const s = shooter(two, false);
    expect(s.depth).toBeGreaterThan(THROUGH);
    expect(s.fires()).toBe(false);
  });
});

describe('Easy (firesIntoLeaves) fires into the leaves, as far as they let a BB through', () => {
  it('fires through a bush a careful bot holds fire at, but not through more than stopDepth', () => {
    const mid = bushOf((THROUGH + STOP) / 4);
    const m = shooter([mid], true);
    expect(m.depth).toBeGreaterThan(THROUGH);
    expect(m.depth).toBeLessThan(STOP);
    expect(m.fires()).toBe(true);
    expect(shooter([mid], false).fires()).toBe(false);
    const deep = shooter([bushOf(STOP / 2 + 0.2)], true);
    expect(deep.depth).toBeGreaterThan(STOP);
    expect(deep.fires()).toBe(false);
  });
});
