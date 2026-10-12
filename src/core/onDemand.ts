/**
 * Code fetched the first time it is needed (IM1), so the start-up file carries only what the first screen uses: `load`
 * fetches it once (a failed fetch is tried again by the next call), `get` returns it once it has arrived, and
 * `preloadWhenIdle` fetches it in the background once the page has nothing else to do, so its first use rarely waits.
 */
export class OnDemand<T> {
  private value: T | null = null;
  private pending: Promise<T> | null = null;
  /** Cancels the preload scheduled and not yet begun. */
  private cancelIdle: (() => void) | null = null;

  constructor(private readonly fetch: () => Promise<T>) {}

  /** What was fetched, or null until it has arrived. */
  get(): T | null {
    return this.value;
  }

  /** Fetches it, once: every call until it arrives shares the one fetch, and one that fails lets the next call try again. */
  load(): Promise<T> {
    this.pending ??= this.fetch().then(
      (value) => (this.value = value),
      (error: unknown) => {
        this.pending = null;
        throw error;
      },
    );
    return this.pending;
  }

  /**
   * Fetches it once the page is idle, or `withinMs` from now at the latest (then, in a browser without idle callbacks).
   * A failure is left for the first use, which fetches again and can say so.
   */
  preloadWhenIdle(withinMs: number): void {
    if (this.value || this.pending || this.cancelIdle) return;
    const run = (): void => {
      this.cancelIdle = null;
      this.load().catch(() => undefined);
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: withinMs });
      this.cancelIdle = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(run, withinMs);
      this.cancelIdle = () => clearTimeout(id);
    }
  }

  /** Drops a preload not yet begun (its owner is being disposed); a fetch already under way runs on harmlessly. */
  cancelPreload(): void {
    this.cancelIdle?.();
    this.cancelIdle = null;
  }
}
