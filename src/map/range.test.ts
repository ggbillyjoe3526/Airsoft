import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { RANGE } from '../config/range';
import { AEG, bbMass, hopUpLift, muzzleVelocity } from '../config/replicas';
import { SIM_DT } from '../config/sim';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { createBBPool, spawnBB, stepBBFlight } from '../sim/ballistics';
import { bestHopUp } from '../sim/hopUp';
import { createRangeTargets } from '../sim/rangeTargets';
import { vec3 } from '../sim/vec';
import { RANGE_MAP } from './range';

describe('the practice range map (M21)', () => {
  it('is walled on every side, with the backstop behind the farthest targets', () => {
    const walls = RANGE_MAP.blocks.filter((b) => b.kind === 'wall');
    expect(walls).toHaveLength(4);
    const backstop = walls.reduce((a, b) => (b.center.z < a.center.z ? b : a));
    const farthest = Math.max(...RANGE.distances);
    expect(-backstop.center.z).toBeGreaterThan(farthest + 3);
    expect(backstop.size.y).toBeGreaterThanOrEqual(RANGE.wallHeight);
  });

  it('puts you on the floor behind the firing line, and every target inside the walls', () => {
    const nav = buildNavGrid(RANGE_MAP, NAV);
    const spawn = RANGE_MAP.spawns[0][0]!;
    expect(isWalkableAt(nav, spawn.position.x, spawn.position.z)).toBe(true);
    expect(spawn.position.z).toBeGreaterThan(0);
    for (const t of createRangeTargets()) {
      expect(Math.abs(t.position.x)).toBeLessThan(RANGE.halfWidth);
      expect(isWalkableAt(nav, t.position.x, t.position.z), `${t.label} ${t.distance} m`).toBe(true);
    }
  });

  it('puts the farthest plates past a level shot: they take holdover, about 3° high, as config/range.ts says (audit SIM-16)', () => {
    const far = Math.max(...RANGE.distances);
    const best = bestHopUp(AEG, BALLISTICS);
    expect(best.onTargetTo).toBeLessThan(far);
    /** Height a rifle BB fired from eye height `deg` up, on the best dial, has at the farthest plates (-1 if it lands first). */
    const heightAt = (deg: number): number => {
      const a = (deg * Math.PI) / 180;
      const bb = spawnBB(createBBPool(1), 0, vec3(0, BODY.standEyeHeight, 0), vec3(0, Math.sin(a), -Math.cos(a)), muzzleVelocity(AEG), hopUpLift(AEG, best.dial), bbMass(AEG), BALLISTICS);
      while (bb.age < BALLISTICS.maxLifetime && bb.position.y > 0) {
        stepBBFlight(bb, BALLISTICS, SIM_DT);
        if (-bb.position.z >= far) return bb.position.y;
      }
      return -1;
    };
    expect(heightAt(0)).toBe(-1);
    expect(heightAt(2)).toBeLessThan(RANGE.plateHeight);
    expect(heightAt(4)).toBeGreaterThan(RANGE.plateHeight);
  });
});
