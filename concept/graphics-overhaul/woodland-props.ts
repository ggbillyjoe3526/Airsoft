import * as THREE from 'three';
import type { MapBlock } from '../../src/map/mapTypes';
import type { MapLight } from '../../src/map/nightSight';
import { canvasTex } from './textures';
import { lump, tube } from './woodland-trees';
import { Bulk, Bulks, fbm2, groundY, HALF_X, hash2, MAP, noise2, rng, UP, V, wx, wz } from './woodland-util';

/**
 * Woodland's built things, from the map's blocks, each drawn inside its block: boulders as faceted granite with moss on
 * top; `log` blocks by where they stand (the hunter's cabin's hewn walls with chinking and notched corners, the fort's
 * double log cribs with a sod cap, the camps' barricades with team-coloured tape, the meadow's fallen trees on mossy
 * berms, firewood stacks showing their cut ends); the field's board fence. Then what the game's lights are: camp fires
 * (stone ring, crossed logs, glowing embers, flames, smoke) and lanterns (iron housing, glowing panes, on a bracket or
 * hung from the cabin's porch). The cabin also gets its roof and porch, all above head height or flat underfoot.
 */

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  cx: number;
  cz: number;
  w: number;
  h: number;
  d: number;
}
const boxOf = (b: MapBlock): Box => ({
  x0: b.center.x - b.size.x / 2,
  x1: b.center.x + b.size.x / 2,
  y0: b.center.y - b.size.y / 2,
  y1: b.center.y + b.size.y / 2,
  z0: b.center.z - b.size.z / 2,
  z1: b.center.z + b.size.z / 2,
  cx: b.center.x,
  cz: b.center.z,
  w: b.size.x,
  h: b.size.y,
  d: b.size.z,
});

const PAL = {
  rock: [0xa29482, 0xab9d88, 0x958a7a, 0xb3a690],
  moss: 0x5d7c2e,
  mossBright: 0x86a33c,
  bark: 0x5e4a3a,
  barkDark: 0x3f3229,
  hewn: 0x9a7350,
  chink: 0xd9d0bd,
  earth: 0x5a4632,
  sod: 0x4f6e2c,
  boards: 0x8f7b62,
  shingle: 0x8a6a4c,
  iron: 0x2e2c2a,
  ember: new THREE.Color(5.5, 1.6, 0.35),
  pane: new THREE.Color(4.2, 2.6, 1.1),
  blue: 0x2f6fd6,
  orange: 0xec7a2c,
};

/** The cabin's and the fort's footprints (world), for telling their log blocks apart. */
export const CABIN = { x0: wx(62), x1: wx(70.4), z0: wz(26.4), z1: wz(18) };
const FORT = { x0: wx(94) - 0.01, x1: wx(108.5) + 0.01, z0: wz(54.5) - 0.01, z1: wz(39.5) + 0.01 };
const inside = (b: Box, r: { x0: number; x1: number; z0: number; z1: number }) => b.x0 >= r.x0 - 0.01 && b.x1 <= r.x1 + 0.01 && b.z0 >= r.z0 - 0.01 && b.z1 <= r.z1 + 0.01;

const tmp = new THREE.Color();
const C = (hex: number) => new THREE.Color(hex);

/** A box into a batch, coloured `col` with an optional per-vertex shade. */
function bbox(b: Bulk, x: number, y: number, z: number, w: number, h: number, d: number, col: THREE.Color | number, ry = 0, shade?: (x: number, y: number, z: number, ny: number) => number): void {
  const c = col instanceof THREE.Color ? col : C(col);
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), V(1, 1, 1));
  b.geo(new THREE.BoxGeometry(w, h, d), m, (out, px, py, pz, _nx, ny) => {
    out.copy(c);
    if (shade) out.multiplyScalar(shade(px, py, pz, ny));
  });
}

/** A log round from a to b (radius r, or rx across × ry up for hewn ones), bark along it, cut ends with growth rings. */
function round(bk: Bulks, a: THREE.Vector3, e: THREE.Vector3, r: number, col: THREE.Color, opts: { sides?: number; ry?: number; key?: string; ends?: boolean; endTint?: THREE.Color; moss?: number; seed?: number } = {}): void {
  const sides = opts.sides ?? 10;
  const ry = opts.ry ?? r;
  const key = opts.key ?? 'wlBark';
  const dir = e.clone().sub(a).normalize();
  const mossC = C(PAL.moss);
  const seed = opts.seed ?? a.x * 3.1 + a.z;
  // The tube's sides: ang 0 is along s1 (horizontal for a horizontal log), π/2 up.
  tube(bk.get(key), a, e, r, r, sides, sides >= 9 ? 2 : 1, (t, ang, out) => {
    out.copy(col).multiplyScalar(0.88 + (noise2(t * 4 + seed, ang, 81) - 0.5) * 0.24);
    const up = Math.sin(ang);
    if (opts.moss) out.lerp(mossC, Math.max(0, up) * opts.moss * (0.5 + noise2(t * 6 + seed, ang * 2, 82)));
  }, { shape: (ang) => (ry === r ? 1 : Math.sqrt(1 / (Math.cos(ang) ** 2 + (Math.sin(ang) * r / ry) ** 2))) });
  if (opts.ends === false) return;
  const end = opts.endTint ?? C(0xd8bd92);
  for (const [p, n] of [[a, dir.clone().negate()], [e, dir]] as const) {
    const g = new THREE.CircleGeometry(1, sides);
    // Orient the disc along the log, scaled to its section.
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
    const side = Math.abs(n.y) > 0.95 ? V(1, 0, 0) : UP.clone();
    const s1 = new THREE.Vector3().crossVectors(dir, side).normalize();
    const localX = V(1, 0, 0).applyQuaternion(q);
    const spin = Math.atan2(localX.clone().cross(s1).dot(n), localX.dot(s1));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), spin));
    const m = new THREE.Matrix4().compose(p.clone().addScaledVector(n, 0.004), q, V(r * 0.99, ry * 0.99, 1));
    bk.get('wlLogEnd').geo(g, m, (out) => out.copy(end), { ownUv: true });
  }
}

