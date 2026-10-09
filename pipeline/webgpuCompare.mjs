/**
 * The WebGPU world-materials comparison's rules (WebGPU overhaul W2; the runner is `webgpu-compare.mjs`): which views
 * are drawn, how a pair of frames is scored and the bar every pair must pass. Pure and dependency-free, so the fast test
 * suite pins it (`webgpuCompare.test.mjs`) and the runner hands `scorePixels` to the browser as it is.
 *
 * A pair is the same fixed camera view drawn twice, once by the old WebGL path and once by the node renderer (on its
 * WebGL2 back end, `?forceWebGL`, in a container without WebGPU), with the figures hidden (W3's) and nothing of the post
 * stack drawn on either side (W4's): what is left is the world's materials, W2's work.
 */

/** Each map in each light it offers (Depot is day only, Woodland night only), and the camera views drawn of it. */
export const COMPARE_SCENES = [
  { map: 'depot', light: 'day', views: ['overview', 'ground'] },
  { map: 'woodland', light: 'night', views: ['overview', 'ground', 'fire', 'sky'] },
  { map: 'neonHeights', light: 'night', views: ['aerial', 'ground', 'sky'] },
  { map: 'neonHeights', light: 'day', views: ['aerial', 'ground'] },
];

/**
 * The views beyond the menus' stills (config/menuArt.ts STILL_CAMERA): `fire` stands `back` m from the map's first camp
 * fire on the side of Blue's start, `up` m over its foot, looking `lookUp` m above it (the flames, embers and fireflies);
 * `sky` stands `up` m over Blue's start and looks at the moon, raised `lookUp` of the sky's radius (the stars, the moon's
 * halo, the skyline's lights).
 */
export const EXTRA_CAMERAS = {
  fire: { back: 3.4, up: 1.5, lookUp: 0.5, fov: 62 },
  sky: { back: 0, up: 12, lookUp: 0.25, fov: 70 },
};

/** The presets compared: Medium and High (Low draws no weathering or per-pixel baked light, and the gate's perf runs cover it). */
export const COMPARE_QUALITIES = ['medium', 'high'];

/** The frame size drawn (CSS pixels at a device pixel ratio of 1). */
export const COMPARE_VIEWPORT = { width: 1280, height: 720 };

/**
 * The bar (owner's brief for W2: "matches today's shots" measured). Per pair:
 *
 * - `mad`: the mean absolute difference per channel, averaged over R, G and B, in 0–255 steps: at most 0.5.
 * - `over`: the share of pixels where any channel differs by more than `threshold` (24 steps, about 10 %): at most 1 %.
 *
 * Both must hold. Measured with this script (High, 2026-10-09): the floor (`--noise`, WebGL against WebGL) is 0.011 at
 * most with no pixel over; W1's plain materials (no twins) score 6.5 and 11.0 on Depot, 1.4 to 4.2 on every Neon Heights
 * view (0.9 to 2.2 % over on its aerial and sky), so the bar fails them on 7 of 11 views (QA, W2-QA-2: the first bar,
 * 2.5 with 2.5 %, failed them on 3). The twins' worst pair sits well inside it (scores.json beside the pairs). Night
 * Woodland is near black and W1's plain materials pass there too (0.48 at most): the unit tests
 * (render/webgpu/worldTwins.test.ts, worldTwins.qa.test.ts) and e2e/webgpuWorld.spec.ts check that the twins draw.
 */
export const COMPARE_BAR = { mad: 0.5, over: 0.01, threshold: 24 };

/**
 * Scores two RGBA frames of the same size: the mean absolute difference per channel (R, G, B, then their mean) and
 * the share of pixels where any channel differs by more than `threshold`. Self-contained (no closures or imports): the
 * runner passes its source to the browser, where the frames are decoded.
 */
export function scorePixels(a, b, threshold) {
  const n = Math.min(a.length, b.length) / 4;
  let r = 0;
  let g = 0;
  let bl = 0;
  let over = 0;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const dr = Math.abs(a[j] - b[j]);
    const dg = Math.abs(a[j + 1] - b[j + 1]);
    const db = Math.abs(a[j + 2] - b[j + 2]);
    r += dr;
    g += dg;
    bl += db;
    if (dr > threshold || dg > threshold || db > threshold) over++;
  }
  const d = Math.max(1, n);
  const mr = r / d;
  const mg = g / d;
  const mb = bl / d;
  return { madRgb: [mr, mg, mb], mad: (mr + mg + mb) / 3, over: over / d };
}

/** Whether a pair's score passes the bar, and if not why. */
export function verdict(score, bar = COMPARE_BAR) {
  const fails = [];
  if (!(score.mad <= bar.mad)) fails.push(`mean difference ${score.mad.toFixed(2)} > ${bar.mad}`);
  if (!(score.over <= bar.over)) fails.push(`${(score.over * 100).toFixed(2)} % of pixels over ${bar.threshold} > ${(bar.over * 100).toFixed(1)} %`);
  return { pass: fails.length === 0, fails };
}

/** The file name of a pair's side-by-side picture. */
export function pairFile(scene, quality, view) {
  return `${scene.map}-${scene.light}-${quality}-${view}.jpg`;
}
