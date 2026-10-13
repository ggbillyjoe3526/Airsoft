import { describe, expect, it } from 'vitest';
import { BOT_SIGHT_AIM, BOTS, botConfig } from '../config/bots';
import type { OpticId } from '../config/optics';
import { LOADOUT } from '../config/replicas';
import { fitOptics } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { vec3, wrapAngle } from '../sim/vec';
import { aimErrorSize, aimFirstErrorSize, settleTime, sightAim } from './aim';
import { duel } from './testSupport';

/**
 * BG1: a bot aims through the sight on its replica in hand. A scope aims finer at range but settles slower and loses a
 * target crossing its view; a red dot is a little finer and quicker; iron sights are the difficulty's own aim.
 */
const DEG = Math.PI / 180;
const { iron, redDot, scope2x } = BOT_SIGHT_AIM;

describe('bot aim through a sight (BG1)', () => {
  it('leaves iron sights exactly as the difficulty aims', () => {
    for (const t of [0, 0.3, 0.8, 5]) {
      expect(aimErrorSize(t, true, 25, 1.5, BOTS, iron)).toBe(aimErrorSize(t, true, 25, 1.5, BOTS));
      expect(aimFirstErrorSize(t, 25, BOTS, iron)).toBe(aimFirstErrorSize(t, 25, BOTS));
    }
    expect(settleTime(BOTS, iron)).toBe(BOTS.aimSettleTime);
  });

  it('settles a scope finer than iron sights, but later; at range its first aim starts as wide', () => {
    const settled = (sight = iron) => aimErrorSize(10, false, 35, 0, BOTS, sight);
    expect(settled(scope2x)).toBeCloseTo(BOTS.aimErrorSettledDeg * scope2x.settled * DEG, 9);
    expect(settled(scope2x)).toBeLessThan(settled(iron));
    expect(aimErrorSize(0, false, 35, 0, BOTS, scope2x)).toBe(aimErrorSize(0, false, 35, 0, BOTS, iron));
    // When iron sights have settled, the scope's first aim is still walking in.
    expect(aimFirstErrorSize(BOTS.aimSettleTime, 35, BOTS, iron)).toBe(0);
    expect(aimFirstErrorSize(BOTS.aimSettleTime, 35, BOTS, scope2x)).toBeGreaterThan(0);
    expect(settleTime(BOTS, scope2x)).toBeGreaterThan(BOTS.aimSettleTime);
  });

  it('finds someone close by later through a scope, and loses someone crossing its narrow view', () => {
    // Up close the first aim's floor in metres decides the error: wider through a scope.
    expect(aimErrorSize(0, false, 4, 0, BOTS, scope2x)).toBeGreaterThan(aimErrorSize(0, false, 4, 0, BOTS, iron));
    expect(aimFirstErrorSize(0, 4, BOTS, scope2x)).toBeGreaterThan(aimFirstErrorSize(0, 4, BOTS, iron));
    const crossing = (sight = iron) => aimErrorSize(10, false, 8, 3, BOTS, sight) - aimErrorSize(10, false, 8, 0, BOTS, sight);
    expect(crossing(scope2x)).toBeGreaterThan(crossing(iron));
    // Its error on the move is the difficulty's, whatever the sight (bots strafe as they fight).
    const moving = (sight = iron) => aimErrorSize(10, true, 20, 0, BOTS, sight) - aimErrorSize(10, false, 20, 0, BOTS, sight);
    expect(moving(scope2x)).toBeCloseTo(moving(iron), 12);
  });

  it('makes a red dot a little finer and quicker than iron sights, and no worse on a crossing target', () => {
    expect(aimErrorSize(10, false, 25, 0, BOTS, redDot)).toBeLessThan(aimErrorSize(10, false, 25, 0, BOTS, iron));
    expect(settleTime(BOTS, redDot)).toBeLessThan(settleTime(BOTS, iron));
    expect(redDot.tracking).toBeLessThanOrEqual(iron.tracking);
  });

  it('reads the sight on the replica in hand: the rifle\'s optic, iron sights on the pistol', () => {
    const c = createCharacter(1, vec3(), 0, LOADOUT, 1);
    expect(sightAim(c)).toBe(iron);
    fitOptics(c.armament, ['scope2x', null]);
    expect(sightAim(c)).toBe(scope2x);
    c.armament.active = 1;
    expect(sightAim(c)).toBe(iron);
  });

  it('holds its aim closer on someone standing at 25 m through a scope, and a red dot, than over iron sights (Normal)', () => {
    // How far (degrees) the bot's view stays off the target while it fires, over 6 s once it has settled; the target is
    // in its insertion grace, so BBs pass and the fight goes on.
    const offAim = (optic: OpticId | null): number => {
      let sum = 0;
      let n = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const { player, bot, run } = duel(25, (s) => {
          fitOptics(s.characters[1]!.armament, [optic, null]);
          s.characters[0]!.grace = Number.POSITIVE_INFINITY;
        }, undefined, botConfig('normal'), seed);
        run(2);
        run(6, () => {
          const want = Math.atan2(bot.position.x - player.position.x, bot.position.z - player.position.z);
          sum += Math.abs(wrapAngle(bot.yaw - want));
          n++;
        });
      }
      return sum / n / DEG;
    };
    const iron = offAim(null);
    expect(offAim('redDot')).toBeLessThan(iron);
    expect(offAim('scope2x')).toBeLessThan(iron * 0.9);
  });
});
