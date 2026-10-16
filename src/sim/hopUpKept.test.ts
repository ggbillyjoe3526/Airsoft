import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { HOP_UP, LOADOUT } from '../config/replicas';
import { type ArmamentContext, createArmament, type Muzzle, stepArmament, turnHopUp } from './armament';
import { createBBPool } from './ballistics';
import { createCommand } from './commands';
import type { GameEvent } from './events';
import { createRng } from './rng';
import { vec3 } from './vec';

/** Dev 6 playtest item 15 (QA): a turned dial in a reload, and the odd cases around it. */
const events: GameEvent[] = [];
const ctx = (): ArmamentContext => ({ ballistics: BALLISTICS, bbs: createBBPool(64), rng: createRng(3), query: { raycastStatic: () => -1 }, events });
const muzzle: Muzzle = { eye: vec3(0, 1.6, 0), yaw: 0, pitch: 0, spreadScale: 1, kickScale: 1 };

describe('hop-up turn corner cases', () => {
  it('turns while the magazine is being swapped, and the dial is what the next BB uses', () => {
    const a = createArmament(LOADOUT);
    const c = ctx();
    const cmd = createCommand();
    a.draw = 0;
    a.ammo[0]!.mag = 0;
    cmd.reload = true;
    stepArmament(1, a, cmd, muzzle, true, c, 1 / 60);
    expect(a.reload).toBeGreaterThan(0);
    const start = a.hopUps[0]!;
    const turn = createCommand();
    turn.hopUpSteps = 1;
    stepArmament(1, a, turn, muzzle, true, c, 1 / 60);
    expect(a.hopUps[0]).toBeCloseTo(start + HOP_UP.dialStep, 6);
    expect(a.reload).toBeGreaterThan(0); // turning does not cancel the reload
  });

  it('turns only the replica in hand: after a switch the other dial moves', () => {
    const a = createArmament(LOADOUT);
    const c = ctx();
    const s = a.hopUps.slice();
    a.active = 1;
    turnHopUp(1, a, LOADOUT[1]!, -1, c);
    expect(a.hopUps[0]).toBe(s[0]);
    expect(a.hopUps[1]).toBeCloseTo(s[1]! - HOP_UP.dialStep, 6);
  });

  it('a many-notch jump from an off-step dial still lands on a step inside the range', () => {
    const a = createArmament(LOADOUT);
    a.hopUps[0] = HOP_UP.minDial + 0.013;
    turnHopUp(1, a, LOADOUT[0]!, 0, ctx());
    const d = a.hopUps[0]!;
    expect(d).toBeGreaterThanOrEqual(HOP_UP.minDial);
    expect(Math.abs(d / HOP_UP.dialStep - Math.round(d / HOP_UP.dialStep))).toBeLessThan(1e-6);
  });
});

describe('the dial across rounds', () => {
  it('stays where the player turned it when the next round starts', async () => {
    const { createCharacter, respawnCharacter } = await import('./character');
    const c = createCharacter(0, vec3(), 0);
    turnHopUp(0, c.armament, LOADOUT[0]!, 2, ctx());
    const turned = c.armament.hopUps[0]!;
    expect(turned).not.toBe(LOADOUT[0]!.hopUpDial);
    respawnCharacter(c);
    expect(c.armament.hopUps[0]).toBe(turned);
  });
});
