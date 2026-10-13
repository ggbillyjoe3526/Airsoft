import { describe, expect, it } from 'vitest';
import { LOADOUT } from './config/replicas';
import { RangeSession, type RangePose } from './rangeSession';
import { createCharacter } from './sim/character';
import { vec3 } from './sim/vec';

/**
 * QA for M95: the range keeps the slot in your hands across a Loadout visit. A RangeSession needs a renderer and
 * physics, so the real takeUp and pose getter run on a bare object holding just the player and the input.
 */
function bare(active = 0) {
  const player = createCharacter(0, vec3(1, 0, 2), 0, LOADOUT, 0);
  player.armament.active = active;
  const s = Object.create(RangeSession.prototype) as RangeSession & Record<string, unknown>;
  Object.assign(s, { player, input: { yaw: 0.5, pitch: -0.2 } });
  const takeUp = (p: RangePose) => (s as unknown as { takeUp(p: RangePose): void }).takeUp(p);
  return { s, a: player.armament, takeUp };
}
const pose = (o: Partial<RangePose>): RangePose => ({ x: 0, z: 0, yaw: 0, pitch: 0, ...o });

describe('M95: back from the Loadout, the range keeps the slot in hand', () => {
  it('the pose carries the slot in hand and the replica id held there', () => {
    const { s, a } = bare(1);
    const p = s.pose;
    expect(p.slot).toBe(1);
    expect(p.held).toBe(a.replicas[1]!.id);
    expect(p.yaw).toBe(0.5);
    expect(p.pitch).toBe(-0.2);
  });

  it('takes the slot from the pose back, with no draw when the same replica is there', () => {
    const { a, takeUp } = bare(0);
    a.draw = 0;
    takeUp(pose({ slot: 1, held: a.replicas[1]!.id }));
    expect(a.active).toBe(1);
    expect(a.draw).toBe(0);
  });

  it('a different replica in that slot comes up with a draw of its handling drawTime', () => {
    const { a, takeUp } = bare(0);
    a.draw = 0;
    takeUp(pose({ slot: 1, held: 'some-other-replica' }));
    expect(a.active).toBe(1);
    expect(a.draw).toBe(a.handling[1]!.drawTime);
    expect(a.draw).toBeGreaterThan(0);
    // The draw's length too, which the hands and the figure show its progress against (M92).
    expect(a.drawTotal).toBe(a.draw);
  });

  it('a replica in its holster (M92) stays there, with no draw, until you draw it', () => {
    const { s, a, takeUp } = bare(1);
    a.holstered = true;
    expect(s.pose.holstered).toBe(true);
    a.holstered = false;
    a.draw = 0;
    takeUp(pose({ slot: 1, held: 'some-other-replica', holstered: true }));
    expect(a.active).toBe(1);
    expect(a.holstered).toBe(true);
    expect(a.draw).toBe(0);
  });

  it('a slot past the kit is ignored (the hand stays where it was)', () => {
    const { a, takeUp } = bare(0);
    takeUp(pose({ slot: LOADOUT.length + 3, held: a.replicas[0]!.id }));
    expect(a.active).toBe(0);
  });

  it('an older pose without slot or held changes nothing', () => {
    const { a, takeUp } = bare(1);
    a.draw = 0;
    takeUp(pose({}));
    expect(a.active).toBe(1);
    expect(a.draw).toBe(0);
  });
});
