import * as THREE from 'three';
import type { MapBlock } from '../../src/map/mapTypes';
import type { Kit } from './kit';
import { MATS } from './kit';
import { TEX_METRES } from './textures';
import { MOON_DIR } from './woodland-sky';
import { Bulk, Bulks, fbm2, groundY, HALF_X, HALF_Z, hash2, MAP, noise2, rng, UP, V } from './woodland-util';

/**
 * Woodland's trees, from the map's `tree` blocks: each trunk fills its block (within the game's 8 cm, straight up to the
 * block's top, so what you see is what stops a BB), and the crown above never comes lower than 3 m over the ground
 * (CANOPY.minBase), so it never hides a standing player. Species by a hash of the trunk's place: Norway spruce in
 * drooping whorls of branch sprays, Scots pine with its orange upper bark and flat pads, a younger silver fir, birch, and
 * dead snags with broken tops and bracket fungi. The meadow's lone oak is the hero: a four-lobed gnarled trunk, great
 * limbs and a crown of leafy lumps. Round the field, a forest of the same species (full skirts to the ground there),
 * thinning into hills of simple silhouettes.
 */

/** No crown point comes lower than this over the ground under it, inside the fence (the game's CANOPY.minBase). */
export const CROWN_CLEAR = 3.1;
/** The game's 8 cm: a trunk's corners may be this far inside its block at most. */
const MAX_GAP = 0.08;

type Species = 'spruce' | 'scots' | 'fir' | 'birch' | 'snag';

const COLOURS = {
  spruce: [0x2b5a35, 0x2f6339, 0x26502f],
  fir: [0x2c5e45, 0x31664a],
  scots: [0x3c6a34, 0x46723a],
  birch: [0x6a9a3c, 0x78a443, 0x5f8f37],
  oak: [0x4f7f30, 0x5a8a34, 0x47752c, 0x638f3a],
  barkSpruce: 0x6a5546,
  barkScots: 0x5e4535,
  barkScotsUpper: 0xc77a44,
  barkFir: 0x8a8580,
  birchBark: 0xeeece4,
  snag: 0x9a948a,
  oakBark: 0x6e6152,
  moss: 0x5f7a34,
};

export interface TreeBuild {
  bulks: Bulks;
  full: boolean;
  kit: Kit;
}

const tmpC = new THREE.Color();

/**
 * A tapering tube from a to b (radii ra, rb), its own UVs in the bark's metres; `col(t, side, out)` colours along it,
 * writing into `out` or returning a colour.
 */
export function tube(b: Bulk, a: THREE.Vector3, e: THREE.Vector3, ra: number, rb: number, sides: number, segs: number, col: (t: number, ang: number, out: THREE.Color) => THREE.Color | void, opts: { cap?: boolean; wobble?: number; seed?: number; shape?: (ang: number, t: number) => number } = {}): void {
  const axis = e.clone().sub(a);
  const len = axis.length();
  const dir = axis.clone().normalize();
  const side = Math.abs(dir.y) > 0.95 ? V(1, 0, 0) : UP.clone();
  const s1 = new THREE.Vector3().crossVectors(dir, side).normalize();
  const s2 = new THREE.Vector3().crossVectors(dir, s1).normalize();
  const metres = TEX_METRES[MATS[b.key]?.texKey ?? ''] ?? 1;
  const base = b.nv;
  const circ = Math.PI * (ra + rb);
  for (let j = 0; j <= segs; j++) {
    const t = j / segs;
    const r = ra + (rb - ra) * t;
    const c = a.clone().addScaledVector(dir, len * t);
    if (opts.wobble) c.addScaledVector(s1, (noise2(t * 3, opts.seed ?? 0, 61) - 0.5) * opts.wobble).addScaledVector(s2, (noise2(t * 3, (opts.seed ?? 0) + 5, 62) - 0.5) * opts.wobble);
    for (let i = 0; i <= sides; i++) {
      const ang = (i / sides) * Math.PI * 2;
      const k = opts.shape ? opts.shape(ang, t) : 1;
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);
      const n = s1.clone().multiplyScalar(nx).addScaledVector(s2, ny);
      const p = c.clone().addScaledVector(n, r * k);
      const got = col(t, ang, tmpC);
      if (got && got !== tmpC) tmpC.copy(got);
      b.v(p.x, p.y, p.z, n.x, n.y, n.z, tmpC.r, tmpC.g, tmpC.b, ((i / sides) * circ) / metres, (len * t) / metres);
    }
  }
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < sides; i++) {
      const p0 = base + j * (sides + 1) + i;
      const p1 = p0 + sides + 1;
      b.tri(p0, p0 + 1, p1);
      b.tri(p0 + 1, p1 + 1, p1);
    }
  }
  if (opts.cap) {
    const c = b.v(e.x, e.y, e.z, dir.x, dir.y, dir.z, tmpC.r, tmpC.g, tmpC.b, 0, 0);
    const top = base + segs * (sides + 1);
    for (let i = 0; i < sides; i++) b.tri(top + i, top + i + 1, c);
  }
}

