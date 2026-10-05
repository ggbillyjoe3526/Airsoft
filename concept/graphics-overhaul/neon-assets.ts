import * as THREE from 'three';
import { MATS } from './kit';
import { fbm, makeTex, smooth, TEX_METRES, tnoise, type TexSet } from './textures';

/**
 * Neon Heights' own surfaces and atlases, registered at module load: wet asphalt and paving, glazed tiles, roofing,
 * brick, perforated and grated steel, roller shutters; a lit decal atlas (road paint, graffiti, stickers, posters,
 * stains, flat litter) and an unlit atlas (screens, lightboxes, lit rooms behind windows); the halo and steam puffs; a
 * single-stroke font for neon tubes. Every name, logo and brand here is made up.
 */

// ---------------------------------------------------------------------------------------------------------------- noise

const hash2 = (i: number, j: number, s: number): number => {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** Seeded random numbers (Park-Miller), so every shot is the same each time. */
export function rng(seed: number): () => number {
  let s = Math.max(1, Math.floor(seed) % 2147483646);
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---------------------------------------------------------------------------------------------------------------- textures

/** Wet asphalt, 6 m square: aggregate, tar-sealed cracks, a patch repair, and wet and dry areas (rough 0.1 to 0.6). */
function asphalt(size: number, full: boolean): TexSet {
  // A soft normal: fine aggregate in a glossy wet surface sparkles (specular aliasing) under many small lights.
  return makeTex('nhAsphalt', size, full, 0.5, (u, v) => {
    const big = fbm(u, v, 3, 3, 201);
    const mid = fbm(u, v, 14, 3, 202);
    const agg = tnoise(u, v, 380, 203);
    const agg2 = tnoise(u, v, 190, 204);
    const chip = agg > 0.9 ? 0.09 : agg < 0.08 ? -0.03 : 0;
    // Tar-sealed cracks: thin black glossy ridges along a noise field's level lines.
    const cr = Math.abs(fbm(u, v, 4, 4, 205) - 0.5);
    const crack = cr < 0.0045 && big > 0.42 ? 1 : 0;
    const seal = cr < 0.012 && big > 0.42 ? 1 : 0;
    // A rectangular patch repair, darker and smoother.
    const patch = u > 0.58 && u < 0.86 && v > 0.12 && v < 0.34 ? 1 : 0;
    // Wet where the road dips (low-frequency field), drying on the crown.
    const wet = smooth(0.42, 0.62, fbm(u + 0.3, v, 2, 3, 206) * 0.8 + mid * 0.3);
    let t = 0.3 + (big - 0.5) * 0.06 + (agg2 - 0.5) * 0.05 + chip - patch * 0.05 - seal * 0.1 - crack * 0.08;
    t *= 1 - wet * 0.28;
    const rough = Math.max(0.14, (0.62 - wet * 0.46 - seal * 0.25 - patch * 0.08 + (agg2 - 0.5) * 0.04) * (1 - crack * 0.4));
    return { r: t * 0.97, g: t * 0.98, b: t * 1.03, h: 0.5 + (agg2 - 0.5) * 0.12 + chip * 0.4 - crack * 0.6 - patch * 0.05, rough };
  });
}

/** Square paving slabs (0.6 m, four across the 2.4 m tile): toned slabs, dark wet joints, chewing-gum spots, a cracked slab. */
function paving(size: number, full: boolean): TexSet {
  return makeTex('nhPaving', size, full, 2.2, (u, v) => {
    const n = 4;
    const i = Math.floor(u * n);
    const j = Math.floor(v * n);
    const fx = u * n - i;
    const fy = v * n - j;
    const joint = Math.min(fx, 1 - fx, fy, 1 - fy);
    const isJoint = joint < 0.012;
    const tone = hash2(i, j, 211);
    const fine = fbm(u, v, 40, 2, 212);
    const gum = tnoise(u, v, 160, 213) > 0.965 ? 1 : 0;
    const cr = Math.abs(fbm(u, v, 6, 3, 214) - 0.5) < 0.006 && tone > 0.75 ? 1 : 0;
    const wet = smooth(0.45, 0.7, fbm(u, v, 3, 3, 215));
    const edge = smooth(0.0, 0.06, joint);
    let t = isJoint ? 0.18 : 0.56 + (tone - 0.5) * 0.12 + (fine - 0.5) * 0.06 - cr * 0.2 + gum * 0.12;
    t *= 1 - wet * 0.22 - (1 - edge) * 0.12;
    const rough = isJoint ? 0.25 : Math.max(0.12, 0.72 - wet * 0.5 + gum * 0.2 - (1 - edge) * 0.2);
    return { r: t * (tone > 0.85 ? 1.04 : 1), g: t, b: t * 1.02, h: isJoint ? 0 : 0.6 + edge * 0.3 + fine * 0.1 - cr * 0.3, rough };
  });
}

/** Glazed tiles 0.15 m (four across the 0.6 m tile), pale grout. */
function tiles(size: number, full: boolean): TexSet {
  return makeTex('nhTiles', size, full, 1.6, (u, v) => {
    const n = 4;
    const fx = (u * n) % 1;
    const fy = (v * n) % 1;
    const g = Math.min(fx, 1 - fx, fy, 1 - fy);
    const grout = g < 0.035;
    const tone = hash2(Math.floor(u * n), Math.floor(v * n), 221);
    const f = fbm(u, v, 12, 2, 222);
    const t = grout ? 0.72 : 0.92 + (tone - 0.5) * 0.06 + (f - 0.5) * 0.03;
    return { r: t, g: t, b: t, h: grout ? 0 : 0.6 + smooth(0, 0.1, g) * 0.4, rough: grout ? 0.9 : 0.18 + f * 0.12 };
  });
}

/** Roofing: a bitumen membrane with seams, a scatter of gravel and dark wet patches. 2 m square. */
function roofing(size: number, full: boolean): TexSet {
  return makeTex('nhRoof', size, full, 1.4, (u, v) => {
    const seam = Math.abs(((v * 2) % 1) - 0.5) < 0.008 ? 1 : 0;
    const grav = tnoise(u, v, 220, 231);
    const big = fbm(u, v, 4, 3, 232);
    const wet = smooth(0.55, 0.75, big);
    const t = (0.36 + (grav - 0.5) * 0.18 - seam * 0.08) * (1 - wet * 0.3);
    return { r: t, g: t * 0.99, b: t * 0.97, h: grav * 0.6 + seam * 0.3, rough: 0.85 - wet * 0.55 };
  });
}

/** Brick: 0.24 × 0.075 m bricks in stretcher bond (five across, sixteen courses in the 1.2 m tile), toned, recessed mortar. */
function brick(size: number, full: boolean): TexSet {
  return makeTex('nhBrick', size, full, 2.4, (u, v) => {
    const rows = 16;
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const bx = u * 5 + (row % 2 ? 0.5 : 0);
    const col = Math.floor(bx);
    const fx = bx - col;
    const mortar = fx < 0.04 || fx > 0.96 || fy < 0.1 || fy > 0.9;
    const tone = hash2(((col % 5) + 5) % 5, row, 241);
    const f = fbm(u, v, 30, 2, 242);
    const t = mortar ? 0.5 : 0.62 + (tone - 0.5) * 0.25 + (f - 0.5) * 0.08;
    const red = tone > 0.8 ? 0.85 : 1;
    return { r: t, g: t * 0.62 * red, b: t * 0.5 * red, h: mortar ? 0 : 0.7 + f * 0.2, rough: mortar ? 1 : 0.85 };
  });
}

/** Perforated steel panels for balustrades: round holes on a staggered grid (dark, but solid: you can't see through). */
function perf(size: number, full: boolean): TexSet {
  return makeTex('nhPerf', size, full, 1.5, (u, v) => {
    const n = 12;
    const row = Math.floor(v * n);
    const fx = ((u * n + (row % 2) * 0.5) % 1) - 0.5;
    const fy = v * n - row - 0.5;
    const hole = Math.hypot(fx, fy) < 0.28;
    const f = fbm(u, v, 6, 2, 251);
    const t = hole ? 0.32 : 0.9 + (f - 0.5) * 0.05;
    return { r: t, g: t, b: t, h: hole ? 0 : 1, rough: hole ? 0.9 : 0.45 };
  });
}

/** Steel grating (fire escapes, catwalks): bars both ways over a dark gap. 0.3 m square. */
function grate(size: number, full: boolean): TexSet {
  return makeTex('nhGrate', size, full, 3, (u, v) => {
    const a = (u * 10) % 1;
    const b = (v * 4) % 1;
    const bar = a < 0.22 || b < 0.12;
    return { r: bar ? 0.85 : 0.08, g: bar ? 0.85 : 0.08, b: bar ? 0.85 : 0.09, h: bar ? 1 : 0, rough: bar ? 0.5 : 1 };
  });
}

/** A roller shutter: slats 0.08 m deep with bright edges and a shadowed groove. 1 m square. */
function shutter(size: number, full: boolean): TexSet {
  return makeTex('nhShutter', size, full, 3, (u, v) => {
    const p = (v * 12.5) % 1;
    const prof = smooth(0, 0.2, p) * (1 - smooth(0.75, 1, p));
    const f = fbm(u, v, 5, 3, 261);
    const scratch = tnoise(u * 3, v * 0.3, 60, 262) > 0.97 ? 0.1 : 0;
    const t = 0.55 + prof * 0.35 + (f - 0.5) * 0.12 + scratch;
    return { r: t, g: t, b: t, h: prof, rough: 0.5 + f * 0.3 };
  });
}

TEX_METRES.nhAsphalt = 6;
TEX_METRES.nhPaving = 2.4;
TEX_METRES.nhTiles = 0.6;
TEX_METRES.nhRoof = 2;
TEX_METRES.nhBrick = 1.2;
TEX_METRES.nhPerf = 0.3;
TEX_METRES.nhGrate = 0.3;
TEX_METRES.nhShutter = 1;

// The materials (MatDef, kit.ts). Texture maps give the roughness on the wet surfaces, so their factor is 1.
MATS.nhAsphalt = { tex: asphalt, texKey: 'nhAsphalt', big: true, rough: 1, envIntensity: 1.1, grime: 0.25 };
MATS.nhPaving = { tex: paving, texKey: 'nhPaving', big: true, rough: 1, envIntensity: 0.9, grime: 0.35 };
MATS.nhTiles = { tex: tiles, texKey: 'nhTiles', rough: 1, envIntensity: 0.8, grime: 0.3 };
MATS.nhRoof = { tex: roofing, texKey: 'nhRoof', rough: 1, envIntensity: 0.7, grime: 0.4 };
MATS.nhBrick = { tex: brick, texKey: 'nhBrick', rough: 0.9, grime: 0.7 };
MATS.nhPerf = { tex: perf, texKey: 'nhPerf', rough: 0.5, metal: 0.5, grime: 0.5, rust: 0.2 };
MATS.nhGrate = { tex: grate, texKey: 'nhGrate', rough: 0.5, metal: 0.4, grime: 0.6, rust: 0.6 };
MATS.nhShutter = { tex: shutter, texKey: 'nhShutter', rough: 0.55, metal: 0.4, grime: 0.8, rust: 0.4 };
MATS.nhGlass = { rough: 0.06, metal: 0.4, envIntensity: 1.5 };
MATS.nhCarPaint = { rough: 0.3, clearcoat: 1, envIntensity: 1.2, grime: 0.35 };
MATS.nhBag = { rough: 0.32, clearcoat: 0.5, envIntensity: 1.1, grime: 0.2 };
MATS.nhTubeOff = { rough: 0.15, clearcoat: 1, envIntensity: 1.4 };
MATS.nhWater = { rough: 0.02, envIntensity: 1.6 };
MATS.nhDecal = { canvas: () => decalAtlas(), rough: 0.6, alphaTest: 0.4, grime: 0.4 };
// Drawn through Kit for merging; neon-city swaps these for their real (unlit, additive) materials after build.
MATS.nhScreen = { canvas: () => screenAtlas(), alphaTest: 0.5 };
MATS.nhHalo = { canvas: () => haloTex() };

// ---------------------------------------------------------------------------------------------------------------- atlases

/** Atlas cells by name: [u, v, w, h] in UV space (v up). */
export type Cells = Record<string, [number, number, number, number]>;

function atlas(size: number, cells: [string, number, number, number, number, (g: CanvasRenderingContext2D, w: number, h: number) => void][], out: Cells, wear: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  for (const [name, x, y, w, h, draw] of cells) {
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    draw(g, w, h);
    if (wear) {
      // Wear: specks punched out of the paint.
      g.globalCompositeOperation = 'destination-out';
      const r = rng(x * 7 + y * 13 + 3);
      for (let i = 0; i < (w * h) / 500; i++) {
        g.globalAlpha = r() * 0.7;
        g.beginPath();
        g.arc(r() * w, r() * h, r() * 4 + 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    out[name] = [x / size, 1 - (y + h) / size, w / size, h / size];
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const FONT = (px: number, w = 'bold', fam = 'DejaVu Sans, Liberation Sans, Arial, sans-serif') => `${w} ${px}px ${fam}`;

function centred(g: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, fill: string): void {
  g.font = font;
  g.fillStyle = fill;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/** A sprayed tag: fat bubble letters with an outline and drips. */
function tag(g: CanvasRenderingContext2D, w: number, h: number, text: string, fill: string, line: string, seed: number): void {
  const r = rng(seed);
  g.translate(w / 2, h / 2);
  g.rotate(-0.08);
  g.font = FONT(h * 0.62, '900', 'DejaVu Sans, sans-serif');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = h * 0.12;
  g.strokeStyle = line;
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.lineWidth = h * 0.025;
  g.strokeStyle = '#ffffff';
  g.globalAlpha = 0.7;
  g.strokeText(text, -h * 0.02, -h * 0.03);
  g.globalAlpha = 1;
  g.fillStyle = line;
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * w * 0.7;
    g.fillRect(x, h * 0.18, 3 + r() * 3, h * (0.1 + r() * 0.2));
  }
}

let decalCells: Cells | null = null;
let decalTex: THREE.CanvasTexture | null = null;
/** Lit decals (alpha-cut, tinted per decal by vertex colour unless drawn in colour). */
export function decalAtlas(): THREE.CanvasTexture {
  if (decalTex) return decalTex;
  const cells: Cells = {};
  decalTex = atlas(2048, [
    ['paint', 0, 0, 256, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      // Tyre-worn paint: a band of heavier wear.
      g.globalCompositeOperation = 'destination-out';
      const r = rng(5);
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = r() * 0.9;
        g.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 4);
      }
    }],
    ['tagA', 256, 0, 512, 256, (g, w, h) => tag(g, w, h, 'ZEPH', '#ff4fb8', '#1b1530', 11)],
    ['tagB', 768, 0, 512, 256, (g, w, h) => tag(g, w, h, 'KOMO', '#7cf0ff', '#14232e', 12)],
    ['tagC', 1280, 0, 512, 256, (g, w, h) => {
      // A thin marker scrawl.
      g.strokeStyle = '#f4f1ea';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.font = FONT(150, 'italic bold', 'FreeSerif, DejaVu Serif, serif');
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeText('nyx 26', 30, h / 2);
      g.beginPath();
      g.moveTo(30, h * 0.82);
      g.quadraticCurveTo(w * 0.5, h * 0.95, w - 40, h * 0.7);
      g.lineWidth = 6;
      g.stroke();
    }],
    ['stencilCat', 1792, 0, 256, 256, (g, w, h) => {
      // A stencilled cat face (sprayed through a card: broken outlines).
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(40, 220);
      g.lineTo(40, 70);
      g.lineTo(80, 110);
      g.lineTo(176, 110);
      g.lineTo(216, 70);
      g.lineTo(216, 220);
      g.closePath();
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(95, 160, 16, 0, Math.PI * 2);
      g.arc(161, 160, 16, 0, Math.PI * 2);
      g.fill();
      g.fillRect(120, 182, 16, 10);
      g.fillRect(126, 110, 4, 110);
      void w;
      void h;
    }],
    ['stickers', 0, 256, 512, 256, (g, w, h) => {
      // A cluster of stickers: a robot face, a star, a round band logo, a tag slap.
      g.fillStyle = '#f2ece0';
      g.fillRect(20, 40, 150, 100);
      centred(g, 'HELLO', 95, 70, FONT(28), '#d8343c');
      centred(g, 'my name is', 95, 96, FONT(16, ''), '#d8343c');
      centred(g, 'BEEP', 95, 122, FONT(26, 'bold italic'), '#222');
      g.fillStyle = '#ffd23a';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? 26 : 60;
        g.lineTo(260 + Math.cos(a) * rr, 90 + Math.sin(a) * rr);
      }
      g.fill();
      g.fillStyle = '#2a2a40';
      g.beginPath();
      g.arc(400, 110, 70, 0, Math.PI * 2);
      g.fill();
      centred(g, 'STATIC', 400, 100, FONT(30, '900'), '#7cf0ff');
      centred(g, 'LIVE', 400, 135, FONT(22), '#ff4fb8');
      g.fillStyle = '#ff6a3a';
      g.fillRect(180, 170, 140, 70);
      g.fillStyle = '#fff';
      g.fillRect(200, 186, 26, 26);
      g.fillRect(274, 186, 26, 26);
      g.fillRect(214, 222, 72, 8);
      void w;
      void h;
    }],
    ['posterA', 512, 256, 256, 384, (g, w, h) => {
      // A paste-up gig poster, torn at the corner.
      g.fillStyle = '#e9e1cf';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d1b2c';
      g.fillRect(14, 14, w - 28, h * 0.55);
      g.fillStyle = '#ff4fb8';
      g.beginPath();
      g.arc(w / 2, h * 0.32, 60, 0, Math.PI * 2);
      g.fill();
      centred(g, 'THE STATIC', w / 2, h * 0.68, FONT(30, '900'), '#1d1b2c');
      centred(g, 'LIVE · FRI 11', w / 2, h * 0.78, FONT(20), '#c4304a');
      centred(g, 'BASEMENT 9', w / 2, h * 0.87, FONT(18, ''), '#1d1b2c');
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.moveTo(w, h - 90);
      g.lineTo(w - 50, h);
      g.lineTo(w, h);
      g.fill();
    }],
    ['posterB', 768, 256, 256, 384, (g, w, h) => {
      g.fillStyle = '#f4f1ea';
      g.fillRect(0, 0, w, h);
      centred(g, 'LOST', w / 2, 50, FONT(52, '900'), '#111');
      g.fillStyle = '#555';
      g.fillRect(40, 90, w - 80, 140);
      g.fillStyle = '#888';
      g.beginPath();
      g.ellipse(w / 2, 170, 50, 40, 0, 0, Math.PI * 2);
      g.fill();
      centred(g, 'grey cat · "Pixel"', w / 2, 260, FONT(18, ''), '#111');
      for (let i = 0; i < 6; i++) {
        g.fillStyle = '#ddd';
        g.fillRect(14 + i * 39, h - 70, 30, 66);
        g.fillStyle = '#333';
        g.fillRect(24 + i * 39, h - 64, 10, 54);
      }
    }],
    ['posterC', 1024, 256, 512, 256, (g, w, h) => {
      // A row of faded fly-posters, overlapping.
      const cols = ['#ffd23a', '#7cf0ff', '#ff4fb8', '#b6ff6a'];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = cols[i]!;
        g.fillRect(i * 124 + 6, 10 + (i % 2) * 14, 118, h - 30);
        centred(g, ['NOISE', 'RAVE', 'NOISE', 'RAVE'][i]!, i * 124 + 65, 80 + (i % 2) * 14, FONT(30, '900'), '#1d1b2c');
        centred(g, 'SAT', i * 124 + 65, 130 + (i % 2) * 14, FONT(24), '#1d1b2c');
      }
      void w;
    }],
    ['stain', 1536, 256, 512, 512, (g, w, h) => {
      // A dark wet stain: overlapping soft blobs.
      const r = rng(41);
      for (let i = 0; i < 26; i++) {
        const x = w / 2 + (r() - 0.5) * w * 0.55;
        const y = h / 2 + (r() - 0.5) * h * 0.55;
        const grd = g.createRadialGradient(x, y, 2, x, y, 50 + r() * 90);
        grd.addColorStop(0, 'rgba(255,255,255,0.55)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      }
    }],
    ['crack', 0, 512, 512, 512, (g, w, h) => {
      g.strokeStyle = '#fff';
      const r = rng(77);
      const walk = (x: number, y: number, a: number, len: number, lw: number): void => {
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x, y);
        for (let i = 0; i < len; i++) {
          a += (r() - 0.5) * 0.9;
          x += Math.cos(a) * 9;
          y += Math.sin(a) * 9;
          g.lineTo(x, y);
          if (r() > 0.93 && lw > 2) walk(x, y, a + (r() - 0.5) * 2, len / 3, lw * 0.6);
        }
        g.stroke();
      };
      walk(20, h * 0.5, 0, 55, 5);
      void w;
    }],
    ['newspaper', 512, 640, 256, 192, (g, w, h) => {
      g.fillStyle = '#d9d4c8';
      g.fillRect(0, 0, w, h);
      centred(g, 'CITY DAILY', w / 2, 22, FONT(22, '900', 'FreeSerif, serif'), '#222');
      g.fillStyle = '#555';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 8; j++) g.fillRect(12 + i * 80, 48 + j * 17, 70, 6);
      g.fillStyle = '#888';
      g.fillRect(172, 48, 70, 60);
      // Creased and torn.
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(60, h);
      g.lineTo(0, h - 50);
      g.fill();
    }],
    ['flyer', 768, 640, 128, 192, (g, w, h) => {
      g.fillStyle = '#ff4fb8';
      g.fillRect(0, 0, w, h);
      centred(g, 'PARTY', w / 2, 40, FONT(26, '900'), '#fff');
      centred(g, '2-4-1', w / 2, 100, FONT(34, '900'), '#ffd23a');
    }],
    ['cardboard', 896, 640, 256, 256, (g, w, h) => {
      // A flattened carton: brown with a printed arrow and tape.
      g.fillStyle = '#b08856';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#9a7445';
      g.fillRect(0, h * 0.48, w, 6);
      g.fillStyle = '#d8c69a';
      g.fillRect(w * 0.42, 0, 26, h);
      g.fillStyle = '#3a2a1a';
      g.font = FONT(30, '900');
      g.fillText('THIS SIDE UP', 20, 60);
      g.beginPath();
      g.moveTo(60, 200);
      g.lineTo(90, 150);
      g.lineTo(120, 200);
      g.fill();
    }],
    ['wrapper', 1152, 640, 128, 128, (g, w, h) => {
      g.fillStyle = '#ffd23a';
      g.beginPath();
      g.moveTo(10, 30);
      g.lineTo(110, 14);
      g.lineTo(118, 96);
      g.lineTo(20, 116);
      g.fill();
      centred(g, 'CRNCH', 64, 64, FONT(22, '900'), '#d8343c');
      void w;
      void h;
    }],
    ['leaves', 1280, 640, 256, 256, (g, w, h) => {
      // Wet leaf litter and grit for gutters and corners.
      const r = rng(91);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = ['#6b5a34', '#8a6c3a', '#4f4a2c', '#a07a40'][Math.floor(r() * 4)]!;
        g.save();
        g.translate(r() * w, r() * h);
        g.rotate(r() * 6);
        g.beginPath();
        g.ellipse(0, 0, 6 + r() * 8, 3 + r() * 4, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(40,36,30,${0.4 + r() * 0.5})`;
        g.fillRect(r() * w, r() * h, 2, 2);
      }
    }],
    ['arrow', 1536, 768, 256, 512, (g, w, h) => {
      // A road arrow (straight on).
      g.fillStyle = '#fff';
      g.fillRect(w / 2 - 22, 160, 44, h - 180);
      g.beginPath();
      g.moveTo(w / 2, 20);
      g.lineTo(w / 2 + 80, 180);
      g.lineTo(w / 2 - 80, 180);
      g.fill();
    }],
    ['slow', 1792, 768, 256, 512, (g, w, h) => {
      // "SLOW" painted on the road, stretched for a driver's eye.
      g.save();
      g.translate(w / 2, h / 2);
      g.scale(1, 2.6);
      centred(g, 'SLOW', 0, 0, FONT(84, '900'), '#fff');
      g.restore();
    }],
    ['manhole', 0, 1024, 256, 256, (g, w, h) => {
      // A cast-iron cover: rim, a grid of studs and the made-up foundry's name round it.
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(w / 2, h / 2, 124, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(w / 2, h / 2, 104, 0, Math.PI * 2);
      g.stroke();
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
        if (i * i + j * j > 14) continue;
        g.fillRect(w / 2 + i * 20 - 4, h / 2 + j * 20 - 4, 8, 8);
      }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000';
      g.font = FONT(16, 'bold');
      g.textAlign = 'center';
      g.fillText('KESTREL FOUNDRY', w / 2, h / 2 + 117);
    }],
    ['drain', 256, 1024, 256, 128, (g, w, h) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 11; i++) g.fillRect(14 + i * 21.5, 16, 10, h - 32);
    }],
    ['zebra', 512, 1024, 256, 256, (g, w, h) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      const r = rng(17);
      for (let i = 0; i < 500; i++) {
        g.globalAlpha = r() * 0.95;
        g.fillRect(r() * w, r() * h, 3 + r() * 16, 2 + r() * 6);
      }
    }],
    ['tagD', 768, 1024, 512, 256, (g, w, h) => tag(g, w, h, 'RAZE', '#b6ff6a', '#1b2a14', 13)],
    ['handbill', 1280, 1024, 256, 256, (g, w, h) => {
      // A torn-off phone-number strip notice.
      g.fillStyle = '#f2efe6';
      g.fillRect(20, 10, w - 40, h - 20);
      centred(g, 'ROOM', w / 2, 50, FONT(34, '900'), '#222');
      centred(g, 'TO LET', w / 2, 90, FONT(28, '900'), '#222');
      for (let i = 0; i < 7; i++) {
        g.fillStyle = i % 3 === 1 ? 'rgba(0,0,0,0)' : '#f2efe6';
        g.fillRect(24 + i * 30, h - 90, 24, 76);
        g.fillStyle = '#444';
        if (i % 3 !== 1) g.fillRect(34 + i * 30, h - 84, 4, 60);
      }
    }],
  ], cells, true);
  decalCells = cells;
  return decalTex;
}

export function decalCell(name: string): [number, number, number, number] {
  decalAtlas();
  const c = decalCells![name];
  if (!c) throw new Error(`no decal ${name}`);
  return c;
}

/** Pixel-art game screens for the arcade cabinets. */
function gameScreen(g: CanvasRenderingContext2D, w: number, h: number, game: number): void {
  const r = rng(game * 31 + 7);
  const px = (x: number, y: number, s: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), s, s);
  };
  if (game === 0) {
    // A space shooter: stars, a ship, rows of invaders.
    g.fillStyle = '#05061a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) px(r() * w, r() * h, 3, '#8fa8ff');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
      const c = ['#ff4fb8', '#7cf0ff', '#b6ff6a', '#ffd23a'][j]!;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) px(30 + i * 34 + a * 7, 30 + j * 26 + b * 7, 7, c);
    }
    g.fillStyle = '#7cf0ff';
    g.fillRect(w / 2 - 16, h - 40, 32, 14);
    g.fillRect(w / 2 - 4, h - 52, 8, 12);
    px(w / 2 - 2, h - 90, 4, '#fff');
  } else if (game === 1) {
    // A fighting game: two fighters on a sunset stage, health bars.
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ff7a3a');
    grd.addColorStop(0.6, '#a03a8a');
    grd.addColorStop(1, '#2a1a40');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd23a';
    g.fillRect(16, 14, w * 0.38, 10);
    g.fillRect(w - 16 - w * 0.26, 14, w * 0.26, 10);
    g.fillStyle = '#1a1028';
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#3ad0ff';
    g.fillRect(w * 0.28, h * 0.42, 22, 56);
    g.fillRect(w * 0.28 + 22, h * 0.5, 26, 10);
    g.fillStyle = '#ff3b4a';
    g.fillRect(w * 0.6, h * 0.42, 22, 56);
    g.fillRect(w * 0.6 - 18, h * 0.48, 18, 10);
  } else if (game === 2) {
    // A racer: a road running to the horizon, a sun, a car.
    g.fillStyle = '#12082a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff4fb8';
    g.beginPath();
    g.arc(w / 2, h * 0.45, 46, Math.PI, 0);
    g.fill();
    g.fillStyle = '#12082a';
    for (let i = 0; i < 4; i++) g.fillRect(w / 2 - 50, h * 0.45 - 8 - i * 9, 100, 3);
    g.fillStyle = '#2a1650';
    g.beginPath();
    g.moveTo(w / 2 - 6, h * 0.45);
    g.lineTo(w / 2 + 6, h * 0.45);
    g.lineTo(w * 0.95, h);
    g.lineTo(w * 0.05, h);
    g.fill();
    g.strokeStyle = '#7cf0ff';
    g.lineWidth = 3;
    for (let i = 1; i < 6; i++) {
      const y = h * 0.45 + (h * 0.55 * i * i) / 36;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.fillStyle = '#ff3b4a';
    g.fillRect(w / 2 - 22, h * 0.8, 44, 16);
  } else {
    // A falling-block puzzle.
    g.fillStyle = '#0a0f24';
    g.fillRect(0, 0, w, h);
    const cols = ['#ff4fb8', '#7cf0ff', '#b6ff6a', '#ffd23a', '#9a6bff'];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) {
      if (y < 4 + (x % 3) || r() > 0.85) continue;
      px(w * 0.2 + x * 18, 20 + y * 18, 16, cols[Math.floor(r() * cols.length)]!);
    }
    px(w * 0.2 + 3 * 18, 20, 16, '#fff');
    px(w * 0.2 + 4 * 18, 20, 16, '#fff');
    px(w * 0.2 + 4 * 18, 38, 16, '#fff');
  }
  // Scanlines.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
}

/** A vending machine's lit front: rows of cans and bottles behind glass, a coin panel. */
function vendingFront(g: CanvasRenderingContext2D, w: number, h: number, palette: string[], seed: number): void {
  const r = rng(seed);
  // The cabinet behind the glass: lit from a tube at the top, falling off to the bottom.
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f2fbff');
  bg.addColorStop(0.5, '#c4d2da');
  bg.addColorStop(1, '#7a8a98');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const rows = 5;
  const cols = 6;
  for (let j = 0; j < rows; j++) {
    const y = 14 + j * ((h - 20) / rows);
    g.fillStyle = '#b8c4c8';
    g.fillRect(6, y + (h - 20) / rows - 12, w - 12, 5);
    for (let i = 0; i < cols; i++) {
      const x = 12 + i * ((w - 24) / cols);
      const c = palette[Math.floor(r() * palette.length)]!;
      const bw = (w - 24) / cols - 8;
      const bh = (h - 20) / rows - 22;
      g.fillStyle = c;
      if (j % 2) {
        g.fillRect(x + bw * 0.3, y, bw * 0.4, bh * 0.25);
        g.fillRect(x + bw * 0.1, y + bh * 0.22, bw * 0.8, bh * 0.78);
      } else g.fillRect(x, y + bh * 0.15, bw, bh * 0.85);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x + 2, y + bh * 0.3, 3, bh * 0.5);
      g.fillStyle = '#ff3b4a';
      g.fillRect(x + bw * 0.25, y + bh + 2, bw * 0.5, 5);
    }
  }
  // The glass: a soft diagonal glare, and the dark frame round it.
  const gl = g.createLinearGradient(0, h * 0.2, w, h * 0.55);
  gl.addColorStop(0.3, 'rgba(255,255,255,0)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  gl.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#1a1d24';
  g.lineWidth = 8;
  g.strokeRect(4, 4, w - 8, h - 8);
}

/** A lit room behind a window: a warm or cool wash, and what's in the room (curtains, blinds, a plant, shelves, a TV). */
function room(g: CanvasRenderingContext2D, w: number, h: number, kind: number): void {
  const warm = kind % 3 !== 1;
  const grd = g.createRadialGradient(w * 0.5, h * 0.25, 10, w * 0.5, h * 0.4, w * 0.8);
  grd.addColorStop(0, warm ? '#fff1d6' : '#e6f4ff');
  grd.addColorStop(1, warm ? '#8a5a3a' : '#3a5a7a');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(30,20,20,0.6)';
  if (kind === 0) {
    // Curtains half drawn.
    g.fillStyle = '#b8486a';
    g.fillRect(0, 0, w * 0.28, h);
    g.fillRect(w * 0.78, 0, w * 0.22, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 6; i++) g.fillRect(i * w * 0.05, 0, 4, h);
  } else if (kind === 1) {
    // Office blinds.
    g.fillStyle = 'rgba(30,40,60,0.55)';
    for (let y = 4; y < h; y += 14) g.fillRect(0, y, w, 6);
  } else if (kind === 2) {
    // A plant on the sill and a lamp.
    g.fillStyle = '#2a3a20';
    g.beginPath();
    g.ellipse(w * 0.25, h * 0.68, 40, 50, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a2a1a';
    g.fillRect(w * 0.2, h * 0.78, 40, 50);
    g.fillStyle = '#fff6c0';
    g.fillRect(w * 0.7, h * 0.3, 30, 20);
  } else if (kind === 3) {
    // Shelves of books.
    for (let j = 0; j < 3; j++) {
      g.fillStyle = '#4a3020';
      g.fillRect(w * 0.1, h * (0.3 + j * 0.22), w * 0.8, 6);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = ['#8a3a3a', '#3a5a8a', '#c8a050', '#3a7a5a'][(i + j) % 4]!;
        g.fillRect(w * 0.12 + i * 13, h * (0.3 + j * 0.22) - 26, 10, 26);
      }
    }
  } else if (kind === 4) {
    // A TV's blue flicker in a dark room.
    g.fillStyle = 'rgba(10,10,30,0.8)';
    g.fillRect(0, 0, w, h);
    const t = g.createRadialGradient(w * 0.6, h * 0.6, 4, w * 0.6, h * 0.6, w * 0.6);
    t.addColorStop(0, '#9fd8ff');
    t.addColorStop(1, 'rgba(40,80,160,0)');
    g.fillStyle = t;
    g.fillRect(0, 0, w, h);
  } else {
    // A figure's silhouette against a warm room.
    g.fillStyle = 'rgba(40,24,20,0.85)';
    g.beginPath();
    g.arc(w * 0.62, h * 0.4, 18, 0, Math.PI * 2);
    g.fill();
    g.fillRect(w * 0.62 - 26, h * 0.5, 52, h * 0.5);
  }
  // Frame bars.
  g.fillStyle = '#222';
  g.fillRect(w / 2 - 3, 0, 6, h);
}

let screenCells: Cells | null = null;
let screenTex: THREE.CanvasTexture | null = null;
/** Unlit panels: screens, marquees, vending fronts, lightboxes, posters and rooms behind windows. */
export function screenAtlas(): THREE.CanvasTexture {
  if (screenTex) return screenTex;
  const cells: Cells = {};
  const list: [string, number, number, number, number, (g: CanvasRenderingContext2D, w: number, h: number) => void][] = [];
  for (let i = 0; i < 4; i++) list.push([`game${i}`, i * 256, 0, 256, 256, (g, w, h) => gameScreen(g, w, h, i)]);
  const marquees: [string, string, string][] = [
    ['STAR RALLY', '#ffd23a', '#2a0f4a'],
    ['MECHA BRAWL', '#ff4fb8', '#101a3a'],
    ['TURBO DRIFT', '#7cf0ff', '#3a0a2a'],
    ['BLOCK POP', '#b6ff6a', '#2a1a4a'],
  ];
  marquees.forEach(([name, fg, bg], i) => list.push([`marquee${i}`, 1024 + (i % 2) * 512, Math.floor(i / 2) * 128, 512, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, bg);
    grd.addColorStop(0.5, '#000');
    grd.addColorStop(1, bg);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.font = FONT(64, '900 italic');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#000';
    g.strokeText(name, w / 2, h / 2 + 4);
    g.fillStyle = fg;
    g.fillText(name, w / 2, h / 2 + 4);
  }]));
  const vend: [string, string, string[]][] = [
    ['FIZZO', '#e8303c', ['#e8303c', '#ffd23a', '#3ad07a', '#fff', '#ff8a3a']],
    ['KUMO', '#2a6ad8', ['#2a6ad8', '#7cf0ff', '#fff', '#b6ff6a', '#c8c8d8']],
    ['OKI TEA', '#2a9a5a', ['#2a9a5a', '#e8d8a0', '#7a4a2a', '#fff', '#3a3a3a']],
  ];
  vend.forEach(([name, col, palette], i) => {
    list.push([`vend${i}`, i * 256, 256, 256, 512, (g, w, h) => vendingFront(g, w, h, palette, 50 + i)]);
    list.push([`vendHead${i}`, 768 + i * 256, 256, 256, 96, (g, w, h) => {
      g.fillStyle = col;
      g.fillRect(0, 0, w, h);
      centred(g, name, w / 2, h / 2 + 2, FONT(52, '900 italic'), '#fff');
    }]);
  });
  const bands: [string, string, string][] = [
    ['PHONE', '#13383a', '#6fffd8'],
    ['NEWS · SNACKS · 24H', '#2a1a3a', '#ffd23a'],
    ['PHOTO ✦ BOOTH', '#3a1030', '#ff8ad8'],
  ];
  bands.forEach(([text, bg, fg], i) => list.push([`band${i}`, 768, 352 + i * 64, 768, 64, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    centred(g, text, w / 2, h / 2 + 2, FONT(44, '900'), fg);
  }]));
  for (let i = 0; i < 6; i++) list.push([`room${i}`, (i % 6) * 256, 768, 256, 256, (g, w, h) => room(g, w, h, i)]);
  const ads: [string, (g: CanvasRenderingContext2D, w: number, h: number) => void][] = [
    ['adZing', (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#1affc8');
      grd.addColorStop(1, '#0a3a6a');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a1a2a';
      g.fillRect(w * 0.35, h * 0.3, w * 0.3, h * 0.5);
      g.fillStyle = '#1affc8';
      g.fillRect(w * 0.38, h * 0.38, w * 0.24, h * 0.06);
      centred(g, 'ZING!', w / 2, h * 0.15, FONT(70, '900 italic'), '#fff');
      centred(g, 'stay up', w / 2, h * 0.9, FONT(30, 'bold'), '#fff');
    }],
    ['adAero', (g, w, h) => {
      g.fillStyle = '#f4f1ea';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1d1b2c';
      g.lineWidth = 18;
      g.beginPath();
      g.arc(w / 2, h * 0.48, w * 0.28, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
      g.fillStyle = '#ff4fb8';
      g.fillRect(w * 0.16, h * 0.44, w * 0.14, h * 0.2);
      g.fillRect(w * 0.7, h * 0.44, w * 0.14, h * 0.2);
      centred(g, 'AERO 9', w / 2, h * 0.8, FONT(56, '900'), '#1d1b2c');
      centred(g, 'hear everything', w / 2, h * 0.9, FONT(24, ''), '#555');
    }],
    ['adFilm', (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#2a0a3a');
      grd.addColorStop(0.7, '#ff6a3a');
      grd.addColorStop(1, '#1a0a1a');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0a14';
      g.beginPath();
      g.moveTo(w * 0.2, h * 0.75);
      g.lineTo(w * 0.5, h * 0.3);
      g.lineTo(w * 0.8, h * 0.75);
      g.fill();
      centred(g, 'STAR', w / 2, h * 0.1, FONT(54, '900'), '#ffd23a');
      centred(g, 'DRIFT', w / 2, h * 0.22, FONT(54, '900'), '#ffd23a');
      centred(g, 'IN CINEMAS', w / 2, h * 0.88, FONT(26, 'bold'), '#fff');
    }],
  ];
  ads.forEach(([name, draw], i) => list.push([name, 1536 + (i % 2) * 256, 256 + Math.floor(i / 2) * 384, 256, 384, draw]));
  const boxes: [string, number, number, number, number, (g: CanvasRenderingContext2D, w: number, h: number) => void][] = [
    ['open', 0, 1024, 512, 256, (g, w, h) => {
      g.fillStyle = '#100810';
      g.fillRect(0, 0, w, h);
      centred(g, 'OPEN', w * 0.38, h / 2, FONT(150, '900'), '#ff3b4a');
      centred(g, '24H', w * 0.82, h / 2, FONT(80, '900'), '#ffd23a');
    }],
    ['menu', 512, 1024, 512, 256, (g, w, h) => {
      g.fillStyle = '#f4ead0';
      g.fillRect(0, 0, w, h);
      const items = ['SHOYU 8.50', 'MISO 9.00', 'SPICY 9.50', 'GYOZA 4.00'];
      items.forEach((t, i) => centred(g, t, w * 0.3, 44 + i * 56, FONT(36, 'bold'), '#4a1a10'));
      g.fillStyle = '#e8a040';
      g.beginPath();
      g.arc(w * 0.78, h * 0.55, 80, 0, Math.PI);
      g.fill();
      g.strokeStyle = '#4a1a10';
      g.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(w * 0.72 + i * 12, h * 0.5);
        g.quadraticCurveTo(w * 0.7 + i * 12, h * 0.25, w * 0.75 + i * 12, h * 0.1);
        g.stroke();
      }
    }],
    ['noren', 1024, 1024, 512, 256, (g, w, h) => {
      // A noodle shop's split curtain, the word for ramen on it.
      g.fillStyle = '#1d2a6a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0a14';
      for (let i = 1; i < 4; i++) g.fillRect(i * (w / 4) - 2, h * 0.3, 4, h);
      centred(g, 'ラーメン', w / 2, h * 0.52, FONT(110, 'bold', 'IPAGothic, IPAPGothic, sans-serif'), '#f4f1ea');
    }],
    ['clinic', 1536, 1024, 256, 256, (g, w, h) => {
      g.fillStyle = '#f4fff8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2ad07a';
      g.fillRect(w * 0.38, h * 0.12, w * 0.24, h * 0.76);
      g.fillRect(w * 0.12, h * 0.38, w * 0.76, h * 0.24);
    }],
    ['shopShelf', 1792, 1024, 256, 256, (g, w, h) => {
      // A shop window: lit shelves of goods.
      g.fillStyle = '#fff4dc';
      g.fillRect(0, 0, w, h);
      const r = rng(61);
      for (let j = 0; j < 4; j++) {
        g.fillStyle = '#8a8a8a';
        g.fillRect(0, 50 + j * 56, w, 5);
        for (let i = 0; i < 9; i++) {
          g.fillStyle = ['#e8303c', '#2a6ad8', '#ffd23a', '#3ad07a', '#ff8ad8'][Math.floor(r() * 5)]!;
          g.fillRect(6 + i * 28, 20 + j * 56, 20, 30);
        }
      }
    }],
    ['shrine', 0, 1280, 256, 256, (g, w, h) => {
      // Candle-lit offerings: warm flames on a red ground.
      g.fillStyle = '#5a0a10';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) {
        const x = 30 + i * 38;
        const grd = g.createRadialGradient(x, h * 0.55, 2, x, h * 0.55, 30);
        grd.addColorStop(0, '#fff6c0');
        grd.addColorStop(0.3, '#ffb040');
        grd.addColorStop(1, 'rgba(255,80,20,0)');
        g.fillStyle = grd;
        g.fillRect(x - 30, h * 0.55 - 30, 60, 60);
        g.fillStyle = '#f4e8d0';
        g.fillRect(x - 6, h * 0.62, 12, 40);
      }
    }],
    ['podGlow', 256, 1280, 256, 256, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      grd.addColorStop(0, '#d8f4ff');
      grd.addColorStop(1, '#2a6ad8');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }],
    ['monitor', 512, 1280, 256, 160, (g, w, h) => {
      g.fillStyle = '#0a1a2a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3ad0ff';
      for (let i = 0; i < 9; i++) g.fillRect(14, 14 + i * 15, 60 + ((i * 53) % 150), 6);
      g.fillStyle = '#b6ff6a';
      g.fillRect(w - 70, 20, 50, 50);
    }],
    ['leds', 768, 1280, 256, 64, (g, w, h) => {
      g.fillStyle = '#05050a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) {
        g.fillStyle = i % 7 === 3 ? '#ff3b4a' : i % 3 ? '#3aff8a' : '#ffd23a';
        g.fillRect(6 + i * 10.4, 20 + (i % 4) * 4, 6, 14 - (i % 4) * 4);
      }
      void h;
    }],
    ['taillight', 1024, 1280, 128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      grd.addColorStop(0, '#ffd0d0');
      grd.addColorStop(0.4, '#ff2030');
      grd.addColorStop(1, '#600008');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }],
    ['headlight', 1152, 1280, 128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.5, '#cfe8ff');
      grd.addColorStop(1, '#3a4a5a');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }],
    ['billboard', 0, 1536, 1024, 384, (g, w, h) => {
      // A rooftop billboard: a made-up phone, a slogan.
      const grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#ff4fb8');
      grd.addColorStop(1, '#3a1aa0');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0a18';
      g.fillRect(w * 0.08, h * 0.12, w * 0.16, h * 0.76);
      g.fillStyle = '#7cf0ff';
      g.fillRect(w * 0.095, h * 0.16, w * 0.13, h * 0.62);
      centred(g, 'HALO ONE', w * 0.6, h * 0.4, FONT(130, '900'), '#fff');
      centred(g, 'the night is yours', w * 0.6, h * 0.72, FONT(56, 'italic bold'), '#ffe0f4');
    }],
    ['billboard2', 1024, 1536, 1024, 384, (g, w, h) => {
      g.fillStyle = '#ffd23a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d1b2c';
      g.beginPath();
      g.arc(w * 0.18, h * 0.5, h * 0.36, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffd23a';
      g.beginPath();
      g.arc(w * 0.18, h * 0.5, h * 0.2, 0, Math.PI * 2);
      g.fill();
      centred(g, 'NOMNOM', w * 0.6, h * 0.42, FONT(140, '900'), '#1d1b2c');
      centred(g, 'delivered in 9 min', w * 0.6, h * 0.76, FONT(54, 'bold'), '#1d1b2c');
    }],
  ];
  list.push(...boxes);
  screenTex = atlas(2048, list, cells, false);
  screenCells = cells;
  return screenTex;
}

export function screenCell(name: string): [number, number, number, number] {
  screenAtlas();
  const c = screenCells![name];
  if (!c) throw new Error(`no screen ${name}`);
  return c;
}

let halo: THREE.CanvasTexture | null = null;
/** A soft round glow (additive halos round lights and splashes of light on walls and the ground). */
export function haloTex(): THREE.CanvasTexture {
  if (halo) return halo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  halo = new THREE.CanvasTexture(c);
  halo.colorSpace = THREE.SRGBColorSpace;
  return halo;
}

let streak: THREE.CanvasTexture | null = null;
/** A long soft streak, bright at one end (a light's reflection drawn down a wet road). */
export function streakTex(): THREE.CanvasTexture {
  if (streak) return streak;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const u = (x + 0.5) / 64 - 0.5;
    const v = (y + 0.5) / 256;
    const across = Math.exp(-u * u * 22);
    const along = Math.pow(1 - v, 1.6) * smooth(0, 0.06, v);
    const ripple = 0.75 + 0.25 * Math.sin(v * 70 + Math.sin(v * 13) * 3);
    const a = across * along * ripple;
    const k = (y * 64 + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  streak = new THREE.CanvasTexture(c);
  streak.colorSpace = THREE.SRGBColorSpace;
  return streak;
}

let puff: THREE.CanvasTexture | null = null;
/** A puff of steam: a soft lumpy blob. */
export function steamTex(): THREE.CanvasTexture {
  if (puff) return puff;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const u = (x + 0.5) / 128;
    const v = (y + 0.5) / 128;
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const n = fbm(u, v, 4, 4, 301);
    const a = Math.max(0, Math.min(1, (1 - d) * 1.4 + (n - 0.5) * 1.1 - 0.15));
    const k = (y * 128 + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = a * a * 255;
  }
  g.putImageData(img, 0, 0);
  puff = new THREE.CanvasTexture(c);
  puff.colorSpace = THREE.SRGBColorSpace;
  return puff;
}

// ---------------------------------------------------------------------------------------------------------------- skyline windows

/** Facade textures for the far towers: lit and dark windows on a dark face, four kinds. Tiles of 8 × 8 windows. */
export function towerTex(kind: number): THREE.CanvasTexture {
  const W = 256;
  const c = document.createElement('canvas');
  c.width = c.height = W;
  const g = c.getContext('2d')!;
  const r = rng(400 + kind * 17);
  g.fillStyle = ['#0b0d18', '#0e0c16', '#0a0f16', '#100c12'][kind]!;
  g.fillRect(0, 0, W, W);
  const n = 8;
  const cw = W / n;
  const lit = [0.32, 0.22, 0.45, 0.28][kind]!;
  const warm = ['#ffcf8a', '#ffe6b8', '#ffc070'];
  const cool = ['#cfe8ff', '#a8d8ff', '#e8f4ff'];
  for (let j = 0; j < n; j++) {
    // Whole floors of an office lit together, here and there.
    const floorLit = kind === 2 && r() > 0.6;
    for (let i = 0; i < n; i++) {
      const on = floorLit || r() < lit;
      const x = i * cw;
      const y = j * cw;
      if (kind === 1) {
        // A curtain wall: continuous glass bands.
        g.fillStyle = on ? cool[Math.floor(r() * 3)]! : '#1a2030';
        g.globalAlpha = on ? 0.5 + r() * 0.5 : 1;
        g.fillRect(x, y + cw * 0.2, cw, cw * 0.62);
      } else {
        g.fillStyle = on ? (kind === 2 ? cool : warm)[Math.floor(r() * 3)]! : '#151a26';
        g.globalAlpha = on ? 0.45 + r() * 0.55 : 1;
        g.fillRect(x + cw * 0.18, y + cw * 0.2, cw * 0.64, cw * 0.6);
        if (on && r() > 0.7) {
          // Blinds half down.
          g.globalAlpha = 0.6;
          g.fillStyle = '#20202a';
          g.fillRect(x + cw * 0.18, y + cw * 0.2, cw * 0.64, cw * 0.25);
        }
      }
      g.globalAlpha = 1;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------- neon font

type Pt = [number, number];
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Pt[] => {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 18));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
};

/** A single-stroke capital font on a 4 × 6 grid (x right, y up): each glyph a list of strokes (polylines). */
const GLYPHS: Record<string, { w: number; s: Pt[][] }> = {
  A: { w: 4, s: [[[0, 0], [2, 6], [4, 0]], [[0.7, 2.1], [3.3, 2.1]]] },
  B: { w: 4, s: [[[0, 3], [0, 6], [2.4, 6], ...arc(2.4, 4.5, 1.5, 1.5, 90, -90), [0, 3], [2.6, 3], ...arc(2.6, 1.5, 1.4, 1.5, 90, -90), [0, 0], [0, 3]]] },
  C: { w: 4, s: [arc(2.2, 3, 2.1, 3, 45, 315)] },
  D: { w: 4, s: [[[0, 0], [0, 6], [1.6, 6], ...arc(1.6, 3, 2.4, 3, 90, -90), [0, 0]]] },
  E: { w: 3.6, s: [[[3.6, 6], [0, 6], [0, 0], [3.6, 0]], [[0, 3], [2.8, 3]]] },
  F: { w: 3.6, s: [[[3.6, 6], [0, 6], [0, 0]], [[0, 3], [2.8, 3]]] },
  G: { w: 4.2, s: [[...arc(2.2, 3, 2.1, 3, 45, 360), [2.4, 3]]] },
  H: { w: 4, s: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]] },
  I: { w: 1.6, s: [[[0.8, 0], [0.8, 6]]] },
  J: { w: 3.6, s: [[[3.6, 6], [3.6, 1.6], ...arc(1.8, 1.6, 1.8, 1.6, 0, -180)]] },
  K: { w: 4, s: [[[0, 0], [0, 6]], [[4, 6], [0, 2.2]], [[1.3, 3.4], [4, 0]]] },
  L: { w: 3.4, s: [[[0, 6], [0, 0], [3.4, 0]]] },
  M: { w: 4.6, s: [[[0, 0], [0, 6], [2.3, 2.4], [4.6, 6], [4.6, 0]]] },
  N: { w: 4, s: [[[0, 0], [0, 6], [4, 0], [4, 6]]] },
  O: { w: 4.4, s: [arc(2.2, 3, 2.2, 3, 0, 360)] },
  P: { w: 3.8, s: [[[0, 0], [0, 6], [2.3, 6], ...arc(2.3, 4.5, 1.5, 1.5, 90, -90), [0, 3]]] },
  Q: { w: 4.4, s: [arc(2.2, 3, 2.2, 3, 0, 360), [[2.7, 1.3], [4.4, -0.4]]] },
  R: { w: 4, s: [[[0, 0], [0, 6], [2.4, 6], ...arc(2.4, 4.5, 1.5, 1.5, 90, -90), [0, 3]], [[1.9, 3], [4, 0]]] },
  S: { w: 4, s: [[...arc(2, 4.5, 1.9, 1.5, 15, 270), ...arc(2, 1.5, 2, 1.5, 90, -165)]] },
  T: { w: 4, s: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]] },
  U: { w: 4, s: [[[0, 6], [0, 2], ...arc(2, 2, 2, 2, 180, 360), [4, 6]]] },
  V: { w: 4, s: [[[0, 6], [2, 0], [4, 6]]] },
  W: { w: 5, s: [[[0, 6], [1.2, 0], [2.5, 4], [3.8, 0], [5, 6]]] },
  X: { w: 4, s: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]] },
  Y: { w: 4, s: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]] },
  Z: { w: 4, s: [[[0, 6], [4, 6], [0, 0], [4, 0]]] },
  '0': { w: 3.8, s: [arc(1.9, 3, 1.9, 3, 0, 360)] },
  '1': { w: 2.6, s: [[[0.2, 4.6], [1.6, 6], [1.6, 0]]] },
  '2': { w: 4, s: [[...arc(2, 4.2, 1.9, 1.8, 160, -30), [0, 0], [4, 0]]] },
  '3': { w: 4, s: [[...arc(2, 4.5, 1.8, 1.5, 150, -90), ...arc(2, 1.5, 2, 1.5, 90, -150)]] },
  '4': { w: 4, s: [[[3, 0], [3, 6], [0, 1.8], [4, 1.8]]] },
  '7': { w: 4, s: [[[0, 6], [4, 6], [1.4, 0]]] },
  '8': { w: 4, s: [arc(2, 4.6, 1.6, 1.4, -90, 270), arc(2, 1.6, 2, 1.6, 90, 450)] },
  '9': { w: 4, s: [arc(2, 4.2, 2, 1.8, 0, 360), [[4, 4.2], [3.7, 1.6], [2.4, 0.2], [0.6, 0]]] },
  '-': { w: 3, s: [[[0.3, 3], [2.7, 3]]] },
  '+': { w: 4, s: [[[2, 1], [2, 5]], [[0, 3], [4, 3]]] },
  '.': { w: 1, s: [[[0.4, 0.2], [0.6, 0.2]]] },
  ' ': { w: 2.4, s: [] },
};

/** Letter spacing between glyphs, grid units. */
const GAP = 1.5;

/** A text's strokes laid out on the grid (y 0..6), starting at x 0, and its total width. */
export function strokeText(text: string): { strokes: Pt[][]; width: number; letters: Pt[][][] } {
  let x = 0;
  const strokes: Pt[][] = [];
  const letters: Pt[][][] = [];
  for (const ch of text.toUpperCase()) {
    const gl = GLYPHS[ch] ?? GLYPHS[' ']!;
    const ls = gl.s.map((s) => s.map(([px, py]) => [px + x, py] as Pt));
    strokes.push(...ls);
    letters.push(ls);
    x += gl.w + GAP;
  }
  return { strokes, width: Math.max(0, x - GAP), letters };
}

/** Icons drawn as tubes, on the same 6-unit-high grid. */
export const ICONS: Record<string, { w: number; s: Pt[][] }> = {
  // A noodle bowl with chopsticks and steam.
  bowl: { w: 6, s: [[[0, 3], [6, 3], ...arc(3, 3, 3, 2.6, 0, -180)], [[4.2, 3.8], [6.4, 6]], [[3.6, 3.6], [5.8, 5.8]], [[1.4, 3.6], [1.1, 4.4], [1.6, 5.2], [1.3, 6]]] },
  // A cocktail glass with an olive.
  glass: { w: 4.4, s: [[[0, 6], [4.4, 6], [2.2, 3], [2.2, 0.4]], [[0.9, 0.2], [3.5, 0.2]], arc(3.3, 6.5, 0.5, 0.5, 0, 360)] },
  cross: { w: 6, s: [[[2, 0], [4, 0], [4, 2], [6, 2], [6, 4], [4, 4], [4, 6], [2, 6], [2, 4], [0, 4], [0, 2], [2, 2], [2, 0]]] },
  star: { w: 6, s: [(() => {
    const p: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 1.3 : 3;
      p.push([3 + Math.cos(a) * r, 3 + Math.sin(a) * r]);
    }
    return p;
  })()] },
  arrow: { w: 7, s: [[[0, 3], [6.6, 3]], [[4.4, 5.2], [6.8, 3], [4.4, 0.8]]] },
  bolt: { w: 4, s: [[[2.8, 6], [0.4, 2.6], [2.2, 2.6], [1.2, 0], [3.8, 3.6], [2, 3.6], [2.8, 6]]] },
  heart: { w: 6, s: [[[3, 0.2], [0.44, 3.24], ...arc(1.5, 4.3, 1.5, 1.5, 225, 0), ...arc(4.5, 4.3, 1.5, 1.5, 180, -45), [3, 0.2]]] },
  ring: { w: 6, s: [arc(3, 3, 3, 3, 0, 360), arc(3, 3, 1.9, 1.9, 0, 360)] },
  wrench: { w: 6, s: [[[0.6, 0.6], [3.8, 3.8], ...arc(4.6, 4.6, 1.3, 1.3, -135, 135)]] },
  mic: { w: 4, s: [[...arc(2, 4.4, 1.2, 1.6, 0, 360)], [...arc(2, 3.8, 2, 1.8, 180, 360)], [[2, 2], [2, 0.2]], [[0.8, 0.2], [3.2, 0.2]]] },
  drone: { w: 7, s: [[[1.5, 3], [5.5, 3]], arc(1.2, 4.2, 1.2, 0.4, 0, 360), arc(5.8, 4.2, 1.2, 0.4, 0, 360), [[1.2, 3], [1.2, 3.8]], [[5.8, 3], [5.8, 3.8]], [[2.6, 3], [3, 1.8], [4, 1.8], [4.4, 3]]] },
};
