/**
 * The desktop suite (PF3's baseline; pipeline/README.md › The desktop run): the runs `perf-desktop.mjs` makes on the
 * owner's desktop PC and the summary he sends back. Pure functions over plain data, so pipeline/perfDesktop.test.mjs
 * tests them.
 */

/** The packages the suite needs: the build (Vite, and Vitest's config helper the Vite config imports) and the browser. */
export const NEEDED_PACKAGES = ['vite', 'vitest', '@playwright/test'];

/** The owner's screen (DECISIONS: Ultra at 3840×2160 aims for a 240 Hz frame). */
export const DESKTOP_4K = '3840x2160';
/** The same run at a quarter of the pixels: how much faster it goes says whether the GPU or the CPU sets the pace. */
export const DESKTOP_HD = '1920x1080';
import { budgetFor, frameTimesGatedFor, judgeRun } from './perfMatrix.mjs';

/** The maxed-out target's refresh rate (owner, 2026-10-16); its line is perf-budget.json `envs.desktop.ultra` (PF3). */
export const TARGET_HZ = 240;

/**
 * Chrome's switches that let frames run past the screen's refresh (`--env desktop`): with vsync a 240 Hz screen holds
 * every frame at 4.17 ms or more, the target's own period, so a run that holds 240 Hz would read the same as one with
 * room to spare, and a regression would hide under the cap until it crossed it.
 */
export const UNCAPPED_ARGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

const ultra4k = (map, mode, backend = 'webgpu') => ({ map, mode, preset: 'ultra', backend, viewport: DESKTOP_4K, baseline: true });

/**
 * The runs, in order (perf-run.mjs's options). WebGPU first: the renderer Chrome players get (Renderer › Auto). Depot
 * Elimination on every preset, then Ultra on every map in both modes, Ultra on WebGL2 for the back ends' gap, and last
 * Depot Ultra at 1080p for the GPU-or-CPU hint: not a baseline (its file would replace 4K's).
 */
export const DESKTOP_SUITE = [
  { map: 'depot', mode: 'elimination', preset: 'all', backend: 'webgpu', viewport: DESKTOP_4K, baseline: true },
  ultra4k('depot', 'extraction'),
  ultra4k('woodland', 'elimination'),
  ultra4k('woodland', 'extraction'),
  ultra4k('neon', 'elimination'),
  ultra4k('neon', 'extraction'),
  ultra4k('depot', 'elimination', 'webgl'),
  { map: 'depot', mode: 'elimination', preset: 'ultra', backend: 'webgpu', viewport: DESKTOP_HD, baseline: false },
];

/** perf-run.mjs's arguments for one run of the suite. */
export function suiteArgs(run) {
  return ['--env', 'desktop', '--map', run.map, '--mode', run.mode, '--preset', run.preset, '--backend', run.backend, '--viewport', run.viewport, ...(run.baseline ? ['--baseline'] : [])];
}

/** The presets a run measures (`all` is perf-run.mjs's four). */
export function runPresets(run) {
  return run.preset === 'all' ? ['low', 'medium', 'high', 'ultra'] : [run.preset];
}

/** Refresh rates screens commonly run at: a run whose median frame sits on one's period was held by vsync. */
export const REFRESH_RATES = [60, 75, 120, 144, 165, 240, 360];
/** How close (a share of the period) a median frame must be to a refresh period to count as held. */
export const VSYNC_TOLERANCE = 0.02;

/** The refresh rate a run's median frame sits on (the uncapped switches didn't take), or null. */
export function vsyncHeld(p50Ms) {
  return REFRESH_RATES.find((hz) => Math.abs(p50Ms - 1000 / hz) <= (1000 / hz) * VSYNC_TOLERANCE) ?? null;
}

/** 1080p's frame rate over 4K's at or above this: the pixels cost most (GPU-bound). */
export const GPU_BOUND_RATIO = 1.5;
/** Below this: a quarter of the pixels barely helps, so the work per frame sets the pace (CPU-bound). */
export const CPU_BOUND_RATIO = 1.15;

/** The GPU-or-CPU hint from Depot Ultra at 4K and at 1080p (frames a second), or null without both. */
export function boundHint(fps4k, fpsHd) {
  if (!(fps4k > 0 && fpsHd > 0)) return null;
  const ratio = fpsHd / fps4k;
  const times = `1080p runs ${ratio.toFixed(2)}× as fast as 4K`;
  if (ratio >= GPU_BOUND_RATIO) return `GPU-bound at 4K: ${times}, so the pixels cost most`;
  if (ratio < CPU_BOUND_RATIO) return `CPU-bound: ${times}, so the game's own work each frame (simulation, figures, draw submission) sets the pace`;
  return `Mixed: ${times}, so both the pixels and the work each frame count`;
}

/** The longest a failed run's error may be in the summary's table. */
export const FAILURE_CHARS = 200;

/** Lines of a Node crash that say nothing: its stack, the source line and caret, the error's fields, Node's version. */
const STDERR_NOISE = /^(at |node:|Node\.js v|\^|[{}]|const |triggerUncaughtException|(log|name|code|status|signal|output|pid|stdout|stderr|errors): )/;

