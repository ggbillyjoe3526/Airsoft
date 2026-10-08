/**
 * Which perf runs the gate makes, and what each is judged against (audit CORE-03, CORE-12; pipeline/README.md › perf).
 * Pure functions over plain data, so pipeline/perfMatrix.test.mjs tests them; gate.mjs and perf-run.mjs import them.
 *
 * The matrix is `perf-budget.json` › `matrix`: every map in both modes on Low, and Extraction on Medium on the big maps
 * (Woodland, Neon Heights). A combination runs only when the diff touches a perf path that reaches it: a file scoped to
 * a map (its data, its own art) reaches that map's combinations, one scoped to a mode reaches that mode's on every map,
 * and every other perf path (the shared ones: rendering, simulation, bots, config, the pool …) reaches them all.
 */

/** Paths whose change makes the perf gate required (the proposal's "render loop, physics, entities, assets"; CORE-03 added config and pool). */
export const PERF_PATHS = ['src/sim/', 'src/physics/', 'src/render/', 'src/ai/', 'src/nav/', 'src/audio/', 'src/core/', 'src/map/', 'src/assets/', 'src/config/', 'src/pool/', 'vite.config.ts'];

/**
 * Perf paths that reach only some combinations, most specific first (the first match wins). A path not listed here
 * reaches every combination. Only files that serve one map or one mode alone are listed; a shared module that today
 * happens to draw one map's things (foliage, nature shapes) stays shared, so a change to it is measured everywhere.
 */
export const PERF_SCOPES = [
  { path: 'src/map/woodlandExtraction.ts', map: 'woodland', mode: 'extraction' },
  { path: 'src/map/neonHeightsExtraction.ts', map: 'neon', mode: 'extraction' },
  { path: 'src/map/depot.ts', map: 'depot' },
  { path: 'src/map/woodland.ts', map: 'woodland' },
  { path: 'src/map/neonHeights.ts', map: 'neon' },
  { path: 'src/render/cityProps.ts', map: 'neon' },
  { path: 'src/render/cityTextures.ts', map: 'neon' },
  { path: 'src/sim/extraction.ts', mode: 'extraction' },
  { path: 'src/config/extraction.ts', mode: 'extraction' },
  { path: 'src/map/extractionBlock.ts', mode: 'extraction' },
  { path: 'src/ai/extraction', mode: 'extraction' },
  { path: 'src/render/exitRenderer.ts', mode: 'extraction' },
  { path: 'src/render/caseRenderer.ts', mode: 'extraction' },
];

const isTest = (file) => /\.test\.(ts|mjs)$/.test(file);
/** A folder's notes (`src/<folder>/README.md`, TE2): nothing imports them. */
const isDoc = (file) => /\.md$/.test(file);

/** Whether a changed file is a perf path at all (tests and folder READMEs are not: they ship nothing). */
export function isPerfPath(file) {
  return !isTest(file) && !isDoc(file) && PERF_PATHS.some((p) => file.startsWith(p));
}

/** The scope a perf path reaches: `{ map?, mode? }`, empty for a shared path. */
export function perfScope(file) {
  const scope = PERF_SCOPES.find((s) => file.startsWith(s.path));
  return scope ? { ...(scope.map ? { map: scope.map } : {}), ...(scope.mode ? { mode: scope.mode } : {}) } : {};
}

/** A combination's name in the report and its log: `woodland extraction medium`. */
export const runName = (run) => `${run.map} ${run.mode} ${run.preset}`;

/**
 * The combinations the gate runs for a diff: each matrix entry some changed perf path reaches, in the matrix's order.
 * `force` (gate --perf) runs the whole matrix.
 */
export function selectPerfRuns(changedFiles, matrix, { force = false } = {}) {
  if (force) return [...matrix];
  const scopes = [...changedFiles].filter(isPerfPath).map(perfScope);
  return matrix.filter((run) => scopes.some((s) => (s.map === undefined || s.map === run.map) && (s.mode === undefined || s.mode === run.mode)));
}

/** What perf-run.mjs adds to its file names for a map and mode: nothing for Depot Elimination (the first files' names). */
export function perfTag(map, mode) {
  return `${map === 'depot' ? '' : `-${map}`}${mode === 'elimination' ? '' : `-${mode}`}`;
}

