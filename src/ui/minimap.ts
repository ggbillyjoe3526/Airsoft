import { MINIMAP } from '../config/minimap';
import type { Bush } from '../map/foliage';
import type { MapBlock } from '../map/mapTypes';
import { type Terrain, terrainMaxX, terrainMaxZ, terrainRange, vertexHeight } from '../map/terrain';
import { clampToRim, coverHeight, type HeardPlayer, insideCircle, type MapPoint, minimapPixelRatio, noiseAlpha, toMinimap } from './minimapView';

/** A teammate as the minimap shows them: where they are (`y`: their feet), and whether they've called a hit (greyed). */
export interface MinimapMate {
  x: number;
  y: number;
  z: number;
  hit: boolean;
}

/** What one frame of the minimap shows (filled in place by MatchPresentation, so nothing is made per frame). */
export interface MinimapFrame {
  /**
   * The middle (where you are, or the player you watch), the height of its feet (which storey the minimap draws, on a
   * map with several) and the way the view looks (game yaw).
   */
  x: number;
  y: number;
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
  /** The field drawing, one per storey (M34c) on a map with several, lowest first; else one. */
  private readonly fields: (FieldLayer | null)[];
  /** The map's storey heights (M34c), lowest first: empty on a map with one. */
  private readonly storeys: readonly number[];
  /** The backing canvas's pixels per CSS pixel, and the HUD's scale (style.css --hud-scale), as last laid out. */
  private pixelRatio = 0;
  private scale = 0;
  /** Where the minimap's circle is on the screen (px from the game's top left), for the markers it hides (audit UI-13). */
  private readonly circle = { x: 0, y: 0, r: 0 };
  private readonly at: MapPoint = { x: 0, y: 0 };
  private visible = false;