/** A boulder: a rounded box, each face cut into facets pushed in by noise, flat-shaded; moss on its top and north side. */
function boulder(bk: Bulks, b: Box, full: boolean): void {
  const seg = full ? 10 : 3.5;
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d, Math.max(2, Math.round(seg * b.w)), Math.max(2, Math.round(seg * b.h)), Math.max(2, Math.round(seg * b.d)));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // Rounded no more than the game's 0.1 m, so the box's corners stay within the 8 cm (0.1 × (√3 − 1) ≈ 0.073 m).
  const radius = Math.min(0.1, b.h * 0.12);
  const hx = b.w / 2;
  const hy = b.h / 2;
  const hz = b.d / 2;
  const seed = hash2(b.cx, b.cz, 83) * 50;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const inner = V(THREE.MathUtils.clamp(v.x, -hx + radius, hx - radius), THREE.MathUtils.clamp(v.y, -hy + radius, hy - radius), THREE.MathUtils.clamp(v.z, -hz + radius, hz - radius));
    const off = v.clone().sub(inner);
    if (off.lengthSq() > 1e-9) v.copy(inner).addScaledVector(off.normalize(), radius);
    // Push in up to 7.5 cm by noise, in the middle of a face only (never at its edges): the corners stay within the 8 cm.
    const dir = v.clone().normalize();
    const n = fbm2(v.x * 1.3 + seed, v.z * 1.3 + v.y * 1.1, 3, 84);
    const edge = THREE.MathUtils.clamp(Math.min(hx - Math.abs(v.x), hy - Math.abs(v.y), hz - Math.abs(v.z)) / 0.3, 0, 1);
    // Bedding planes: shallow horizontal ledges round the sides, so the stone reads as layered granite, not a box.
    const bed = Math.abs(Math.sin((v.y + hy) * (Math.PI / 0.42) + seed + v.x * 0.3));
    const side = 1 - Math.abs(dir.y);
    const push = n * 0.05 + THREE.MathUtils.smoothstep(bed, 0.75, 1) * 0.025 * side;
    v.addScaledVector(dir, -Math.min(0.075, push) * edge);
    // A slight lean of the strata: the top shifts, still inside the box.
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const col0 = C(PAL.rock[Math.floor(seed) % PAL.rock.length]!);
  const moss = C(PAL.moss);
  const mossB = C(PAL.mossBright);
  const m = new THREE.Matrix4().makeTranslation(b.cx, (b.y0 + b.y1) / 2, b.cz);
  const g0 = groundY(b.cx, b.cz);
  bk.get('wlRock').geo(geo, m, (out, x, y, z, nx, ny, nz) => {
    // Each facet lighter or darker (flat-shaded, so every face catches the light its own way), dark seams in the cracks,
    // a warm stain on the sides and a pale weathered top.
    const facet = 0.72 + hash2(Math.round(x * 5 + nx * 3), Math.round(y * 5 + ny * 3) + Math.round(z * 5 + nz * 3) * 7, 85) * 0.5;
    const seam = THREE.MathUtils.smoothstep(Math.abs(noise2(x * 2.4 + y, z * 2.4 - y, 89) - 0.5), 0, 0.06);
    out.copy(col0).multiplyScalar(facet * (0.62 + 0.38 * seam) * (1 + Math.max(0, ny) * 0.12));
    out.lerp(tmp.set(0x8a6f52), Math.max(0, 1 - Math.abs(ny)) * 0.22 * noise2(x * 0.9, z * 0.9 + y, 90));
    const mossy = THREE.MathUtils.smoothstep(ny, 0.35, 0.85) * THREE.MathUtils.smoothstep(noise2(x * 1.8, z * 1.8, 86), 0.3, 0.6) + Math.max(0, -nz) * 0.35 * THREE.MathUtils.smoothstep(noise2(x * 2, y * 2, 87), 0.45, 0.7);
    out.lerp(noise2(x * 3, z * 3, 88) > 0.5 ? mossB : moss, Math.min(0.9, mossy));
    // Darker at the foot, where it sits in the ground.
    out.multiplyScalar(0.65 + 0.35 * THREE.MathUtils.smoothstep(y - g0, 0, 0.45));
  }, { flat: true });
  // Moss cushions on the top, inside the block (one on Low).
  const r = rng(Math.floor(seed * 100));
  for (let i = 0; i < (full ? 3 : 1); i++) {
    const px = b.cx + (r() - 0.5) * b.w * 0.5;
    const pz = b.cz + (r() - 0.5) * b.d * 0.5;
    lump(bk.get('wlMoss'), V(px, b.y1 - 0.11, pz), 0.2 + r() * 0.12, full ? 1 : 0, r() * 9, (_p, o, out) => out.copy(mossB).multiplyScalar(0.7 + o.y * 0.3), V(1.4, 0.32, 1.1), 0.25);
  }
  // Scree at its foot: a few flat stones broken off it, under 0.2 m and within 0.4 m of the block (no new cover).
  const stones = full ? 9 : 4;
  for (let i = 0; i < stones; i++) {
    const a = r() * Math.PI * 2;
    // A point on the box's outline, pushed out a little.
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    const k = 1 / Math.max(Math.abs(ox) / hx, Math.abs(oz) / hz);
    const out = 0.06 + r() * 0.3;
    const px = b.cx + ox * (k + out);
    const pz = b.cz + oz * (k + out);
    const sz = 0.07 + r() * 0.1;
    const c = C(PAL.rock[i % PAL.rock.length]!).multiplyScalar(0.7 + r() * 0.25);
    lump(bk.get('wlRock'), V(px, groundY(px, pz) + sz * 0.15, pz), sz, 0, seed + i, (_p, o, outC) => outC.copy(c).multiplyScalar(0.7 + Math.max(0, o.y) * 0.4), V(1.2, 0.55, 1), 0.3);
  }
}

/** Courses of round logs at the two faces of a thick wall, earth between, a sod cap: the fort's cribs and the camps' barricades. */
function crib(bk: Bulks, b: Box, full: boolean, tape?: number): void {
  const along = b.w >= b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const th = along === 'x' ? b.d : b.w;
  const r = 0.15;
  const at = (s: number, o: number, y: number) => (along === 'x' ? V(b.cx + s, y, b.cz + o) : V(b.cx + o, y, b.cz + s));
  // Courses level with the world's (every 0.3 m), so neighbouring walls meet course to course.
  const k0 = Math.floor((b.y0 + 0.02) / (2 * r));
  const k1 = Math.floor((b.y1 - 0.02) / (2 * r));
  const col = C(PAL.bark);
  for (let k = k0; k <= k1; k++) {
    const y = Math.min(b.y1 - r, (k + 0.5) * 2 * r);
    if (y + r < groundY(b.cx, b.cz) - 0.3) continue;
    for (const o of [-th / 2 + r, th / 2 - r]) {
      const shade = 0.85 + hash2(k, o * 10 + b.cx, 89) * 0.3;
      const ext = ((k % 2) * 0.06);
      round(bk, at(-len / 2 + ext, o, y), at(len / 2 - ext, o, y), r, col.clone().multiplyScalar(shade), { sides: full ? 10 : 6, moss: k === k1 ? 0.5 : 0.1 });
    }
  }
  // Earth fill between the faces and a grassy sod cap on top.
  const gy = groundY(b.cx, b.cz);
  const fillW = th - 4 * r + 0.06;
  if (fillW > 0.05) {
    const [w, d] = along === 'x' ? [len - 0.02, fillW] : [fillW, len - 0.02];
    bbox(bk.get('wlRock'), b.cx, (gy - 0.2 + b.y1 - 0.06) / 2, b.cz, w, b.y1 - 0.06 - gy + 0.2, d, C(PAL.earth), 0, (_x, y, _z, ny) => (ny > 0.5 ? 0.85 : 0.6 + (y - gy) * 0.1));
    lump(bk.get('wlMoss'), V(b.cx, b.y1 - 0.08, b.cz), 0.5, full ? 1 : 0, b.cx, (_p, o, out) => out.set(PAL.sod).multiplyScalar(0.7 + o.y * 0.35), along === 'x' ? V(len * 0.9, 0.12, th * 0.42) : V(th * 0.42, 0.12, len * 0.9), 0.2);
  }
  // Posts at the ends and every couple of metres, inside the faces.
  const posts = Math.max(2, Math.round(len / 2.2) + 1);
  for (let i = 0; i < posts; i++) {
    const s = -len / 2 + 0.11 + (i / (posts - 1)) * (len - 0.22);
    for (const o of [-th / 2 + 0.11, th / 2 - 0.11]) {
      const p0 = at(s, o, gy - 0.3);
      const p1 = at(s, o, b.y1 - 0.02);
      tube(bk.get('wlBark'), p0, p1, 0.1, 0.09, full ? 8 : 5, 1, (_t, _a, out) => out.set(PAL.barkDark), { cap: true });
    }
    if (tape !== undefined && (i === 0 || i === posts - 1)) {
      // Team tape tied round the post tops: bold colour that reads at night.
      for (const o of [-th / 2 + 0.11, th / 2 - 0.11]) {
        const p = at(s, o, b.y1 - 0.3);
        tube(bk.get('wlSolid'), p.clone().add(V(0, -0.06, 0)), p.clone().add(V(0, 0.06, 0)), 0.115, 0.115, 10, 1, (_t, _a, out) => out.set(tape).multiplyScalar(1.15));
      }
    }
  }
}

