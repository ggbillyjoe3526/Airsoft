import { DRESSING } from '../config/dressing';
import { createRng, rngNext, type RngState } from '../sim/rng';
import type { AtlasRect, DressingCells } from './mapDecals';

/**
 * The set dressing's pictures in the decal atlas (G8, its last third: render/mapDecals.ts atlasRects): the shipping
 * lines' logos, dirt banked along a cell's bottom edge, a spray arrow and tag (white: the quad's vertex colour paints
 * them), a warning sign, grit, a soft contact shadow and scraps of litter. Drawn once with the atlas, seeded, so the
 * atlas is the same every time. `k` is the atlas' scale (its width / 1024).
 */
const X = DRESSING.decals;
const SEED = 8081;

export function drawDressingCells(g: CanvasRenderingContext2D, cells: DressingCells, k: number): void {
  const rng = createRng(SEED);
  cells.logos.forEach((r, i) => drawLogo(g, r, k, X.logo.names[i % X.logo.names.length]!, i));
  cells.banks.forEach((r) => drawBank(g, r, k, rng));
  drawArrow(g, cells.arrow, k);
  drawTag(g, cells.tag, k, rng);
  drawWarning(g, cells.warning, k);
  drawGrit(g, cells.grit, k, rng);
  drawContact(g, cells.contact, k);
  cells.litter.forEach((r) => drawLitter(g, r, k, rng));
}

/** The cell's rectangle in pixels and a clip to it (restored by the caller's `g.restore()`). */
function cell(g: CanvasRenderingContext2D, r: AtlasRect): void {
  g.save();
  g.beginPath();
  g.rect(r[0], r[1], r[2], r[3]);
  g.clip();
}

const rand = (rng: RngState, a: number, b: number): number => a + rngNext(rng) * (b - a);

