import './style.css';
import { parseQuality, startingQuality } from './config/render';
import { parseSeed, randomSeed } from './core/seed';
import { Game } from './game';
// Reads pool.md at start (M26a), so a row it can't read is reported in the console straight away.
import './pool/gamePool';
import { lacksHardwareAcceleration } from './render/gpuCheck';
import { loadSavedQuality } from './ui/menus/savedChoices';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');
  const params = new URLSearchParams(window.location.search);
  // A fresh seed each load, so the bots' plans differ from session to session; ?seed=N replays one
  // (the debug overlay shows the seed in use). An unreadable ?seed= value is ignored.
  const seed = parseSeed(params.get('seed')) ?? randomSeed();
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
  game.start();
  document.getElementById('loading')?.remove();
  // The console handle (and the smoke test's): dev server and the `e2e` build only.
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') (window as unknown as { airsoft: Game }).airsoft = game;
}

main().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
