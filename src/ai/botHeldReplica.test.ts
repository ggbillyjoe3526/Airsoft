import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS } from '../config/bots';
import { BODY } from '../config/movement';
import { HITS } from '../config/hits';
import { bbMass, LOADOUT, muzzleVelocity } from '../config/replicas';
import { flightTimeEstimate } from '../sim/ballistics';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { vec3 } from '../sim/vec';
import { aimBot, shootBot } from './botCombat';
import { bodyPoint, eyeOf } from './perception';
import { duel, facing } from './testSupport';

/**
 * BP3b QA: a bot leads and judges its line of fire by the replica in its hands (and the BBs it loads), not the factory
 * primary; past its target only a teammate a miss could knock out (in play, friendly fire on) holds its fire.
 */
const DT = 1 / 60;

/** A duel set up for driving aimBot / shootBot by hand: the bot has seen the player and reacted. */
function ready(dist: number, extra: Parameters<typeof duel>[1] = () => {}) {
  const d = duel(dist, extra);
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
  return { ...d, b, w, eye, aimPoint, fires };
}

describe('the lead uses the replica in the bot hands', () => {
  it('leads a crossing target by the flight of the held replica and its loaded BBs, not the primary', () => {
    const { bot, player, b, w } = ready(35);
    const a = bot.armament;
    a.active = 1; // the pistol
    a.bbWeights[1] = 0.3;
    const held = a.replicas[1]!;
    expect(held).not.toBe(LOADOUT[0]);
    player.velocity.x = 4;
    player.velocity.z = 0;
    const eye = eyeOf(bot, BODY, HITS, vec3());
    const straight = bodyPoint(player, HITS, b.targetPart, vec3());
    const range = Math.hypot(straight.x - eye.x, straight.y - eye.y, straight.z - eye.z);
    const aimPoint = vec3();
    aimBot(b, w, player, eye, aimPoint, false, createCommand(), DT);
    const lead = (aimPoint.x - straight.x) / (4 * b.skill.leadFactor);
    const heldFlight = flightTimeEstimate(range, muzzleVelocity(held, 0.3), bbMass(held, 0.3), BALLISTICS);
    const primary = LOADOUT[0]!;
    const primaryFlight = flightTimeEstimate(range, muzzleVelocity(primary), bbMass(primary), BALLISTICS);
    expect(Math.abs(heldFlight - primaryFlight), 'the two flights differ, so the test can tell them apart').toBeGreaterThan(0.01);
    expect(lead).toBeCloseTo(heldFlight, 9);
  });
});

describe('the stray spread in the line of fire is the held replica\'s', () => {
  it('holds fire for a teammate just past the pistol\'s wider spread that the rifle\'s narrower one clears', () => {
    // A teammate beyond the target, off the line by a distance between the two replicas' inflated margins.
    const { bot, fires } = ready(20, (s) => s.characters.push(createCharacter(2, vec3(1.0, 0, 10), 0, LOADOUT, 1)));
    const a = bot.armament;
    a.active = 0;
    expect(fires(), 'on the rifle (primary) the narrower stray leaves the line clear').toBe(true);
    a.active = 1;
    expect(fires(), 'on the pistol the wider stray reaches the teammate').toBe(false);
  });
});

describe('what past the target holds fire (bodyInLine)', () => {
  const beyond = (s: { characters: unknown[] }) => (s.characters as ReturnType<typeof createCharacter>[]).push(createCharacter(2, vec3(0, 0, 10), 0, LOADOUT, 1));

  it('holds for a teammate beyond the target with friendly fire on, not with it off', () => {
    const t = ready(20, beyond);
    expect(t.w.hits.friendlyFire).toBe(true);
    expect(t.fires()).toBe(false);
    t.w.hits = { ...t.w.hits, friendlyFire: false };
    expect(t.fires()).toBe(true);
  });

  it('does not hold for a teammate beyond the target who is already out', () => {
    const t = ready(20, (s) => {
      beyond(s);
      s.characters[2]!.status = 'out';
    });
    expect(t.fires()).toBe(true);
  });

  it('holds for a teammate between the bot and the target whatever the friendly fire switch says', () => {
    const t = ready(20, (s) => s.characters.push(createCharacter(2, vec3(0, 0, -10), 0, LOADOUT, 1)));
    expect(t.fires()).toBe(false);
    t.w.hits = { ...t.w.hits, friendlyFire: false };
    expect(t.fires()).toBe(false);
  });

  it('holds for a teammate in front who leans their torso into the line, not for the same teammate upright or leaning away (KNOWN_ISSUES, M-06)', () => {
    // 0.8 m off the line half-way to the target, facing the way the bot shoots: clear upright (measured: clear from
    // 0.45 m upright, from 1.0 m leaning in), so only the tilted torso and head reach the line.
    for (const side of [-1, 1]) {
      const at = (lean: number) =>
        ready(20, (s) => {
          const mate = createCharacter(2, vec3(0.8 * side, 0, -10), 0, LOADOUT, 1);
          mate.yaw = facing(mate.position, vec3(0, 0, 0));
          mate.lean = lean;
          s.characters.push(mate);
        }).fires();
      expect(at(0), `upright at x ${0.8 * side}`).toBe(true);
      expect(at(side), `leaning into the line at x ${0.8 * side}`).toBe(false);
      expect(at(-side), `leaning away at x ${0.8 * side}`).toBe(true);
    }
  });
});
