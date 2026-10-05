import type { NatureSurfaceId, SurfaceTextureId } from '../config/render';
import { createRng, rngNext, type RngState } from '../sim/rng';
import type { ProceduralTexture } from './proceduralTextures';

/**
 * The woods' surface textures (M33i), drawn on canvases like the rest (render/proceduralTextures.ts; no downloaded
 * files, docs/CC0_ASSETS.md): bark with vertical fissures and lichen, weathered vertical fence boards, stone with lichen
 * and cracks, and a greyscale ground tile the terrain's colours are multiplied by. Each tiles seamlessly; lengths are in
 * units of the original 256-pixel drawing (PX), so they look the same at every Texture detail.
 */

/** The drawing helpers proceduralTextures.ts shares with these drawings (its canvas size, wrapping and finishing). */
export interface TextureKit {
  SIZE: number;
  PX: number;
  makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D];
  rgba(r: number, g: number, b: number, a: number): string;
  wrapped(x: number, y: number, r: number, draw: (x: number, y: number) => void): void;
  speckle(ctx: CanvasRenderingContext2D, rng: RngState, count: number, alpha: number, light: boolean): void;
  blotches(ctx: CanvasRenderingContext2D, rng: RngState, count: number, minR: number, maxR: number, color: readonly [number, number, number], alpha: number): void;
  crack(ctx: CanvasRenderingContext2D, rng: RngState, steps: number, alpha: number): void;
  finish(canvas: HTMLCanvasElement, id: SurfaceTextureId): ProceduralTexture;
}

/** Linear value of each 8-bit sRGB level (the sRGB transfer curve). */
const SRGB_TO_LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** The mean linear luminance (Rec. 709 weights) of RGBA 8-bit sRGB pixels: what a tile multiplies colours by on average. */
export function meanLinearLuminance(rgba: ArrayLike<number>): number {
  let sum = 0;
  const n = Math.floor(rgba.length / 4);
  for (let i = 0; i < n; i++) sum += 0.2126 * SRGB_TO_LINEAR[rgba[i * 4]!]! + 0.7152 * SRGB_TO_LINEAR[rgba[i * 4 + 1]!]! + 0.0722 * SRGB_TO_LINEAR[rgba[i * 4 + 2]!]!;
  return n > 0 ? sum / n : 1;
}

