import type { DevSettings } from './config/dev';
import type { QualityChoice, QualitySettings, RetroLook } from './config/render';
import type { RulesetId } from './config/matchRules';
import { crashReport, type ReportField, type ReportInfo } from './core/crashReport';
import type { ErrorLog } from './core/errorLog';
import type { FrameSummary } from './core/frameWindow';
import { clockText, framesLine, loadLine, memoryLine, playerLine, qualityLine, runReportLine } from './core/reportFields';
import { lightingPicked } from './map/lightingChoice';
import type { MatchSession } from './matchSession';
import type { RangeSession } from './rangeSession';
import { rendererName } from './render/gpuCheck';
import type { Renderer } from './render/renderer';
import { browserStorage, flushSettings, SETTINGS_KEY } from './settings/storage';

/**
 * What the debug overlay and the reports read off the game (out of game.ts, DX5), each read only when asked: a report
 * may be made after an error left things half-done.
 */
export interface GameReadout {
  /** The session loaded, a match or the range; null on the menus with nothing loaded. */
  session(): MatchSession | RangeSession | null;
  /** The seed in play: the visit's on the range, the match's otherwise (the last match's with nothing loaded). */
  seed(): number;
  /** New game's map as it would play, and its ruleset: what a match would be, with none loaded. */
  mapPick(): string;
  ruleset(): RulesetId;
  /** Play is running: the mouse is locked, play runs without it (`?unlocked`), or a round skips without it. */
  inPlay(): boolean;
  menuScreen(): string;
  /** Simulation ticks in the last second; smoothed milliseconds a frame in the simulation and in the draw (REN-17). */
  tickRate(): number;
  simMs(): number;
  drawMs(): number;
  /** The frame times of the last seconds of play (IM7). */
  frames(): FrameSummary;
  /** The render quality in use, whether it is the game's own pick (REN-03), and what it resolves to. */
  quality(): { choice: QualityChoice; automatic: boolean; settings: QualitySettings };
  /** The Retro look in force (Settings › Dev), or null. */
  retro(): RetroLook | null;
  /** The audio context's output latency, where the browser says. */
  audioLatencyMs(): number | null;
  /** When the loop started (performance.now()): the game was ready to play. */
  readyAt(): number;
  /** The Dev settings in force while their tab is shown; null while it is hidden. */
  dev(): DevSettings | null;
  readonly renderer: Renderer;
  /** The WebGPU adapter's name, '' on WebGL (render/rendererStart.ts). */
  readonly adapterName: string;
  /** The console's recent errors and warnings since start-up (core/errorLog.ts, IM7). */
  readonly errors: ErrorLog;
}

/** The debug overlay's lines (ui/debugOverlay.ts): the seed and map, the player, the frame's costs and what the GPU holds. */
export function debugLines(r: GameReadout): Record<string, string | number> {
  const s = r.session();
  const p = s?.player;
  const renderer = r.renderer;
  const drawn = renderer.stats;
  return {
    seed: r.seed(),
    map: s?.kind === 'range' ? 'range' : r.mapPick(),
    tick: s?.state.tick ?? '-',
    'sim ticks/s': r.tickRate(),
    characters: s?.characterCount ?? 0,
    pos: p ? `${p.position.x.toFixed(2)}, ${p.position.y.toFixed(2)}, ${p.position.z.toFixed(2)}` : '-',
    speed: p ? Math.hypot(p.velocity.x, p.velocity.z).toFixed(2) : '-',
    grounded: String(p?.grounded ?? '-'),
    'BBs in flight': s?.combat.bbsInFlight ?? 0,
    'audio latency (ms)': r.audioLatencyMs()?.toFixed(1) ?? '-',
    quality: qualityText(r),
    renderer: renderer.backend,
    'pixel ratio': renderer.renderer.getPixelRatio(),
    'frame ms (sim / draw / GPU)': `${r.simMs().toFixed(1)} / ${r.drawMs().toFixed(1)} / ${Number.isNaN(renderer.gpuMs) ? 'n/a' : renderer.gpuMs.toFixed(1)}`,
    antialias: antialiasText(r),
    // G5: the post stack's passes in force (none on Low).
    post: renderer.postPasses.join(' ') || 'none',
    'draw calls': drawn.calls,
    triangles: drawn.triangles,
    'programs / geometries / textures': `${drawn.programs} / ${drawn.geometries} / ${drawn.textures}`,
  };
}

/**
 * A report (audit CORE-04, CORE-32, IM7): the build and browser, the game's state, `error` for a crash, and the console's
 * recent errors and the session's recent events. Never throws: whatever can't be read is left out.
 */
export function reportInfo(r: GameReadout, title: string, error?: unknown): ReportInfo {
  const guarded = <T>(f: () => T, none: T): T => {
    try {
      return f();
    } catch {
      return none;
    }
  };
  const s = r.session();
  return {
    title,
    build: __BUILD_VERSION__.label,
    userAgent: navigator.userAgent,
    fields: guarded(() => reportFields(r), []),
    error,
    lists: [
      { label: 'Recent errors', entries: guarded(() => r.errors.lines(), []) },
      { label: 'Recent events', entries: guarded(() => (s ? s.eventLog.lines(s.state.tick, s.state.characters, s.player.id) : []), []) },
    ],
  };
}

