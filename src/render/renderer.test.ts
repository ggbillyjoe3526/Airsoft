import { describe, expect, it } from 'vitest';
import { verticalFovFor } from './renderer';

describe('verticalFovFor', () => {
  it('converts a 16:9 horizontal FOV to the matching vertical FOV', () => {
    // 90° horizontal at 16:9 is ~58.7° vertical.
    expect(verticalFovFor(90)).toBeCloseTo(58.72, 1);
    expect(verticalFovFor(100)).toBeCloseTo(67.67, 1);
  });
});
