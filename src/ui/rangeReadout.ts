/** Before your first shot. */
export const RANGE_INTRO = 'Practice range · spare magazines refill · Esc for the Loadout';

/** What the practice range's readout shows about your last BB (M21). */
export interface LastShot {
  /** How far from you it landed (m), along the ground. */
  distance: number;
  /** The target it hit ("Steel", "Figure" …) and that target's marked distance, or null for a miss. */
  target: { label: string; distance: number } | null;
  /** It left the range (over a wall or the backstop) without landing anywhere. */
  lost?: boolean;
}

/** "Last BB: 31 m · hit Steel 30 m", "Last BB: 44 m · miss" or that it flew out; before the first shot, how the range works. */
export function lastShotText(shot: LastShot | null): string {
  if (!shot) return RANGE_INTRO;
  if (shot.lost) return 'Last BB: flew out of the range · aim lower or turn the hop-up down';
  const d = `${Math.round(shot.distance)} m`;
  return shot.target ? `Last BB: ${d} · hit ${shot.target.label} ${shot.target.distance} m` : `Last BB: ${d} · miss`;
}

/**
 * The practice range's readout (M21), top centre: where your last BB landed, and which target it hit. The same
 * text as before is never written twice, so it costs nothing per frame.
 */
export class RangeReadout {
  private readonly root: HTMLDivElement;
  private shown = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'range-readout';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  set(text: string): void {
    if (text === this.shown) return;
    this.shown = text;
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}