/** The diagnostics report as text (Settings → Dev → Diagnostics; audit CORE-32): the crash report's, with no error. */
export function diagnosticsText(r: GameReadout): string {
  return crashReport(reportInfo(r, 'Airsoft diagnostics'));
}

/**
 * The game's state for a crash or diagnostics report (audit CORE-04, CORE-32), read defensively: it may run after an
 * error left things half-done, so each value falls back to '-' rather than throwing.
 */
function reportFields(g: GameReadout): ReportField[] {
  const read = <T>(f: () => T): T | '-' => {
    try {
      return f();
    } catch {
      return '-';
    }
  };
  const s = g.session();
  const range = s?.kind === 'range';
  const match = s?.kind === 'match' ? s : null;
  const r = match?.state.round;
  const renderer = g.renderer;
  const stats = renderer.stats;
  const dev = g.dev();
  return [
    // When, in what language, and how long the page has been open (IM7).
    ['Time', read(() => `${new Date().toISOString()}, page open ${clockText(performance.now() / 1000)}`)],
    ['Language', read(() => navigator.language)],
    ['Seed', g.seed()],
    ['Map', read(() => (range ? 'range' : match ? match.setup.map.name : '-'))],
    ['Mode', read(() => (match ? `${match.mode}, ${match.setup.difficulty} (teammates ${match.setup.teammateDifficulty})` : range ? 'practice' : '-'))],
    // The ruleset, the light the map plays under and the run's state (audit CORE-02): where most new crashes come from.
    ['Rules', read(() => (match ? match.setup.ruleset : g.ruleset()))],
    ['Lighting', read(() => (match ? lightingPicked(match.setup.map) : '-'))],
    ['Round', read(() => (r ? `${r.number} (${r.phase}), score ${r.score[0]}–${r.score[1]}, draws ${r.draws}` : '-'))],
    ...(match?.mode === 'extraction' && r ? [['Run', read(() => runReportLine(r.run))] as const] : []),
    ['Tick', read(() => s?.state.tick ?? '-')],
    ['Match time', read(() => (s ? clockText(s.state.time) : '-'))],
    ['Screen', read(() => (g.inPlay() && s ? 'in play' : `menus: ${g.menuScreen()}`))],
    // Where the player is, looks and what they're doing (IM7): a thread can go to the spot.
    ['Player', read(() => (s ? playerLine(s.player) : '-'))],
    ['Frames', read(() => framesLine(g.frames(), g.simMs(), g.drawMs()))],
    ['Quality', read(() => qualityText(g))],
    ['Retro pixels', read(() => {
      const look = g.retro();
      return look ? `${look.pixelSize} px, ${look.levels} levels` : 'off';
    })],
    ['Post', read(() => renderer.postPasses.join(' ') || 'none')],
    ['Pixel ratio', read(() => renderer.renderer.getPixelRatio())],
    ['Renderer', renderer.backend],
    ['GPU', read(() => {
      const gl = renderer.webglContext;
      return gl ? rendererName(gl) : g.adapterName || '-';
    })],
    ['Window', `${window.innerWidth} × ${window.innerHeight} at ${window.devicePixelRatio}`],
    ['Sim ticks/s', g.tickRate()],
    ['Draw calls / triangles', read(() => `${stats.calls} / ${stats.triangles}`)],
    ['Memory', read(() => memoryLine((performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory, stats))],
    ['Load', read(() => loadLine(performance.getEntriesByType('resource') as PerformanceResourceTiming[], mainScriptUrl(), pageLoadedAt(), g.readyAt()))],
    ['Dev settings', dev ? JSON.stringify(dev) : 'off'],
    // Pending slider writes (FA5's saveSettingSoon) go first, so the stored settings are the ones in use.
    ['Settings', read(() => {
      flushSettings();
      return browserStorage()?.getItem(SETTINGS_KEY) ?? '-';
    })],
  ];
}

/** The quality line: the choice, and the render scale, pixel ratio and shadow map in force. */
function qualityText(r: GameReadout): string {
  const q = r.quality();
  return qualityLine(q.choice, q.automatic, q.settings);
}

/** The debug overlay's antialiasing line (REN-21): asked for, given, and the samples per pixel. */
function antialiasText(r: GameReadout): string {
  const renderer = r.renderer;
  return `${r.quality().settings.antialias ? 'on' : 'off'} asked, ${renderer.antialiased ? 'on' : 'off'} given (${renderer.samples} samples)`;
}

/** The page's own script (index.html's module), as Resource Timing names it: the main file of a load line (IM7). */
function mainScriptUrl(): string {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '';
}

/** When the page finished loading (ms after it opened), or 0 if the browser doesn't say. */
function pageLoadedAt(): number {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav?.loadEventEnd ?? 0;
}
