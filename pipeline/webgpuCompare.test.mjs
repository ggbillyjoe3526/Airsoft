import { describe, expect, it } from 'vitest';
import {
  COMPARE_BACKENDS,
  COMPARE_BAR,
  COMPARE_QUALITIES,
  COMPARE_SCENES,
  COMPARE_VIEWPORT,
  drawW5Views,
  EXTRA_CAMERAS,
  FIGURE_CAMERAS,
  FIGURE_STATES,
  FIGURE_VIEWS,
  GRASS_TRIANGLES,
  isFigureView,
  NO_DRESSING,
  pairFile,
  POST_CAMERAS,
  POST_FRAMES,
  POST_QUALITIES,
  POST_VIEWS,
  postViewsOf,
  postBase,
  sceneViews,
  scorePixels,
  verdict,
  W5_QUALITIES,
  W5_SCENES,
  W5_VIEWS,
  w5File,
  w5Verdict,
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

describe('the WebGPU post stack and retro filter comparison (W4)', () => {
  it('draws the whole frame on every preset: the ground, the sun or moon, first person, the retro filter and a light', () => {
    expect(POST_QUALITIES).toEqual(['low', 'medium', 'high', 'ultra']);
    expect(POST_VIEWS).toEqual(['ground', 'sun', 'first-person', 'retro', 'glow']);
    // A pool light by night only: by day nothing blooms, so the view would show nothing of Medium's stack.
    for (const scene of COMPARE_SCENES) expect(postViewsOf(scene).includes('glow'), scene.map + scene.light).toBe(scene.light === 'night');
    expect(postViewsOf(COMPARE_SCENES[0])).toEqual(['ground', 'sun', 'first-person', 'retro']);
    expect(isFigureView(postBase('glow'))).toBe(false);
    // Each stands where a W2 or W3 view does, or has its own camera.
    for (const v of POST_VIEWS) {
      const base = postBase(v);
      expect(['ground', 'first-person'].includes(base) || base in POST_CAMERAS, v).toBe(true);
    }
    expect(postBase('retro')).toBe('ground');
    expect(isFigureView(postBase('first-person'))).toBe(true);
    expect(isFigureView(postBase('sun'))).toBe(false);
    // The retro look is Settings → Dev's default; enough frames for the temporal history to settle.
    expect(POST_CAMERAS.retro.look).toEqual({ pixelSize: 4, levels: 6 });
    expect(POST_FRAMES).toBeGreaterThanOrEqual(8);
  });

  it('names a post view’s pair apart from W2’s and W3’s', () => {
    expect(pairFile(COMPARE_SCENES[0], 'ultra', 'ground', 'webgpu-webgl2', true)).toBe('depot-day-ultra-post-ground.jpg');
    expect(pairFile(COMPARE_SCENES[2], 'low', 'retro', 'webgpu', true)).toBe('neonHeights-night-low-post-retro-webgpu.jpg');
    expect(pairFile(COMPARE_SCENES[0], 'high', 'ground')).toBe('depot-day-high-ground.jpg');
  });
});

describe("the WebGPU compute dressing's views (W5)", () => {
  it("switches the dressing off on the pairs' node pages, and draws it on Woodland by night on Medium and up", () => {
    expect(NO_DRESSING).toBe('noGpuDressing');
    expect(W5_SCENES).toEqual([{ map: 'woodland', light: 'night' }]);
    expect(W5_QUALITIES).toEqual(['medium', 'high', 'ultra']);
    // Each stands where a W2 view does.
    for (const v of W5_VIEWS) expect(v in EXTRA_CAMERAS || ['overview', 'ground'].includes(v), v).toBe(true);
    for (const v of W5_VIEWS) expect(isFigureView(v)).toBe(false);
  });

  it("holds the grass under a triangle ceiling per preset: three a blade slot (render/webgpu/compute/grassLayout.ts's caps)", () => {
    // Medium 41,952 slots, High 93,696, Ultra 159,892 (the concept's 160,000), at three triangles a blade.
    expect(GRASS_TRIANGLES.medium).toBeGreaterThanOrEqual(41_952 * 3);
    expect(GRASS_TRIANGLES.high).toBeGreaterThanOrEqual(93_696 * 3);
    expect(GRASS_TRIANGLES.ultra).toBeGreaterThanOrEqual(159_892 * 3);
    expect(GRASS_TRIANGLES.ultra).toBeLessThanOrEqual(160_000 * 3);
    const entry = (grass, on, off) => ({ quality: 'ultra', grass: { triangles: grass }, draws: { on, off } });
    expect(w5Verdict(entry(479_676, 60, 58)).pass).toBe(true);
    expect(w5Verdict(entry(480_003, 60, 58)).fails[0]).toMatch(/grass 480003 triangles > 480000/);
    expect(w5Verdict(entry(1000, 61, 58)).fails[0]).toMatch(/3 draws added > 2/);
  });

  it("names a W5 view's picture apart from the pairs (the node renderer's frame alone)", () => {
    expect(w5File(W5_SCENES[0], 'ultra', 'ground', 'webgpu')).toBe('woodland-night-ultra-w5-ground-webgpu.png');
    expect(w5File(W5_SCENES[0], 'medium', 'fire', 'webgpu-webgl2')).toBe('woodland-night-medium-w5-fire.png');
  });

  it('draws each W5 page once per preset and back end, saves its views and scores their counts', async () => {
    const counts = (grass) => ({ draws: { on: 30, off: 28 }, triangles: { on: 90_000 + grass, off: 90_000 }, grass: { slots: grass / 3, triangles: grass }, forest: { trees: 900, triangles: 1800 } });
    const calls = [];
    const draw = async (scene, views, quality, backend, withPost, dressing) => {
      calls.push({ views: views.map((v) => v.name), quality, backend, withPost, dressing });
      const frames = Object.fromEntries(views.map((v) => [v.name, { plain: 'data:image/png;base64,AAAA', counts: counts(quality === 'high' ? 300_000 : 120_000) }]));
      return { frames, memory: { total: 50e6, storage: 4e6, textures: 30e6, dressing: 11e6 } };
    };
    const saved = [];
    const lines = [];
    const entries = await drawW5Views({ draw, save: (file) => saved.push(file), log: (l) => lines.push(l), scenes: W5_SCENES, qualities: ['medium', 'high'], backends: ['webgpu-webgl2'] });
    expect(calls).toEqual(['medium', 'high'].map((quality) => ({ views: W5_VIEWS, quality, backend: 'webgpu-webgl2', withPost: false, dressing: true })));
    expect(saved).toEqual(['medium', 'high'].flatMap((q) => W5_VIEWS.map((v) => w5File(W5_SCENES[0], q, v, 'webgpu-webgl2'))));
    expect(entries).toHaveLength(6);
    expect(entries[0]).toMatchObject({ map: 'woodland', quality: 'medium', w5: true, ceiling: GRASS_TRIANGLES.medium, pass: true, memory: { dressing: 11e6 } });
    // High's 300,000 grass triangles are over its ceiling.
    expect(entries[3]).toMatchObject({ quality: 'high', pass: false });
    expect(lines[0]).toMatch(/draws 28\+2 .* dressing 10\.5 MB {2}pass/);
  });
});
