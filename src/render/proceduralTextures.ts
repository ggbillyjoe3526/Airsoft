import * as THREE from 'three';
import { type Anisotropy, type CitySurfaceId, type CoreSurfaceId, type LibrarySurfaceId, type NatureSurfaceId, SURFACES, type SurfaceTextureId, type TextureSize } from '../config/render';
import { createRng, rngNext, type RngState } from '../sim/rng';
import { cityDrawers } from './cityTextures';
import { natureDrawers } from './natureTextures';
import { drawLibraryTexels, type LibraryDrawingId } from './textureLibrary';

/**
 * The field's surface textures, drawn on canvases as each match loads (M14 art pass: no downloaded assets, see
 * docs/ASSETS.md): poured concrete with saw-cut joints, oil stains and hairline cracks; grey precast wall panels; plank
 * crates with a braced frame and nails; ribbed container steel with dirt streaks; diamond tread plate; moulded
 * plastic; sandbags (M25b); grey rubble behind gabion wire. The precast panels, the rubble and worn paint come from the
 * texture library (G6, render/textureLibrary.ts). Each tiles seamlessly; `worldSize` is how many metres one repeat covers (see mapMeshes' world-space UVs).
 * Light and dark also read as height, so each texture doubles as its own bump map when surface relief is on.
 */
export interface ProceduralTexture {
  texture: THREE.CanvasTexture;
  worldSize: number;
  /** Its normal map, worked out the first time Relief maps: Normal wants it (render/surfaceNormals.ts ensureNormalMap). */
  normal?: THREE.Texture;
  /**
   * The tile's mean linear luminance, for a detail tile the colours under it are lifted by (M33i: the ground's, so it
   * adds grain without darkening; render/terrainMeshes.ts). Absent: not measured (treated as 1).
   */
  mean?: number;
}

/**
 * A set of surface textures: every core one, and the woods' (M33i) and the city's (M34f) once a map that uses them has
 * asked for them (addSurfaceTextures; Renderer.surfaceTexturesFor), so a set no such map has used holds exactly what it
 * did before.
 */
export type SurfaceTextures = Record<CoreSurfaceId, ProceduralTexture> & Partial<Record<NatureSurfaceId | CitySurfaceId | LibrarySurfaceId, ProceduralTexture>>;

/** The core surfaces, the ones every set has. */
export const CORE_SURFACES: readonly CoreSurfaceId[] = ['concrete', 'blockWall', 'crate', 'corrugated', 'steelPlate', 'barrier', 'sandbag', 'gabion'];

/**
 * Draws every core surface texture at `size` pixels a side (QualitySettings.textureSize, audit REN-13) with `anisotropy`
 * (QualitySettings.anisotropy). The drawings are the same at any size: every length is in units of the original
 * 256-pixel drawing (PX), and speckle counts cover the same share of the tile. Drawn once per size per game
 * (Renderer.surfaceTextures shares them between sessions).
 */
export function createSurfaceTextures(size: TextureSize, anisotropy: Anisotropy): SurfaceTextures {
  const draw = setDrawer(size, anisotropy);
  return Object.fromEntries(CORE_SURFACES.map((id) => [id, draw(id)])) as SurfaceTextures;
}

/**
 * Draws into `set` each of `ids` it doesn't hold yet (M33i: the woods' textures, when a map that uses them loads), at
 * `size` (each capped by its drawnSize) and `anisotropy`, the set's own. Returns the set.
 */
export function addSurfaceTextures<T extends Partial<SurfaceTextures>>(set: T, ids: Iterable<SurfaceTextureId>, size: TextureSize, anisotropy: Anisotropy): T {
  let draw: ((id: SurfaceTextureId) => ProceduralTexture) | null = null;
  for (const id of ids) {
    if (set[id]) continue;
    draw ??= setDrawer(size, anisotropy);
    set[id] = draw(id);
  }
  return set;
}

