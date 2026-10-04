/** Lines of diagnostic text supplied by the game each refresh. */
export type DebugStatsProvider = () => Record<string, string | number>;

const REFRESH_INTERVAL = 0.25;

/** Toggleable diagnostics panel (FPS, frame time, entity counts, anything the game adds). */
export class DebugOverlay {
  visible = false;
  private readonly el: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;
  private worstFrameMs = 0;
  private fps = 0;
  private avgMs = 0;
  private worstMs = 0;

  constructor(
    parent: HTMLElement,
    private readonly provider: DebugStatsProvider,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.el.hidden = !visible;
  }

  /** Call every rendered frame with the real frame time in seconds. */
  frame(dt: number): void {
    this.frames++;
    this.elapsed += dt;
    this.worstFrameMs = Math.max(this.worstFrameMs, dt * 1000);
    if (this.elapsed < REFRESH_INTERVAL) return;

    this.fps = this.frames / this.elapsed;
    this.avgMs = (this.elapsed / this.frames) * 1000;
    this.worstMs = this.worstFrameMs;
    this.frames = 0;
    this.elapsed = 0;
    this.worstFrameMs = 0;
    if (this.visible) this.render();
  }

  dispose(): void {
    this.el.remove();
  }

  private render(): void {
    const lines = [
      `FPS ${this.fps.toFixed(0)}  avg ${this.avgMs.toFixed(1)}ms  worst ${this.worstMs.toFixed(1)}ms`,
    ];
    for (const [k, v] of Object.entries(this.provider())) lines.push(`${k}: ${v}`);
    this.el.textContent = lines.join('\n');
  }
}