/**
 * A soft lump of foliage: an icosphere pushed in and out by noise, its normals pointing out from its middle (so a crown
 * shades as one mass), `scale` squashing it; coloured per vertex by `col(world point, unit offset)`.
 */
export function lump(b: Bulk, c: THREE.Vector3, r: number, detail: number, seed: number, col: (p: THREE.Vector3, o: THREE.Vector3, out: THREE.Color) => void, scale = V(1, 1, 1), rough = 0.35): void {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const base = b.nv;
  const o = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    o.fromBufferAttribute(pos, i).normalize();
    const n = 1 + (noise2(o.x * 2.1 + seed, o.z * 2.1 + o.y * 1.7, 63) - 0.5) * rough * 2 + (noise2(o.x * 5 + seed, o.y * 5 - o.z * 3, 64) - 0.5) * rough * 0.6;
    p.set(o.x * scale.x, o.y * scale.y, o.z * scale.z).multiplyScalar(r * n).add(c);
    const nn = V(o.x / scale.x, o.y / scale.y, o.z / scale.z).normalize();
    col(p, o, tmpC);
    b.v(p.x, p.y, p.z, nn.x, nn.y, nn.z, tmpC.r, tmpC.g, tmpC.b, p.x / 1.1, p.y / 1.1 + p.z / 1.1);
  }
  for (let i = 0; i < pos.count; i += 3) b.tri(base + i, base + i + 1, base + i + 2);
  g.dispose();
}

/**
 * One conifer branch spray: a flat, tapering blade of needles out from the trunk, drooping then lifting at its tip (a
 * diamond section, three stations). Normals blend out from the trunk and up, so whorls shade softly.
 */
function spray(b: Bulk, root: THREE.Vector3, ang: number, len: number, droop: number, width: number, colBase: THREE.Color, colTip: THREE.Color, shade: number): void {
  const out = V(Math.cos(ang), 0, Math.sin(ang));
  const side = V(-out.z, 0, out.x);
  const stations = [
    { t: 0, w: width * 0.25, th: width * 0.12, dy: 0 },
    { t: 0.5, w: width, th: width * 0.22, dy: -droop * 0.7 },
    { t: 0.85, w: width * 0.55, th: width * 0.12, dy: -droop },
    { t: 1, w: 0.02, th: 0.01, dy: -droop * 0.75 },
  ];
  const base = b.nv;
  for (const s of stations) {
    const c = root.clone().addScaledVector(out, len * s.t);
    c.y += s.dy;
    const col = tmpC.copy(colBase).lerp(colTip, s.t).multiplyScalar(shade * (0.8 + s.t * 0.35));
    const corners = [
      [side, s.w, 0],
      [UP, 0, s.th],
      [side, -s.w, 0],
      [UP, 0, -s.th],
    ] as const;
    for (const [, w, th] of corners) {
      const p = c.clone().addScaledVector(side, w).addScaledVector(UP, th);
      const n = out.clone().multiplyScalar(0.55).addScaledVector(UP, 0.6 + (th < 0 ? -0.5 : 0)).addScaledVector(side, Math.sign(w) * 0.25).normalize();
      b.v(p.x, p.y, p.z, n.x, n.y, n.z, col.r, col.g, col.b, p.x / 0.9 + p.y * 0.3, p.z / 0.9 + p.y * 0.3);
    }
  }
  for (let s = 0; s < stations.length - 1; s++) {
    for (let k = 0; k < 4; k++) {
      const a0 = base + s * 4 + k;
      const a1 = base + s * 4 + ((k + 1) % 4);
      const b0 = a0 + 4;
      const b1 = a1 + 4;
      b.tri(a0, b0, a1);
      b.tri(a1, b0, b1);
    }
  }
}

