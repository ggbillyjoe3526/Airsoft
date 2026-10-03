import { describe, expect, it } from 'vitest';
import { verticalFovFor, zoomedFov } from './renderer';

describe('verticalFovFor', () => {
  it('converts a 16:9 horizontal FOV to the matching vertical FOV', () => {
    // 90° horizontal at 16:9 is ~58.7° vertical.
    expect(verticalFovFor(90)).toBeCloseTo(58.72, 1);
    expect(verticalFovFor(100)).toBeCloseTo(67.67, 1);
  });
});

describe('zoomedFov', () => {
  it('narrows the view by the zoom factor (and leaves it alone at 1)', () => {
    const fov = verticalFovFor(100);
    expect(zoomedFov(fov, 1)).toBeCloseTo(fov, 9);
    const DEG = Math.PI / 180;
    expect(Math.tan((zoomedFov(fov, 1.25) * DEG) / 2)).toBeCloseTo(Math.tan((fov * DEG) / 2) / 1.25, 12);
  });
});