/** The cabin's hewn logs: oval rounds with pale chinking between, notched at the corners (alternate courses cross). */
function cabinWall(bk: Bulks, b: Box, full: boolean): void {
  const along = b.w >= b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const th = along === 'x' ? b.d : b.w;
  const course = 0.3;
  const k0 = Math.floor((b.y0 + 0.01) / course);
  const k1 = Math.ceil((b.y1 - 0.01) / course) - 1;
  const gy = Math.min(groundY(b.x0, b.z0), groundY(b.x1, b.z1), groundY(b.cx, b.cz));
  const col = C(PAL.hewn);
  const corner = (cx: number, cz: number) => Math.abs(cx - CABIN.x0) < 0.25 || Math.abs(cx - CABIN.x1) < 0.25 ? Math.abs(cz - CABIN.z0) < 0.25 || Math.abs(cz - CABIN.z1) < 0.25 : false;
  for (let k = k0; k <= k1; k++) {
    const yl = Math.max(b.y0, k * course);
    const yh = Math.min(b.y1, (k + 1) * course);
    if (yh - yl < 0.05 || yh < gy - 0.2) continue;
    const y = (yl + yh) / 2;
    const ry = (yh - yl) / 2 - 0.012;
    const shade = 0.85 + hash2(k, b.cx + b.cz, 90) * 0.3;
    // Stones under the lowest logs: a dry-laid footing.
    if (yh < gy + 0.18) {
      bbox(bk.get('wlRock'), b.cx, y, b.cz, b.w, yh - yl, b.d, C(0x8a867e), 0, (x, yy, z) => 0.7 + hash2(Math.floor(x * 4), Math.floor(z * 4) + Math.floor(yy * 8), 91) * 0.4);
      continue;
    }
    // At a corner square, odd courses run the other way (the crossing wall's log, its cut end on this face).
    let s0 = -len / 2;
    let s1 = len / 2;
    const ends: number[] = [];
    for (const s of [-len / 2 + th / 2, len / 2 - th / 2]) {
      const cx = along === 'x' ? b.cx + s : b.cx;
      const cz = along === 'x' ? b.cz : b.cz + s;
      if (corner(cx, cz) && k % 2 === 1) {
        ends.push(s);
        if (s < 0) s0 += th;
        else s1 -= th;
      }
    }
    const P = (s: number, o = 0) => (along === 'x' ? V(b.cx + s, y, b.cz + o) : V(b.cx + o, y, b.cz + s));
    round(bk, P(s0), P(s1), th / 2 - 0.005, col.clone().multiplyScalar(shade), { ry, key: 'wlHewn', sides: full ? 12 : 8, ends: true, endTint: C(0xcfb48a) });
    for (const s of ends) {
      // The crossing log's stub across this wall's thickness, its end facing out.
      const a2 = along === 'x' ? V(b.cx + s, y, b.cz - th / 2) : V(b.cx - th / 2, y, b.cz + s);
      const e2 = along === 'x' ? V(b.cx + s, y, b.cz + th / 2) : V(b.cx + th / 2, y, b.cz + s);
      round(bk, a2, e2, th / 2 - 0.005, col.clone().multiplyScalar(shade * 0.95), { ry, key: 'wlHewn', sides: full ? 12 : 8, endTint: C(0xcfb48a) });
    }
    // Chinking: a pale band in the seam above this course, set back a little.
    if (yh < b.y1 - 0.02) {
      const [w, d] = along === 'x' ? [len, th - 0.06] : [th - 0.06, len];
      bbox(bk.get('wlSolid'), b.cx, yh, b.cz, w, 0.05, d, C(PAL.chink));
    }
  }
}