/** The lowest a crown may come at (x, z) with radius r: 3 m over the highest ground under it, inside the fence. */
function crownFloor(x: number, z: number, r: number): number {
  let g = groundY(x, z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g = Math.max(g, groundY(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return g + CROWN_CLEAR;
}

/** The trunk: round (12 sides, a touch over the block's half width so its corners stay within the 8 cm), straight to its block's top. */
function trunk(tb: TreeBuild, key: string, x: number, z: number, g: number, top: number, half: number, seed: number, col: (y01: number, ang: number, out: THREE.Color) => void, above = 0, lean = V(0, 0, 0)): number {
  const sides = tb.full ? 14 : 8;
  // A circle reaching within MAX_GAP of the box corners bulges this far past its faces; the polygon's corners go out to
  // 1 / cos(π / sides) of it, so its flats (not just its corners) reach that circle on every preset.
  const r = Math.max(half, half * Math.SQRT2 - MAX_GAP) / Math.cos(Math.PI / sides);
  const b = tb.bulks.get(key);
  const segs = tb.full ? Math.max(4, Math.round((top - g) / 1.5)) : 1;
  tube(b, V(x, g - 0.2, z), V(x, top, z), r, r * 0.97, sides, segs, (t, a, out) => col(t, a, out), { shape: (a) => 1 + (noise2(a * 1.6, seed, 65) - 0.5) * 0.04 });
  if (above > 0) {
    // Above the block it may taper and lean as trees do.
    const tip = V(x, top + above, z).add(lean);
    tube(b, V(x, top, z), tip, r * 0.97, r * 0.2, sides, tb.full ? 4 : 1, (t, a, out) => col(1, a, out), { cap: true });
  }
  if (tb.full) {
    // Root flare: low buttresses (under 0.25 m) spreading into the ground.
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + seed;
      const d = V(Math.cos(a), 0, Math.sin(a));
      const p0 = V(x, g + 0.32, z).addScaledVector(d, r * 0.6);
      const p1 = V(x, groundY(x + d.x * (r + 0.55), z + d.z * (r + 0.55)) - 0.05, z).addScaledVector(d, r + 0.55);
      tube(b, p0, p1, r * 0.42, 0.04, 6, 2, (_t, aa, out) => col(0, aa, out));
    }
  }
  return r;
}

const barkCol = (hex: number, upper?: number, mossy = true) => {
  const c0 = new THREE.Color(hex);
  const c1 = new THREE.Color(upper ?? hex);
  const m = new THREE.Color(COLOURS.moss);
  return (y01: number, ang: number, out: THREE.Color) => {
    out.copy(c0).lerp(c1, THREE.MathUtils.smoothstep(y01, 0.35, 0.75));
    // Moss on the north (-z) side, low on the trunk.
    if (mossy) out.lerp(m, Math.max(0, -Math.sin(ang)) * (1 - THREE.MathUtils.smoothstep(y01, 0.0, 0.22)) * 0.75);
    out.multiplyScalar(0.75 + 0.25 * THREE.MathUtils.smoothstep(y01, 0, 0.15));
  };
};

/** Light across a crown: darker low and inside, lighter on top and on the moon's side (baked under the real light). */
function crownShade(p: THREE.Vector3, centre: THREE.Vector3, low: number, high: number, n?: THREE.Vector3): number {
  const h = THREE.MathUtils.clamp((p.y - low) / Math.max(0.1, high - low), 0, 1);
  const moon = n ? Math.max(0, n.dot(MOON_DIR)) : 0;
  const out = Math.min(1, Math.hypot(p.x - centre.x, p.z - centre.z) / 1.5);
  return 0.62 + h * 0.32 + moon * 0.16 + out * 0.08;
}

function spruce(tb: TreeBuild, x: number, z: number, g: number, top: number, half: number, seed: number, field: boolean, fir = false): void {
  const r = rng(Math.floor(seed * 1e6));
  const height = (top - g) + 2.5 + r() * 3.5;
  trunk(tb, 'wlBark', x, z, g, top, half, seed, barkCol(fir ? COLOURS.barkFir : COLOURS.barkSpruce, undefined, true), height - (top - g), V(0, 0, 0));
  const apex = g + height + 0.6;
  const floor = field ? crownFloor(x, z, 2.6) : g + 0.4 + r() * 0.8;
  const base = Math.max(floor, g + (field ? CROWN_CLEAR : 0.3));
  const pal = fir ? COLOURS.fir : COLOURS.spruce;
  const colBase = new THREE.Color(pal[Math.floor(r() * pal.length)]!).multiplyScalar(0.7);
  const colTip = new THREE.Color(pal[0]!).lerp(new THREE.Color(fir ? 0x6c9a70 : 0x5c8a45), 0.55);
  const maxLen = (fir ? 1.9 : 2.3) * (0.85 + r() * 0.3);
  const b = tb.bulks.get('wlNeedle');
  if (!tb.full) {
    // Low: three ragged cones, the same silhouette.
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers;
      const y0 = base + (apex - base) * f * 0.78;
      const y1 = i === tiers - 1 ? apex : base + (apex - base) * (f * 0.78 + 0.45);
      const rad = maxLen * (1 - f * 0.55);
      const cg = new THREE.ConeGeometry(rad, y1 - y0, 9, 1, false);
      const pos = cg.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const vy = pos.getY(v);
        if (vy < 0) {
          const a = Math.atan2(pos.getZ(v), pos.getX(v));
          const k = 1 + (noise2(a * 2 + seed * 9, i, 66) - 0.5) * 0.35;
          pos.setXYZ(v, pos.getX(v) * k, vy - Math.abs(Math.sin(a * 4.5 + seed)) * 0.25, pos.getZ(v) * k);
        }
      }
      cg.translate(x, (y0 + y1) / 2, z);
      const centre = V(x, 0, z);
      b.geo(cg, null, (out, px, py, pz) => {
        out.copy(colBase).lerp(colTip, 0.3 + f * 0.3).multiplyScalar(crownShade(V(px, py, pz), centre, base, apex));
      });
    }
    return;
  }
  // Ultra: whorls of drooping sprays round a dark core.
  const core = new THREE.ConeGeometry(maxLen * 0.42, apex - base - 0.3, 10, 1, true);
  core.translate(x, (apex + base + 0.3) / 2, z);
  b.geo(core, null, (out) => out.copy(colBase).multiplyScalar(0.45));
  const whorls = Math.round((apex - base) / 0.62);
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = base + 0.15 + (apex - 0.5 - base) * Math.pow(t, 0.95);
    const len = Math.max(0.28, maxLen * Math.pow(1 - t, 0.85) + 0.2);
    const n = Math.max(4, Math.round((fir ? 8 : 7) - t * 3 + r() * 2));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + w * 0.73 + r() * 0.4;
      const l = len * (0.8 + r() * 0.35);
      const droop = l * (fir ? 0.18 : 0.32) * (1 - t * 0.6) + (r() > 0.85 ? 0.25 : 0);
      // No spray tip below the crown's floor.
      const d = Math.min(droop, Math.max(0, y - floor - 0.05));
      spray(b, V(x, y, z), a, l, d, Math.max(0.12, l * (fir ? 0.36 : 0.3)), colBase, colTip, 0.82 + t * 0.3 + Math.max(0, Math.cos(a - Math.atan2(MOON_DIR.z, MOON_DIR.x))) * 0.14);
    }
  }
  // A leader at the top.
  spray(b, V(x, apex - 0.6, z), 0, 0.05, 0, 0.08, colBase, colTip, 1);
  const tip = new THREE.ConeGeometry(0.16, 0.9, 6);
  tip.translate(x, apex - 0.1, z);
  b.geo(tip, null, (out) => out.copy(colTip));
}

