import { describe, expect, it } from 'vitest';
import {
  COMPARE_BACKENDS,
  COMPARE_BAR,
  COMPARE_QUALITIES,
  COMPARE_SCENES,
  COMPARE_VIEWPORT,
  EXTRA_CAMERAS,
  FIGURE_CAMERAS,
  FIGURE_STATES,
  FIGURE_VIEWS,
  isFigureView,
  pairFile,
  sceneViews,
  scorePixels,
  verdict,
  WEBGPU_ARGS,
} from './webgpuCompare.mjs';

/** A w×h RGBA frame filled with one colour. */
const frame = (n, rgb) => {
  const px = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) px.set([...rgb, 255], i * 4);
  return px;
};

describe('the WebGPU world-materials comparison (W2)', () => {
  it('pins the bar: mean difference 0.5 steps, at most 1 % of pixels over 24 steps', () => {
    expect(COMPARE_BAR).toEqual({ mad: 0.5, over: 0.01, threshold: 24 });
    expect(COMPARE_QUALITIES).toEqual(['medium', 'high']);
    expect(COMPARE_VIEWPORT).toEqual({ width: 1280, height: 720 });
  });

  it('draws every map in every light it has, and only views it knows', () => {
    expect(COMPARE_SCENES.map((s) => `${s.map} ${s.light}`)).toEqual(['depot day', 'woodland night', 'neonHeights night', 'neonHeights day']);
    const stills = ['overview', 'ground', 'aerial'];
    for (const s of COMPARE_SCENES) for (const v of s.views) expect(stills.includes(v) || v in EXTRA_CAMERAS, v).toBe(true);
  });

  it('scores identical frames 0 and a uniform shift by its size, with no pixel over the threshold', () => {
    const a = frame(100, [100, 120, 140]);
    expect(scorePixels(a, a, 24)).toEqual({ madRgb: [0, 0, 0], mad: 0, over: 0 });
    const s = scorePixels(a, frame(100, [110, 120, 137]), 24);
    expect(s.madRgb).toEqual([10, 0, 3]);
    expect(s.mad).toBeCloseTo(13 / 3, 10);
    expect(s.over).toBe(0);
  });

  it('counts a pixel over when any one channel differs by more than the threshold', () => {
    const a = frame(4, [0, 0, 0]);
    const b = frame(4, [0, 0, 0]);
    b.set([0, 0, 25], 0);
    b.set([24, 24, 24], 4);
    expect(scorePixels(a, b, 24).over).toBe(0.25);
  });

  it('fails a frame shifted as much as W1\'s plain materials were (Depot, 6.5 steps), passes the noise floor', () => {
    const a = frame(100, [100, 100, 100]);
    expect(verdict(scorePixels(a, frame(100, [106, 107, 106]), 24))).toEqual({ pass: false, fails: ['mean difference 6.33 > 0.5'] });
    // W1's plain Neon Heights aerial (1.39, 0.88 % over) fails too.
    expect(verdict({ mad: 1.392, over: 0.00877 }).fails).toEqual(['mean difference 1.39 > 0.5']);
    expect(verdict({ mad: 0.3, over: 0.008 }).pass).toBe(true);
    expect(verdict({ mad: 0.3, over: 0.012 }).fails).toEqual(['1.20 % of pixels over 24 > 1.0 %']);
    expect(verdict({ mad: Number.NaN, over: 0 }).pass).toBe(false);
  });

  it('names each pair\'s picture by map, light, preset and view', () => {
    expect(pairFile(COMPARE_SCENES[1], 'high', 'fire')).toBe('woodland-night-high-fire.jpg');
  });
});

describe('the WebGPU figures, replicas and lights comparison (W3)', () => {
  it('adds first person and figures near and far to every scene, and a torch beam by night', () => {
    expect(sceneViews(COMPARE_SCENES[0])).toEqual(['overview', 'ground', 'first-person', 'figures-near', 'figures-far']);
    for (const s of COMPARE_SCENES) {
      const views = sceneViews(s);
      expect(views.slice(0, s.views.length)).toEqual(s.views);
      expect(views.filter(isFigureView)).toEqual(FIGURE_VIEWS[s.light]);
      expect(views.includes('torch')).toBe(s.light === 'night');
    }
    for (const v of [...FIGURE_VIEWS.day, ...FIGURE_VIEWS.night]) expect(v in FIGURE_CAMERAS, v).toBe(true);
    // W2's views stay W2's: none of them is a figure view.
    for (const s of COMPARE_SCENES) for (const v of s.views) expect(isFigureView(v), v).toBe(false);
  });

  it('stands the figures in every state the twins must draw: alive, calling a hit, out and leaving', () => {
    expect(new Set(FIGURE_STATES)).toEqual(new Set(['alive', 'calling', 'out', 'leaving']));
  });

  it('draws on both node back ends, real WebGPU through the software Vulkan adapter', () => {
    expect(COMPARE_BACKENDS).toEqual(['webgpu-webgl2', 'webgpu']);
    expect(WEBGPU_ARGS).toContain('--enable-unsafe-webgpu');
    expect(WEBGPU_ARGS).toContain('--use-webgpu-adapter=swiftshader');
    expect(pairFile(COMPARE_SCENES[2], 'medium', 'torch', 'webgpu')).toBe('neonHeights-night-medium-torch-webgpu.jpg');
    expect(pairFile(COMPARE_SCENES[2], 'medium', 'torch', 'webgpu-webgl2')).toBe('neonHeights-night-medium-torch.jpg');
  });
});
