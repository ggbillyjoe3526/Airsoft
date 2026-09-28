import { describe, expect, it } from 'vitest';
import { DEPOT } from '../map/depot';
import { vec3 } from '../sim/vec';
import { blockTint, TEAM_COLOURS } from './mapMeshes';

describe('blockTint', () => {
  it('gives mirror twins the same colour, so a symmetric map looks symmetric', () => {
    for (const b of DEPOT.blocks) {
      const twin = { ...b, center: vec3(-b.center.x, b.center.y, b.center.z) };
      expect(blockTint(twin)).toBe(blockTint(b));
    }
  });

  it('never paints props in team colours', () => {
    for (const b of DEPOT.blocks) expect(TEAM_COLOURS).not.toContain(blockTint(b));
  });

  it('varies colours between props of the same kind', () => {
    const containerTints = new Set(DEPOT.blocks.filter((b) => b.kind === 'container').map(blockTint));
    expect(containerTints.size).toBeGreaterThan(1);
  });
});
