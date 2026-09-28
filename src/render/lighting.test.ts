import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING } from '../config/render';
import { TEST_YARD, TEST_YARD_HALF_SIZE } from '../map/testYard';
import { fitShadowCamera, mapBoundingBox } from './lighting';

describe('shadow camera fitting', () => {
  it('covers every corner of the level box', () => {
    const box = mapBoundingBox(TEST_YARD);
    const centre = box.getCenter(new THREE.Vector3());
    const target = new THREE.Vector3(centre.x, 0, centre.z);
    const light = new THREE.Vector3(
      centre.x + LIGHTING.sunOffset.x,
      LIGHTING.sunOffset.y,
      centre.z + LIGHTING.sunOffset.z,
    );
    const cam = new THREE.OrthographicCamera();
    fitShadowCamera(cam, light, target, box, 0);

    const projected = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      projected
        .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .project(cam);
      // Inside the clip volume on all axes (tiny tolerance for float error at the exact edges).
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.abs(projected.z)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('includes walls and floor in the level box', () => {
    const box = mapBoundingBox(TEST_YARD);
    expect(box.min.x).toBeLessThan(-TEST_YARD_HALF_SIZE);
    expect(box.max.z).toBeGreaterThan(TEST_YARD_HALF_SIZE);
    expect(box.max.y).toBeGreaterThanOrEqual(3);
    expect(box.min.y).toBeLessThan(0);
  });
});