/** A fallen tree on the meadow: one big trunk on a mossy berm, a root plate at its foot, fungi along its side. */
function fallenTree(bk: Bulks, b: Box, full: boolean): void {
  const along = b.w >= b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const th = along === 'x' ? b.d : b.w;
  const flip = hash2(b.cx, b.cz, 92) > 0.5 ? 1 : -1;
  const ry = Math.min(0.52, (b.y1 - b.y0) / 2);
  const cy = b.y1 - ry;
  const P = (s: number, o = 0, y = cy) => (along === 'x' ? V(b.cx + s * flip, y, b.cz + o) : V(b.cx + o, y, b.cz + s * flip));
  const col = C(0x6a5544);
  const rootEnd = 0.28;
  round(bk, P(-len / 2 + rootEnd), P(len / 2 - 0.02), th / 2 + 0.01, col, { ry, sides: full ? 16 : 8, moss: 0.85, endTint: C(0xa58a66), seed: b.cx });
  // Berm of earth and moss under it, filling down to the ground.
  const gy = groundY(b.cx, b.cz);
  const berm = along === 'x' ? V(len * 0.48, Math.max(0.1, cy - ry - gy + 0.25), th * 0.48) : V(th * 0.48, Math.max(0.1, cy - ry - gy + 0.25), len * 0.48);
  lump(bk.get('wlMoss'), V(b.cx, gy, b.cz), 1, full ? 2 : 1, b.cz, (_p, o, out) => out.set(PAL.moss).multiplyScalar(0.55 + o.y * 0.35), berm, 0.15);
  // Root plate: a disc of earth and roots, filling the block's end.
  const rp = P(-len / 2 + rootEnd / 2, 0, (b.y0 + b.y1) / 2 + 0.05);
  const g = new THREE.CylinderGeometry(1, 1, 1, full ? 18 : 8, 1);
  g.rotateZ(Math.PI / 2);
  if (along === 'z') g.rotateY(Math.PI / 2);
  const s = along === 'x' ? V(rootEnd, (b.y1 - b.y0) / 2 - 0.02, th / 2) : V(th / 2, (b.y1 - b.y0) / 2 - 0.02, rootEnd);
  const m = new THREE.Matrix4().compose(rp, new THREE.Quaternion(), s);
  bk.get('wlRock').geo(g, m, (out, x, y, z) => out.set(PAL.earth).multiplyScalar(0.6 + noise2(x * 5 + z * 5, y * 5, 93) * 0.4));
  if (full) {
    // Root stubs splaying out of the plate, low (they stay under the trunk's height).
    const r = rng(Math.floor(b.cx * 100));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const from = rp.clone().add(along === 'x' ? V(0, Math.sin(a) * 0.35, Math.cos(a) * 0.3) : V(Math.cos(a) * 0.3, Math.sin(a) * 0.35, 0));
      const to = from.clone().add(along === 'x' ? V(-flip * (0.25 + r() * 0.35), Math.sin(a) * 0.2, Math.cos(a) * 0.08) : V(Math.cos(a) * 0.08, Math.sin(a) * 0.2, -flip * (0.25 + r() * 0.35)));
      to.y = Math.min(to.y, b.y1 - 0.05);
      to.y = Math.max(to.y, gy + 0.02);
      tube(bk.get('wlBark'), from, to, 0.06, 0.015, 5, 1, (_t, _a, out) => out.set(0x4a3a2c));
    }
    // Shelf fungi along the trunk's side.
    for (let i = 0; i < 5; i++) {
      const sAt = -len / 2 + 1.2 + r() * (len - 2);
      const side = r() > 0.5 ? 1 : -1;
      const p = P(sAt, side * (th / 2 + 0.005), cy - 0.05 + (r() - 0.5) * 0.3);
      const fg = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI, 0, Math.PI / 2);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, along === 'x' ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const sc = 0.07 + r() * 0.06;
      bk.get('wlSolid').geo(fg, new THREE.Matrix4().compose(p, q, V(sc * 1.2, sc * 0.35, sc)), (out, _x, py) => out.set(0xd8b37a).multiplyScalar(0.7 + Math.min(1, (py - p.y) / (sc * 0.35)) * 0.4));
    }
  }
}

/** Firewood: a stack of cut rounds between end posts, their ends (rings) on the long faces. */
function cordStack(bk: Bulks, b: Box, full: boolean, roof: boolean): void {
  const along = b.w >= b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const th = along === 'x' ? b.d : b.w;
  const gy = groundY(b.cx, b.cz);
  const top = roof ? b.y1 - 0.2 : b.y1;
  const r = rng(Math.floor(b.cx * 77 + b.cz));
  const rr = 0.12;
  const base = Math.max(gy - 0.04, b.y0);
  const rows = Math.max(2, Math.round((top - base - 2 * rr) / (rr * 1.72)) + 1);
  const pitch = (top - base - 2 * rr) / (rows - 1);
  const cols = Math.floor((len - 0.24) / (rr * 2.02));
  const P = (s: number, o: number, y: number) => (along === 'x' ? V(b.cx + s, y, b.cz + o) : V(b.cx + o, y, b.cz + s));
  for (let j = 0; j < rows; j++) {
    const y = base + rr + j * pitch;
    const off = (j % 2) * rr;
    for (let i = 0; i < cols - (j % 2); i++) {
      const s = -len / 2 + 0.12 + rr + off + i * rr * 2.02;
      const rad = rr * (0.85 + r() * 0.18);
      const jitter = (r() - 0.5) * 0.06;
      const shade = 0.8 + r() * 0.35;
      round(bk, P(s, -th / 2 + 0.01 + jitter, y), P(s, th / 2 - 0.01 + jitter, y), rad, C(PAL.bark).multiplyScalar(shade), { sides: full ? 9 : 5, endTint: C(0xdcc196).multiplyScalar(0.85 + r() * 0.25) });
    }
  }
  // End posts, and a little roof of shakes for the tall stack.
  for (const s of [-len / 2 + 0.06, len / 2 - 0.06]) {
    for (const o of [-th / 2 + 0.06, th / 2 - 0.06]) tube(bk.get('wlBark'), P(s, o, gy - 0.2), P(s, o, roof ? b.y1 - 0.16 : top - 0.02), 0.055, 0.05, 6, 1, (_t, _a, out) => out.set(PAL.barkDark), { cap: true });
  }
  if (roof) {
    const [w, d] = along === 'x' ? [len, th] : [th, len];
    bbox(bk.get('wlShingle'), b.cx, b.y1 - 0.09, b.cz, w - 0.01, 0.16, d - 0.01, C(PAL.shingle), 0, (_x, _y, _z, ny) => (ny > 0.5 ? 1 : 0.7));
  }
}

/** A crouch-height log pile: long logs stacked lengthways, bark out, ends showing at its short faces. */
function logPile(bk: Bulks, b: Box, full: boolean): void {
  const along = b.w >= b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  const th = along === 'x' ? b.d : b.w;
  const gy = groundY(b.cx, b.cz);
  const r = rng(Math.floor(b.cx * 31 + b.cz * 7));
  const base = Math.max(gy - 0.06, b.y0);
  const rows = Math.max(2, Math.round((b.y1 - base) / 0.32));
  const rad = (b.y1 - base) / rows / 2;
  const per = Math.max(1, Math.round(th / (rad * 2)));
  const radW = th / per / 2;
  const P = (s: number, o: number, y: number) => (along === 'x' ? V(b.cx + s, y, b.cz + o) : V(b.cx + o, y, b.cz + s));
  for (let j = 0; j < rows; j++) {
    const y = base + rad + j * rad * 2;
    for (let i = 0; i < per; i++) {
      const o = -th / 2 + radW + i * radW * 2;
      const rr = Math.min(rad, radW) * (0.94 + r() * 0.06);
      round(bk, P(-len / 2 + r() * 0.07, o, y), P(len / 2 - r() * 0.07, o, y), rr, C(PAL.bark).multiplyScalar(0.85 + r() * 0.3), { sides: full ? 12 : 7, moss: j === rows - 1 ? 0.35 : 0.1 });
    }
  }
  // Stakes at the ends hold the pile.
  for (const sgn of [-1, 1]) for (const o of [-th / 2 + 0.05, th / 2 - 0.05]) tube(bk.get('wlBark'), P(sgn * (len / 2 - 0.05), o, gy - 0.2), P(sgn * (len / 2 - 0.05), o, b.y1 - 0.03), 0.045, 0.04, 6, 1, (_t, _a, out) => out.set(PAL.barkDark), { cap: true });
}

