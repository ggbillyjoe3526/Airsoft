import * as THREE from 'three';
import { MATS } from './kit';
import { fbm, lerp, makeTex, smooth, TEX_METRES, timber, tnoise, type TexSet } from './textures';

/**
 * Woodland's own surfaces, drawn in code like the rest of the concept's (tileable, a colour map plus normal and
 * roughness maps on Ultra): pine and birch bark, cut log ends, granite with lichen, moss, conifer needles, broad
 * leaves, cedar shakes, fur, and the packed ground detail the terrain shader blends. Registered into MATS at load
 * under `wl` keys, so nothing in the shared kit changes.
 */

function hash(i: number, j: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tileable Voronoi on an `nx` × `ny` lattice: nearest and second distances, the nearest cell's id and offset. */
function voronoi(u: number, v: number, nx: number, ny: number, seed: number): { d1: number; d2: number; id: number; fx: number; fy: number } {
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  let fx = 0;
  let fy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ci = Math.floor(u * nx) + i;
      const cj = Math.floor(v * ny) + j;
      const wi = ((ci % nx) + nx) % nx;
      const wj = ((cj % ny) + ny) % ny;
      const px = ci + 0.15 + hash(wi, wj, seed) * 0.7;
      const py = cj + 0.15 + hash(wi, wj, seed + 1) * 0.7;
      const dx = u * nx - px;
      const dy = v * ny - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(wi, wj, seed + 2);
        fx = dx;
        fy = dy;
      } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id, fx, fy };
}

/** Pine and spruce bark: long plates split by deep fissures, warm red-brown plates, grey in the cracks. */
export function bark(size: number, full: boolean): TexSet {
  return makeTex('wlBark', size, full, 3.2, (u, v) => {
    // Long plates along the trunk (v), split by deep, wandering fissures.
    const w = fbm(u, v, 4, 3, 101) * 0.35;
    const c = voronoi(u + w * 0.12, v + w * 0.5, 9, 2, 102);
    const edge = smooth(0.02, 0.16, c.d2 - c.d1);
    const flake = fbm(u, v, 32, 3, 103);
    const scale = tnoise(u * 3, v, 40, 104);
    const t = (0.62 + c.id * 0.32 + (flake - 0.5) * 0.22) * (0.32 + edge * 0.68);
    const warm = 0.06 * c.id;
    return { r: t + warm, g: t * 0.9, b: t * 0.82 - warm * 0.5, h: edge * 0.8 + flake * 0.25 + scale * 0.1, rough: 0.9 + (1 - edge) * 0.1 };
  });
}

/** Birch: white bark, dark horizontal lenticels, black diamonds and scars, a warm peel here and there. */
export function birch(size: number, full: boolean): TexSet {
  return makeTex('wlBirch', size, full, 1.4, (u, v) => {
    const row = Math.floor(v * 36);
    const fy = v * 36 - row;
    const off = hash(row % 36, 0, 110);
    const dash = tnoise(u + off, v, 6, 111 + (row % 7));
    const len = dash > 0.66 ? 1 : 0;
    const lent = len && Math.abs(fy - 0.5) < 0.12 ? 1 : 0;
    const big = fbm(u, v, 3, 3, 112);
    const patch = smooth(0.66, 0.7, big) * smooth(0.2, 0.5, fbm(u, v * 0.5, 5, 2, 113));
    const peel = smooth(0.7, 0.75, fbm(u, v, 6, 3, 114)) * (1 - patch);
    const fine = fbm(u, v, 48, 2, 115);
    const t = 0.94 - lent * 0.6 - patch * 0.78 + (fine - 0.5) * 0.06;
    return { r: t + peel * 0.02, g: t - peel * 0.05, b: t - peel * 0.12 - 0.02, h: 0.6 - lent * 0.4 - patch * 0.3 + fine * 0.1 + peel * 0.15, rough: 0.6 + patch * 0.3 + lent * 0.3 };
  });
}

/** A cut log's end: growth rings round the pith, radial checks, a dark ring of bark at the rim. Its own UVs (0..1). */
export function logEnd(size: number, full: boolean): TexSet {
  return makeTex('wlLogEnd', size, full, 1.8, (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const a = Math.atan2(dy, dx);
    const wob = fbm(Math.cos(a) * 0.2 + 0.5, Math.sin(a) * 0.2 + 0.5, 4, 2, 120) * 0.08;
    const rings = Math.sin((r + wob) * 70) * 0.5 + 0.5;
    const late = smooth(0.75, 1, rings);
    const check = Math.abs(Math.sin(a * 3 + 0.7)) < 0.03 && r > 0.25 && r < 0.86 ? 1 : 0;
    const barkRing = smooth(0.86, 0.9, r);
    const fine = fbm(u, v, 40, 2, 121);
    const sap = smooth(0.55, 0.85, r) * 0.08;
    const t = (0.9 - late * 0.12 - check * 0.4 + (fine - 0.5) * 0.05 + sap) * (1 - barkRing * 0.62);
    return { r: t, g: t * 0.86, b: t * 0.66, h: 0.6 - late * 0.1 - check * 0.5 - barkRing * 0.2, rough: 0.85 };
  });
}