function scots(tb: TreeBuild, x: number, z: number, g: number, top: number, half: number, seed: number): void {
  const r = rng(Math.floor(seed * 1e6) + 3);
  const height = (top - g) + 3 + r() * 3;
  const lean = V((r() - 0.5) * 1.4, 0, (r() - 0.5) * 1.4);
  trunk(tb, 'wlBark', x, z, g, top, half, seed, barkCol(COLOURS.barkScots, COLOURS.barkScotsUpper, true), height - (top - g), lean);
  // A Scots pine's crown: a broad, flat-topped cloud high on a bare orange trunk, a few big limbs holding it up.
  const crownLow = g + Math.max(CROWN_CLEAR + 3.5, height * 0.62);
  const apex = V(x, g + height, z).add(lean);
  const b = tb.bulks.get('wlNeedle');
  const bark = tb.bulks.get('wlBark');
  const pal = COLOURS.scots;
  const c0 = new THREE.Color(pal[Math.floor(r() * pal.length)]!);
  const branches = tb.full ? 5 + Math.floor(r() * 3) : 3;
  const pads: { c: THREE.Vector3; r: number }[] = [{ c: apex.clone().add(V(0, -0.2, 0)), r: 1.5 + r() * 0.4 }];
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + r() * 0.7;
    const yy = crownLow + (apex.y - crownLow) * (0.1 + (i / branches) * 0.6);
    const from = V(x, yy, z).add(lean.clone().multiplyScalar((yy - g) / height));
    const reach = 1.1 + r() * 1.1;
    const to = from.clone().add(V(Math.cos(a) * reach, 0.5 + r() * 0.7, Math.sin(a) * reach));
    tube(bark, from, to, tb.full ? 0.1 : 0.08, 0.045, tb.full ? 6 : 4, 1, () => tmpC.set(COLOURS.barkScotsUpper).multiplyScalar(0.75));
    pads.push({ c: to.add(V(0, 0.2, 0)), r: 1.05 + r() * 0.5 });
  }
  // Each pad is a cluster of soft, overlapping tufts, so the crown reads as one lumpy mass, not plates.
  for (const [k, pd] of pads.entries()) {
    const tufts = tb.full ? 5 : 1;
    for (let t = 0; t < tufts; t++) {
      const a = (t / tufts) * Math.PI * 2 + k;
      const off = t === 0 ? 0 : pd.r * (0.45 + r() * 0.25);
      const c = pd.c.clone().add(V(Math.cos(a) * off, (t === 0 ? 0.12 : -0.05) + (r() - 0.5) * 0.15, Math.sin(a) * off));
      const rad = pd.r * (t === 0 ? (tb.full ? 0.75 : 1.05) : 0.5 + r() * 0.15);
      const cc = c0.clone().multiplyScalar(0.9 + r() * 0.2);
      lump(b, c, rad, 1, seed * 10 + k * 7 + t, (_p, o, out) => {
        out.copy(cc).multiplyScalar(0.5 + Math.max(0, o.y) * 0.5 + Math.max(0, o.dot(MOON_DIR)) * 0.2);
      }, V(1.15, 0.78, 1.15), 0.34);
    }
  }
}

