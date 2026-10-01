/**
 * A small flag icon over the pole in flag mode, with the distance to it, so you can always find the
 * objective; pinned to the edge of the screen when the pole is out of view. The DOM is only touched
 * when what it shows changes.
 */
export class FlagMarker {
  private readonly root: HTMLDivElement;
  private readonly distance: HTMLSpanElement;
  private shownX = Number.NaN;
  private shownY = Number.NaN;
  private shownMetres = -1;
  private shownVisible = false;
  private shownColor = '';
  private shownEdge = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'flag-marker';
    this.root.hidden = true;
    this.root.innerHTML = '<i class="flag-marker-icon"></i><span></span>';
    this.distance = this.root.querySelector('span') as HTMLSpanElement;
    parent.appendChild(this.root);
  }

  /** Shows the marker at (x, y) pixels, `metres` away, in the colour `color` (CSS); `edge` when pinned to the screen edge. */
  show(x: number, y: number, metres: number, color: string, edge: boolean): void {
    if (!this.shownVisible) this.root.hidden = !(this.shownVisible = true);
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== this.shownX || ry !== this.shownY) {
      this.shownX = rx;
      this.shownY = ry;
      this.root.style.transform = `translate(${rx}px, ${ry}px)`;
    }
    const m = Math.round(metres);
    if (m !== this.shownMetres) this.distance.textContent = `${(this.shownMetres = m)} m`;
    if (color !== this.shownColor) this.root.style.setProperty('--flag', (this.shownColor = color));
    if (edge !== this.shownEdge) this.root.classList.toggle('edge', (this.shownEdge = edge));
  }

  hide(): void {
    if (this.shownVisible) this.root.hidden = !(this.shownVisible = false);
  }

  dispose(): void {
    this.root.remove();
  }
}
