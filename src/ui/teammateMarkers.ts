/**
 * A small marker with the name over each teammate (never over an enemy), so you know where they are and don't put a
 * BB in them: in the team's colour while they're in play, grey once they've called a hit. MatchPresentation projects
 * the positions; the DOM is only touched when what a marker shows changes.
 */
export class TeammateMarkers {
  private readonly markers: {
    root: HTMLDivElement;
    x: number;
    y: number;
    visible: boolean;
    hit: boolean;
  }[];

  /** One marker per teammate, in `color` (CSS), labelled with `names`. */
  constructor(parent: HTMLElement, names: readonly string[], color: string) {
    this.markers = names.map((name) => {
      const root = document.createElement('div');
      root.className = 'mate-marker';
      root.hidden = true;
      root.style.setProperty('--team', color);
      const label = document.createElement('span');
      label.textContent = name;
      root.append(label, document.createElement('i'));
      parent.appendChild(root);
      return { root, x: Number.NaN, y: Number.NaN, visible: false, hit: false };
    });
  }

  /** Marker `i` at (x, y) pixels (the tip, just over the head); `hit`: greyed out. */
  show(i: number, x: number, y: number, hit: boolean): void {
    const m = this.markers[i]!;
    if (!m.visible) m.root.hidden = !(m.visible = true);
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== m.x || ry !== m.y) {
      m.x = rx;
      m.y = ry;
      m.root.style.transform = `translate(${rx}px, ${ry}px)`;
    }
    if (hit !== m.hit) m.root.classList.toggle('hit', (m.hit = hit));
  }

  hide(i: number): void {
    const m = this.markers[i]!;
    if (m.visible) m.root.hidden = !(m.visible = false);
  }

  hideAll(): void {
    for (let i = 0; i < this.markers.length; i++) this.hide(i);
  }

  dispose(): void {
    for (const m of this.markers) m.root.remove();
  }
}