/**
 * A failed run's error for its row, from what it wrote to stderr: the first line opening with an error's name or
 * perf-run.mjs's own `perf:`, else the first line that isn't a crash's noise, kept on one table cell (no `|`) and short.
 */
export function failureLine(stderr) {
  const lines = String(stderr ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !STDERR_NOISE.test(l));
  const line = lines.find((l) => /^(\w*Error\b|perf: )/.test(l)) ?? lines[0] ?? 'no output';
  const cell = line.replaceAll('|', '/');
  return cell.length > FAILURE_CHARS ? `${cell.slice(0, FAILURE_CHARS - 1)}…` : cell;
}

const fixed = (v, digits = 1) => (typeof v === 'number' ? v.toFixed(digits) : '-');

/**
 * A run's verdict against perf-budget.json's lines for the desktop (`budgets`): `ok`, or each line it is over. Frame
 * times count at 4K on the presets the desktop's are judged on (Ultra, PF3); the 1080p run is there for the hint.
 */
export function budgetVerdict(budgets, run, preset, result) {
  const budget = budgetFor(budgets, run.map, preset, result.backend, 'desktop');
  const frameTimesGated = run.viewport === DESKTOP_4K && frameTimesGatedFor(budgets, 'desktop', preset);
  const { over } = judgeRun({ run: { ...run, preset }, metrics: result.metrics, budget, baseline: null, baselineName: '', frameTimesGated });
  return over.length ? over.map((o) => `${o.metric} ${o.now} > ${o.limit}`).join(', ') : 'ok';
}

/**
 * The summary (markdown) the owner sends back: one row per run, the hints under it. `rows`: `{ run, preset, result,
 * failure? }` with `result` perf-run.mjs's file (null when the run wrote none) and `failure` its error then; `budgets`
 * is perf-budget.json.
 */
export function summaryMarkdown(rows, when, budgets) {
  const targetMs = 1000 / TARGET_HZ;
  const gpu = rows.find((r) => r.result?.gpu)?.result.gpu ?? 'unknown';
  const head = rows.find((r) => r.result?.head)?.result.head ?? 'unknown';
  const lines = [
    '# Desktop perf summary',
    '',
    `${when} · GPU: ${gpu} · head ${String(head).slice(0, 7)} · target ${TARGET_HZ} Hz (${targetMs.toFixed(2)} ms)`,
    '',
    '| Map | Mode | Renderer | Size | Preset | FPS | 1 % low FPS | p50 ms | p95 ms | p99 ms | Worst ms | Budget | Sim ticks/s | Figures ms | Draw calls | Errors |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const held = new Set();
  const ended = [];
  for (const { run, preset, result, failure } of rows) {
    const size = run.viewport === DESKTOP_4K ? '4K' : run.viewport;
    if (!result) {
      lines.push(`| ${run.map} | ${run.mode} | ${run.backend} | ${size} | ${preset} | no result: ${failure ?? 'see the run\'s output above'} |  |  |  |  |  |  |  |  |  |  |`);
      continue;
    }
    const m = result.metrics;
    if (m.matchEnded) ended.push(`${run.map} ${run.mode} ${preset} (${fixed(m.seconds, 0)} s)`);
    const hz = vsyncHeld(m.p50Ms);
    if (hz !== null) held.add(hz);
    lines.push(
      `| ${run.map} | ${run.mode} | ${result.backend} | ${size} | ${preset} | ${fixed(m.fps, 0)} | ${fixed(m.onePercentLowFps, 0)} | ${fixed(m.p50Ms, 2)} | ${fixed(m.p95Ms, 2)} | ${fixed(m.p99Ms, 2)} | ${fixed(m.worstMs)} | ${budgetVerdict(budgets, run, preset, result)} | ${fixed(m.simTicksPerSecond, 0)} | ${fixed(m.figureMs, 2)} | ${fixed(m.drawCalls, 0)} | ${result.errors.length} |`,
    );
  }
  const depot = (viewport) => rows.find((r) => r.run.map === 'depot' && r.run.mode === 'elimination' && r.run.backend === 'webgpu' && r.run.viewport === viewport && r.preset === 'ultra')?.result?.metrics;
  const [at4k, atHd] = [depot(DESKTOP_4K), depot(DESKTOP_HD)];
  // A run held by vsync says nothing about which side is slower.
  const hint = at4k && atHd && vsyncHeld(at4k.p50Ms) === null && vsyncHeld(atHd.p50Ms) === null ? boundHint(at4k.fps, atHd.fps) : null;
  lines.push('');
  if (hint) lines.push(`- ${hint}.`);
  if (ended.length) lines.push(`- The match ended inside the window, which then stopped at its last tick: ${ended.join(', ')}.`);
  if (held.size) lines.push(`- Frames sat on a ${[...held].join(' / ')} Hz screen's refresh: the uncapped switches may not have taken, so these runs may show the cap, not the headroom.`);
  lines.push('- Sim ticks/s under 60 means the simulation fell behind (CPU). Figures ms is the characters\' drawing work each frame.');
  return `${lines.join('\n')}\n`;
}
