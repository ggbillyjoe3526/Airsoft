/**
 * The WebGPU comparison's rules (WebGPU overhaul W2 and W3; the runner is `webgpu-compare.mjs`): which views are drawn,
 * how a pair of frames is scored and the bar every pair must pass. Pure and dependency-free, so the fast test suite pins
 * it (`webgpuCompare.test.mjs`) and the runner hands `scorePixels` to the browser as it is.
 *
 * A pair is the same fixed camera view drawn twice, once by the old WebGL path and once by the node renderer. W2's
 * world views hide the figures, their contact shadows and the torch beams; W3's figure views (`FIGURE_VIEWS`) draw them,
 * and the held replica in first person, with the characters stood where the view wants them so both pages draw the same
 * scene. Both draw no post effect on either side, only the output step; W4's post views (`POST_VIEWS`) draw the whole
 * frame on every preset, the post stack (or Low's straight draw) and the retro filter. The node renderer runs on its WebGL2
 * back end (`?forceWebGL`) and, where the browser offers a WebGPU device (in the container, Chromium's SwiftShader
 * Vulkan adapter, `WEBGPU_ARGS`), on WebGPU itself, where the night maps are lit by clustered lights (W3).
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

/**
 * W3's views, with the figures and the held replica drawn, by the light of the scene (W2's views above stay as they
 * were, figures hidden):
 *
 * - `first-person`: your own eyes at your start, turned towards Orange's start and `pitch` radians below level, the
 *   held replica drawn (the replica sheen, the arms and hands), your torch off.
 * - `figures-near` and `figures-far`: the six figures stood in two rows of three, `distance` m out from your start
 *   along the line to Orange's (or as far as the line is clear, less `margin`), `spacing` m apart, every one facing the
 *   camera, which stands at your start `up` m over the ground and looks `lookUp` m over their feet. Two are hit:
 *   one calls the hit (hand up and the HIT! sign), one is out (replica down) and one walks off fading at `fade` of its
 *   vanish time, so the near view shows the figures' finish, team colours, both looks (humans and robots), the hit and
 *   out states and a fade; the far one shows them small, as a firefight sees them.
 * - `torch` (night only): first person with your torch on, `pitch` below level, and a team-mate stood `ahead` m out and
 *   `side` m to the left with their torch on, pointing the way you look: your beam and theirs (its cone, glare and lit
 *   disc), and the light on what they land on.
 */
export const FIGURE_VIEWS = {
  day: ['first-person', 'figures-near', 'figures-far'],
  night: ['first-person', 'figures-near', 'figures-far', 'torch'],
};

export const FIGURE_CAMERAS = {
  'first-person': { pitch: 0.06, fov: 70 },
  'figures-near': { distance: 4.5, margin: 1.2, spacing: 1.1, up: 1.6, lookUp: 1.0, fov: 55 },
  'figures-far': { distance: 22, margin: 2, spacing: 1.6, up: 1.7, lookUp: 1.0, fov: 40 },
  torch: { pitch: 0.22, ahead: 3, side: 1.5, fov: 70 },
};

/** The figures' states in the stood rows (by place: near row left to right, then the far row), and the fade's share. */
export const FIGURE_STATES = ['alive', 'calling', 'alive', 'out', 'leaving', 'alive'];
export const FIGURE_FADE = 0.5;

/** The fires' clock (s) on both pages of a pair: their flames' sway and their real lights' flicker. */
export const FIRE_CLOCK = 7.25;

/** A scene's views: W2's world views (figures hidden) and W3's figure views. */
export function sceneViews(scene) {
  return [...scene.views, ...FIGURE_VIEWS[scene.light]];
}

/** Whether a view is W3's (figures drawn) rather than W2's (figures hidden). */
export function isFigureView(view) {
  return view in FIGURE_CAMERAS;
}

/**
 * The node renderer's back ends compared: its WebGL2 back end (`?forceWebGL`, any container) and WebGPU itself, where
 * the browser offers a device. `WEBGPU_ARGS` are the Chromium switches that give the container a WebGPU device
 * (SwiftShader's Vulkan, a software adapter, which the WebGPU pick accepts and Auto does not); without them Chromium
 * reaches WebGPU only on a real GPU.
 */
export const COMPARE_BACKENDS = ['webgpu-webgl2', 'webgpu'];
export const WEBGPU_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'];

/** The presets compared: Medium and High (Low draws no weathering or per-pixel baked light, and the gate's perf runs cover it). */
export const COMPARE_QUALITIES = ['medium', 'high'];

/**
 * W4's post views, drawn on every preset (`POST_QUALITIES`) with the whole frame on both sides: Low's straight draw, the
 * post stack on Medium and up, the held replica over it in first person, the retro filter. Each starts a new stack (or
 * retro filter) once the view has compiled, then draws `POST_FRAMES` frames from the stood camera before the grab, so
 * both pages' temporal history, jitter and grain are at the same frame.
 *
 * - `ground` and `first-person`: W2's ground still (figures hidden) and W3's first person (the held replica drawn).
 * - `sun`: from `up` m over the middle of the two starts, looking towards the key light (the sun, or the moon by night)
 *   a little below it (`lookDown`, as a share of the way), so it is on screen for the light shafts over the scenery.
 * - `retro`: the ground still through the retro filter at `look` (Settings → Dev's defaults), instead of the stack.
 * - `glow` (night only, `postViewsOf`): `back` m short of the map's first pool light (Woodland's fire, a Neon Heights
 *   lamp) on the way from the stood eye, `up` m over its foot, looking at it, so the bloom shows: by day nothing on
 *   these maps is bright enough to bloom (threshold 1), so Medium's stack (bloom alone) changes no pixel of a day view.
 */
export const POST_VIEWS = ['ground', 'sun', 'first-person', 'retro', 'glow'];
export const POST_QUALITIES = ['low', 'medium', 'high', 'ultra'];
export const POST_FRAMES = 12;
export const POST_CAMERAS = { sun: { up: 12, lookDown: 0.15, fov: 70 }, retro: { look: { pixelSize: 4, levels: 6 } }, glow: { back: 4, up: 1.5, fov: 62 } };

/** The post views of `scene`: every one, but `glow` only by night (no pool light is lit by day). */
export function postViewsOf(scene) {
  return POST_VIEWS.filter((v) => v !== 'glow' || scene.light === 'night');
}

/** The camera a post view stands where (its W2 or W3 view's, or its own). */
export function postBase(view) {
  return view === 'retro' ? 'ground' : view;
}

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

/**
 * The file name of a pair's side-by-side picture: W2's names on the WebGL2 back end, `-webgpu` on WebGPU, and `post-`
 * before a post view's name (W4).
 */
export function pairFile(scene, quality, view, backend = 'webgpu-webgl2', post = false) {
  return `${scene.map}-${scene.light}-${quality}-${post ? 'post-' : ''}${view}${backend === 'webgpu' ? '-webgpu' : ''}.jpg`;
}