/** The fort's hut: a log blockhouse with a plank door and a sod roof, all inside its block. */
function hut(bk: Bulks, b: Box, full: boolean): void {
  const r = 0.15;
  const gy = groundY(b.cx, b.cz);
  const k0 = Math.floor(Math.max(b.y0, gy - 0.2) / (2 * r));
  const k1 = Math.floor((b.y1 - 0.25) / (2 * r));
  for (let k = k0; k <= k1; k++) {
    const y = (k + 0.5) * 2 * r;
    const shade = 0.85 + hash2(k, b.cx, 94) * 0.3;
    const c = C(PAL.bark).multiplyScalar(shade);
    // Alternate courses overlap at the corners, as a notched blockhouse does.
    const ox = k % 2 ? 0 : r;
    const oz = k % 2 ? r : 0;
    for (const z of [b.z0 + r, b.z1 - r]) round(bk, V(b.x0 + ox, y, z), V(b.x1 - ox, y, z), r, c, { sides: full ? 10 : 6 });
    for (const x of [b.x0 + r, b.x1 - r]) round(bk, V(x, y, b.z0 + oz), V(x, y, b.z1 - oz), r, c, { sides: full ? 10 : 6 });
  }
  bbox(bk.get('wlRock'), b.cx, (gy + b.y1) / 2 - 0.1, b.cz, b.w - 0.5, b.y1 - gy - 0.2, b.d - 0.5, C(0x2a221a));
  // Roof slab and sod.
  bbox(bk.get('wlBoards'), b.cx, b.y1 - 0.16, b.cz, b.w - 0.02, 0.1, b.d - 0.02, C(PAL.boards));
  lump(bk.get('wlMoss'), V(b.cx, b.y1 - 0.12, b.cz), 1, full ? 2 : 1, 3, (_p, o, out) => out.set(PAL.sod).multiplyScalar(0.7 + o.y * 0.4), V(b.w * 0.48, 0.1, b.d * 0.48), 0.2);
  // A plank door on the side facing the fort's middle (west), flat on the logs.
  const doorX = b.x0 + 0.01;
  bbox(bk.get('wlBoards'), doorX, gy + 0.95, b.cz, 0.05, 1.8, 0.9, C(0x6b5038));
  bbox(bk.get('wlIron'), doorX - 0.02, gy + 1.0, b.cz + 0.32, 0.03, 0.05, 0.12, C(PAL.iron));
}

/** The field's fence: vertical boards on the field side of each section, rails and posts behind, moss creeping up. */
function fence(bk: Bulks, b: Box, full: boolean): void {
  const along = b.w >= b.d ? 'x' : 'z';
  const len = along === 'x' ? b.w : b.d;
  // The face towards the field.
  const inward = along === 'x' ? -Math.sign(b.cz) : -Math.sign(b.cx);
  const faceO = (along === 'x' ? b.d : b.w) / 2;
  const P = (s: number, o: number, y: number) => (along === 'x' ? V(b.cx + s, y, b.cz + o) : V(b.cx + o, y, b.cz + s));
  const boardW = full ? 0.16 : len;
  const n = Math.round(len / boardW);
  const top = b.y1;
  const moss = C(PAL.moss);
  for (let i = 0; i < n; i++) {
    const s0 = -len / 2 + (i / n) * len;
    const s1 = -len / 2 + ((i + 1) / n) * len;
    const mid = (s0 + s1) / 2;
    const p = P(mid, inward * (faceO - 0.04), 0);
    const g = Math.min(groundY(p.x, p.z), groundY(P(s0, inward * faceO, 0).x, P(s0, inward * faceO, 0).z)) - 0.15;
    const h = top - g - (full ? hash2(i, b.cx + b.cz, 95) * 0.04 : 0);
    const [w, d] = along === 'x' ? [s1 - s0 - (full ? 0.006 : 0), 0.06] : [0.06, s1 - s0 - (full ? 0.006 : 0)];
    const tone = 0.85 + hash2(i, b.cx * 3 + b.cz, 96) * 0.3;
    bbox(bk.get('wlBoards'), p.x, g + h / 2, p.z, w, h, d, C(PAL.boards).multiplyScalar(tone), 0, (x, y, z) => {
      void x;
      void z;
      return 1;
    });
    void moss;
  }
  // A capping rail along the top and posts every 2 m behind the boards.
  const cap = P(0, inward * (faceO - 0.08), top - 0.04);
  bbox(bk.get('wlBoards'), cap.x, cap.y, cap.z, along === 'x' ? len : 0.16, 0.08, along === 'x' ? 0.16 : len, C(0x7a6650));
  const posts = Math.max(2, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) {
    const s = -len / 2 + (i / posts) * len;
    const p = P(THREE.MathUtils.clamp(s, -len / 2 + 0.06, len / 2 - 0.06), inward * (faceO - 0.15), 0);
    const g = groundY(p.x, p.z) - 0.2;
    bbox(bk.get('wlBoards'), p.x, (g + top - 0.02) / 2, p.z, 0.12, top - 0.02 - g, 0.12, C(0x6a5843));
  }
}

/** Every block, drawn as what it is. */
export function buildBlocks(bk: Bulks, full: boolean): void {
  for (const blk of MAP.blocks) {
    const b = boxOf(blk);
    switch (blk.kind) {
      case 'boulder':
        boulder(bk, b, full);
        break;
      case 'fence':
        fence(bk, b, full);
        break;
      case 'log': {
        const thin = Math.min(b.w, b.d);
        const len = Math.max(b.w, b.d);
        if (inside(b, CABIN)) cabinWall(bk, b, full);
        else if (inside(b, FORT)) {
          if (thin > 2) hut(bk, b, full);
          else crib(bk, b, full);
        } else if (Math.abs(b.cx) > HALF_X - 12) crib(bk, b, full, b.cx < 0 ? PAL.blue : PAL.orange);
        else if (b.h > 1.5) cordStack(bk, b, full, true);
        else if (thin < 1 && len > 5) fallenTree(bk, b, full);
        else if (thin > 1.2 && len > 5) cordStack(bk, b, full, false);
        else logPile(bk, b, full);
        break;
      }
      default:
        break;
    }
  }
}

/**
 * The cabin's roof, porch and trim: a shake roof on a gable over the walls (its eaves above head height), board gable
 * ends, a stovepipe; a low board porch at the north door (flat, 0.12 m); plank doors swung open flat against the walls,
 * shutters on the faces; a board floor inside; antlers over the door. Returns where the porch lantern's arm meets the wall
 * and the stovepipe's top.
 */
