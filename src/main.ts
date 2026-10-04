import './style.css';
import { LOADING } from './config/loading';
import { parseQuality, startingQuality } from './config/render';
import { parseSeed, randomSeed } from './core/seed';
import { Game } from './game';
// Reads pool.md at start (M26a), so a row it can't read is reported in the console straight away.
import './pool/gamePool';
import { initPhysics } from './physics/physicsWorld';
import { lacksHardwareAcceleration } from './render/gpuCheck';
import { chunkInfo, prefetchWithProgress } from './ui/loadingProgress';
import { LoadingScreen } from './ui/loadingScreen';
import { loadSavedQuality } from './ui/menus/savedChoices';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');
  // The loading bar (audit CORE-10): the physics chunk's download as it arrives, then starting physics and the game.
  const loading = LoadingScreen.find();
  const chunk = chunkInfo(document.querySelector(`meta[name="${LOADING.chunkMeta}"]`));
  if (chunk) {
    loading?.show(0, LOADING.text.download);
    await prefetchWithProgress(chunk, (share) => loading?.show(share * LOADING.downloadShare, LOADING.text.download));
  }
  loading?.show(LOADING.physicsAt, LOADING.text.physics);
  await initPhysics();
  loading?.show(LOADING.gameAt, LOADING.text.game);
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
  loading?.remove();
  // The console handle (and the smoke test's): dev server and the `e2e` build only.
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') (window as unknown as { airsoft: Game }).airsoft = game;
}

main().catch((err: unknown) => {
  console.error(err);
  LoadingScreen.find()?.fail(err instanceof Error ? err.message : String(err));
});
