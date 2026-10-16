import { stackTags } from './tagStack';

/** Pixels between two name tags stacked over close teammates (BP5). */
const STACK_GAP = 2;

/**
 * A small marker with the name over each teammate (never over an enemy), so you know where they are and don't put a
 * BB in them: in the team's colour while they're in play, grey once they've called a hit. MatchPresentation projects
 * the positions (`show` or `hide` for each, then `commit`); the DOM is only touched when what a marker shows changes.
 * Close teammates' tags stack rather than overlap (BP5, ui/tagStack.ts): each marker's size is read from the page only
 * when its words change or it comes back into view.
 */
export class TeammateMarkers {
  private readonly markers: {
    root: HTMLDivElement;
    label: HTMLSpanElement;
    x: number;
    y: number;
    visible: boolean;
    hit: boolean;
    mag: boolean;
    /** Its size is to be read again before it is laid out (its words changed, or it was hidden). */
    measure: boolean;
  }[];
  /** This frame's anchors, sizes and visibility (show / hide), laid out together by commit. */
  private readonly wantX: Float64Array;
  private readonly wantY: Float64Array;
  private readonly width: Float64Array;
  private readonly height: Float64Array;
  private readonly shown: boolean[];
  private readonly order: Int32Array;
  private readonly placedY: Float64Array;
  /** The HUD size the sizes were read at (`--hud-scale` on the container): a change reads them all again. */
  private scale = '';

  /** One marker per teammate, in `color` (CSS), labelled with `names`. */
  constructor(
    private readonly parent: HTMLElement,
    names: readonly string[],
    color: string,
  ) {
    this.markers = names.map((name) => {
      const root = document.createElement('div');
      root.className = 'mate-marker';
      root.hidden = true;
      root.style.setProperty('--team', color);
      const label = document.createElement('span');
      label.textContent = name;
      root.append(label, document.createElement('i'));
      parent.appendChild(root);
      return { root, label, x: Number.NaN, y: Number.NaN, visible: false, hit: false, mag: false, measure: true };
    });
    const n = this.markers.length;
    this.wantX = new Float64Array(n);
    this.wantY = new Float64Array(n);
    this.width = new Float64Array(n);
    this.height = new Float64Array(n);
    this.shown = this.markers.map(() => false);
    this.order = new Int32Array(n);
    this.placedY = new Float64Array(n);
  }

  /** Marker `i` labelled `name` instead (BN1: the bot's roster name, once the match has drawn it). */
  rename(i: number, name: string): void {
    const m = this.markers[i];
    if (m && m.label.textContent !== name) {
      m.label.textContent = name;
      m.measure = true;
    }
  }

  /** Marker `i` wanted at (x, y) pixels this frame (the tip, just over the head); `hit`: greyed out. Placed by `commit`. */
  show(i: number, x: number, y: number, hit: boolean): void {
    const m = this.markers[i]!;
    if (!m.visible) {
      m.root.hidden = !(m.visible = true);
      m.measure = true;
    }
    if (hit !== m.hit) {
      m.root.classList.toggle('hit', (m.hit = hit));
      m.measure = true;
    }
    this.wantX[i] = x;
    this.wantY[i] = y;
    this.shown[i] = true;
  }

  /**
   * Places the markers shown this frame, a tag over a close teammate's stacked above theirs. Sizes are read first and
   * transforms written after, so a frame costs at most one layout, and none once every size is known.
   */
  commit(): void {
    const n = this.markers.length;
    const scale = this.parent.style.getPropertyValue('--hud-scale');
    if (scale !== this.scale) {
      this.scale = scale;
      for (const m of this.markers) m.measure = true;
    }
    for (let i = 0; i < n; i++) {
      const m = this.markers[i]!;
      if (!this.shown[i] || !m.measure) continue;
      this.width[i] = m.root.offsetWidth;
      this.height[i] = m.root.offsetHeight;
      m.measure = false;
    }
    stackTags(n, this.wantX, this.wantY, this.width, this.height, this.shown, STACK_GAP, this.order, this.placedY);
    for (let i = 0; i < n; i++) {
      if (!this.shown[i]) continue;
      const m = this.markers[i]!;
      const rx = Math.round(this.wantX[i]!);
      const ry = Math.round(this.placedY[i]!);
      if (rx !== m.x || ry !== m.y) {
        m.x = rx;
        m.y = ry;
        m.root.style.transform = `translate(${rx}px, ${ry}px)`;
      }
    }
  }

  /** Marker `i` tagged "mag" (MG1): that teammate is asking you for a magazine, or bringing you one. */
  setMag(i: number, on: boolean): void {
    const m = this.markers[i];
    if (m && on !== m.mag) {
      m.root.classList.toggle('mag', (m.mag = on));
      m.measure = true;
    }
  }

  hide(i: number): void {
    const m = this.markers[i]!;
    this.shown[i] = false;
    if (m.visible) m.root.hidden = !(m.visible = false);
  }

  hideAll(): void {
    for (let i = 0; i < this.markers.length; i++) this.hide(i);
  }

  dispose(): void {
    for (const m of this.markers) m.root.remove();
  }
}
