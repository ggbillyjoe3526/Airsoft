/**
 * Where your teammates hold (squad order Hold here, M22): a small diamond over the held spot with the distance to it,
 * pinned to the edge of the screen when the spot is out of view. The DOM is only touched when what it shows changes.
 */
export class HoldMarker {
  private readonly root: HTMLDivElement;
  private readonly distance: HTMLSpanElement;
  private shownX = Number.NaN;
  private shownY = Number.NaN;
  private shownMetres = -1;
  private shownVisible = false;
  private shownEdge = false;

  /** `team`: yours, whose colour the diamond is (a CSS colour, see teamCss). */
  constructor(parent: HTMLElement, teamColour: string) {
    this.root = document.createElement('div');
    this.root.className = 'hold-marker';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.setProperty('--team', teamColour);
    this.root.innerHTML = '<i></i><span></span>';
    this.distance = this.root.querySelector('span') as HTMLSpanElement;
    parent.appendChild(this.root);
  }

  /** Shows the marker at (x, y) pixels, `metres` away; `edge` when pinned to the screen edge. */
  show(x: number, y: number, metres: number, edge: boolean): void {
    if (!this.shownVisible) this.root.hidden = !(this.shownVisible = true);
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== this.shownX || ry !== this.shownY) {
      this.shownX = rx;
      this.shownY = ry;
      this.root.style.transform = `translate(${rx}px, ${ry}px)`;
    }
    const m = Math.round(metres);
    if (m !== this.shownMetres) this.distance.textContent = `Hold · ${(this.shownMetres = m)} m`;
    if (edge !== this.shownEdge) this.root.classList.toggle('edge', (this.shownEdge = edge));
  }

  hide(): void {
    if (this.shownVisible) this.root.hidden = !(this.shownVisible = false);
  }

  dispose(): void {
    this.root.remove();
  }
}
