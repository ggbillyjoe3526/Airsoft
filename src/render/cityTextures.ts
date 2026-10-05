import type { CitySurfaceId } from '../config/render';
import { createRng, rngNext } from '../sim/rng';
import type { TextureKit } from './natureTextures';
import type { ProceduralTexture } from './proceduralTextures';

/**
 * The city's surface textures (M34f), drawn on canvases like the rest (render/proceduralTextures.ts; no downloaded
 * files, docs/CC0_ASSETS.md): smooth painted plaster, standing-seam metal cladding, small glazed tiles (each pale, so a
 * block's paint is its colour), asphalt, square paving slabs, and dark glass for the city props' screens and windows.
 * Clean, not grimy (the concept's "playful, not grim"). Each tiles seamlessly; lengths are in units of the original
 * 256-pixel drawing (PX), so they look the same at every Texture detail.
 */
export function cityDrawers(k: TextureKit): Record<CitySurfaceId, () => ProceduralTexture> {
  const { SIZE, PX } = k;

  /** Painted render: near white, a soft trowelled mottle, a fine sand grain; no joints, so it reads at any size. */
  function plaster(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(101);
    ctx.fillStyle = '#f2f1ee';
    ctx.fillRect(0, 0, SIZE, SIZE);
    k.blotches(ctx, rng, 30, 24, 90, [255, 255, 255], 0.14);
    k.blotches(ctx, rng, 30, 24, 90, [196, 194, 188], 0.1);
    k.speckle(ctx, rng, 7000, 0.08, false);
    k.speckle(ctx, rng, 4000, 0.1, true);
    return k.finish(canvas, 'plaster');
  }

  /**
   * Standing-seam cladding: four panels a repeat, each seam a lit ridge with a shadow beside it, a faint sheen across
   * each panel; pale, for its paint. Seams run along v (upright on a wall).
   */
  function cladding(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(103);
    ctx.fillStyle = '#e9ebee';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const panels = 4;
    const w = SIZE / panels;
    for (let i = 0; i < panels; i++) {
      const x = i * w;
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      const tone = 0.04 + rngNext(rng) * 0.05;
      grad.addColorStop(0, `rgba(255,255,255,${tone})`);
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(1, `rgba(0,0,0,${tone})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, w, SIZE);
      // The seam: a dark groove, a lit ridge.
      ctx.fillStyle = 'rgba(40,44,52,0.5)';
      ctx.fillRect(x, 0, 1.6 * PX, SIZE);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 1.6 * PX, 0, 1.4 * PX, SIZE);
      ctx.fillStyle = 'rgba(40,44,52,0.16)';
      ctx.fillRect(x + 3 * PX, 0, 3 * PX, SIZE);
    }
    k.speckle(ctx, rng, 2000, 0.06, false);
    return k.finish(canvas, 'cladding');
  }

  /** Glazed tiles, four by four a repeat (15 cm), pale grout, each tile a touch different, a glint at one corner. */
  function tiles(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(107);
    ctx.fillStyle = '#b9bbbf'; // grout
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 4;
    const t = SIZE / n;
    const grout = 2 * PX;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const tone = 0.95 + rngNext(rng) * 0.05;
        const x = i * t + grout / 2;
        const y = j * t + grout / 2;
        ctx.fillStyle = k.rgba(248 * tone, 248 * tone, 246 * tone, 1);
        ctx.fillRect(x, y, t - grout, t - grout);
        const glint = ctx.createLinearGradient(x, y, x + t, y + t);
        glint.addColorStop(0, 'rgba(255,255,255,0.35)');
        glint.addColorStop(0.3, 'rgba(255,255,255,0)');
        glint.addColorStop(1, 'rgba(0,0,0,0.05)');
        ctx.fillStyle = glint;
        ctx.fillRect(x, y, t - grout, t - grout);
      }
    }
    k.speckle(ctx, rng, 1200, 0.05, false);
    return k.finish(canvas, 'tiles');
  }

  /** Asphalt: dark grey, a coarse stone aggregate light and dark, a few smoother worn patches and a tar seam. */
  function asphalt(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(109);
    ctx.fillStyle = '#4a4d52';
    ctx.fillRect(0, 0, SIZE, SIZE);
    k.blotches(ctx, rng, 18, 30, 100, [96, 98, 102], 0.12); // worn smoother
    k.blotches(ctx, rng, 14, 20, 80, [30, 31, 34], 0.14);
    k.speckle(ctx, rng, 16000, 0.3, false);
    k.speckle(ctx, rng, 9000, 0.22, true);
    // A sealed crack: a wandering dark tar line.
    k.crack(ctx, rng, 30, 0.5);
    return k.finish(canvas, 'asphalt');
  }

  /** Paving: two by two square slabs a repeat (60 cm), light grey, each a touch different, dark joints with a lit lip. */
  function paving(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(113);
    ctx.fillStyle = '#6f7277'; // joints
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 2;
    const s = SIZE / n;
    const joint = 2.5 * PX;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const tone = 0.93 + rngNext(rng) * 0.08;
        const x = i * s + joint / 2;
        const y = j * s + joint / 2;
        ctx.fillStyle = k.rgba(206 * tone, 206 * tone, 202 * tone, 1);
        ctx.fillRect(x, y, s - joint, s - joint);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x, y, s - joint, PX);
        ctx.fillRect(x, y, PX, s - joint);
      }
    }
    k.blotches(ctx, rng, 16, 16, 60, [150, 150, 146], 0.1);
    k.speckle(ctx, rng, 8000, 0.14, false);
    k.speckle(ctx, rng, 4000, 0.1, true);
    return k.finish(canvas, 'paving');
  }

  /** Dark glass: blue-black, two soft diagonal reflections across it, a lit edge along the top. */
  function glass(): ProceduralTexture {
    const [canvas, ctx] = k.makeCanvas();
    const rng = createRng(127);
    ctx.fillStyle = '#20262e';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (const [from, width, alpha] of [
      [0.15, 0.18, 0.14],
      [0.55, 0.08, 0.1],
    ] as const) {
      // A band running corner to corner, drawn three times across so it wraps.
      for (const dx of [-SIZE, 0, SIZE]) {
        ctx.fillStyle = `rgba(190,215,240,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(dx + from * SIZE, 0);
        ctx.lineTo(dx + (from + width) * SIZE, 0);
        ctx.lineTo(dx + (from + width) * SIZE + SIZE, SIZE);
        ctx.lineTo(dx + from * SIZE + SIZE, SIZE);
        ctx.closePath();
        ctx.fill();
      }
    }
    k.blotches(ctx, rng, 6, 30, 90, [120, 150, 180], 0.06);
    return k.finish(canvas, 'glass');
  }

  return { plaster, cladding, tiles, asphalt, paving, glass };
}
