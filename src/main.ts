import './style.css';
import { parseSeed, randomSeed } from './core/seed';
import { Game } from './game';
import { DEPOT } from './map/depot';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');
  const params = new URLSearchParams(window.location.search);
  // A fresh seed each load, so the bots' plans differ from session to session; ?seed=N replays one
  // (the debug overlay shows the seed in use). An unreadable ?seed= value is ignored.
  const seed = parseSeed(params.get('seed')) ?? randomSeed();
  const game = await Game.create(container, DEPOT, {
    // ?nolock works on the dev server and in the smoke test's `e2e` build, never in a normal release build.
    allowUnlocked: (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && params.has('nolock'),
    seed,
  });
  game.start();
  document.getElementById('loading')?.remove();
  if (import.meta.env.DEV) (window as unknown as { airsoft: Game }).airsoft = game;
}

main().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
