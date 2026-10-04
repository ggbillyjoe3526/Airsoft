import { LOADING } from '../config/loading';

/**
 * The loading screen index.html draws before any script runs (audit UI-12): the wordmark, a 2 px bar and a line of
 * text. The page shows the bar sliding (nothing is known yet); once the game's code runs it fills to what has really
 * happened (CORE-10), says which step is under way, and goes when the game is ready.
 */
export class LoadingScreen {
  private constructor(
    private readonly root: HTMLElement,
    private readonly bar: HTMLElement | null,
    private readonly fill: HTMLElement | null,
    private readonly text: HTMLElement | null,
  ) {}

  /** The screen in the page, or null once it's gone. */
  static find(): LoadingScreen | null {
    const root = document.getElementById('loading');
    if (!root) return null;
    const bar = root.querySelector<HTMLElement>('.loading-bar');
    return new LoadingScreen(root, bar, bar?.querySelector<HTMLElement>('div') ?? null, root.querySelector<HTMLElement>('.loading-text'));
  }

  /** The bar at `share` (0–1) of the way, with `text` under it. */
  show(share: number, text: string): void {
    const percent = Math.round(Math.max(0, Math.min(1, share)) * 100);
    this.bar?.classList.remove('indeterminate');
    this.bar?.setAttribute('aria-valuenow', String(percent));
    // A transform, so the bar moves without a layout.
    if (this.fill) this.fill.style.transform = `scaleX(${percent / 100})`;
    if (this.text && this.text.textContent !== text) this.text.textContent = text;
  }

  /** Starting failed: the bar stops and the line says why. */
  fail(reason: string): void {
    this.root.classList.add('failed');
    const message = `${LOADING.text.failed}: ${reason}`;
    if (this.text) this.text.textContent = message;
    else this.root.textContent = message;
  }

  remove(): void {
    this.root.remove();
  }
}