/** A fictional shipping line (no real brand): an emblem and its name, stencilled in worn paint. */
function drawLogo(g: CanvasRenderingContext2D, r: AtlasRect, k: number, name: string, i: number): void {
  cell(g, r);
  const [x, y, w, h] = r;
  g.fillStyle = X.logo.paint;
  g.strokeStyle = X.logo.paint;
  g.lineWidth = 10 * k;
  // The emblem: four marks, one per line (a bird's wing, a ring, a peak, a wave).
  const cx = x + h * 0.55;
  const cy = y + h / 2;
  const s = h * 0.36;
  g.beginPath();
  if (i % 4 === 0) {
    g.moveTo(cx - s, cy + s * 0.5);
    g.lineTo(cx, cy - s * 0.6);
    g.lineTo(cx + s, cy + s * 0.5);
    g.lineTo(cx, cy);
    g.closePath();
    g.fill();
  } else if (i % 4 === 1) {
    g.arc(cx, cy, s * 0.85, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
    g.fill();
  } else if (i % 4 === 2) {
    g.moveTo(cx - s, cy + s * 0.7);
    g.lineTo(cx - s * 0.2, cy - s * 0.7);
    g.lineTo(cx + s * 0.25, cy);
    g.lineTo(cx + s * 0.55, cy - s * 0.4);
    g.lineTo(cx + s, cy + s * 0.7);
    g.closePath();
    g.fill();
  } else {
    for (let j = 0; j < 3; j++) {
      g.moveTo(cx - s, cy - s * 0.5 + j * s * 0.5);
      g.quadraticCurveTo(cx, cy - s * 0.9 + j * s * 0.5, cx + s, cy - s * 0.5 + j * s * 0.5);
    }
    g.stroke();
  }
  g.font = `bold ${Math.round(h * 0.5)}px sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const room = w - h * 1.3;
  const measured = g.measureText(name).width;
  g.save();
  g.translate(x + h * 1.1, cy);
  if (measured > room) g.scale(room / measured, 1);
  g.fillText(name, 0, 0);
  g.restore();
  // Worn: chips knocked out of the paint.
  g.globalCompositeOperation = 'destination-out';
  for (let j = 0; j < 60; j++) {
    const px = x + ((j * 97 + i * 31) % 100) / 100 * w;
    const py = y + ((j * 53 + i * 17) % 100) / 100 * h;
    g.fillRect(px, py, (2 + (j % 4)) * k, (1 + (j % 3)) * k);
  }
  g.restore();
}

/** Grey dirt and grit banked against a block's foot: thick along the bottom edge, thinning to nothing up the cell. */
function drawBank(g: CanvasRenderingContext2D, r: AtlasRect, k: number, rng: RngState): void {
  cell(g, r);
  const [x, y, w, h] = r;
  const grad = g.createLinearGradient(0, y + h, 0, y);
  grad.addColorStop(0, hexAlpha(X.colour.dirt, X.alpha.dirt));
  grad.addColorStop(0.45, hexAlpha(X.colour.dirt, X.alpha.dirt * 0.5));
  grad.addColorStop(1, hexAlpha(X.colour.dirt, 0));
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // Clumps and chips along the foot, fewer further out.
  for (let i = 0; i < 160; i++) {
    const out = Math.pow(rngNext(rng), 1.8);
    const px = x + rngNext(rng) * w;
    const py = y + h - out * h * 0.9;
    const rad = rand(rng, 1.5, 6) * k * (1 - out * 0.6);
    g.fillStyle = hexAlpha(i % 3 === 0 ? X.colour.grit : X.colour.dirt, X.alpha.grit * (1 - out));
    g.beginPath();
    g.arc(px, py, rad, 0, Math.PI * 2);
    g.fill();
  }
  // Soften the cell's ends so a bank never ends in a hard line.
  g.globalCompositeOperation = 'destination-out';
  for (const [from, to] of [[x, x + w * 0.12], [x + w, x + w * 0.88]] as const) {
    const fade = g.createLinearGradient(from, 0, to, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(Math.min(from, to), y, w * 0.12, h);
  }
  g.restore();
}

/** A sprayed arrow (white; the quad's colour paints it), soft-edged, with a drip or two. */
function drawArrow(g: CanvasRenderingContext2D, r: AtlasRect, k: number): void {
  cell(g, r);
  const [x, y, w, h] = r;
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,255,255,0.8)';
  g.shadowBlur = 6 * k;
  g.lineWidth = h * 0.16;
  const cy = y + h / 2;
  g.beginPath();
  g.moveTo(x + w * 0.1, cy);
  g.lineTo(x + w * 0.7, cy);
  g.stroke();
  g.beginPath();
  g.moveTo(x + w * 0.62, y + h * 0.18);
  g.lineTo(x + w * 0.92, cy);
  g.lineTo(x + w * 0.62, y + h * 0.82);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 3 * k;
  for (const dx of [0.25, 0.48]) {
    g.beginPath();
    g.moveTo(x + w * dx, cy + h * 0.06);
    g.lineTo(x + w * dx, cy + h * 0.3);
    g.stroke();
  }
  g.restore();
}

/** An abstract sprayed tag (no letters): loops and a slash, white. */
function drawTag(g: CanvasRenderingContext2D, r: AtlasRect, k: number, rng: RngState): void {
  cell(g, r);
  const [x, y, w, h] = r;
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.shadowColor = 'rgba(255,255,255,0.8)';
  g.shadowBlur = 4 * k;
  g.lineWidth = 9 * k;
  g.beginPath();
  g.moveTo(x + w * 0.12, y + h * 0.7);
  for (let i = 0; i < 5; i++) {
    const px = x + w * (0.2 + i * 0.15);
    g.bezierCurveTo(px, y + h * rand(rng, 0.1, 0.3), px + w * 0.1, y + h * rand(rng, 0.7, 0.85), px + w * 0.05, y + h * 0.55);
  }
  g.stroke();
  g.lineWidth = 6 * k;
  g.beginPath();
  g.moveTo(x + w * 0.15, y + h * 0.85);
  g.lineTo(x + w * 0.88, y + h * 0.78);
  g.stroke();
  g.restore();
}

/** A warning sign on its plate: a yellow triangle, dark border and a "!" (no words: it reads at any distance). */
function drawWarning(g: CanvasRenderingContext2D, r: AtlasRect, k: number): void {
  cell(g, r);
  const [x, y, w, h] = r;
  g.fillStyle = X.warning.plate;
  g.fillRect(x + 4 * k, y + 4 * k, w - 8 * k, h - 8 * k);
  const tri = (inset: number): void => {
    g.beginPath();
    g.moveTo(x + w / 2, y + inset);
    g.lineTo(x + w - inset, y + h - inset * 1.1);
    g.lineTo(x + inset, y + h - inset * 1.1);
    g.closePath();
  };
  g.fillStyle = X.warning.ink;
  tri(12 * k);
  g.fill();
  g.fillStyle = X.warning.yellow;
  tri(24 * k);
  g.fill();
  g.fillStyle = X.warning.ink;
  g.fillRect(x + w / 2 - 5 * k, y + h * 0.4, 10 * k, h * 0.26);
  g.fillRect(x + w / 2 - 5 * k, y + h * 0.71, 10 * k, 9 * k);
  g.restore();
}

/** Grit scattered round a heap of rubble: chips thinning out from the middle. */
function drawGrit(g: CanvasRenderingContext2D, r: AtlasRect, k: number, rng: RngState): void {
  cell(g, r);
  const [x, y, w, h] = r;
  for (let i = 0; i < 140; i++) {
    const a = rngNext(rng) * Math.PI * 2;
    const d = Math.sqrt(rngNext(rng)) * 0.46;
    g.fillStyle = hexAlpha(i % 2 ? X.colour.grit : X.colour.dirt, X.alpha.grit * (1 - d * 1.6));
    g.fillRect(x + w / 2 + Math.cos(a) * d * w, y + h / 2 + Math.sin(a) * d * h, rand(rng, 1.5, 4) * k, rand(rng, 1.5, 4) * k);
  }
  g.restore();
}

/** The soft dark shadow under a piece of junk: a rounded patch fading out at its edge. */
function drawContact(g: CanvasRenderingContext2D, r: AtlasRect, k: number): void {
  cell(g, r);
  const [x, y, w, h] = r;
  const grad = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
  grad.addColorStop(0, hexAlpha(X.colour.contact, X.alpha.contact));
  grad.addColorStop(0.6, hexAlpha(X.colour.contact, X.alpha.contact * 0.8));
  grad.addColorStop(1, hexAlpha(X.colour.contact, 0));
  g.fillStyle = grad;
  g.fillRect(x + k, y + k, w - 2 * k, h - 2 * k);
  g.restore();
}

/** Scraps of paper and card blown into a corner: a few turned slips. */
function drawLitter(g: CanvasRenderingContext2D, r: AtlasRect, k: number, rng: RngState): void {
  cell(g, r);
  const [x, y, w, h] = r;
  for (let i = 0; i < 5; i++) {
    g.save();
    g.translate(x + w * rand(rng, 0.25, 0.75), y + h * rand(rng, 0.25, 0.75));
    g.rotate(rngNext(rng) * Math.PI);
    g.fillStyle = X.litter[i % X.litter.length]!;
    const sw = rand(rng, 14, 30) * k;
    const sh = rand(rng, 8, 18) * k;
    g.fillRect(-sw / 2, -sh / 2, sw, sh);
    g.fillStyle = 'rgba(40,40,40,0.25)';
    g.fillRect(-sw / 2, sh / 2 - 2 * k, sw, 2 * k);
    g.restore();
  }
  g.restore();
}

/** An sRGB hex colour ('#rrggbb') at `alpha`, as a canvas colour. */
function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}
