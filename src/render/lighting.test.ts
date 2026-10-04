import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { LIGHTING, QUALITY, type QualitySettings } from '../config/render';
import { terrainMaxX, terrainMaxZ, terrainRange } from '../map/terrain';
import { SLOPE_YARD, SLOPE_YARD_TERRAIN, terrainOnly } from '../map/testSupport';
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

describe('the level box with sloping ground (M33c)', () => {
  it('spans a terrain\'s footprint and its lowest and highest heights, with or without blocks', () => {
    const t = SLOPE_YARD_TERRAIN;
    const { min, max } = terrainRange(t);
    const bare = mapBoundingBox(terrainOnly(t));
    expect([bare.min.x, bare.min.z, bare.max.x, bare.max.z]).toEqual([t.minX, t.minZ, terrainMaxX(t), terrainMaxZ(t)]);
    expect(bare.min.y).toBeCloseTo(min, 6);
    expect(bare.max.y).toBeCloseTo(max, 6);
    expect(max).toBeGreaterThan(2); // the slope's top and the hill: well above, and min well below, a flat floor at 0
    expect(min).toBeLessThan(-2);
    // With the blocks: still covers the ground (the crate and walls sit within it), and the walls' tops if higher.
    const box = mapBoundingBox(SLOPE_YARD);
    expect(box.min.y).toBeCloseTo(Math.min(min, -2.5), 6); // the end wall reaches down to -2.5
    expect(box.max.y).toBeCloseTo(Math.max(max, 2.5), 6);
    expect(box.min.x).toBeLessThanOrEqual(t.minX);
    expect(box.max.x).toBeGreaterThanOrEqual(terrainMaxX(t));
  });

  it('is unchanged on a map without terrain', () => {
    const box = mapBoundingBox(TEST_YARD);
    const { terrain: _terrain, ...bare } = { ...TEST_YARD, terrain: undefined };
    expect(mapBoundingBox(bare).equals(box)).toBe(true);
    expect(mapBoundingBox({ ...TEST_YARD, terrain: SLOPE_YARD_TERRAIN }).max.y).toBeGreaterThan(box.max.y - 1e-9);
  });

  it('is covered by the fitted shadow camera, corner to corner, so the whole ground can receive shadows', () => {
    const box = mapBoundingBox(SLOPE_YARD);
    const centre = box.getCenter(new THREE.Vector3());
    const light = new THREE.Vector3(centre.x + LIGHTING.sunOffset.x, LIGHTING.sunOffset.y, centre.z + LIGHTING.sunOffset.z);
    const cam = new THREE.OrthographicCamera();
    fitShadowCamera(cam, light, new THREE.Vector3(centre.x, 0, centre.z), box, 0);
    const t = SLOPE_YARD_TERRAIN;
    const v = new THREE.Vector3();
    for (const [x, z] of [[t.minX, t.minZ], [terrainMaxX(t), t.minZ], [t.minX, terrainMaxZ(t)], [terrainMaxX(t), terrainMaxZ(t)]] as const) {
      const { min, max } = terrainRange(t);
      for (const y of [min, max]) {
        v.set(x, y, z).project(cam);
        expect(Math.abs(v.x)).toBeLessThanOrEqual(1 + 1e-6);
        expect(Math.abs(v.y)).toBeLessThanOrEqual(1 + 1e-6);
        expect(Math.abs(v.z)).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
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
