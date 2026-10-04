import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, DUST_MOTES } from '../config/render';
import { skyColour } from './atmosphere';
import { moteFade, motePosition } from './dustMotes';

describe('skyColour', () => {
  const sun = new THREE.Vector3(1, 2, 0).normalize();
  const away = new THREE.Vector3(-1, 0, 0);
  const dist = (a: THREE.Color, hex: number): number => {
    const b = new THREE.Color(hex);
    return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  };

  it('is the horizon colour at the horizon (matching the haze) and the zenith colour straight up, away from the sun', () => {
    const c = new THREE.Color();
    expect(dist(skyColour(new THREE.Vector3(0, 0, -1), sun, c), ATMOSPHERE.horizon)).toBeLessThan(1e-6);
    expect(dist(skyColour(new THREE.Vector3(0, 1, 0), away, c), ATMOSPHERE.zenith)).toBeLessThan(1e-6);
  });

  it('glows warm towards the sun', () => {
    const towards = skyColour(sun, sun, new THREE.Color());
    const opposite = skyColour(new THREE.Vector3(-sun.x, sun.y, -sun.z), sun, new THREE.Color());
    expect(towards.r - towards.b).toBeGreaterThan(opposite.r - opposite.b);
  });
});

describe('motePosition', () => {
  it('keeps every mote within half a box of the eye, wherever the eye goes and however far they drift', () => {
    const half = DUST_MOTES.box / 2;
    for (const eye of [0, 3.3, -40, 125.7]) {
      for (const base of [0, 1, 7, DUST_MOTES.box - 0.01]) {
        for (const moved of [0, 0.5, -3, 100]) {
          const p = motePosition(base, moved, eye, DUST_MOTES.box);
          expect(Math.abs(p - eye)).toBeLessThanOrEqual(half + 1e-9);
        }
      }
    }
  });

  it('moves a mote smoothly with its drift (no jump except when it wraps round the far side)', () => {
    const a = motePosition(3, 0.1, 0, DUST_MOTES.box);
    const b = motePosition(3, 0.2, 0, DUST_MOTES.box);
    expect(b - a).toBeCloseTo(0.1, 9);
  });
});

describe('moteFade', () => {
  const D = DUST_MOTES;

  it('hides motes right by the camera, so none turns into a blurry blob', () => {
    for (const d of [0, 0.3, 0.5, D.fadeNear]) expect(moteFade(d, d)).toBe(0);
    expect(moteFade(1, 1)).toBeLessThan(0.25); // a metre off: barely there
    expect(moteFade(D.fadeFar, D.fadeFar)).toBe(1);
    expect(moteFade(4, 4)).toBe(1);
  });

  it('grows steadily with distance, then fades again before the box edge so wrapping never pops', () => {
    let last = 0;
    for (let d = 0; d <= D.fadeFar; d += 0.05) {
      const a = moteFade(d, d);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
    expect(moteFade(D.box, D.box / 2)).toBe(0);
    expect(moteFade(D.box, D.box / 2 - D.edgeFade)).toBe(1);
  });

  it('caps a mote at a few pixels: even at the fade-in distance the world size would be bigger than the cap', () => {
    // At 1080 p a world-size point is size × 540 / distance pixels; the cap keeps it at maxPixels or under.
    expect((D.size * 540) / D.fadeFar).toBeGreaterThan(D.maxPixels);
    expect(D.maxPixels).toBeLessThanOrEqual(12);
  });
});
