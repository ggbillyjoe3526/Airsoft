import './style.css';
import { CRASH_TEXT, WEBGL_ERROR } from './config/crash';
import { parseQuality, startingQuality } from './config/render';
import { crashReport } from './core/crashReport';
import { parseSeed, randomSeed } from './core/seed';
import { Game } from './game';
// Reads pool.md at start (M26a), so a row it can't read is reported in the console straight away.
import './pool/gamePool';
import { lacksHardwareAcceleration } from './render/gpuCheck';
import { CrashScreen } from './ui/crashScreen';
import { loadSavedQuality } from './ui/menus/savedChoices';

/** The game once it has started; until then an error is a start-up failure. */
let running: Game | null = null;
/** Set once the start-up failure pane is up, so a second error doesn't stack another. */
let bootFailed: CrashScreen | null = null;
/** The visit's seed once it is picked, for the start-up report. */
let bootSeed: number | null = null;

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');
  const params = new URLSearchParams(window.location.search);
  // A fresh seed each load, so the bots' plans differ from session to session; ?seed=N replays one
  // (the debug overlay shows the seed in use). An unreadable ?seed= value is ignored.
  const seed = parseSeed(params.get('seed')) ?? randomSeed();
  bootSeed = seed;
  // The saved render preset (Settings → Graphics); ?quality=low|medium|high picks another for this visit, to measure
  // frame cost (the debug overlay shows which). With neither, a browser drawing in software starts on Low (audit
  // M-02). Decided before the renderer is made, so its antialiasing matches.
  const softwareRendering = lacksHardwareAcceleration();
  const quality = startingQuality(parseQuality(params.get('quality')), loadSavedQuality(), softwareRendering);
  const game = await Game.create(container, {
    // ?nolock works on the dev server and in the smoke test's `e2e` build, never in a normal release build.
    allowUnlocked: (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && params.has('nolock'),
    // ?script=perf drives the player from config/perfScript.ts for the perf harness (pipeline/perf-run.mjs).
    scriptedPlayer: (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && params.get('script') === 'perf',
    seed,
    quality: quality.preset,
    automaticQuality: quality.automatic,
    softwareRendering,
  });
  running = game;
  game.start();
  document.getElementById('loading')?.remove();
  // The console handle (and the smoke test's): dev server and the `e2e` build only.
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') (window as unknown as { airsoft: Game }).airsoft = game;
}

/**
 * The game couldn't start (audit CORE-28): the loading text goes, and the crash pane says so, with advice when the
 * browser has no WebGL, and a report with the build, the browser and the seed.
 */
function bootFailure(error: unknown): void {
  console.error(error);
  document.getElementById('loading')?.remove();
  const report = crashReport({ title: 'Airsoft start-up report', build: __BUILD_VERSION__.label, userAgent: navigator.userAgent, fields: [['Address', window.location.search || '-'], ['Seed', bootSeed]], error });
  if (bootFailed) {
    bootFailed.append(report);
    return;
  }
  const webGl = error instanceof Error && WEBGL_ERROR.test(error.message);
  bootFailed = new CrashScreen(document.getElementById('app') ?? document.body, {
    heading: CRASH_TEXT.bootHeading,
    body: CRASH_TEXT.bootBody,
    advice: webGl ? CRASH_TEXT.bootWebGl : '',
    report,
  });
}

/**
 * An error nobody caught, in an event handler or a promise (audit UI-02): the game stops and says so, as for an error in
 * its loop (Game.crash). Ignored: errors without an error object (a cross-origin script's "Script error.", Chrome's
 * benign "ResizeObserver loop" note) and a browser API's refusal (a DOMException: pointer lock, audio, clipboard,
 * fullscreen), which the game already handles where it asks.
 */
function uncaught(error: unknown): void {
  if (error === null || error === undefined || error instanceof DOMException) return;
  if (running) running.crash(error);
  else bootFailure(error);
}

window.addEventListener('error', (e) => uncaught(e.error));
window.addEventListener('unhandledrejection', (e) => uncaught(e.reason));

main().catch(bootFailure);