export function buildCabin(bk: Bulks, full: boolean): { hook: THREE.Vector3; pipe: THREE.Vector3 } {
  const c = CABIN;
  const top = Math.max(...MAP.blocks.filter((b) => inside(boxOf(b), CABIN)).map((b) => b.center.y + b.size.y / 2));
  const eave = 0.55;
  const x0 = c.x0 - eave;
  const x1 = c.x1 + eave;
  const zm = (c.z0 + c.z1) / 2;
  const halfD = (c.z1 - c.z0) / 2 + eave;
  const pitch = 0.62;
  const rise = halfD * Math.tan(pitch);
  const ridge = top + 0.05 + rise;
  const slope = halfD / Math.cos(pitch);
  for (const side of [-1, 1]) {
    // One roof plane: shakes on a board deck.
    const m = new THREE.Matrix4().compose(V((x0 + x1) / 2, top + 0.05 + rise / 2, zm + (side * halfD) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(side * pitch, 0, 0)), V(1, 1, 1));
    bk.get('wlShingle').geo(new THREE.BoxGeometry(x1 - x0, 0.12, slope), m, (out, _x, _y, _z, _nx, ny) => out.set(PAL.shingle).multiplyScalar(ny > 0.3 ? 1 : 0.55));
  }
  bbox(bk.get('wlBoards'), (x0 + x1) / 2, ridge + 0.04, zm, x1 - x0 + 0.02, 0.1, 0.26, C(0x5e4a38));
  // Gable ends: vertical boards in the triangle.
  for (const gx of [c.x0 + 0.05, c.x1 - 0.05]) {
    const tri = new THREE.Shape([new THREE.Vector2(-halfD + eave, 0), new THREE.Vector2(halfD - eave, 0), new THREE.Vector2(0, rise * ((halfD - eave) / halfD))]);
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(gx - 0.04, top, zm);
    bk.get('wlBoards').geo(g, null, (out) => out.set(PAL.boards).multiplyScalar(0.85), { metres: 1.2 });
  }
  // Stovepipe through the south slope.
  const pipeX = c.x0 + 2.2;
  const pipeZ = zm + 1.6;
  const pipeTop = V(pipeX, ridge + 0.6, pipeZ);
  tube(bk.get('wlIron'), V(pipeX, ridge - 1.2, pipeZ), pipeTop, 0.09, 0.09, full ? 12 : 6, 1, (_t, _a, out) => out.set(0x3a3734));
  tube(bk.get('wlIron'), pipeTop, pipeTop.clone().add(V(0, 0.12, 0)), 0.16, 0.05, full ? 12 : 6, 1, (_t, _a, out) => out.set(0x2c2a28), { cap: true });
  // The porch: a low deck at the north door (flat, 0.12 m), a lean-to on knee braces above head height.
  const north = c.z0;
  const gy = groundY(5, north - 0.6);
  const deckZ0 = north - 1.35;
  for (let i = 0; i < 9; i++) {
    const z = deckZ0 + 0.075 + i * 0.15;
    bbox(bk.get('wlBoards'), 5, gy + 0.09, z, 3.6, 0.05, 0.14, C(0x8a7458).multiplyScalar(0.85 + hash2(i, 1, 97) * 0.3));
  }
  for (const x of [3.3, 5, 6.7]) bbox(bk.get('wlBoards'), x, gy + 0.03, deckZ0 + 0.67, 0.12, 0.12, 1.32, C(0x5a4834));
  // Doors: plank leaves swung open flat against the outside walls; frames round the openings, on the faces.
  const door = (x: number, z: number, alongX: boolean, out: number) => {
    const g = groundY(x, z);
    const [w, d] = alongX ? [1.15, 0.05] : [0.05, 1.15];
    bbox(bk.get('wlBoards'), x, g + 1.0, z, w, 1.95, d, C(0x6e5238), 0, (_x, y) => 0.85 + Math.sin(y * 9) * 0.03);
    // Iron strap hinges.
    for (const dy of [0.45, 1.55]) bbox(bk.get('wlIron'), x, g + dy, z + (alongX ? out * 0.03 : 0), alongX ? 0.9 : 0.02, 0.05, alongX ? 0.02 : 0.9, C(PAL.iron));
  };
  door(3.55, north - 0.03, true, -1);
  door(c.x1 + 0.03, 20.0 + 0.6, false, 1);
  // Window shutters, open against the wall either side of the south and west windows.
  const shutter = (x: number, z: number, alongX: boolean, y: number) => bbox(bk.get('wlBoards'), x, y, z, alongX ? 0.68 : 0.04, 0.78, alongX ? 0.04 : 0.68, C(0x4f6e5a));
  const sw = groundY(8.1, c.z1);
  shutter(8.1 - 1.1, c.z1 + 0.03, true, sw + 1.6);
  shutter(8.1 + 1.1, c.z1 + 0.03, true, sw + 1.6);
  const ww = groundY(c.x0, 18);
  shutter(c.x0 - 0.03, 18 - 1.4, false, ww + 1.6);
  shutter(c.x0 - 0.03, 18 + 1.4, false, ww + 1.6);
  // Board floor inside.
  const fy = groundY((c.x0 + c.x1) / 2, zm) + 0.015;
  for (let i = 0; i < Math.floor((c.z1 - c.z0 - 0.8) / 0.2); i++) bbox(bk.get('wlBoards'), (c.x0 + c.x1) / 2, fy, c.z0 + 0.5 + i * 0.2, c.x1 - c.x0 - 0.8, 0.03, 0.19, C(0x7a6248).multiplyScalar(0.85 + hash2(i, 2, 98) * 0.3));
  // Antlers over the north door (on the wall face, above head height).
  if (full) {
    const ax = 4.8;
    const ay = top - 0.35;
    const az = north - 0.04;
    bbox(bk.get('wlBoards'), ax, ay, az, 0.24, 0.3, 0.04, C(0x5a4532));
    for (const s of [-1, 1]) {
      const base = V(ax + s * 0.05, ay + 0.05, az - 0.05);
      const t1 = base.clone().add(V(s * 0.28, 0.32, -0.08));
      tube(bk.get('wlSolid'), base, t1, 0.02, 0.012, 5, 1, () => tmp.set(0xe2d6bd));
      tube(bk.get('wlSolid'), base.clone().lerp(t1, 0.5), base.clone().lerp(t1, 0.5).add(V(s * 0.02, 0.16, -0.05)), 0.012, 0.006, 4, 1, () => tmp.set(0xe2d6bd));
    }
  }
  // The lantern by the north door hangs from an iron arm off the wall, over the porch (no post in the way).
  const lamp = MAP.lights?.find((l) => l.kind === 'lantern' && l.position.x > c.x0 && l.position.x < c.x1 && l.position.z < c.z0);
  return { hook: V(lamp?.position.x ?? 6, 0, north - 0.01), pipe: pipeTop };
}

// --- Fires and lanterns -------------------------------------------------------------------------------------------

let flameTex: THREE.Texture | null = null;
let puffTex: THREE.Texture | null = null;
let glowTex: THREE.Texture | null = null;

