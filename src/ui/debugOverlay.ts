/** Lines of diagnostic text supplied by the game each refresh. */
export type DebugStatsProvider = () => Record<string, string | number>;

const REFRESH_INTERVAL = 0.25;

/**
 * Toggleable diagnostics panel (FPS, frame time, entity counts, anything the game adds). With the panel hidden, the FPS
 * readout (Settings → Graphics → Show FPS, UI-06) shows its first line alone.
 */
export class DebugOverlay {
  visible = false;
  /** The FPS line on its own while the panel is hidden. */
  private fpsReadout = false;
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
    this.showState();
  }

  /** The FPS readout on or off (shown while the panel is hidden). */
  setFpsReadout(on: boolean): void {
    this.fpsReadout = on;
    this.showState();
  }

  private showState(): void {
    this.el.hidden = !this.visible && !this.fpsReadout;
    this.el.classList.toggle('fps-readout', !this.visible && this.fpsReadout);
  }

  /** Call every drawn frame with the time since the last one drawn, in seconds. */
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
    if (this.visible || this.fpsReadout) this.render();
  }

  dispose(): void {
    this.el.remove();
  }

  private render(): void {
    if (!this.visible) {
      this.el.textContent = `${this.fps.toFixed(0)} FPS · ${this.avgMs.toFixed(1)} ms`;
      return;
    }
    const lines = [
      `FPS ${this.fps.toFixed(0)}  avg ${this.avgMs.toFixed(1)}ms  worst ${this.worstMs.toFixed(1)}ms`,
    ];
    for (const [k, v] of Object.entries(this.provider())) lines.push(`${k}: ${v}`);
    this.el.textContent = lines.join('\n');
  }
}