/** The four drawings, each a function that draws its texture once. */
export function natureDrawers(k: TextureKit): Record<NatureSurfaceId, () => ProceduralTexture> {
  const { SIZE, PX } = k;

  /**
   * A wavy vertical line down the whole tile (seamless top to bottom: whole sine periods), `width` px wide, drawn at x
   * and a tile either side so it wraps.
   */
  function fissure(ctx: CanvasRenderingContext2D, rng: RngState, x0: number, width: number, style: string): void {
    const waves = 1 + Math.floor(rngNext(rng) * 3);
    const amp = (2 + rngNext(rng) * 5) * PX;
    const phase = rngNext(rng) * Math.PI * 2;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (const dx of [-SIZE, 0, SIZE]) {
      ctx.beginPath();
      for (let y = 0; y <= SIZE; y += 4 * PX) {
        const x = x0 + dx + amp * Math.sin((2 * Math.PI * waves * y) / SIZE + phase);
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** Bark (trunks and logs): grey-brown plates between dark vertical fissures, pale lichen, fine grit. Grain along v. */
  function bark(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(71);
    ctx.fillStyle = '#7d6e5e';
    ctx.fillRect(0, 0, SIZE, SIZE);
    k.blotches(ctx, rng, 20, 20, 70, [150, 136, 118], 0.16);
    k.blotches(ctx, rng, 20, 20, 70, [60, 50, 40], 0.14);
    // The plates' lit ridges, then the fissures between them.
    for (let i = 0; i < 14; i++) fissure(ctx, rng, rngNext(rng) * SIZE, (3 + rngNext(rng) * 4) * PX, k.rgba(176, 160, 138, 0.22));
    for (let i = 0; i < 18; i++) fissure(ctx, rng, rngNext(rng) * SIZE, (1.2 + rngNext(rng) * 2.6) * PX, k.rgba(38, 30, 24, 0.5 + rngNext(rng) * 0.3));
    k.speckle(ctx, rng, 5000, 0.16, false);
    k.speckle(ctx, rng, 2500, 0.12, true);
    k.blotches(ctx, rng, 9, 4, 12, [170, 182, 150], 0.35); // lichen
    return k.finish(canvas, 'bark');
  }

  /** Weathered fence boards standing upright: six silver-brown boards a repeat, dark gaps, grain and a nail row. */
  function planks(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(73);
    ctx.fillStyle = '#2e261e'; // the gaps
    ctx.fillRect(0, 0, SIZE, SIZE);
    const boards = 6;
    const w = SIZE / boards;
    for (let b = 0; b < boards; b++) {
      const tone = 0.86 + rngNext(rng) * 0.22;
      const x = b * w + 1.2 * PX;
      ctx.fillStyle = k.rgba(146 * tone, 132 * tone, 112 * tone, 1);
      ctx.fillRect(x, 0, w - 2.4 * PX, SIZE);
      for (let g = 0; g < 9; g++) {
        const gx = x + rngNext(rng) * (w - 2.4 * PX);
        ctx.fillStyle = k.rgba(70, 58, 44, 0.12 + rngNext(rng) * 0.18);
        ctx.fillRect(gx, 0, (0.5 + rngNext(rng)) * PX, SIZE);
      }
      // A nail at each board's middle, two rails' worth a repeat.
      for (const y of [SIZE * 0.22, SIZE * 0.72]) {
        ctx.fillStyle = 'rgba(32,28,24,0.8)';
        ctx.beginPath();
        ctx.arc(x + w / 2 - 1.2 * PX, y, 1.5 * PX, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    k.blotches(ctx, rng, 14, 10, 40, [60, 52, 40], 0.12); // weathering
    k.speckle(ctx, rng, 3000, 0.12, false);
    return k.finish(canvas, 'planks');
  }

  /** Field stone: mottled grey, dark pits, pale and yellow-green lichen, a few cracks. */
  function stone(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(79);
    ctx.fillStyle = '#8f8b84';
    ctx.fillRect(0, 0, SIZE, SIZE);
    k.blotches(ctx, rng, 26, 24, 90, [190, 186, 176], 0.14);
    k.blotches(ctx, rng, 26, 24, 90, [60, 58, 54], 0.14);
    k.speckle(ctx, rng, 9000, 0.2, false);
    k.speckle(ctx, rng, 6000, 0.14, true);
    for (let i = 0; i < 4; i++) k.crack(ctx, rng, 10 + Math.floor(rngNext(rng) * 14), 0.45);
    k.blotches(ctx, rng, 10, 5, 18, [176, 184, 120], 0.3); // yellow-green lichen
    k.blotches(ctx, rng, 8, 4, 12, [214, 214, 200], 0.3); // pale lichen
    return k.finish(canvas, 'stone');
  }

  /**
   * The ground's grain (greyscale and light: the terrain's vertex colours carry the surface, lifted by the tile's
   * measured mean so the grain neither darkens nor brightens the ground on average): soft light and dark patches, grit,
   * and short dark strokes (twigs, blades, leaf edges) in every direction.
   */
  function groundDetail(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(83);
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, SIZE, SIZE);
    k.blotches(ctx, rng, 30, 16, 60, [255, 255, 255], 0.2);
    k.blotches(ctx, rng, 30, 16, 60, [150, 150, 150], 0.14);
    k.speckle(ctx, rng, 12000, 0.22, false);
    k.speckle(ctx, rng, 5000, 0.16, true);
    for (let i = 0; i < 700; i++) {
      const x = rngNext(rng) * SIZE;
      const y = rngNext(rng) * SIZE;
      const a = rngNext(rng) * Math.PI;
      const len = (2 + rngNext(rng) * 5) * PX;
      ctx.strokeStyle = k.rgba(90, 90, 90, 0.12 + rngNext(rng) * 0.16);
      ctx.lineWidth = 0.7 * PX;
      k.wrapped(x, y, len, (wx, wy) => {
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + Math.cos(a) * len, wy + Math.sin(a) * len);
        ctx.stroke();
      });
    }
    const tile = k.finish(canvas, 'groundDetail');
    return { ...tile, mean: meanLinearLuminance(ctx.getImageData(0, 0, SIZE, SIZE).data) };
  }

  return { bark, planks, stone, groundDetail };
}
