import { describe, expect, it } from 'vitest';
import { DEPOT } from '../map/depot';
import type { MapBlock, MapData } from '../map/mapTypes';
import { vec3 } from '../sim/vec';
import { CROUCHED_EYE, longestSightline, mapGeometry, routeBetween, sees, spawnYardsSeen, standPoints, STANDING_EYE, walkField, walkFrom } from './mapLayout';

/** The map checks' measuring tools (CT2) on Depot's open ground floor and a wall across it. */

const floors = DEPOT.blocks.filter((b) => b.kind === 'floor' && b.center.y < 0);
const open: MapData = { ...DEPOT, name: 'Open', blocks: floors };
const wallAt = (z: number, height: number): MapBlock => ({ kind: 'wall', center: vec3(0, height / 2, z), size: vec3(60, height, 0.3) });
const a = vec3(0, 0, -10);
const b = vec3(0, 0, 10);

describe('the map layout tools', () => {
  it('see along open ground and not through a wall, and over a low one only standing', () => {
    expect(sees(mapGeometry(open), a, b)).toBe(true);
    const walled = mapGeometry({ ...open, blocks: [...floors, wallAt(0, 3)] });
    expect(sees(walled, a, b)).toBe(false);
    // A wall between a crouched and a standing eye height: seen standing, hidden crouched.
    const low = mapGeometry({ ...open, blocks: [...floors, wallAt(0, (STANDING_EYE + CROUCHED_EYE) / 2)] });
    expect(sees(low, a, b, STANDING_EYE)).toBe(true);
    expect(sees(low, a, b, CROUCHED_EYE)).toBe(false);
  });

  it('find the longest clear line among stand points, and a shorter one once a wall cuts the ground', () => {
    const geo = mapGeometry(open);
    const far = longestSightline(geo, standPoints(geo, 4));
    expect(far).not.toBeNull();
    const cut = mapGeometry({ ...open, blocks: [...floors, wallAt(0, 3)] });
    const cutFar = longestSightline(cut, standPoints(cut, 4));
    expect(cutFar!.metres).toBeLessThan(far!.metres);
    expect(longestSightline(geo, [])).toBeNull();
  });

  it('say whether one spawn yard sees the other', () => {
    expect(spawnYardsSeen(mapGeometry(open), 3, 1)).not.toBeNull();
    expect(spawnYardsSeen(mapGeometry(DEPOT), 3, 1)).toBeNull();
  });

  it('measure walking distance, and report a pair a wall of the whole map splits as unreachable', () => {
    const geo = mapGeometry(open);
    const field = walkField(geo, [b]);
    expect(walkFrom(geo, field, a)).toBeGreaterThanOrEqual(19.5);
    expect(walkFrom(geo, field, vec3(500, 0, 500))).toBe(Number.POSITIVE_INFINITY);
    expect(routeBetween(geo, a, b)).toBe(true);
    expect(routeBetween(geo, a, vec3(500, 0, 500))).toBe(false);
  });
});