/** Granite: speckled grain, hairline cracks, pale lichen rosettes. */
export function rock(size: number, full: boolean): TexSet {
  return makeTex('wlRock', size, full, 2.2, (u, v) => {
    const big = fbm(u, v, 3, 4, 130);
    const mid = fbm(u, v, 11, 3, 131);
    const grain = tnoise(u, v, 300, 132);
    const speck = grain > 0.86 ? -0.16 : grain < 0.1 ? 0.1 : 0;
    const cr = Math.abs(fbm(u, v, 4, 4, 133) - 0.5);
    const crack = cr < 0.008 ? 1 : 0;
    // Lichen in ragged, half-faded patches (never round spots).
    const lichen = smooth(0.64, 0.7, fbm(u, v, 6, 4, 134) + (fbm(u, v, 30, 2, 135) - 0.5) * 0.25) * 0.45;
    const strata = Math.sin((v * 6 + big * 1.4) * Math.PI * 2) * 0.5 + 0.5;
    const t = 0.78 + (big - 0.5) * 0.22 + (mid - 0.5) * 0.12 + speck + (strata - 0.5) * 0.05 - crack * 0.3;
    const lr = lerp(t, 0.86, lichen);
    const lg = lerp(t * 0.99, 0.88, lichen);
    const lb = lerp(t * 0.96, 0.7, lichen);
    return { r: lr, g: lg, b: lb, h: mid * 0.5 + grain * 0.15 - crack * 0.6 + lichen * 0.2, rough: 0.78 + (mid - 0.5) * 0.2 + lichen * 0.3 };
  });
}

/** Moss: soft cushions of tiny fronds, lighter on the crowns. */
export function moss(size: number, full: boolean): TexSet {
  return makeTex('wlMoss', size, full, 2.4, (u, v) => {
    const cush = voronoi(u, v, 10, 10, 140);
    const dome = 1 - Math.min(1, cush.d1 * 1.6);
    const frond = fbm(u, v, 64, 3, 141);
    const t = 0.66 + dome * 0.28 + (frond - 0.5) * 0.3 + (cush.id - 0.5) * 0.12;
    return { r: t * 0.94, g: t, b: t * 0.78, h: dome * 0.6 + frond * 0.4, rough: 1 };
  });
}

/** Conifer needles: short overlapping strokes, dark gaps between the sprays. */
export function needles(size: number, full: boolean): TexSet {
  return makeTex('wlNeedle', size, full, 3, (u, v) => {
    const sp = voronoi(u, v, 8, 8, 150);
    const ang = sp.id * Math.PI;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const a = sp.fx * ca + sp.fy * sa;
    const b = -sp.fx * sa + sp.fy * ca;
    const stroke = Math.abs(Math.sin(b * 34 + a * 3)) ;
    const spray = 1 - smooth(0.3, 0.62, sp.d1);
    const fine = fbm(u, v, 48, 2, 151);
    const t = 0.45 + spray * (0.35 + stroke * 0.25) + (fine - 0.5) * 0.15;
    return { r: t * 0.94, g: t, b: t * 0.92, h: spray * 0.7 + stroke * spray * 0.3, rough: 0.85 };
  });
}

/** Broad leaves in a crown: overlapping leaf shapes, each lit from its own tilt, dark gaps. */
export function leaves(size: number, full: boolean): TexSet {
  return makeTex('wlLeaf', size, full, 2.6, (u, v) => {
    const c = voronoi(u, v, 14, 14, 160);
    const ang = c.id * Math.PI * 2;
    const a = c.fx * Math.cos(ang) + c.fy * Math.sin(ang);
    const b = -c.fx * Math.sin(ang) + c.fy * Math.cos(ang);
    const leaf = 1 - smooth(0.32, 0.4, Math.hypot(a * 0.75, b * 1.5));
    const vein = Math.abs(b) < 0.02 ? 1 : 0;
    const tilt = 0.75 + a * 0.5;
    const t = (0.4 + leaf * (0.55 * tilt + (c.id - 0.5) * 0.2)) - vein * leaf * 0.1;
    return { r: t * (0.92 + c.id * 0.1), g: t, b: t * 0.82, h: leaf * (0.6 + a * 0.4), rough: 0.7 + (1 - leaf) * 0.3 };
  });
}

