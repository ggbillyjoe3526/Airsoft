import { PINGS } from '../config/pings';
import { restartAnimation } from './restartAnimation';

/** What a ping marks (ai/pings.ts PingKind): a spot, or an enemy seen there. */
export type ShownPingKind = 'spot' | 'enemy';

/** One ping as the HUD shows it (PG1): whose it is, what it marks, where (the marker's point) and when it was placed. */
export interface ShownPing {
  /** The character it is from: you, or one of your bot teammates (a mark). */
  readonly owner: number;
  kind: ShownPingKind;
  x: number;
  y: number;
  z: number;
  /** Simulation time it was placed; NaN while the slot holds no ping. */
  at: number;
}

/** How solid a ping placed `age` seconds ago shows: 1, then down to 0 over its last PINGS.fadeTime, 0 once gone. */
export function pingAlpha(age: number): number {
  if (!(age >= 0) || age >= PINGS.lifetime) return 0;
  return Math.min(1, (PINGS.lifetime - age) / PINGS.fadeTime);
}

/** One marker's element and what it last showed, so the DOM is only touched when that changes. */
interface Node {
  root: HTMLDivElement;
  /** The ring, which pops in (pings.css), and the line under it. */
  ring: HTMLElement;
  label: HTMLSpanElement;
  visible: boolean;
  x: number;
  y: number;
  metres: number;
  kind: ShownPingKind | '';
  edge: boolean;
  alpha: number;
}

/**
 * The ping markers over the field (PG1): one slot per player on your team, so each has at most one ping; a new one takes
 * the old one's place. A ring over the spot with what it marks and its distance ("Ping · 24 m"), in your team's colour,
 * or the other team's for a contact; it pops in, is pinned to the screen's edge while out of view, and fades at the end
 * of PINGS.lifetime. MatchPresentation projects them each frame; the minimap draws the same `pings`.
 */
export class PingMarkers {
  /** Every slot, placed or not (`at` NaN): the minimap reads them too. */
  readonly pings: ShownPing[];
  private readonly nodes: Node[];
  private shown = true;

  /** `owners`: you and your teammates, by character id; `mine` / `theirs`: the two teams' colours (CSS). */
  constructor(parent: HTMLElement, owners: readonly number[], mine: string, theirs: string) {
    this.pings = owners.map((owner) => ({ owner, kind: 'spot', x: 0, y: 0, z: 0, at: Number.NaN }));
    this.nodes = owners.map(() => {
      const root = document.createElement('div');
      root.className = 'ping-marker';
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
      root.style.setProperty('--ping-mine', mine);
      root.style.setProperty('--ping-theirs', theirs);
      const ring = document.createElement('i');
      const label = document.createElement('span');
      root.append(ring, label);
      parent.appendChild(root);
      return { root, ring, label, visible: false, x: Number.NaN, y: Number.NaN, metres: -1, kind: '', edge: false, alpha: -1 };
    });
  }

  /** `owner` pinged `kind` at `point` (simulation time `time`), in place of their last one. Unknown owners are ignored. */
  place(owner: number, kind: ShownPingKind, point: { readonly x: number; readonly y: number; readonly z: number }, time: number): void {
    const i = this.pings.findIndex((p) => p.owner === owner);
    if (i < 0) return;
    const p = this.pings[i]!;
    p.kind = kind;
    p.x = point.x;
    p.y = point.y;
    p.z = point.z;
    p.at = time;
    // The pop plays again for a new ping in the same slot (pings.css .ping-marker i.pop); a hidden one plays it as it shows.
    restartAnimation(this.nodes[i]!.ring, 'pop');
  }

  /** Settings › HUD › Ping markers: false hides every marker (the pings themselves go on). */
  setShown(on: boolean): void {
    this.shown = on;
    if (!on) this.hideAll();
  }

  get markersShown(): boolean {
    return this.shown;
  }

  /** Slot `i` at (x, y) px, `metres` away, pinned to the edge (`edge`), as solid as `alpha`. */
  show(i: number, x: number, y: number, metres: number, edge: boolean, alpha: number): void {
    const n = this.nodes[i]!;
    const p = this.pings[i]!;
    if (!this.shown || alpha <= 0) {
      this.hide(i);
      return;
    }
    if (!n.visible) n.root.hidden = !(n.visible = true);
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== n.x || ry !== n.y) {
      n.x = rx;
      n.y = ry;
      n.root.style.transform = `translate(${rx}px, ${ry}px)`;
    }
    const m = Math.round(metres);
    if (m !== n.metres || p.kind !== n.kind) {
      n.metres = m;
      n.label.textContent = `${PINGS.labels[p.kind]} · ${m} m`;
    }
    if (p.kind !== n.kind) n.root.classList.toggle('enemy', (n.kind = p.kind) === 'enemy');
    if (edge !== n.edge) n.root.classList.toggle('edge', (n.edge = edge));
    // In steps of 5 %, so a fade writes the style at most 20 times.
    const a = Math.round(alpha * 20) / 20;
    if (a !== n.alpha) n.root.style.setProperty('--ping-alpha', String((n.alpha = a)));
  }

  hide(i: number): void {
    const n = this.nodes[i]!;
    if (n.visible) n.root.hidden = !(n.visible = false);
  }

  hideAll(): void {
    for (let i = 0; i < this.nodes.length; i++) this.hide(i);
  }

  /** A new round: every ping gone. */
  clear(): void {
    for (const p of this.pings) p.at = Number.NaN;
    this.hideAll();
  }

  dispose(): void {
    for (const n of this.nodes) n.root.remove();
  }
}
