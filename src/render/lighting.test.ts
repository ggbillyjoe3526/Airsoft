import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { LIGHTING, QUALITY, type QualitySettings } from '../config/render';
import { TEST_YARD, TEST_YARD_HALF_SIZE } from '../map/testYard';
import { addLighting, fitShadowCamera, mapBoundingBox } from './lighting';

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

describe('the sun\'s shadow and the quality preset', () => {
  /** A stand-in for the shadow map Three.js would make at the first shadow pass (no WebGL here). */
  function fakeShadowMap(sun: THREE.DirectionalLight): () => void {
    const dispose = vi.fn();
    sun.shadow.map = { dispose } as unknown as THREE.WebGLRenderTarget;
    return dispose;
  }

  function lit(quality: QualitySettings) {
    const scene = new THREE.Scene();
    const daylight = addLighting(scene, TEST_YARD, quality);
    const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
    return { scene, daylight, sun };
  }

  it('frees the shadow map when shadows go off, even at the same map size (audit L-01)', () => {
    const { daylight, sun } = lit(QUALITY.medium);
    expect(sun.castShadow).toBe(true);
    expect(QUALITY.low.shadowMapSize).toBe(QUALITY.medium.shadowMapSize); // the case the size check alone missed
    const dispose = fakeShadowMap(sun);
    daylight.setQuality(QUALITY.low);
    expect(sun.castShadow).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(sun.shadow.map).toBeNull();
    daylight.dispose();
  });

  it('frees the shadow map for a new size, and keeps it when nothing about it changes', () => {
    const { daylight, sun } = lit(QUALITY.medium);
    const kept = fakeShadowMap(sun);
    daylight.setQuality(QUALITY.medium);
    expect(kept).not.toHaveBeenCalled();
    daylight.setQuality(QUALITY.high);
    expect(kept).toHaveBeenCalledOnce();
    expect(sun.shadow.map).toBeNull();
    expect(sun.shadow.mapSize.x).toBe(QUALITY.high.shadowMapSize);
    expect(sun.shadow.radius).toBe(QUALITY.high.shadowRadius);
    daylight.dispose();
  });

  it('turns shadows back on from Low', () => {
    const { daylight, sun } = lit(QUALITY.low);
    expect(sun.castShadow).toBe(false);
    daylight.setQuality(QUALITY.high);
    expect(sun.castShadow).toBe(true);
    daylight.dispose();
  });
});
