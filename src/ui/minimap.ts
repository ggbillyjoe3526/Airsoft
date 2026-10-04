import { MINIMAP } from '../config/minimap';
import type { MapBlock } from '../map/mapTypes';
import { type Terrain, terrainMaxX, terrainMaxZ, terrainRange, vertexHeight } from '../map/terrain';
import { clampToRim, coverHeight, type HeardPlayer, insideCircle, type MapPoint, minimapPixelRatio, noiseAlpha, toMinimap } from './minimapView';

/** A teammate as the minimap shows them: where they are, and whether they've called a hit (greyed). */
export interface MinimapMate {
  x: number;
  z: number;
  hit: boolean;
}

/** What one frame of the minimap shows (filled in place by MatchPresentation, so nothing is made per frame). */
export interface MinimapFrame {
  /** The middle (where you are, or the player you watch) and the way the view looks (game yaw). */
  x: number;
  z: number;
  yaw: number;
  /** Teammates in play or walking off (`count` of `mates` are used). */
  mates: MinimapMate[];
  count: number;
  /** Where your teammates hold (null if they don't hold a spot), and in Attack / Defend the flagpole (null otherwise). */
  hold: { x: number; z: number } | null;
  flag: { x: number; z: number } | null;
  /** Simulation time, for the heard players' fading. */
  time: number;
}

/** The field drawn once per match, in world metres from (x, z) over (width, depth). */
interface FieldLayer {
  canvas: HTMLCanvasElement;
  x: number;
  z: number;
  width: number;
  depth: number;
}

/** The step patch's dashed outline (made once). */
const STEP_DASH: readonly number[] = [3, 3];
const NO_DASH: readonly number[] = [];

/**
 * The minimap (M23), top left while you play: the field round you, turned so the way you look is up, with your
 * teammates always on it (pinned to the rim when further off) and the other team only where you last heard each of
 * them (minimapView.ts HeardPlayers). Everything is drawn on one canvas each frame from a field drawing made once per
 * match; nothing is allocated per frame.
 */
export class Minimap {
  private readonly root: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly field: FieldLayer | null;
  /** The backing canvas's pixels per CSS pixel, and the HUD's scale (style.css --hud-scale), as last laid out. */
  private pixelRatio = 0;
  private scale = 0;
  /** Where the minimap's circle is on the screen (px from the game's top left), for the markers it hides (audit UI-13). */
  private readonly circle = { x: 0, y: 0, r: 0 };
  private readonly at: MapPoint = { x: 0, y: 0 };
  private visible = false;
  /** Whether the other team shows where heard (M23); off under rules that show teammates only (M39). */
  private heardShown = true;

  /** `blocks`: the map's; `mine` / `theirs`: the two teams' HUD colours (CSS); `terrain`: the map's ground, if any. */
  constructor(
    private readonly parent: HTMLElement,
    blocks: readonly MapBlock[],
    private readonly mine: string,
    private readonly theirs: string,
    /** The map's sloping ground, if it has one (M33c): drawn under the blocks, lighter where it is higher. */
    terrain: Terrain | null = null,
  ) {
    this.root = document.createElement('canvas');
    this.root.className = 'minimap';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.ctx = this.root.getContext('2d');
    this.field = drawField(blocks, terrain);
    parent.appendChild(this.root);
    this.layout();
    // The window moved to a screen of another pixel ratio, browser zoom, or the HUD's size changed (audit UI-14).
    globalThis.addEventListener?.('resize', this.layout);
  }