/** The run file perf-run.mjs writes under pipeline/out/ for one combination. */
export function runFileName(env, run) {
  return `perf-${env}${perfTag(run.map, run.mode)}-${run.preset}.json`;
}

/**
 * The baseline file under pipeline/baseline/ for one combination: `<env><tag>.json` on the budget preset (Low),
 * `<env><tag>-<preset>.json` on another, e.g. `container.json`, `container-woodland-extraction-medium.json`.
 */
export function baselineFileName(env, run, budgetPreset) {
  const tag = perfTag(run.map, run.mode);
  return run.preset === budgetPreset ? `${env}${tag}.json` : `${env}${tag}-${run.preset}.json`;
}

/** The budget for a map on a preset: the preset's lines, with the map's own lines (`maps.<map>.<preset>`) over them. */
export function budgetFor(budgets, map, preset) {
  return { ...(budgets.presets?.[preset] ?? {}), ...(budgets.maps?.[map]?.[preset] ?? {}) };
}

/**
 * How far a baseline's head is behind HEAD, in commits: a number, or null when the head is not in this clone's history
 * (rebased away, or a shallow clone). `count(head)` runs `git rev-list --count <head>..HEAD`.
 */
export function baselineLag(head, count) {
  if (typeof head !== 'string' || !/^[0-9a-f]{7,40}$/.test(head)) return null;
  try {
    const n = Number(String(count(head)).trim());
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** The gate's warning (never a failure, CORE-12) for a baseline more than `maxLag` commits behind HEAD, or null. */
export function baselineLagWarning(fileName, head, lag, maxLag) {
  if (lag === null) return `${fileName}: its head ${String(head ?? '?').slice(0, 7)} is not in this clone's history; re-record it (perf-run.mjs --baseline)`;
  if (lag > maxLag) return `${fileName}: its head ${head.slice(0, 7)} is ${lag} commits behind HEAD (more than ${maxLag}); re-record it in the next PR that changes what it measures`;
  return null;
}

/** Metrics compared with the baseline; frame times only where the budget file says they are gated. */
export const RELATIVE_METRICS = ['drawCalls', 'triangles', 'gpuMemoryMB'];
export const FRAME_METRICS = ['p95Ms', 'p99Ms'];
/** How much worse than its baseline a metric may get (10 %). */
export const RELATIVE_TOLERANCE = 0.1;

/**
 * One run's verdict: `over` (budget lines it is above), `worse` (metrics more than RELATIVE_TOLERANCE above the
 * baseline) and `note` (why the relative check was skipped: no baseline, or one of another combination). Frame times
 * count only when `frameTimesGated`. `baseline` is the parsed baseline file, or null.
 */
export function judgeRun({ run, metrics, budget, baseline, baselineName, frameTimesGated }) {
  const over = [];
  for (const [metric, limit] of Object.entries(budget)) {
    if (FRAME_METRICS.includes(metric) && !frameTimesGated) continue;
    if (typeof metrics[metric] === 'number' && metrics[metric] > limit) over.push({ metric, limit, now: metrics[metric] });
  }
  const worse = [];
  let note;
  if (!baseline) note = `no baseline pipeline/baseline/${baselineName}; relative check skipped`;
  else {
    // Files from before M48 carry no map or mode: they were Depot Elimination.
    const was = { map: baseline.map ?? 'depot', mode: baseline.mode ?? 'elimination', preset: baseline.preset };
    if (was.map !== run.map || was.mode !== run.mode || was.preset !== run.preset) note = `${baselineName} is ${runName(was)}, not ${runName(run)}; relative check skipped`;
    else {
      for (const metric of [...RELATIVE_METRICS, ...(frameTimesGated ? FRAME_METRICS : [])]) {
        const before = baseline.metrics?.[metric];
        const now = metrics[metric];
        if (typeof before !== 'number' || typeof now !== 'number' || before <= 0) continue;
        const pct = ((now - before) / before) * 100;
        if (pct > RELATIVE_TOLERANCE * 100) worse.push({ metric, baseline: before, now, pct: Math.round(pct) });
      }
    }
  }
  return { over, worse, ...(note ? { note } : {}) };
}