/** Cedar shakes for the cabin roof: rows of split boards, each its own width and tone, a shadow line under each row. */
export function shingles(size: number, full: boolean): TexSet {
  return makeTex('wlShingle', size, full, 3, (u, v) => {
    const rows = 8;
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const off = (row % 2) * 0.5 / 6;
    const cols = 6;
    const x = (u + off) * cols;
    const ci = Math.floor(x + hash(row, 0, 170) * 0.3);
    const fx = x - ci;
    const tone = hash(((ci % cols) + cols) % cols, row, 171);
    const grain = Math.sin((u * 90 + fbm(u, v, 8, 2, 172) * 6) * Math.PI) * 0.5 + 0.5;
    const gap = fx < 0.04 ? 1 : 0;
    const lip = smooth(0.85, 1, fy);
    const moss = smooth(0.6, 0.75, fbm(u, v, 3, 3, 173)) * (1 - fy);
    const t = (0.74 + tone * 0.2 + grain * 0.06) * (1 - lip * 0.45) * (1 - gap * 0.6);
    return { r: lerp(t, t * 0.8, moss), g: lerp(t * 0.92, t * 0.95, moss), b: lerp(t * 0.84, t * 0.62, moss), h: fy * 0.7 - gap * 0.4 + grain * 0.1, rough: 0.9 };
  });
}

/** Short fur: fine strands along v, a soft undercoat. */
export function fur(size: number, full: boolean): TexSet {
  return makeTex('wlFur', size, full, 1.2, (u, v) => {
    const s = tnoise(u * 1, v * 0.12, 120, 180) * 0.6 + tnoise(u, v * 0.2, 240, 181) * 0.4;
    const clump = fbm(u, v, 8, 2, 182);
    const t = 0.78 + (s - 0.5) * 0.35 + (clump - 0.5) * 0.15;
    return { r: t, g: t, b: t, h: s, rough: 0.95 };
  });
}

/** Weathered fence boards: vertical grain, knots, a split now and then (one board per 0.15 m across u). */
export function boards(size: number, full: boolean): TexSet {
  return makeTex('wlBoards', size, full, 2.2, (u, v) => {
    const n = 8;
    const bi = Math.floor(u * n);
    const fx = u * n - bi;
    const gap = fx < 0.035 || fx > 0.965;
    const warp = fbm(u, v, 6, 3, 190 + bi);
    const grain = Math.sin((u * n * 5 + warp * 3) * Math.PI * 2) * 0.5 + 0.5;
    const tone = hash(bi, 0, 191) * 0.16;
    const knot = tnoise(u, v, 10, 192 + bi) > 0.92 ? -0.15 : 0;
    const bleach = smooth(0.45, 0.8, fbm(u, v, 3, 3, 193 + bi)) * 0.4;
    const base = gap ? 0.25 : 0.8 - tone + grain * 0.08 + knot;
    const grey = base * 0.95;
    return { r: lerp(base, grey, bleach), g: lerp(base * 0.92, grey * 0.98, bleach), b: lerp(base * 0.82, grey * 1.0, bleach), h: gap ? 0 : 0.7 + grain * 0.2, rough: 0.85 };
  });
}

/**
 * The ground's detail, four surfaces packed into one linear RGBA texture (the terrain shader blends them by its splat
 * weights and makes a normal from them): R grass sward, G leaf litter and pine needles, B trodden earth, A creek gravel.
 * Each channel is that surface's height and brightness, 0..1.
 */
