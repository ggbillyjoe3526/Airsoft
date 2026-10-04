/** What BuildTiming needs of the browser's (or Node's) `performance`; a stub stands in for it in tests. */
export interface PerfClock {
  now(): number;
  measure(name: string, options: { start: number; end: number }): unknown;
}

/**
 * Times the phases of a build (audit CORE-33: the match build), each as a `performance.measure` entry (DevTools'
 * Performance panel shows them by name) and as milliseconds for one summary line (`?perf` logs it, Game). A phase is
 * the time since the previous one ended, or since the timing began.
 */
export class BuildTiming {
  private readonly phases: { name: string; ms: number }[] = [];
  private readonly began: number;
  private last: number;
  /** Notes for the summary line, such as "map meshes reused". */
  readonly notes: string[] = [];

  constructor(
    private readonly label: string,
    private readonly clock: PerfClock = performance,
  ) {
    this.began = this.last = clock.now();
  }

  /** The phase `name` ended now. */
  phase(name: string): void {
    const now = this.clock.now();
    this.clock.measure(`${this.label}: ${name}`, { start: this.last, end: now });
    this.phases.push({ name, ms: now - this.last });
    this.last = now;
  }

  /** Milliseconds from the start to the end of the last phase. */
  get totalMs(): number {
    return this.last - this.began;
  }

  /** `match build 812 ms (map meshes reused) · map meshes 3 · lighting 30 · …`, whole milliseconds. */
  line(): string {
    const notes = this.notes.length > 0 ? ` (${this.notes.join(', ')})` : '';
    return [`${this.label} ${Math.round(this.totalMs)} ms${notes}`, ...this.phases.map((p) => `${p.name} ${Math.round(p.ms)}`)].join(' · ');
  }
}
