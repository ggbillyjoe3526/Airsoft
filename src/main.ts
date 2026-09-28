import './style.css';
import { Game } from './game';
import { TEST_YARD } from './map/testYard';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');
  const params = new URLSearchParams(window.location.search);
  const game = await Game.create(container, TEST_YARD, {
    allowUnlocked: import.meta.env.DEV && params.has('nolock'),
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
