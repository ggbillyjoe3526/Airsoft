import type * as THREE from 'three';
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TONE_MAPPING } from '../config/render';
import type { SurfaceTextures } from './proceduralTextures';
import { toneMappingOf, verticalFovFor, warmSurfacesInIdle, zoomedFov } from './renderer';

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

describe('warmSurfacesInIdle (REN-14)', () => {
  /** A queue of idle moments run by hand. */
  function manualIdle() {
    const jobs: (() => void)[] = [];
    return { idle: (work: () => void) => void jobs.push(work), runOne: () => jobs.shift()?.(), waiting: () => jobs.length };
  }
  const fakeSet = () =>
    Object.fromEntries(['concrete', 'blockWall', 'crate'].map((id) => [id, { texture: { name: id } as unknown as THREE.Texture }])) as unknown as SurfaceTextures;

  it('draws the set in one idle moment, then uploads one texture a moment until all are up, and stops', () => {
    const { idle, runOne, waiting } = manualIdle();
    const set = fakeSet();
    const draw = vi.fn(() => set);
    const uploaded: string[] = [];
    warmSurfacesInIdle(draw, () => set, (t) => uploaded.push(t.name), idle);
    expect(draw).not.toHaveBeenCalled();
    runOne();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(uploaded).toEqual([]);
    runOne();
    expect(uploaded).toEqual(['concrete']);
    while (waiting() > 0) runOne();
    expect(uploaded).toEqual(['concrete', 'blockWall', 'crate']);
  });

  it('stops uploading once the set is dropped (a texture-size change)', () => {
    const { idle, runOne, waiting } = manualIdle();
    const set = fakeSet();
    let current: SurfaceTextures | null = set;
    const uploaded: string[] = [];
    warmSurfacesInIdle(() => set, () => current, (t) => uploaded.push(t.name), idle);
    runOne();
    runOne();
    current = null;
    while (waiting() > 0) runOne();
    expect(uploaded).toEqual(['concrete']);
  });
});

describe('toneMappingOf (audit F2)', () => {
  it('gives each Tone mapping choice its Three.js mapper and exposure, Neutral at 1 by default', () => {
    expect(toneMappingOf(TONE_MAPPING.default)).toEqual({ mapping: NeutralToneMapping, exposure: 1 });
    expect(toneMappingOf('agx').mapping).toBe(AgXToneMapping);
    expect(toneMappingOf('aces')).toEqual({ mapping: ACESFilmicToneMapping, exposure: TONE_MAPPING.exposure.aces });
  });
});