function birch(tb: TreeBuild, x: number, z: number, g: number, top: number, half: number, seed: number, field: boolean): void {
  const r = rng(Math.floor(seed * 1e6) + 7);
  const height = (top - g) + 1 + r() * 2.5;
  const lean = V((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9);
  const white = new THREE.Color(COLOURS.birchBark);
  const dark = new THREE.Color(0x3a3632);
  trunk(tb, 'wlBirch', x, z, g, top, half, seed, (y01, _a, out) => out.copy(white).lerp(dark, (1 - THREE.MathUtils.smoothstep(y01, 0, 0.1)) * 0.75), height - (top - g), lean);
  const b = tb.bulks.get('wlLeaf');
  const pal = COLOURS.birch;
  const floor = field ? crownFloor(x, z, 2.2) + 1.2 : g + 3.5;
  const n = tb.full ? 9 : 3;
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const a = f * Math.PI * 2 * 2.4 + seed;
    const yy = floor + 0.8 + (g + height - floor - 0.8) * (0.25 + (i % 3) * 0.3 + r() * 0.15);
    const rad = (tb.full ? 0.9 : 1.4) + r() * 0.5;
    const off = i === 0 ? 0 : 0.6 + r() * 1.0;
    const c = V(x + Math.cos(a) * off, Math.max(yy, floor + rad * 0.75), z + Math.sin(a) * off).add(lean.clone().multiplyScalar((yy - g) / height));
    const col0 = new THREE.Color(pal[i % pal.length]!);
    lump(b, c, rad, tb.full ? 2 : 0, seed + i, (_p, o, out) => out.copy(col0).multiplyScalar(0.6 + Math.max(0, o.y) * 0.35 + Math.max(0, o.dot(MOON_DIR)) * 0.2), V(1, 0.85, 1), 0.4);
  }
  if (tb.full) {
    // Fine twigs out of the crown's edge.
    const bark = tb.bulks.get('wlBirch');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + seed * 3;
      const from = V(x, floor + 0.6 + i * 0.5, z).add(lean.clone().multiplyScalar(0.5));
      const to = from.clone().add(V(Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6));
      tube(bark, from, to, 0.06, 0.02, 5, 1, (_t, _a, out) => out.copy(white).multiplyScalar(0.8));
    }
  }
}

