import { describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import type { WorldQuery } from '../sim/armament';
import { createCommand } from '../sim/commands';
import { length3, vec3 } from '../sim/vec';
import { shootBot } from './botCombat';
import { bodyPoint, eyeOf } from './perception';
import { duel } from './testSupport';

/**
 * KI1 (KNOWN_ISSUES "Bots measure most distances in 2D ... the aim-wall check mixes a 3D and a 2D distance"): a bot
 * holds fire when its actual aim line (aim error included) meets a wall within aimWallFraction of the way to the target,
 * measured along that 3D line, so a target up a ramp or on a higher floor is judged like one on the flat.
 */
const DT = 1 / 60;
const OFF = 0.02;

/**
 * A bot 10 m (flat) from the player raised `rise` metres, aiming OFF rad wide of them; a wall that only the wide aim
 * line meets, at `fraction` of the eye-to-chest distance. Returns whether the bot fires.
 */
function firesWithWallAt(rise: number, fraction: number): boolean {
  let toChest = 0;
  const exact = vec3();
  const query: WorldQuery = {
    raycastStatic(_o, d, max) {
      // The straight line to the target is clear; the wide aim line meets the wall.
      const dot = d.x * exact.x + d.y * exact.y + d.z * exact.z;
      if (dot > Math.cos(OFF / 2)) return -1;
      const t = fraction * toChest;
      return t <= max ? t : -1;
    },
  };
  const d = duel(10, (s) => (s.characters[0]!.position.y = rise), query);
  const b = d.bots.bots[0]!;
  const w = d.bots.worldForTests;
  b.targetVisible = true;
  b.contact = { seenAt: d.state.time, acquiredAt: 0, firstSeenAt: d.state.time, held: false, reactAt: 0 };
  w.live = true;
  w.time = d.state.time;
  const eye = eyeOf(d.bot, BODY, HITS, vec3());
  const aimPoint = bodyPoint(d.player, HITS, BOTS.aimHeightFraction, vec3());
  exact.x = aimPoint.x - eye.x;
  exact.y = aimPoint.y - eye.y;
  exact.z = aimPoint.z - eye.z;
  toChest = length3(exact.x, exact.y, exact.z);
  exact.x /= toChest;
  exact.y /= toChest;
  exact.z /= toChest;
  b.aim.yaw = Math.atan2(-exact.x, -exact.z) + OFF;
  b.aim.pitch = Math.atan2(exact.y, Math.hypot(exact.x, exact.z));
  b.burstLeft = 0;
  b.pauseLeft = 0;
  const cmd = createCommand();
  shootBot(b, w, d.player, eye, aimPoint, 0, cmd, DT);
  return cmd.fire;
}

describe('the aim-wall check measures along the 3D aim line (KI1)', () => {
  const f = BOTS.aimWallFraction;

  it('on the flat: holds for a wall just inside aimWallFraction of the way, fires past it', () => {
    expect(firesWithWallAt(0, f - 0.03)).toBe(false);
    expect(firesWithWallAt(0, f + 0.03)).toBe(true);
  });

  it('at a target 6 m up (a 2D distance 14 % short): the same fractions of the 3D line decide', () => {
    expect(firesWithWallAt(6, f - 0.03)).toBe(false);
    // Here the old 2D reach (10 m × f) put the line's wall past it, and the bot fired into the wall.
    expect(firesWithWallAt(6, f * 0.95)).toBe(false);
    expect(firesWithWallAt(6, f + 0.03)).toBe(true);
  });
});
