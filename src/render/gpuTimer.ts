/**
 * GPU time per frame for the debug overlay (audit REN-17): one `EXT_disjoint_timer_query_webgl2` query round the
 * frame's draws, read back a frame or more later (never waited for), smoothed. Chrome and Edge offer the extension on
 * desktop; Firefox doesn't, and the overlay then says "n/a". One query object, made once: nothing is allocated per frame.
 */
export class GpuTimer {
  /** Smoothed GPU milliseconds a frame (NaN until a first result, or without the extension). */
  ms = Number.NaN;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly query: WebGLQuery | null;
  /** A query was begun this frame (end() closes it). */
  private open = false;
  /** A closed query whose result hasn't been read yet. */
  private pending = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    /** The weight of each new result in the running average. */
    private readonly smoothing: number,
  ) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    this.query = this.ext ? gl.createQuery() : null;
  }

  get available(): boolean {
    return this.query !== null;
  }

  /** Before the frame's first draw: reads the last result if it's ready, and starts timing this frame if none is pending. */
  begin(): void {
    if (!this.ext || !this.query) return;
    const gl = this.gl;
    if (this.pending && gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) {
      this.pending = false;
      // A disjoint event (a GPU clock change, another app) makes the result meaningless: dropped.
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        const ms = (gl.getQueryParameter(this.query, gl.QUERY_RESULT) as number) / 1e6;
        this.ms = Number.isNaN(this.ms) ? ms : this.ms + (ms - this.ms) * this.smoothing;
      }
    }
    if (this.pending) return;
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
    this.open = true;
  }

  /** After the frame's last draw. */
  end(): void {
    if (!this.open || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.open = false;
    this.pending = true;
  }

  dispose(): void {
    if (this.query) this.gl.deleteQuery(this.query);
  }
}
