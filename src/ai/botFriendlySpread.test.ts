import { describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { BODY } from '../config/movement';
import { HITS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { vec3 } from '../sim/vec';
import { shootBot } from './botCombat';
import { bodyPoint, eyeOf } from './perception';
import { boxQuery, duel } from './testSupport';

/**
 * M92 (second commit): a bot's friendly-fire check widens the line of fire by the spread it shoots with now
 * (Character.spreadScale), and a wall stops the BBs only if it also stands as far to either side as they stray.
 */
const DT = 1 / 60;

/** A duel with the bot having seen and reacted to the player, and `fires()` asking shootBot once, dead on aim. */
function ready(dist: number, extra: (s: Parameters<typeof duel>[1] extends ((s: infer S) => void) | undefined ? S : never) => void, query?: WorldQuery) {
  const d = duel(dist, extra, query);
  const b = d.bots.bots[0]!;
  const w = d.bots.worldForTests;
  b.targetVisible = true;
  b.contact = { seenAt: d.state.time, acquiredAt: 0, firstSeenAt: d.state.time, held: false, reactAt: 0 };
  w.live = true;
  w.time = d.state.time;
  const eye = eyeOf(d.bot, BODY, HITS, vec3());
  const aimPoint = bodyPoint(d.player, HITS, BOTS.aimHeightFraction, vec3());
  const yaw = Math.atan2(-(aimPoint.x - eye.x), -(aimPoint.z - eye.z));
  const pitch = Math.atan2(aimPoint.y - eye.y, Math.hypot(aimPoint.x - eye.x, aimPoint.z - eye.z));
  const fires = (): boolean => {
    const cmd = createCommand();
    b.aim.yaw = yaw;
    b.aim.pitch = pitch;
    b.burstLeft = 0;
    b.pauseLeft = 0;
    shootBot(b, w, d.player, eye, aimPoint, 0, cmd, DT);
    return cmd.fire;
  };
  return { ...d, fires };
}

describe('the line of fire widens with the spread the bot shoots with now', () => {
  it('holds fire for a teammate past the target that its settled aim clears, once a wider spread (moving, landing, a sprint just ended) reaches them', () => {
    const t = ready(20, (s) => s.characters.push(createCharacter(2, vec3(1.0, 0, 10), 0, LOADOUT, 1)));
    expect(t.bot.spreadScale).toBe(1);
    expect(t.fires(), 'at the replica\'s own spread the teammate is clear').toBe(true);
    t.bot.spreadScale = 3;
    expect(t.fires(), 'at three times the spread the BBs may reach them').toBe(false);
    t.bot.spreadScale = 1;
    expect(t.fires()).toBe(true);
  });
});

describe('a wall that only just reaches the line does not stop strayed BBs', () => {
  // A teammate 6 m behind the player, in line; a tall wall just behind the player, between them.
  const mate = (s: { characters: unknown[] }) => (s.characters as ReturnType<typeof createCharacter>[]).push(createCharacter(2, vec3(0, 0, 6), 0, LOADOUT, 1));

  it('covers the teammate when it is wide enough to take the strayed BBs too', () => {
    expect(ready(12, mate, boxQuery(0, 1.2, 5, 0.2, 3)).fires()).toBe(true);
  });

  it('does not when the wall is a post the BBs can pass either side of: the teammate still holds fire', () => {
    expect(ready(12, mate, boxQuery(0, 1.2, 0.05, 0.2, 3)).fires()).toBe(false);
  });

  it('a wider spread asks for a wider wall', () => {
    // 0.5 m either side of the line: enough at the settled spread (about 0.2 m of stray there), not at three times it.
    const t = ready(12, mate, boxQuery(0, 1.2, 0.5, 0.2, 3));
    expect(t.fires()).toBe(true);
    t.bot.spreadScale = 3;
    expect(t.fires()).toBe(false);
  });
});