function snag(tb: TreeBuild, x: number, z: number, g: number, top: number, half: number, seed: number, field: boolean): void {
  const r = rng(Math.floor(seed * 1e6) + 11);
  const grey = new THREE.Color(COLOURS.snag);
  const height = (top - g) + 0.6 + r() * 1.5;
  trunk(tb, 'wlBark', x, z, g, top, half, seed, (y01, ang, out) => {
    out.copy(grey).multiplyScalar(0.7 + y01 * 0.3);
    out.lerp(new THREE.Color(COLOURS.moss), Math.max(0, -Math.sin(ang)) * (1 - THREE.MathUtils.smoothstep(y01, 0, 0.3)) * 0.6);
  }, 0);
  const b = tb.bulks.get('wlBark');
  const rad = half * Math.SQRT2 - MAX_GAP;
  // A broken top: jagged splinters.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const h = 0.3 + r() * (height - (top - g));
    const p0 = V(x + Math.cos(a) * rad * 0.55, top - 0.05, z + Math.sin(a) * rad * 0.55);
    tube(b, p0, p0.clone().add(V(Math.cos(a) * 0.06, h, Math.sin(a) * 0.06)), rad * 0.42, 0.015, 5, 1, (_t, _a, out) => out.copy(grey).multiplyScalar(0.95));
  }
  // Bare broken limbs, none below the crown floor.
  const floor = field ? crownFloor(x, z, 1.5) : g + 2;
  for (let i = 0; i < (tb.full ? 6 : 3); i++) {
    const a = r() * Math.PI * 2;
    const yy = floor + 0.2 + r() * (top - floor - 0.8);
    const from = V(x, yy, z);
    const to = from.clone().add(V(Math.cos(a) * (0.8 + r() * 1.4), 0.3 + r() * 0.9, Math.sin(a) * (0.8 + r() * 1.4)));
    tube(b, from, to, 0.08, 0.025, 5, 1, (_t, _a, out) => out.copy(grey).multiplyScalar(0.85));
  }
  if (tb.full) {
    // Bracket fungi climbing one side.
    const f = tb.bulks.get('wlSolid');
    for (let i = 0; i < 5; i++) {
      const a = seed * 6 + (r() - 0.5) * 1.2;
      const yy = g + 0.8 + i * 0.45 + r() * 0.2;
      const s = 0.12 + r() * 0.08;
      const gg = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI, 0, Math.PI / 2);
      const m = new THREE.Matrix4().compose(V(x + Math.cos(a) * rad, yy, z + Math.sin(a) * rad), new THREE.Quaternion().setFromAxisAngle(UP, -a + Math.PI / 2), V(s, s * 0.35, s * 0.9));
      f.geo(gg, m, (out, _x, py) => out.set(0xc9a46a).multiplyScalar(0.75 + Math.min(1, (py - yy) / (s * 0.35)) * 0.35));
    }
  }
}