  /**
   * `blocks`: the map's; `mine` / `theirs`: the two teams' HUD colours (CSS); `terrain`: the map's ground, if any;
   * `storeys`: its storey heights (MapData.storeys), if it has more than one.
   */
  constructor(
    private readonly parent: HTMLElement,
    blocks: readonly MapBlock[],
    private readonly mine: string,
    private readonly theirs: string,
    /** The map's sloping ground, if it has one (M33c): drawn under the blocks, lighter where it is higher. */
    terrain: Terrain | null = null,
    /** The map's bushes (M33e): drawn as soft green rounds over the ground, under the blocks. */
    foliage: readonly Bush[] = [],
    /** The map's storeys (M34c, MapData.storeys): one drawing of the field per storey. */
    storeys: readonly number[] = [],
  ) {
    this.root = document.createElement('canvas');
    this.root.className = 'minimap';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.ctx = this.root.getContext('2d');
    this.storeys = storeys.length > 1 ? storeys : [];
    this.fields = this.storeys.length > 0 ? this.storeys.map((_, i) => drawField(blocks, terrain, foliage, this.storeys, i)) : [drawField(blocks, terrain, foliage)];
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
    const field = this.fields[storeyOf(this.storeys, f.y)];
    if (field) {
      ctx.translate(half, half);
      ctx.scale(scale, scale);
      ctx.rotate(f.yaw);
      ctx.translate(-f.x, -f.z);
      ctx.drawImage(field.canvas, field.x, field.z, field.width, field.depth);
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
      if (Number.isNaN(h.at)) continue;
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

  /**
   * A teammate: a dot in your team's colour, grey once hit, pinned to the rim (and hollow) when off the map's edge; on
   * another storey than the one drawn (M34c), a small arrow over it pointing up or down to theirs.
   */
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
    const other = this.storeys.length > 0 ? Math.sign(storeyOf(this.storeys, m.y) - storeyOf(this.storeys, f.y)) : 0;
    if (other !== 0) {
      // Above the dot: ▲ for a storey up, ▼ for one down.
      const tip = p.y - 9 - 3 * other;
      ctx.beginPath();
      ctx.moveTo(p.x, tip);
      ctx.lineTo(p.x + 3.5, tip + 6 * other);
      ctx.lineTo(p.x - 3.5, tip + 6 * other);
      ctx.closePath();
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }
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

/** The storey (index into `storeys`) of feet at height `y`: the highest whose floor is at most MINIMAP.storeyPick above them. */
export function storeyOf(storeys: readonly number[], y: number): number {
  let i = 0;
  while (i + 1 < storeys.length && storeys[i + 1]! <= y + MINIMAP.storeyPick) i++;
  return i;
}

/**
 * The field from above, drawn once: the ground, raised floors and ramps, then low cover and walls, lowest first so a
 * crate on the dock shows over the dock. Null where the browser gives no 2D canvas (the minimap then shows only markers).
 *
 * On a map with several storeys (M34c) one drawing per storey `level`: cut away above it (no block that starts more
 * than a body's height over its floor), with everything below its floor shaded darker, so the floor you're on and its
 * walls read plainly over the street seen through a stairwell or an atrium.
 */
function drawField(blocks: readonly MapBlock[], terrain: Terrain | null, foliage: readonly Bush[], storeys: readonly number[] = [], level = 0): FieldLayer | null {
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
  const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;
  const walkable = (b: MapBlock): boolean => b.kind === 'floor' || b.kind === 'ramp';
  // A storey's drawing: its floor's height, and what lies under it (drawn first, then shaded).
  const base = storeys[level] ?? 0;
  const cut = base + MINIMAP.storeyCut;
  const under = (b: MapBlock): boolean => level > 0 && (walkable(b) ? top(b) < base - MINIMAP.floorContact : top(b) <= base + MINIMAP.floorContact);
  // How tall a block stands over the floor it is on: on a storey's drawing, over that storey's floor at least.
  const standsOn = (b: MapBlock): number => storeys.reduce((on, h) => (h <= bottom(b) + MINIMAP.floorContact ? h : on), 0);
  // Ground first, then everything else from the lowest top up; on a storey's drawing, all of that under it first.
  const order = blocks
    .filter((b) => storeys.length === 0 || bottom(b) < cut)
    .sort((a, b) => Number(under(b)) - Number(under(a)) || Number(!walkable(a)) - Number(!walkable(b)) || top(a) - top(b));
  const c = MINIMAP.colours;
  if (terrain) drawTerrain(ctx, terrain, x0, z0, s);
  let shaded = level === 0;
  let bushesDrawn = foliage.length === 0;
  for (const b of order) {
    // Bushes go over the ground (floors come first in `order`) and under the cover, and under a storey's shading.
    if (!bushesDrawn && (!walkable(b) || (!shaded && !under(b)))) {
      drawBushes(ctx, foliage, x0, z0, s);
      bushesDrawn = true;
    }
    if (!shaded && !under(b)) {
      ctx.fillStyle = c.belowStorey;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      shaded = true;
    }
    const cover = Math.min(coverHeight(b, blocks), top(b) - standsOn(b));
    ctx.fillStyle = b.kind === 'floor' ? (top(b) > MINIMAP.raisedFloor + base ? c.raised : c.ground) : b.kind === 'ramp' ? c.ramp : cover <= MINIMAP.lowCoverTop ? c.low : c.tall;
    ctx.fillRect((b.center.x - b.size.x / 2 - x0) * s, (b.center.z - b.size.z / 2 - z0) * s, b.size.x * s, b.size.z * s);
  }
  if (!bushesDrawn) drawBushes(ctx, foliage, x0, z0, s);
  return { canvas, x: x0, z: z0, width: x1 - x0, depth: z1 - z0 };
}

/** Bushes (M33e): a filled round each, the bush's footprint. */
function drawBushes(ctx: CanvasRenderingContext2D, bushes: readonly Bush[], x0: number, z0: number, s: number): void {
  ctx.fillStyle = MINIMAP.colours.bush;
  for (const b of bushes) {
    ctx.beginPath();
    ctx.arc((b.x - x0) * s, (b.z - z0) * s, b.radius * s, 0, Math.PI * 2);
    ctx.fill();
  }
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
