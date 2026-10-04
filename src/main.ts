import './style.css';
import { parseQuality, startingQuality } from './config/render';
import { parseSeed, randomSeed } from './core/seed';
import { Game } from './game';
// Reads pool.md at start (M26a), so a row it can't read is reported in the console straight away.
import './pool/gamePool';
import { gpuTier, probeGpu } from './render/gpuCheck';
import { loadCustomQuality, loadSavedQuality } from './ui/menus/savedChoices';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');
  const params = new URLSearchParams(window.location.search);
  // A fresh seed each load, so the bots' plans differ from session to session; ?seed=N replays one
  // (the debug overlay shows the seed in use). An unreadable ?seed= value is ignored.
  const seed = parseSeed(params.get('seed')) ?? randomSeed();
  // The saved render quality (Settings → Graphics: a preset or the Custom mix); ?quality=low|medium|high|custom picks
  // another for this visit, to measure frame cost (the debug overlay shows which). With neither, the GPU decides: Low in
  // a browser drawing in software (audit M-02), Medium on integrated graphics, High on a discrete card (REN-03). Decided
  // before the renderer is made, so its first context is the right one.
  const gpu = probeGpu();
  const softwareRendering = gpu.software;
  const quality = startingQuality(parseQuality(params.get('quality')), loadSavedQuality(), loadCustomQuality(), gpuTier(gpu.name, gpu.software));
  const game = await Game.create(container, {
    // ?nolock works on the dev server and in the smoke test's `e2e` build, never in a normal release build.
    allowUnlocked: (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && params.has('nolock'),
    // ?script=perf drives the player from config/perfScript.ts for the perf harness (pipeline/perf-run.mjs).
    scriptedPlayer: (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && params.get('script') === 'perf',
    seed,
    quality: quality.choice,
    qualitySettings: quality.settings,
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