/** The lone oak on the meadow: a four-lobed trunk filling its block, great limbs, a broad crown of leafy lumps. */
function oak(tb: TreeBuild, blk: MapBlock): THREE.Vector3[] {
  const { x, z } = blk.center;
  const half = blk.size.x / 2;
  const g = groundY(x, z);
  const top = blk.center.y + blk.size.y / 2;
  const bark = tb.bulks.get('wlBark');
  const c0 = new THREE.Color(COLOURS.oakBark);
  const moss = new THREE.Color(COLOURS.moss);
  const r = rng(551);
  const bole = 4.6;
  // Lobes reach the block's corners (within the 8 cm) and its faces: gnarled buttresses.
  const lobe = (a: number) => {
    const d = Math.abs(Math.cos(2 * (a - Math.PI / 4)));
    return 1 + Math.pow(d, 3) * ((half * Math.SQRT2 - MAX_GAP) / half - 1);
  };
  tube(bark, V(x, g - 0.3, z), V(x, g + bole, z), half * 1.02, half * 0.98, tb.full ? 28 : 12, tb.full ? 8 : 2, (t, a, out) => {
    out.copy(c0).multiplyScalar(0.8 + t * 0.2 + (noise2(a * 3, t * 6, 67) - 0.5) * 0.2);
    out.lerp(moss, Math.max(0, -Math.sin(a)) * (1 - t) * 0.55);
  }, { shape: (a, t) => lobe(a) * (1 + (noise2(a * 4, t * 3, 68) - 0.5) * 0.05) });
  // The upper stem fills the rest of the block to its top, inside the crown.
  tube(bark, V(x, g + bole - 0.2, z), V(x + 0.3, top, z - 0.2), half * 0.92, half * 0.55, tb.full ? 18 : 8, 3, (t, _a, out) => out.copy(c0).multiplyScalar(0.9 + t * 0.1));
  const perches: THREE.Vector3[] = [];
  const limbs = tb.full ? 6 : 4;
  const leafTips: { c: THREE.Vector3; r: number }[] = [];
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + 0.4 + r() * 0.4;
    const from = V(x, g + bole - 0.6 + r() * 1.5, z);
    const mid = from.clone().add(V(Math.cos(a) * 2.6, 1.3 + r() * 0.8, Math.sin(a) * 2.6));
    const to = mid.clone().add(V(Math.cos(a) * 2.4, 1.6 + r() * 1.4, Math.sin(a) * 2.4));
    tube(bark, from, mid, 0.34, 0.24, tb.full ? 10 : 6, 2, (t, _a, out) => out.copy(c0).multiplyScalar(0.85 + t * 0.15), { wobble: 0.15, seed: i });
    tube(bark, mid, to, 0.24, 0.1, tb.full ? 8 : 5, 2, () => tmpC.copy(c0), { wobble: 0.2, seed: i + 9 });
    if (i === 1) perches.push(mid.clone().lerp(to, 0.25));
    leafTips.push({ c: to, r: 2.0 + r() * 0.6 }, { c: mid.clone().add(V(0, 1.3, 0)), r: 1.7 + r() * 0.4 });
    if (tb.full) {
      for (let k = 0; k < 3; k++) {
        const aa = a + (r() - 0.5) * 1.6;
        const tw = mid.clone().lerp(to, 0.3 + k * 0.25);
        const end = tw.clone().add(V(Math.cos(aa) * 1.5, 0.9 + r(), Math.sin(aa) * 1.5));
        tube(bark, tw, end, 0.08, 0.03, 5, 1, () => tmpC.copy(c0).multiplyScalar(0.9));
        leafTips.push({ c: end, r: 1.2 + r() * 0.5 });
      }
    }
  }
  leafTips.push({ c: V(x, top + 0.6, z), r: 2.8 }, { c: V(x, g + bole + 4.5, z), r: 3.0 });
  const b = tb.bulks.get('wlLeaf');
  const centre = V(x, 0, z);
  const low = crownFloor(x, z, 5);
  for (let i = 0; i < leafTips.length; i++) {
    const t = leafTips[i]!;
    // Keep every lump's underside above the crown floor.
    t.c.y = Math.max(t.c.y, low + t.r * 0.8);
    const col0 = new THREE.Color(COLOURS.oak[i % COLOURS.oak.length]!);
    lump(b, t.c, t.r, tb.full ? 2 : 1, i * 3.1, (p, o, out) => out.copy(col0).multiplyScalar(crownShade(p, centre, low, top + 3, o) * (0.85 + Math.max(0, o.y) * 0.2)), V(1.1, 0.8, 1.1), 0.32);
  }
  return perches;
}

export interface Trees {
  /** Where an owl could sit: on the oak's limb and on snags' stubs. */
  perches: THREE.Vector3[];
  /** Snag trunks (x, z, top). */
  snags: { x: number; z: number; top: number }[];
}

function speciesAt(x: number, z: number, meadow: boolean): Species {
  const h = hash2(x, z, 71);
  if (meadow) return h < 0.25 ? 'scots' : h < 0.6 ? 'birch' : 'spruce';
  return h < 0.48 ? 'spruce' : h < 0.58 ? 'scots' : h < 0.76 ? 'fir' : h < 0.89 ? 'birch' : 'snag';
}

/** The field's trees, from the map's blocks. */
export function buildFieldTrees(tb: TreeBuild): Trees {
  const perches: THREE.Vector3[] = [];
  const snags: Trees['snags'] = [];
  for (const blk of MAP.blocks) {
    if (blk.kind !== 'tree') continue;
    if (blk.size.x > 1) {
      perches.push(...oak(tb, blk));
      continue;
    }
    const { x, z } = blk.center;
    const g = groundY(x, z);
    const top = blk.center.y + blk.size.y / 2;
    const half = blk.size.x / 2;
    const meadow = z > -22 && z < 33;
    const sp = speciesAt(x, z, meadow);
    const seed = hash2(x, z, 72);
    if (sp === 'spruce' || sp === 'fir') spruce(tb, x, z, g, top, half, seed, true, sp === 'fir');
    else if (sp === 'scots') scots(tb, x, z, g, top, half, seed);
    else if (sp === 'birch') birch(tb, x, z, g, top, half, seed, true);
    else {
      snag(tb, x, z, g, top, half, seed, true);
      snags.push({ x, z, top });
    }
  }
  return { perches, snags };
}

