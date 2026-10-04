import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE } from '../config/render';
import { skyColour } from './atmosphere';

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
