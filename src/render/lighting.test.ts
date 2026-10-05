import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { LIGHTING, LIGHTING_PRESETS, QUALITY, type QualitySettings } from '../config/render';
import { terrainMaxX, terrainMaxZ, terrainRange } from '../map/terrain';
import { SLOPE_YARD, SLOPE_YARD_TERRAIN, terrainOnly } from '../map/testSupport';
import { DEPOT } from '../map/depot';
import { WOODLAND } from '../map/woodland';
import { TEST_YARD, TEST_YARD_HALF_SIZE } from '../map/testYard';
import { addLighting, fitShadowCamera, mapBoundingBox, shadowTexel } from './lighting';
import { resolveLighting } from './lightingPreset';

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
    const daylight = addLighting(scene, TEST_YARD, quality, LIGHTING_PRESETS.day);
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

describe('the view-fitted shadow map on High (REN-08)', () => {
  function lit(quality: QualitySettings) {
    const scene = new THREE.Scene();
    const daylight = addLighting(scene, DEPOT, quality, LIGHTING_PRESETS.day);
    const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
    return { daylight, sun, cam: sun.shadow.camera };
  }
  const width = (cam: THREE.OrthographicCamera) => Math.max(cam.right - cam.left, cam.top - cam.bottom);
  /** A first-person camera at `x, z`, eye height, facing `yaw`. */
  function eye(x: number, z: number, yaw: number): THREE.PerspectiveCamera {
    const c = new THREE.PerspectiveCamera();
    c.rotation.order = 'YXZ';
    c.position.set(x, 1.6, z);
    c.rotation.set(0, yaw, 0);
    return c;
  }

  it('fits a smaller map than the whole field: on Depot at 2048² a texel is under 2 cm (the field fit: 2.9 cm)', () => {
    const field = lit({ ...QUALITY.high, shadowFollowsView: false });
    const view = lit(QUALITY.high);
    view.daylight.follow(eye(0, 0, 0), 0);
    expect(shadowTexel(field.cam, 2048)).toBeGreaterThan(0.028);
    expect(shadowTexel(view.cam, QUALITY.high.shadowMapSize)).toBeLessThan(0.02);
    expect(width(view.cam)).toBeLessThan(width(field.cam));
    field.daylight.dispose();
    view.daylight.dispose();
  });

  it('covers the ground ahead of the view, and follows it', () => {
    const { daylight, cam } = lit(QUALITY.high);
    for (const [x, z, yaw] of [[-12, 4, 0], [10, -6, Math.PI / 2], [0, 0, Math.PI]] as const) {
      const c = eye(x, z, yaw);
      daylight.follow(c, 0);
      cam.updateMatrixWorld(true);
      const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
      // From under your feet to 20 m ahead (inside the field), and 8 m to either side.
      const side = new THREE.Vector3(-ahead.z, 0, ahead.x);
      for (const [f, s] of [[0, 0], [20, 0], [10, 8], [10, -8]] as const) {
        const p = new THREE.Vector3(x, 0, z).addScaledVector(ahead, f).addScaledVector(side, s);
        p.x = THREE.MathUtils.clamp(p.x, -24, 24);
        p.z = THREE.MathUtils.clamp(p.z, -15, 15);
        const ndc = p.clone().project(cam);
        expect(Math.abs(ndc.x), `${x},${z} → ${f},${s}`).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y), `${x},${z} → ${f},${s}`).toBeLessThanOrEqual(1);
      }
    }
    daylight.dispose();
  });

  it('moves in whole texels, so a small step of the view does not shift the shadows a fraction of a texel', () => {
    const { daylight, cam } = lit(QUALITY.high);
    const texel = shadowTexel(cam, QUALITY.high.shadowMapSize);
    daylight.follow(eye(-3, 2, 0.3), 0);
    const first = cam.left;
    for (let i = 1; i < 40; i++) {
      daylight.follow(eye(-3 + i * 0.013, 2 + i * 0.007, 0.3), 0);
      const steps = (cam.left - first) / texel;
      expect(Math.abs(steps - Math.round(steps)), `step ${i}`).toBeLessThan(1e-6);
    }
    daylight.dispose();
  });

  it('scales the normal bias with the texel, and goes back to the whole field when turned off', () => {
    const { daylight, sun, cam } = lit(QUALITY.high);
    daylight.follow(eye(0, 0, 0), 0);
    const near = sun.shadow.normalBias;
    expect(near).toBeCloseTo(LIGHTING.shadowNormalBiasTexels * shadowTexel(cam, 2048), 9);
    daylight.setQuality(QUALITY.medium);
    const fieldWidth = width(cam);
    daylight.follow(eye(10, 5, 1), 0); // nothing to follow on Medium
    expect(width(cam)).toBe(fieldWidth);
    expect(sun.shadow.normalBias).toBeCloseTo(LIGHTING.shadowNormalBiasTexels * shadowTexel(cam, 1024), 9);
    expect(sun.shadow.normalBias).toBeGreaterThan(near * 2);
    daylight.dispose();
  });

  it('fits Medium’s map to the view at night too (M52, audit REN-08): Woodland’s low moon, texels 10 cm to 4 cm', () => {
    const woods = (preset: typeof LIGHTING_PRESETS.day, quality: QualitySettings) => {
      const scene = new THREE.Scene();
      const daylight = addLighting(scene, WOODLAND, quality, preset);
      const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
      return { daylight, sun, cam: sun.shadow.camera };
    };
    const night = resolveLighting(WOODLAND);
    expect(night.night).toBe(true);
    expect(QUALITY.medium.shadowFollowsView).toBe(false); // Medium's own setting is the whole field
    // The whole field under the moon, as Medium drew it before M52 (and Low at night, with no shadow map, keeps).
    const low = woods(night, QUALITY.low);
    const fieldWidth = width(low.cam);
    low.daylight.follow(eye(4, -6, 0.5), 0);
    expect(low.sun.castShadow).toBe(false);
    expect(width(low.cam)).toBe(fieldWidth);
    low.daylight.dispose();

    const medium = woods(night, QUALITY.medium);
    medium.daylight.follow(eye(4, -6, 0.5), 0);
    const texel = shadowTexel(medium.cam, QUALITY.medium.shadowMapSize);
    expect(texel).toBeLessThan(fieldWidth / QUALITY.medium.shadowMapSize / 2.5);
    expect(medium.sun.shadow.normalBias).toBeCloseTo(LIGHTING.shadowNormalBiasTexels * texel, 9);
    // It follows the view, in whole texels.
    const first = medium.cam.left;
    medium.daylight.follow(eye(4.05, -6.02, 0.5), 0);
    const steps = (medium.cam.left - first) / texel;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
    medium.daylight.follow(eye(-20, 10, 2), 0);
    expect(medium.cam.left).not.toBe(first);
    medium.daylight.dispose();

    // By day the same field on Medium keeps its one whole-field map (Depot's Medium is unchanged too).
    const day = woods(LIGHTING_PRESETS.day, QUALITY.medium);
    const dayWidth = width(day.cam);
    day.daylight.follow(eye(4, -6, 0.5), 0);
    day.daylight.follow(eye(-20, 10, 2), 0);
    expect(width(day.cam)).toBe(dayWidth);
    expect(shadowTexel(day.cam, QUALITY.medium.shadowMapSize)).toBeGreaterThan(texel * 2);
    day.daylight.dispose();
  });
});