/** The surface texture `id` of `set`; throws if it isn't drawn (a map's meshes ask for theirs first: texturesFor). */
export function surfaceTexture(set: SurfaceTextures, id: SurfaceTextureId): ProceduralTexture {
  const t = set[id];
  if (!t) throw new Error(`surface texture '${id}' is not drawn: ask the renderer for the map's set (surfaceTexturesFor)`);
  return t;
}

/**
 * How many pixels a side surface `id` is drawn at in a set of `size`: `size`, or less where SURFACES.maxSize caps it
 * (the city's flat finishes stay at 512² on High and Ultra; M78, owner decision 9).
 */
export function drawnSize(id: SurfaceTextureId, size: TextureSize): TextureSize {
  const cap: TextureSize | undefined = (SURFACES.maxSize as Partial<Record<SurfaceTextureId, TextureSize>>)[id];
  return cap !== undefined && cap < size ? cap : size;
}

/** A set's drawer: each surface at its drawnSize, from a surfaceDrawer per size made the first time it is needed. */
function setDrawer(size: TextureSize, anisotropy: Anisotropy): (id: SurfaceTextureId) => ProceduralTexture {
  const bySize = new Map<TextureSize, (id: SurfaceTextureId) => ProceduralTexture>();
  return (id) => {
    const at = drawnSize(id, size);
    let draw = bySize.get(at);
    if (!draw) {
      draw = surfaceDrawer(at, anisotropy);
      bySize.set(at, draw);
    }
    return draw(id);
  };
}