/** A flame: a teardrop, white-gold at its root, orange, then red at its tip, soft-edged. */
export function flameTexture(): THREE.Texture {
  if (flameTex) return flameTex;
  flameTex = canvasTex(128, 256, (g) => {
    const img = g.createImageData(128, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 128; x++) {
        const u = (x / 127) * 2 - 1;
        const v = 1 - y / 255;
        const width = Math.pow(Math.max(0, 1 - v), 0.55) * Math.min(1, v * 6 + 0.25) * (1 + Math.sin(v * 9) * 0.05);
        const d = Math.abs(u) / Math.max(0.01, width);
        const a = Math.max(0, 1 - d) * Math.min(1, (1 - v) * 3);
        const core = Math.max(0, 1 - d * 1.6) * (1 - v * 0.8);
        const k = (y * 128 + x) * 4;
        img.data[k] = 255;
        img.data[k + 1] = 120 + 135 * Math.min(1, core * 1.4 + (1 - v) * 0.2);
        img.data[k + 2] = 30 + 200 * Math.max(0, core - 0.4);
        img.data[k + 3] = 255 * Math.pow(a, 1.2);
      }
    }
    g.putImageData(img, 0, 0);
  });
  return flameTex;
}

function puffTexture(): THREE.Texture {
  if (puffTex) return puffTex;
  puffTex = canvasTex(128, 128, (g) => {
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const u = x / 127 - 0.5;
        const v = y / 127 - 0.5;
        const r = Math.hypot(u, v) * 2;
        const n = fbm2(x * 0.06, y * 0.06, 3, 99);
        const a = Math.max(0, 1 - r) * (0.5 + n * 0.8);
        const k = (y * 128 + x) * 4;
        img.data[k] = 255;
        img.data[k + 1] = 255;
        img.data[k + 2] = 255;
        img.data[k + 3] = 255 * Math.min(1, a * a * 1.3);
      }
    }
    g.putImageData(img, 0, 0);
  });
  return puffTex;
}

/** A soft round glow (halos, fireflies, embers). */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  glowTex = canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  return glowTex;
}

function sprite(map: THREE.Texture, color: THREE.Color, additive: boolean, opacity = 1): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity, fog: !additive });
}

export interface FireFx {
  group: THREE.Group;
  /** Where each light sits (world), its kind and colour. */
  lights: { pos: THREE.Vector3; kind: 'fire' | 'lantern'; colour: number }[];
}

/** A camp fire's solids into the batches, its flames, embers and smoke as sprites into `fx`. */
function fire(bk: Bulks, fx: THREE.Group, l: MapLight, full: boolean): void {
  const { x, z } = l.position;
  const g = groundY(x, z);
  const r = rng(Math.floor(x * 100 + z));
  // Stone ring.
  const stones = full ? 11 : 8;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2 + r() * 0.2;
    const s = 0.13 + r() * 0.06;
    const sx = x + Math.cos(a) * 0.58;
    const sz = z + Math.sin(a) * 0.58;
    const c = V(sx, groundY(sx, sz) + s * 0.35, sz);
    lump(bk.get('wlRock'), c, s, full ? 1 : 0, i + x, (_p, o, out) => out.set(0x8a857b).multiplyScalar(0.55 + o.y * 0.35 + (o.x * Math.cos(a) + o.z * Math.sin(a)) * -0.1), V(1.2, 0.8, 1), 0.3);
  }
  // Ash bed and charred, glowing logs leaning into a cone.
  // The ash bed follows the ground (the east camp sits on the Knoll's flank).
  const ash = new THREE.CircleGeometry(0.56, full ? 18 : 10, 0, Math.PI * 2);
  ash.rotateX(-Math.PI / 2);
  const ap = ash.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < ap.count; i++) {
    const ax = x + ap.getX(i);
    const az = z + ap.getZ(i);
    const rr = Math.hypot(ap.getX(i), ap.getZ(i)) / 0.56;
    ap.setXYZ(i, ax, groundY(ax, az) + 0.035 * (1 - rr * rr) + 0.012, az);
  }
  ash.deleteAttribute('normal');
  bk.get('wlRock').geo(ash, null, (out, px, _py, pz) => out.set(0x2e2a27).multiplyScalar(0.7 + noise2(px * 6, pz * 6, 66) * 0.5));
  const logs = full ? 5 : 3;
  for (let i = 0; i < logs; i++) {
    const a = (i / logs) * Math.PI * 2 + 0.3;
    const fx0 = x + Math.cos(a) * 0.5;
    const fz0 = z + Math.sin(a) * 0.5;
    const from = V(fx0, groundY(fx0, fz0) + 0.06, fz0);
    const to = V(x + Math.cos(a) * 0.05, g + 0.34, z + Math.sin(a) * 0.05);
    tube(bk.get('wlBark'), from, to, 0.075, 0.055, full ? 8 : 6, 2, (t, _a, out) => out.set(0x2a211b).lerp(new THREE.Color(0x120c08), t));
    // The burning ends glow.
    const tip = from.clone().lerp(to, 0.82);
    tube(bk.get('wlGlow'), tip, to.clone().add(V(0, 0.01, 0)), 0.055, 0.04, 6, 1, (t, _a, out) => out.copy(PAL.ember).multiplyScalar(0.5 + t * 0.6), { cap: true });
  }
  // Embers in the ash: glowing chips.
  for (let i = 0; i < (full ? 26 : 8); i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.32;
    lump(bk.get('wlGlow'), V(x + Math.cos(a) * d, groundY(x + Math.cos(a) * d, z + Math.sin(a) * d) + 0.05, z + Math.sin(a) * d), 0.025 + r() * 0.03, 0, i, (_p, _o, out) => out.copy(PAL.ember).multiplyScalar(0.4 + r() * 0.9), V(1, 0.5, 1), 0.3);
  }
  // Flames: a few crossed teardrops, brightest at the root.
  const flame = flameTexture();
  const cards = full ? 7 : 4;
  for (let i = 0; i < cards; i++) {
    const h = 0.55 + r() * 0.5 - i * 0.04;
    // Bright enough to bloom at the root, not so bright the bloom swallows the flames' shape.
    const m = sprite(flame, new THREE.Color(2.4, 1.5, 0.8).multiplyScalar(full ? 0.75 : 1.1), true, 0.85);
    const s = new THREE.Sprite(m);
    s.center.set(0.5, 0.02);
    s.scale.set(h * 0.55, h, 1);
    s.position.set(x + (r() - 0.5) * 0.2, g + 0.12, z + (r() - 0.5) * 0.2);
    fx.add(s);
  }
  // A warm halo round it (reads as glow even without bloom).
  const halo = new THREE.Sprite(sprite(glowTexture(), new THREE.Color(1.0, 0.45, 0.15), true, full ? 0.16 : 0.55));
  halo.scale.set(2.2, 2.2, 1);
  halo.position.set(x, g + 0.45, z);
  fx.add(halo);
  // Rising embers.
  const emb = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(3.2, 1.3, 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  for (let i = 0; i < (full ? 26 : 8); i++) {
    const s = new THREE.Sprite(emb);
    const y = 0.6 + Math.pow(r(), 0.7) * 2.6;
    s.position.set(x + (r() - 0.5) * 0.25 * y, g + y, z + (r() - 0.5) * 0.25 * y);
    s.scale.setScalar(0.035 + r() * 0.03);
    fx.add(s);
  }
  // Smoke drifting up and away from the moon, cool grey-blue, warmer low down where the fire lights it.
  const puff = puffTexture();
  const puffs = full ? 12 : 5;
  for (let i = 0; i < puffs; i++) {
    const t = i / puffs;
    const y = 0.9 + t * 5.5;
    const drift = t * t * 2.2;
    const warm = Math.max(0, 1 - t * 2.2);
    const c = new THREE.Color(0.42, 0.46, 0.55).lerp(new THREE.Color(1.0, 0.6, 0.35), warm * 0.6);
    const s = new THREE.Sprite(sprite(puff, c, false, 0.22 * (1 - t * 0.7)));
    s.material.rotation = r() * Math.PI * 2;
    const sz = 0.6 + t * 2.4;
    s.scale.set(sz, sz, 1);
    s.position.set(x - drift * 0.8, g + y, z + drift * 0.4);
    fx.add(s);
  }
}

