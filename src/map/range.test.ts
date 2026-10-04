import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { RANGE } from '../config/range';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { createRangeTargets } from '../sim/rangeTargets';
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
});