let groundTex: THREE.DataTexture | null = null;
export function groundDetail(size: number): THREE.DataTexture {
  if (groundTex) return groundTex;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // Grass: a dense sward of tiny blades, clumpy, with soil showing in the gaps.
      const blades = tnoise(u * 1, v * 1, 220, 200) * 0.5 + tnoise(u, v, 110, 201) * 0.3;
      const clump = fbm(u, v, 9, 3, 202);
      const grass = Math.min(1, 0.25 + blades * 0.75 + (clump - 0.5) * 0.5);
      // Litter: leaves (Voronoi lozenges at random turns) over a bed of needle strokes.
      const lc = voronoi(u, v, 22, 22, 203);
      const ang = lc.id * Math.PI * 2;
      const la = lc.fx * Math.cos(ang) + lc.fy * Math.sin(ang);
      const lb = -lc.fx * Math.sin(ang) + lc.fy * Math.cos(ang);
      const leaf = 1 - smooth(0.3, 0.38, Math.hypot(la * 0.7, lb * 1.6));
      const needle = Math.abs(Math.sin((u * 140 + fbm(u, v, 12, 2, 204) * 9) * Math.PI)) > 0.92 ? 1 : 0;
      const litter = Math.min(1, 0.22 + leaf * (0.5 + lc.id * 0.4) + needle * 0.3 * (1 - leaf));
      // Earth: dry dirt with small stones and cracks.
      const ef = fbm(u, v, 14, 4, 205);
      const stone = voronoi(u, v, 40, 40, 206);
      const pebble = stone.d1 < 0.22 && stone.id > 0.72 ? 1 - stone.d1 * 3 : 0;
      const crack = Math.abs(fbm(u, v, 6, 3, 207) - 0.5) < 0.01 ? 1 : 0;
      const earth = Math.min(1, 0.45 + (ef - 0.5) * 0.5 + pebble * 0.5 - crack * 0.3);
      // Gravel: rounded pebbles packed together, each its own tone.
      const gc = voronoi(u, v, 30, 30, 208);
      const dome = Math.max(0, 1 - gc.d1 * 1.9);
      const gravel = Math.min(1, smooth(0.0, 0.12, gc.d2 - gc.d1) * (0.35 + dome * 0.45 + gc.id * 0.3));
      const k = (y * size + x) * 4;
      data[k] = grass * 255;
      data[k + 1] = litter * 255;
      data[k + 2] = Math.max(0, earth) * 255;
      data[k + 3] = gravel * 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  t.needsUpdate = true;
  groundTex = t;
  return t;
}

/** Metres each texture covers. */
TEX_METRES.wlBark = 0.9;
TEX_METRES.wlBirch = 1.2;
TEX_METRES.wlRock = 1.6;
TEX_METRES.wlMoss = 0.6;
TEX_METRES.wlNeedle = 0.9;
TEX_METRES.wlLeaf = 1.1;
TEX_METRES.wlShingle = 1.4;
TEX_METRES.wlFur = 0.35;
TEX_METRES.wlBoards = 1.2;
TEX_METRES.wlLogEnd = 1;

Object.assign(MATS, {
  wlBark: { tex: bark, texKey: 'wlBark', rough: 0.95, grime: 0.2, envIntensity: 0.6 },
  wlBirch: { tex: birch, texKey: 'wlBirch', rough: 0.75, envIntensity: 0.6 },
  wlLogEnd: { tex: logEnd, texKey: 'wlLogEnd', rough: 0.85, envIntensity: 0.5 },
  wlHewn: { tex: timber, texKey: 'timber', rough: 0.85, grime: 0.45, envIntensity: 0.5 },
  wlBoards: { tex: boards, texKey: 'wlBoards', rough: 0.85, grime: 0.6, envIntensity: 0.5 },
  wlRock: { tex: rock, texKey: 'wlRock', rough: 0.82, grime: 0.3, envIntensity: 0.6 },
  wlMoss: { tex: moss, texKey: 'wlMoss', rough: 1, envIntensity: 0.4 },
  wlNeedle: { tex: needles, texKey: 'wlNeedle', rough: 0.88, envIntensity: 0.45 },
  wlLeaf: { tex: leaves, texKey: 'wlLeaf', rough: 0.86, envIntensity: 0.25 },
  wlShingle: { tex: shingles, texKey: 'wlShingle', rough: 0.9, grime: 0.4, envIntensity: 0.5 },
  wlFur: { tex: fur, texKey: 'wlFur', rough: 0.95, rim: true, envIntensity: 0.5 },
  // Thin double-sided plant parts: grass blades, fern fronds, petals, leaf cards, litter.
  wlBlade: { rough: 0.95, side: THREE.DoubleSide, envIntensity: 0.1 },
  wlPlant: { rough: 0.8, side: THREE.DoubleSide, envIntensity: 0.35 },
  wlSolid: { rough: 0.6, envIntensity: 0.6 },
  wlGloss: { rough: 0.25, clearcoat: 0.6, envIntensity: 1.0 },
  wlEye: { rough: 0.04, clearcoat: 1, envIntensity: 1.6, rim: true },
  wlIron: { tex: (s: number, f: boolean) => MATS.steel!.tex!(s, f), texKey: 'metal', rough: 0.55, metal: 0.6, grime: 0.6, rust: 0.8 },
  wlWater: { rough: 0.03, envIntensity: 1.5 },
  wlGlow: { unlit: true },
});