/** A drawer of single surface textures at `size` pixels a side with `anisotropy`. */
function surfaceDrawer(size: TextureSize, anisotropy: Anisotropy): (id: SurfaceTextureId) => ProceduralTexture {
  const SIZE = size;
  /** Pixels per unit of the textures' original 256-pixel drawings: line widths and sizes scale with it. */
  const PX = SIZE / 256;

  function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    return [canvas, ctx];
  }

  const rgba = (r: number, g: number, b: number, a: number): string => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

  /** Calls `draw` at (x, y) and again shifted by a tile wherever the shape (radius `r`) crosses an edge, so it tiles. */
  function wrapped(x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
    for (const dx of [-SIZE, 0, SIZE]) {
      if (x + dx + r < 0 || x + dx - r > SIZE) continue;
      for (const dy of [-SIZE, 0, SIZE]) {
        if (y + dy + r < 0 || y + dy - r > SIZE) continue;
        draw(x + dx, y + dy);
      }
    }
  }

  function speckle(ctx: CanvasRenderingContext2D, rng: RngState, count: number, alpha: number, light: boolean): void {
    const v = light ? 255 : 0;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = rgba(v, v, v, alpha * rngNext(rng));
      const s = (1 + rngNext(rng) * 2) * PX * 0.75;
      ctx.fillRect(rngNext(rng) * SIZE, rngNext(rng) * SIZE, s, s);
    }
  }

  /** Soft round blotches of `[r, g, b]` up to `alpha`, `minR`..`maxR` pixels across: mottling, stains, dirt. */
  function blotches(ctx: CanvasRenderingContext2D, rng: RngState, count: number, minR: number, maxR: number, color: readonly [number, number, number], alpha: number): void {
    const [r, g, b] = color;
    for (let i = 0; i < count; i++) {
      const radius = (minR + rngNext(rng) * (maxR - minR)) * PX;
      const a = alpha * (0.4 + 0.6 * rngNext(rng));
      wrapped(rngNext(rng) * SIZE, rngNext(rng) * SIZE, radius, (x, y) => {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, rgba(r, g, b, a));
        grad.addColorStop(1, rgba(r, g, b, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      });
    }
  }

  /** A thin wandering crack from a random point. */
  function crack(ctx: CanvasRenderingContext2D, rng: RngState, steps: number, alpha: number): void {
    let x = rngNext(rng) * SIZE;
    let y = rngNext(rng) * SIZE;
    let heading = rngNext(rng) * Math.PI * 2;
    ctx.strokeStyle = rgba(45, 43, 40, alpha);
    ctx.lineWidth = 0.6 * PX;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < steps; i++) {
      heading += (rngNext(rng) - 0.5) * 0.9;
      x += Math.cos(heading) * 5 * PX;
      y += Math.sin(heading) * 5 * PX;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /**
   * Fine grain at the largest size (audit section 5: at 1024 the drawings need detail at the new frequency, or they only
   * look smoother): every pixel's brightness nudged by up to SURFACES.fineGrain.amount, from a hash of its position.
   */
  function fineGrain(canvas: HTMLCanvasElement, seed: number): void {
    if (SIZE < SURFACES.fineGrain.fromSize) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.getImageData(0, 0, SIZE, SIZE);
    const d = image.data;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const n = ((Math.imul(i ^ seed, 2654435761) >>> 0) / 4294967296 - 0.5) * 2 * SURFACES.fineGrain.amount;
      d[i * 4] = d[i * 4]! + n;
      d[i * 4 + 1] = d[i * 4 + 1]! + n;
      d[i * 4 + 2] = d[i * 4 + 2]! + n;
    }
    ctx.putImageData(image, 0, 0);
  }

  function finish(canvas: HTMLCanvasElement, id: SurfaceTextureId): ProceduralTexture {
    fineGrain(canvas, id.length * 7919 + SIZE);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    texture.name = id;
    return { texture, worldSize: SURFACES.worldSize[id] };
  }

  /** Poured warehouse slab: mottled, speckled, a few oil stains and hairline cracks, saw-cut joints every repeat (4 m). */
  function concrete(): ProceduralTexture {
    const [canvas, ctx] = makeCanvas();
    const rng = createRng(11);
    ctx.fillStyle = '#a4a29c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, rng, 26, 30, 110, [255, 252, 240], 0.1);
    blotches(ctx, rng, 26, 30, 110, [70, 66, 58], 0.09);
    speckle(ctx, rng, 9000, 0.16, false);
    speckle(ctx, rng, 6000, 0.14, true);
    // Oil and tyre stains: dark, slightly brown, soft.
    blotches(ctx, rng, 4, 10, 34, [48, 40, 30], 0.28);
    for (let i = 0; i < 3; i++) crack(ctx, rng, 14 + Math.floor(rngNext(rng) * 18), 0.4);
    // Saw-cut joints along the tile's edges (they meet the next tile's), with a lighter worn lip beside each.
    ctx.fillStyle = 'rgba(38,37,35,0.7)';
    ctx.fillRect(0, 0, SIZE, 1.5 * PX);
    ctx.fillRect(0, 0, 1.5 * PX, SIZE);
    ctx.fillStyle = 'rgba(255,255,250,0.18)';
    ctx.fillRect(0, 1.5 * PX, SIZE, PX);
    ctx.fillRect(1.5 * PX, 0, PX, SIZE);
    return finish(canvas, 'concrete');
  }

  /** Draws one wooden board from (x0, y0) to (x1, y1) (a rotated rectangle `width` wide) with grain along it. */
  function board(ctx: CanvasRenderingContext2D, rng: RngState, x0: number, y0: number, x1: number, y1: number, width: number, tone: number): void {
    const length = Math.hypot(x1 - x0, y1 - y0);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    ctx.fillStyle = rgba(184 * tone, 138 * tone, 86 * tone, 1);
    ctx.fillRect(0, -width / 2, length, width);
    for (let g = 0; g < width / (2.2 * PX); g++) {
      ctx.strokeStyle = rgba(95, 62, 30, 0.12 + rngNext(rng) * 0.2);
      ctx.lineWidth = (0.5 + rngNext(rng)) * PX * 0.6;
      const y = -width / 2 + rngNext(rng) * width;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(length / 2, y + (rngNext(rng) - 0.5) * 4 * PX, length, y + (rngNext(rng) - 0.5) * 3 * PX);
      ctx.stroke();
    }
    // Dark edges where boards meet.
    ctx.fillStyle = 'rgba(60,38,18,0.55)';
    ctx.fillRect(0, -width / 2, length, PX);
    ctx.fillRect(0, width / 2 - PX, length, PX);
    ctx.restore();
  }

  /** A nail head: a dark dot with a glint. */
  function nail(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = 'rgba(40,36,32,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, 1.6 * PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,235,0.45)';
    ctx.fillRect(x - 0.8 * PX, y - 0.8 * PX, 0.8 * PX, 0.8 * PX);
  }

  /** A plank crate face, mapped once per face: five planks, a frame of boards, a diagonal brace and nails at the joints. */
  function crate(): ProceduralTexture {
    const [canvas, ctx] = makeCanvas();
    const rng = createRng(37);
    ctx.fillStyle = '#5a3d20'; // the gaps between planks
    ctx.fillRect(0, 0, SIZE, SIZE);
    const planks = 5;
    const ph = SIZE / planks;
    for (let p = 0; p < planks; p++) board(ctx, rng, 0, p * ph + ph / 2, SIZE, p * ph + ph / 2, ph - 1.5 * PX, 0.85 + rngNext(rng) * 0.25);
    // Knots in the planks.
    for (let i = 0; i < 5; i++) {
      const x = rngNext(rng) * SIZE;
      const y = rngNext(rng) * SIZE;
      ctx.fillStyle = 'rgba(90,55,25,0.55)';
      ctx.beginPath();
      ctx.ellipse(x, y, 4 * PX, 2 * PX, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const frame = 20 * PX;
    const tone = (): number => 0.95 + rngNext(rng) * 0.15;
    // The brace first, so the frame boards cover its ends.
    board(ctx, rng, frame / 2, SIZE - frame / 2, SIZE - frame / 2, frame / 2, frame * 0.9, tone());
    board(ctx, rng, 0, frame / 2, SIZE, frame / 2, frame, tone());
    board(ctx, rng, 0, SIZE - frame / 2, SIZE, SIZE - frame / 2, frame, tone());
    board(ctx, rng, frame / 2, frame, frame / 2, SIZE - frame, frame, tone());
    board(ctx, rng, SIZE - frame / 2, frame, SIZE - frame / 2, SIZE - frame, frame, tone());
    for (const x of [frame / 2, SIZE - frame / 2]) {
      for (const y of [frame * 0.3, frame * 0.7, SIZE - frame * 0.3, SIZE - frame * 0.7]) nail(ctx, x + (rngNext(rng) - 0.5) * 4 * PX, y);
    }
    for (let p = 1; p < planks - 1; p++) {
      nail(ctx, frame / 2, p * ph + ph / 2);
      nail(ctx, SIZE - frame / 2, p * ph + ph / 2);
    }
    // Weathering: darker towards the bottom where the ground splashes it.
    const grad = ctx.createLinearGradient(0, SIZE * 0.6, 0, SIZE);
    grad.addColorStop(0, 'rgba(40,28,15,0)');
    grad.addColorStop(1, 'rgba(40,28,15,0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    return finish(canvas, 'crate');
  }

  /** Ribbed container steel, white so each container's tint shows through: rib shading, dirt streaks, rust and scratches. */
  function corrugated(): ProceduralTexture {
    const [canvas, ctx] = makeCanvas();
    const rng = createRng(41);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const ribs = 8;
    const ribW = SIZE / ribs;
    for (let i = 0; i < ribs; i++) {
      // A trapezoid rib: flat face, shaded flank, dark valley, lit flank.
      const grad = ctx.createLinearGradient(i * ribW, 0, (i + 1) * ribW, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.34)');
      grad.addColorStop(0.15, 'rgba(0,0,0,0.12)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.14)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
      grad.addColorStop(0.72, 'rgba(0,0,0,0.12)');
      grad.addColorStop(0.88, 'rgba(0,0,0,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0.34)');
      ctx.fillStyle = grad;
      ctx.fillRect(i * ribW, 0, ribW, SIZE);
    }
    // Rain streaks running down from the top, seamless top to bottom (they run the whole tile).
    for (let i = 0; i < 26; i++) {
      const x = rngNext(rng) * SIZE;
      const w = (1 + rngNext(rng) * 3) * PX;
      ctx.fillStyle = rgba(40, 36, 30, 0.04 + rngNext(rng) * 0.08);
      ctx.fillRect(x, 0, w, SIZE);
    }
    blotches(ctx, rng, 12, 4, 16, [120, 72, 34], 0.32); // rust spots
    blotches(ctx, rng, 10, 20, 60, [60, 55, 48], 0.1); // grime
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = rgba(255, 255, 255, 0.15 + rngNext(rng) * 0.2);
      ctx.lineWidth = 0.6 * PX;
      const x = rngNext(rng) * SIZE;
      const y = rngNext(rng) * SIZE;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rngNext(rng) - 0.5) * 40 * PX, y + (rngNext(rng) - 0.5) * 10 * PX);
      ctx.stroke();
    }
    speckle(ctx, rng, 900, 0.1, false);
    // At the largest size, a hairline row of paint chips along each rib's crest (lighter: worn paint, never rust).
    if (SIZE >= SURFACES.fineGrain.fromSize) {
      for (let i = 0; i < ribs; i++) {
        for (let k = 0; k < SURFACES.fineGrain.ribChips; k++) {
          ctx.fillStyle = rgba(255, 255, 255, 0.2 + rngNext(rng) * 0.25);
          ctx.fillRect((i + 0.4 + rngNext(rng) * 0.15) * ribW, rngNext(rng) * SIZE, PX * 0.5, PX * (0.5 + rngNext(rng)));
        }
      }
    }
    return finish(canvas, 'corrugated');
  }

  /** Diamond tread plate for steel ramps and floors: raised lozenges in alternating directions, worn shiny in places. */
  function steelPlate(): ProceduralTexture {
    const [canvas, ctx] = makeCanvas();
    const rng = createRng(47);
    ctx.fillStyle = '#b4b8bc';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, rng, 14, 20, 70, [255, 255, 255], 0.14); // polished by boots
    blotches(ctx, rng, 14, 20, 70, [70, 66, 60], 0.12);
    const cells = 12;
    const cell = SIZE / cells;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const x = (i + 0.5) * cell;
        const y = (j + 0.5) * cell;
        const angle = (i + j) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
        // A lit top edge and a shadowed lower one, so the lozenge reads as raised.
        for (const [dx, dy, style] of [
          [0.8, 0.8, 'rgba(40,40,42,0.45)'],
          [-0.5, -0.5, 'rgba(255,255,255,0.55)'],
          [0, 0, 'rgba(196,200,204,1)'],
        ] as const) {
          ctx.fillStyle = style;
          ctx.beginPath();
          ctx.ellipse(x + dx * PX, y + dy * PX, cell * 0.38, cell * 0.09, angle, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    speckle(ctx, rng, 3000, 0.14, false);
    // A weld seam along the edge where plates meet.
    ctx.fillStyle = 'rgba(50,50,52,0.6)';
    ctx.fillRect(0, 0, SIZE, 1.5 * PX);
    return finish(canvas, 'steelPlate');
  }

  /** Moulded plastic site barrier: white for its tint, faint moulding ridges and scuffs (the grime at its foot is shading). */
  function barrier(): ProceduralTexture {
    const [canvas, ctx] = makeCanvas();
    const rng = createRng(53);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let r = 0; r < 4; r++) {
      const y = (r + 0.5) * (SIZE / 4);
      const grad = ctx.createLinearGradient(0, y - 8 * PX, 0, y + 8 * PX);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.25)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.12)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - 8 * PX, SIZE, 16 * PX);
    }
    speckle(ctx, rng, 2400, 0.1, false);
    blotches(ctx, rng, 12, 8, 30, [80, 74, 64], 0.12);
    return finish(canvas, 'barrier');
  }

  /**
   * Sandbags laid in running bond (M25b), six courses of two bags per repeat: each bag a rounded, slightly different tan
   * with a woven speckle, lit from above, dark gaps between them.
   */
  function sandbag(): ProceduralTexture {
    const [canvas, ctx] = makeCanvas();
    const rng = createRng(61);
    ctx.fillStyle = '#4a4134'; // the shadowed gaps between bags
    ctx.fillRect(0, 0, SIZE, SIZE);
    const courses = 6;
    const ch = SIZE / courses;
    const bw = SIZE / 2;
    for (let c = 0; c < courses; c++) {
      const offset = c % 2 === 0 ? 0 : bw / 2;
      for (let i = 0; i < 2; i++) {
        const tone = 0.88 + rngNext(rng) * 0.18;
        const cx = offset + i * bw + bw / 2;
        const cy = c * ch + ch / 2;
        wrapped(cx, cy, bw / 2, (x, y) => {
          const grad = ctx.createLinearGradient(0, y - ch / 2, 0, y + ch / 2);
          grad.addColorStop(0, rgba(214 * tone, 194 * tone, 150 * tone, 1));
          grad.addColorStop(0.55, rgba(190 * tone, 168 * tone, 124 * tone, 1));
          grad.addColorStop(1, rgba(132 * tone, 114 * tone, 82 * tone, 1));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x - bw / 2 + 2 * PX, y - ch / 2 + 2 * PX, bw - 4 * PX, ch - 4 * PX, ch * 0.42);
          ctx.fill();
          // The tied end of the bag: a crease near one end.
          ctx.strokeStyle = 'rgba(90,76,52,0.45)';
          ctx.lineWidth = 1.2 * PX;
          ctx.beginPath();
          ctx.moveTo(x + bw * 0.36, y - ch * 0.3);
          ctx.quadraticCurveTo(x + bw * 0.4, y, x + bw * 0.36, y + ch * 0.3);
          ctx.stroke();
        });
      }
    }
    speckle(ctx, rng, 9000, 0.12, false); // the weave
    speckle(ctx, rng, 4000, 0.1, true);
    blotches(ctx, rng, 10, 10, 34, [96, 82, 58], 0.12); // mud
    return finish(canvas, 'sandbag');
  }

  /**
   * A texture-library drawing (G6, render/textureLibrary.ts): worked out texel by texel, then put on a canvas so it is
   * finished (fine grain, relief) like the rest.
   */
  function library(id: LibraryDrawingId): () => ProceduralTexture {
    return () => {
      const [canvas, ctx] = makeCanvas();
      ctx.putImageData(new ImageData(drawLibraryTexels(id, SIZE) as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
      return finish(canvas, id);
    };
  }

  const kit = { SIZE, PX, makeCanvas, rgba, wrapped, speckle, blotches, crack, finish };
  const drawers: Record<SurfaceTextureId, () => ProceduralTexture> = {
    concrete,
    blockWall: library('blockWall'),
    crate,
    corrugated,
    steelPlate,
    barrier,
    sandbag,
    gabion: library('gabion'),
    paint: library('paint'),
    ...natureDrawers(kit),
    ...cityDrawers(kit),
  };
  return (id) => drawers[id]();
}

export function disposeSurfaceTextures(t: Partial<SurfaceTextures>): void {
  for (const surface of Object.values(t) as ProceduralTexture[]) {
    surface.texture.dispose();
    surface.normal?.dispose();
  }
}

/**
 * Anisotropic filtering for a set already drawn (REN-13): uploaded again with the new filter on the next frame (Three.js
 * clamps it to what the graphics card offers).
 */
export function setSurfaceAnisotropy(t: Partial<SurfaceTextures>, anisotropy: Anisotropy): void {
  for (const surface of Object.values(t) as ProceduralTexture[]) {
    for (const texture of [surface.texture, surface.normal]) {
      if (!texture || texture.anisotropy === anisotropy) continue;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    }
  }
}