  /** False while a menu is up. Shown again, it is laid out afresh (the HUD's size may have changed on the menus). */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.hidden = !visible;
    if (visible) this.layout();
  }

  /** Heard patches shown (true, M23) or not: teammates only (the Rules picker's minimap switch, M39). */
  setHeardShown(shown: boolean): void {
    this.heardShown = shown;
  }

  /**
   * Whether (x, y), px from the game's top left, is under the minimap's circle while it shows: a teammate marker there
   * would read through it (audit UI-13).
   */
  covers(x: number, y: number): boolean {
    return this.visible && insideCircle(x, y, this.circle.x, this.circle.y, this.circle.r);
  }

  /**
   * Sizes the canvas for the HUD's scale and the screen's pixel ratio, re-read each time (audit UI-14: once per match
   * left it blurry or oversized after a move to another screen), and notes where its circle is.
   */
  private readonly layout = (): void => {
    const scale = Number(this.parent.style.getPropertyValue('--hud-scale')) || 1;
    const ratio = minimapPixelRatio(globalThis.devicePixelRatio);
    if (scale !== this.scale || ratio !== this.pixelRatio) {
      this.scale = scale;
      this.pixelRatio = ratio;
      const px = Math.round(MINIMAP.size * scale * ratio);
      this.root.width = px;
      this.root.height = px;
      // On the container, so the debug panel can move clear of the minimap too (style.css, bug pass).
      this.parent.style.setProperty('--minimap-size', `${MINIMAP.size * scale}px`);
    }
    if (!this.visible) return;
    const box = this.root.getBoundingClientRect();
    const origin = this.parent.getBoundingClientRect();
    this.circle.r = box.width / 2;
    this.circle.x = box.left - origin.left + this.circle.r;
    this.circle.y = box.top - origin.top + this.circle.r;
  };

  /** Once per frame while playing. */
  update(f: MinimapFrame, heard: readonly HeardPlayer[]): void {
    const ctx = this.ctx;
    if (!ctx || !this.visible) return;
    const half = MINIMAP.size / 2;
    const rim = half - 3;
    const scale = rim / MINIMAP.viewRadius;
    const k = this.pixelRatio * this.scale;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, MINIMAP.size, MINIMAP.size);

    // The field, turned with the view, inside the circle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, rim, 0, Math.PI * 2);
    ctx.fillStyle = MINIMAP.colours.backdrop;
    ctx.fill();
    ctx.clip();
    if (this.field) {
      ctx.translate(half, half);
      ctx.scale(scale, scale);
      ctx.rotate(f.yaw);
      ctx.translate(-f.x, -f.z);
      const l = this.field;
      ctx.drawImage(l.canvas, l.x, l.z, l.width, l.depth);
    }
    ctx.restore();

    ctx.save();
    ctx.translate(half, half);
    // The other team where they were heard: a patch as wide as the guess is vague, dashed for a footstep, kept inside
    // the circle. Heard beyond the map's edge (a shot carries further than it shows), a small patch on the rim towards
    // them.
    ctx.beginPath();
    ctx.arc(0, 0, rim, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    for (const h of heard) {
      if (!this.heardShown || Number.isNaN(h.at)) continue;
      const alpha = noiseAlpha(f.time - h.at);
      if (alpha <= 0) continue;
      const p = toMinimap(f.yaw, f.x, f.z, h.x, h.z, scale, this.at);
      // Pinned only once its middle is off the map: a patch reaching past the rim is just clipped by it.
      const pinned = clampToRim(p, rim);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pinned ? MINIMAP.rimPatch : Math.max(4, h.radius * scale), 0, Math.PI * 2);
      ctx.fillStyle = this.theirs;
      ctx.globalAlpha = alpha * 0.28;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = this.theirs;
      ctx.lineWidth = 1.5;
      ctx.setLineDash((h.kind === 'step' ? STEP_DASH : NO_DASH) as number[]);
      ctx.stroke();
      ctx.setLineDash(NO_DASH as number[]);
      if (h.kind === 'shot') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (f.flag) this.drawFlag(f, scale, rim);
    if (f.hold) this.drawHold(f, scale, rim);
    for (let i = 0; i < f.count; i++) this.drawMate(f, f.mates[i]!, scale, rim);
    this.drawYou();
    ctx.restore();

    // The rim.
    ctx.beginPath();
    ctx.arc(half, half, rim, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  dispose(): void {
    globalThis.removeEventListener?.('resize', this.layout);
    this.root.remove();
  }

  /** A teammate: a dot in your team's colour, grey once hit, pinned to the rim (and hollow) when off the map's edge. */
  private drawMate(f: MinimapFrame, m: MinimapMate, scale: number, rim: number): void {
    const ctx = this.ctx!;
    const p = toMinimap(f.yaw, f.x, f.z, m.x, m.z, scale, this.at);
    const pinned = clampToRim(p, rim - 5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillStyle = m.hit ? MINIMAP.colours.out : this.mine;
    ctx.globalAlpha = pinned ? 0.75 : 1;
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** You (or the player you watch) in the middle: an arrow pointing the way you look (always up). */
  private drawYou(): void {
    const ctx = this.ctx!;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = MINIMAP.colours.you;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fill();
  }

  /** Where your teammates hold: a diamond in your team's colour, as over the field (ui/holdMarker.ts). */
  private drawHold(f: MinimapFrame, scale: number, rim: number): void {
    const ctx = this.ctx!;
    const p = toMinimap(f.yaw, f.x, f.z, f.hold!.x, f.hold!.z, scale, this.at);
    clampToRim(p, rim - 6);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 6);
    ctx.lineTo(p.x + 6, p.y);
    ctx.lineTo(p.x, p.y + 6);
    ctx.lineTo(p.x - 6, p.y);
    ctx.closePath();
    ctx.fillStyle = this.mine;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }

  /** Attack / Defend's flagpole: a small white flag. */
  private drawFlag(f: MinimapFrame, scale: number, rim: number): void {
    const ctx = this.ctx!;
    const p = toMinimap(f.yaw, f.x, f.z, f.flag!.x, f.flag!.z, scale, this.at);
    clampToRim(p, rim - 7);
    ctx.beginPath();
    ctx.moveTo(p.x - 3, p.y + 6);
    ctx.lineTo(p.x - 3, p.y - 7);
    ctx.lineTo(p.x + 6, p.y - 4);
    ctx.lineTo(p.x - 3, p.y - 1);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/**
 * The field from above, drawn once: the ground, raised floors and ramps, then low cover and walls, lowest first so a
 * crate on the dock shows over the dock. Null where the browser gives no 2D canvas (the minimap then shows only markers).
 */
function drawField(blocks: readonly MapBlock[], terrain: Terrain | null): FieldLayer | null {
  if (blocks.length === 0 && !terrain) return null;
  let x0 = terrain ? terrain.minX : Infinity;
  let z0 = terrain ? terrain.minZ : Infinity;
  let x1 = terrain ? terrainMaxX(terrain) : -Infinity;
  let z1 = terrain ? terrainMaxZ(terrain) : -Infinity;
  for (const b of blocks) {
    x0 = Math.min(x0, b.center.x - b.size.x / 2);
    x1 = Math.max(x1, b.center.x + b.size.x / 2);
    z0 = Math.min(z0, b.center.z - b.size.z / 2);
    z1 = Math.max(z1, b.center.z + b.size.z / 2);
  }
  const s = MINIMAP.layerScale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((x1 - x0) * s));
  canvas.height = Math.max(1, Math.ceil((z1 - z0) * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
  const walkable = (b: MapBlock): boolean => b.kind === 'floor' || b.kind === 'ramp';
  // Ground first, then everything else from the lowest top up.
  const order = [...blocks].sort((a, b) => Number(!walkable(a)) - Number(!walkable(b)) || top(a) - top(b));
  const c = MINIMAP.colours;
  if (terrain) drawTerrain(ctx, terrain, x0, z0, s);
  for (const b of order) {
    ctx.fillStyle =
      b.kind === 'floor' ? (top(b) > MINIMAP.raisedFloor ? c.raised : c.ground) : b.kind === 'ramp' ? c.ramp : coverHeight(b, blocks) <= MINIMAP.lowCoverTop ? c.low : c.tall;
    ctx.fillRect((b.center.x - b.size.x / 2 - x0) * s, (b.center.z - b.size.z / 2 - z0) * s, b.size.x * s, b.size.z * s);
  }
  return { canvas, x: x0, z: z0, width: x1 - x0, depth: z1 - z0 };
}

/** Sloping ground (M33c): the ground colour, lightened cell by cell by height, so a hill reads as a lighter patch. */
function drawTerrain(ctx: CanvasRenderingContext2D, t: Terrain, x0: number, z0: number, s: number): void {
  ctx.fillStyle = MINIMAP.colours.ground;
  ctx.fillRect((t.minX - x0) * s, (t.minZ - z0) * s, t.cols * t.cell * s, t.rows * t.cell * s);
  const { min, max } = terrainRange(t);
  if (max - min < 1e-3) return;
  for (let j = 0; j < t.rows; j++) {
    for (let i = 0; i < t.cols; i++) {
      const h = (vertexHeight(t, i, j) + vertexHeight(t, i + 1, j) + vertexHeight(t, i, j + 1) + vertexHeight(t, i + 1, j + 1)) / 4;
      const a = (MINIMAP.terrainShade * (h - min)) / (max - min);
      if (a < 0.005) continue;
      ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
      // A hair over a cell each way, so neighbouring cells leave no seam.
      ctx.fillRect((t.minX + i * t.cell - x0) * s, (t.minZ + j * t.cell - z0) * s, t.cell * s + 0.5, t.cell * s + 0.5);
    }
  }
}