/** A lantern: iron frame and cap, four glowing panes, on a bracket to the block beside it or hung from `hook`. */
function lantern(bk: Bulks, fx: THREE.Group, l: MapLight, full: boolean, hook?: THREE.Vector3): void {
  const { x, y, z } = l.position;
  const w = 0.2;
  const h = 0.28;
  const iron = C(PAL.iron);
  const y0 = y - h / 2;
  const y1 = y + h / 2;
  bbox(bk.get('wlIron'), x, y0 + 0.015, z, w + 0.03, 0.03, w + 0.03, iron);
  // A pyramid cap and a ring.
  const cap = new THREE.ConeGeometry(w * 0.8, 0.11, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(x, y1 + 0.05, z);
  bk.get('wlIron').geo(cap, null, (out) => out.copy(iron), { flat: true });
  tube(bk.get('wlIron'), V(x, y1 + 0.1, z), V(x, y1 + 0.16, z), 0.03, 0.03, 8, 1, () => tmp.copy(iron));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bbox(bk.get('wlIron'), x + (sx * w) / 2, y, z + (sz * w) / 2, 0.022, h, 0.022, iron);
  // The panes: glowing (bloom), a warm candle-gold.
  for (const [dx, dz, ww, dd] of [[0, w / 2 - 0.005, w - 0.02, 0.01], [0, -w / 2 + 0.005, w - 0.02, 0.01], [w / 2 - 0.005, 0, 0.01, w - 0.02], [-w / 2 + 0.005, 0, 0.01, w - 0.02]] as const) {
    bbox(bk.get('wlGlow'), x + dx, y, z + dz, ww, h * 0.82, dd, PAL.pane, 0, (_x, yy) => 0.75 + (yy - y0) / h * 0.4);
  }
  // Mounting: a hook from the porch beam, a bracket to the block beside it, else a post.
  if (hook) {
    // A long iron arm from the wall with a diagonal stay, the lantern on a short hook at its end.
    const top = V(x, y1 + 0.24, z);
    const wall = V(hook.x, y1 + 0.24, hook.z);
    tube(bk.get('wlIron'), top, wall, 0.016, 0.016, 6, 1, () => tmp.copy(iron));
    tube(bk.get('wlIron'), V(x, y1 + 0.16, z), top, 0.008, 0.008, 4, 1, () => tmp.copy(iron));
    tube(bk.get('wlIron'), V(hook.x, y1 - 0.3, hook.z), top.clone().lerp(wall, 0.45), 0.012, 0.012, 4, 1, () => tmp.copy(iron));
    bbox(bk.get('wlIron'), hook.x, y1 - 0.03, hook.z - 0.01, 0.1, 0.62, 0.02, iron);
    tube(bk.get('wlIron'), top.clone().add(V(0, 0.02, 0)), top.clone().add(V(0, 0.09, -0.06)), 0.012, 0.006, 4, 1, () => tmp.copy(iron));
  } else {
    let best: { x: number; z: number; d: number } | null = null;
    for (const b of MAP.blocks) {
      if (y < b.center.y - b.size.y / 2 || y > b.center.y + b.size.y / 2) continue;
      const px = THREE.MathUtils.clamp(x, b.center.x - b.size.x / 2, b.center.x + b.size.x / 2);
      const pz = THREE.MathUtils.clamp(z, b.center.z - b.size.z / 2, b.center.z + b.size.z / 2);
      const d = Math.hypot(px - x, pz - z);
      if (d <= 0.5 && (!best || d < best.d)) best = { x: px, z: pz, d };
    }
    if (best) {
      const top = V(x, y1 + 0.2, z);
      tube(bk.get('wlIron'), top, V(best.x, y1 + 0.2, best.z), 0.015, 0.015, 6, 1, () => tmp.copy(iron));
      tube(bk.get('wlIron'), V(x, y1 + 0.16, z), top, 0.008, 0.008, 4, 1, () => tmp.copy(iron));
      // A diagonal stay under the arm.
      tube(bk.get('wlIron'), V(best.x, y1 - 0.12, best.z), V((x + best.x) / 2, y1 + 0.2, (z + best.z) / 2), 0.01, 0.01, 4, 1, () => tmp.copy(iron));
    } else {
      const g = groundY(x, z);
      tube(bk.get('wlBark'), V(x, g - 0.05, z), V(x, y0, z), 0.045, 0.04, 6, 1, () => tmp.set(0x5a4a3a), { cap: true });
    }
  }
  const halo = new THREE.Sprite(sprite(glowTexture(), new THREE.Color(1.0, 0.65, 0.3), true, full ? 0.4 : 0.6));
  halo.scale.set(1.3, 1.3, 1);
  halo.position.set(x, y, z);
  fx.add(halo);
}

/** The fires and lanterns of the map's lights. */
export function buildLightFixtures(bk: Bulks, full: boolean, hook: THREE.Vector3): FireFx {
  const group = new THREE.Group();
  const lights: FireFx['lights'] = [];
  for (const l of MAP.lights ?? []) {
    const pos = V(l.position.x, l.position.y, l.position.z);
    if (l.kind === 'fire') {
      fire(bk, group, l, full);
      lights.push({ pos, kind: 'fire', colour: l.colour });
    } else if (l.kind === 'lantern') {
      const atCabin = Math.abs(l.position.x - hook.x) < 0.01 && Math.abs(l.position.z - hook.z) < 1.5;
      lantern(bk, group, l, full, atCabin ? hook : undefined);
      lights.push({ pos, kind: 'lantern', colour: l.colour });
    }
  }
  return { group, lights };
}