/** The belt of forest round the fence: a jittered grid this far apart (m), this deep, full detail this near the eye. */
const BELT = { stepUltra: 2.9, stepLow: 4.8, depth: 44, richUltra: 42, coneLowFrom: 14, fenceClear: 3.4 };

/**
 * The forest round the field: a dense belt from just outside the fence (skirts down to the ground there), thinning
 * out over the hills, then far ridges of simple dark silhouettes. Trees near the eye get Ultra's full build, the rest
 * the cheap build of the same species; on Low the deep belt is single cones.
 */
export function buildOuterForest(tb: TreeBuild, view: THREE.Vector3, glades: readonly { x: number; z: number; r: number }[] = []): void {
  const r = rng(909);
  const full = tb.full;
  const step = full ? BELT.stepUltra : BELT.stepLow;
  const b = tb.bulks.get('wlNeedle');
  for (let gx = -HALF_X - BELT.depth; gx <= HALF_X + BELT.depth; gx += step) {
    for (let gz = -HALF_Z - BELT.depth; gz <= HALF_Z + BELT.depth; gz += step) {
      const x = gx + (hash2(gx, gz, 76) - 0.5) * step * 0.9;
      const z = gz + (hash2(gz, gx, 77) - 0.5) * step * 0.9;
      // How far outside the fence (m).
      const out = Math.max(Math.abs(x) - HALF_X, Math.abs(z) - HALF_Z);
      if (out < BELT.fenceClear || out > BELT.depth) continue;
      // Thinner further out, with a few glades so the hills read through.
      if (hash2(x, z, 78) < (out / BELT.depth) * 0.4) continue;
      if (fbm2(x * 0.05, z * 0.05, 2, 73) < 0.3) continue;
      if (glades.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
      const g = groundY(x, z);
      const seed = hash2(x, z, 74);
      const s = 0.85 + seed * 0.6;
      const top = g + 7 * s;
      if (!full && out > BELT.coneLowFrom) {
        // Low, deep in the belt: one dark cone, its foot in the ground.
        const h = 8 * s + 4;
        const cg = new THREE.ConeGeometry(h * 0.27, h, 6, 1, true);
        cg.translate(x, g + h * 0.5 - 0.3, z);
        const shade = 0.55 + seed * 0.25;
        b.geo(cg, null, (o, _x, py) => o.set(0x2a5232).multiplyScalar(shade * (0.6 + 0.5 * THREE.MathUtils.clamp((py - g) / h, 0, 1))));
        continue;
      }
      const sp = speciesAt(x, z, false);
      const dist = Math.hypot(x - view.x, z - view.z);
      const sub: TreeBuild = { ...tb, full: full && dist < BELT.richUltra };
      if (sp === 'scots') scots(sub, x, z, g, top, 0.2 * s, seed);
      else if (sp === 'birch') birch(sub, x, z, g, top, 0.16 * s, seed, false);
      else if (sp === 'snag' && dist < 60) snag(sub, x, z, g, top, 0.2 * s, seed, false);
      else spruce(sub, x, z, g, top, 0.2 * s, seed, false, sp === 'fir');
    }
  }
  // Far ridges: dark cone silhouettes on the hills, thick enough to read as forest against the sky.
  const far = full ? 3600 : 800;
  for (let i = 0; i < far; i++) {
    const a = r() * Math.PI * 2;
    const d = 110 + Math.pow(r(), 0.8) * 420;
    const x = Math.cos(a) * d * 1.15;
    const z = Math.sin(a) * d;
    if (fbm2(x * 0.01, z * 0.01, 2, 75) < 0.36) continue;
    const g = groundY(x, z);
    const h = 9 + r() * 9;
    const cg = new THREE.ConeGeometry(h * 0.28, h, full ? 7 : 5, 1, true);
    cg.translate(x, g + h * 0.5 - 0.5, z);
    const shade = 0.5 + r() * 0.25;
    b.geo(cg, null, (out, _x, py) => out.set(0x24452c).multiplyScalar(shade * (0.7 + 0.4 * THREE.MathUtils.clamp((py - g) / h, 0, 1))));
  }
}
