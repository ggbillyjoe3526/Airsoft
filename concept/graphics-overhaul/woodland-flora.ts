import * as THREE from 'three';
import type { Kit } from './kit';
import { splatAt } from './woodland-ground';
import { MOON_DIR } from './woodland-sky';
import { lump, tube } from './woodland-trees';
import { Bulk, Bulks, groundY, HALF_X, HALF_Z, hash2, inBlock, inBush, laneDistance, MAP, noise2, rng, UP, V } from './woodland-util';

/**
 * Woodland's undergrowth, all set dressing: nothing here collides, and nothing outside a bush or the woods is taller
 * than 0.3 m except soft grass. The map's bushes (MapData.foliage, which hide players and let BBs through) are drawn as
 * several species filling their own ellipsoids: hazel, bramble with berries, juniper, holly. Then the ground cover:
 * dense instanced grass blades round the view on Ultra, tall grass tufts, bracken and ferns in the woods and on the creek
 * banks, meadow flowers and bluebells, mushrooms at trunk feet and on logs, leaf litter, pine cones, sticks, cut stumps
 * and pebbles. In the game the grass and ferns would sway in a vertex shader; here they are still.
 */

const tmp = new THREE.Color();
const C = (h: number) => new THREE.Color(h);

/** Where low dressing may go: on the field (or just outside), not in a block, the creek bed's middle or a camp fire. */
function free(x: number, z: number, pad = 0.15): boolean {
  if (inBlock(x, z, pad)) return false;
  for (const l of MAP.lights ?? []) if (l.kind === 'fire' && Math.hypot(x - l.position.x, z - l.position.z) < 1.1) return false;
  return true;
}

/** Soft taller things (ferns, tufts) keep off the lanes' lines and out of the camps, fort and cabin. */
function offLane(x: number, z: number, gap: number): boolean {
  if (laneDistance(x, z) < gap) return false;
  if (Math.abs(x) > HALF_X - 11.5 && Math.abs(z) < 14) return false;
  if (x > 33.5 && x < 49 && z > -15 && z < 1) return false;
  if (x > 1.5 && x < 11 && z > 12.5 && z < 22.5) return false;
  return true;
}

// --- Bushes --------------------------------------------------------------------------------------------------------

type BushKind = 'hazel' | 'bramble' | 'juniper' | 'holly';
const BUSH_GREENS: Record<BushKind, number[]> = {
  hazel: [0x5b8a35, 0x6a9a3c, 0x4f7d2f],
  bramble: [0x3f6a2c, 0x4a7532, 0x365f28],
  juniper: [0x3d6a52, 0x45745a],
  holly: [0x2f5a2c, 0x356530],
};

/** One leaf card (a small diamond, double-sided) at p, facing roughly n. */
function leafCard(b: Bulk, p: THREE.Vector3, n: THREE.Vector3, size: number, col: THREE.Color, spin: number): void {
  const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? V(1, 0, 0) : UP).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1);
  const a = t1.clone().multiplyScalar(Math.cos(spin)).addScaledVector(t2, Math.sin(spin));
  const c = t1.clone().multiplyScalar(-Math.sin(spin)).addScaledVector(t2, Math.cos(spin));
  const nn = n.clone().addScaledVector(UP, 0.4).normalize();
  const base = b.nv;
  const pts = [p.clone().addScaledVector(a, -size), p.clone().addScaledVector(c, size * 0.42), p.clone().addScaledVector(a, size * 1.1), p.clone().addScaledVector(c, -size * 0.42)];
  const shades = [0.8, 1, 1.12, 0.95];
  pts.forEach((q, i) => b.v(q.x, q.y, q.z, nn.x, nn.y, nn.z, col.r * shades[i]!, col.g * shades[i]!, col.b * shades[i]!));
  b.tri(base, base + 1, base + 2);
  b.tri(base, base + 2, base + 3);
}

function bushKind(x: number, z: number): BushKind {
  const h = hash2(x, z, 101);
  // Holly and juniper in the woods, bramble on the creek banks, hazel on the meadow.
  if (z < -20) return h < 0.45 ? 'holly' : h < 0.75 ? 'juniper' : 'hazel';
  if (z > 20) return h < 0.6 ? 'bramble' : 'hazel';
  return h < 0.55 ? 'hazel' : h < 0.8 ? 'bramble' : 'juniper';
}

/** The map's bushes: each fills its ellipsoid (what hides you), its species by where it grows. */
export function buildBushes(bk: Bulks, full: boolean): void {
  for (const bush of MAP.foliage ?? []) {
    const kind = bushKind(bush.x, bush.z);
    const r = rng(Math.floor(hash2(bush.x, bush.z, 102) * 1e6));
    const pal = BUSH_GREENS[kind];
    const cy = bush.y + bush.height / 2;
    const rad = bush.radius;
    const hh = bush.height / 2;
    const key = kind === 'juniper' ? 'wlNeedle' : 'wlLeaf';
    const b = bk.get(key);
    const centre = V(bush.x, cy, bush.z);
    const lumps = full ? 7 : 3;
    // Core lumps filling the ellipsoid, the biggest low and in the middle.
    for (let i = 0; i < lumps; i++) {
      const a = (i / lumps) * Math.PI * 2 + r() * 0.6;
      const off = i === 0 ? 0 : 0.42;
      const yy = i === 0 ? 0 : (r() - 0.35) * 0.6;
      const c = V(bush.x + Math.cos(a) * rad * off, cy + yy * hh, bush.z + Math.sin(a) * rad * off);
      const lr = i === 0 ? 0.78 : 0.5 + r() * 0.15;
      const col0 = C(pal[i % pal.length]!);
      const s = kind === 'juniper' ? V(rad * lr, hh * (lr + 0.25), rad * lr) : V(rad * lr, hh * lr, rad * lr);
      lump(b, c, 1, full ? 2 : 1, i + bush.x, (p, o, out) => {
        const up = THREE.MathUtils.clamp((p.y - bush.y) / bush.height, 0, 1);
        out.copy(col0).multiplyScalar(0.5 + up * 0.45 + Math.max(0, o.dot(MOON_DIR)) * 0.15);
      }, s, kind === 'bramble' ? 0.45 : 0.32);
    }
    if (!full) continue;
    // Leaf cards over the surface break up its outline.
    const cards = Math.round((kind === 'juniper' ? 160 : 300) * rad * hh);
    const cb = bk.get('wlPlant');
    for (let i = 0; i < cards; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const o = V(s * Math.cos(th), u, s * Math.sin(th));
      if (o.y < -0.5) continue;
      const reach = 0.96 + r() * 0.12;
      const p = centre.clone().add(V(o.x * rad * reach, o.y * hh * reach, o.z * rad * reach));
      const up = THREE.MathUtils.clamp((p.y - bush.y) / bush.height, 0, 1);
      const col0 = C(pal[Math.floor(r() * pal.length)]!).multiplyScalar(0.62 + up * 0.5 + Math.max(0, o.dot(MOON_DIR)) * 0.2);
      const size = kind === 'holly' ? 0.06 : kind === 'juniper' ? 0.05 : 0.075;
      leafCard(cb, p, o, size * (0.8 + r() * 0.5), col0, r() * Math.PI);
    }
    if (kind === 'bramble' || kind === 'holly') {
      // Berries: glossy red (holly) or dark purple-black with a few red (bramble).
      const gb = bk.get('wlGloss');
      for (let i = 0; i < (kind === 'holly' ? 40 : 30); i++) {
        const u = r() * 1.6 - 0.6;
        const th = r() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        const p = centre.clone().add(V(s * Math.cos(th) * rad * 0.97, u * hh * 0.97, s * Math.sin(th) * rad * 0.97));
        const c = kind === 'holly' ? C(0xd02a24) : r() > 0.7 ? C(0xb02a3a) : C(0x2a1630);
        lump(gb, p, 0.022, 0, i, (_p, o, out) => out.copy(c).multiplyScalar(0.7 + o.y * 0.35), V(1, 1, 1), 0.05);
      }
    }
    if (kind === 'bramble') {
      // Arching canes out of the bush, low over the ground.
      const cane = bk.get('wlPlant');
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2;
        const p0 = V(bush.x + Math.cos(a) * rad * 0.6, cy + hh * 0.3, bush.z + Math.sin(a) * rad * 0.6);
        const p1 = V(bush.x + Math.cos(a) * rad * 1.05, cy + hh * 0.5, bush.z + Math.sin(a) * rad * 1.05);
        const p2 = V(bush.x + Math.cos(a) * rad * 1.15, groundY(bush.x + Math.cos(a) * rad * 1.15, bush.z + Math.sin(a) * rad * 1.15) + 0.1, bush.z + Math.sin(a) * rad * 1.15);
        tube(cane, p0, p1, 0.012, 0.01, 4, 1, () => tmp.set(0x5a3a2c));
        tube(cane, p1, p2, 0.01, 0.006, 4, 1, () => tmp.set(0x5a3a2c));
      }
    }
  }
}

// --- Grass ---------------------------------------------------------------------------------------------------------

/** A blade of grass, 1 m tall and 1 m wide before scaling: a tapered, curving strip, dark at its root, light at its tip. */
function bladeGeo(bend: number, segs: number, width = 1): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = width * (1 - t * 0.92) * 0.5;
    const z = bend * t * t;
    const y = t * (1 - bend * 0.3 * t);
    const k = 0.32 + 0.68 * Math.pow(t, 0.8);
    for (const s of [-1, 1]) {
      pos.push(s * w, y, z);
      // Normals lean up so a sward lights like the ground under it.
      const n = V(0, 0.95, -0.18 - bend * 0.15).normalize();
      nrm.push(n.x, n.y, n.z);
      col.push(k * (0.95 + t * 0.12), k, k * (0.85 - t * 0.1));
    }
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  return g;
}

export interface GrassOpts {
  /** The camera's ground point: blades are densest round it and only where it looks. */
  eye: THREE.Vector3;
  look: THREE.Vector3;
  halfFov: number;
  /** Blades per m² right by the eye, and the reach (m). */
  density: number;
  reach: number;
}

/**
 * Dense grass blades on Ultra, instanced (three bent shapes): only round the view and in the view's direction, thinning
 * with distance, as a game draws its near grass. Where the ground is litter or earth they thin out to a few strays.
 * Returns the blade count.
 */
/** The camp fires, and how far round them the grass is trampled bare, then short and sparse (m). */
const CAMPS = (MAP.lights ?? []).filter((l) => l.kind === 'fire').map((l) => ({ x: l.position.x, z: l.position.z }));
const CAMP_BARE = 2.4;
const CAMP_SHORT = 4.5;

export function buildGrassBlades(kit: Kit, group: THREE.Group, o: GrassOpts): number {
  const r = rng(4242);
  const shapes = [bladeGeo(0.18, 4), bladeGeo(0.38, 4), bladeGeo(0.08, 3, 1.5)];
  const mats: THREE.Matrix4[][] = [[], [], []];
  const cols: THREE.Color[][] = [[], [], []];
  const w: [number, number, number, number] = [0, 0, 0, 0];
  const dir = Math.atan2(o.look.z - o.eye.z, o.look.x - o.eye.x);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  // Yellower than the day sward: the blue moonlight turns them teal-green.
  const greens = [C(0x5b8a32), C(0x669640), C(0x6f9a3c), C(0x4f7e2c), C(0x7a9a40)];
  // Sample the view's wedge in rings.
  let count = 0;
  for (let d = 0.3; d < o.reach; d += Math.max(0.25, d * 0.06)) {
    const ring = Math.max(0.25, d * 0.06);
    const dens = o.density / (1 + (d / 6) ** 2);
    const arc = (o.halfFov + 0.25) * 2 * d;
    const n = Math.round(dens * arc * ring);
    for (let i = 0; i < n; i++) {
      const a = dir + (r() * 2 - 1) * (o.halfFov + 0.25);
      const dd = d + r() * ring;
      const x = o.eye.x + Math.cos(a) * dd;
      const z = o.eye.z + Math.sin(a) * dd;
      if (Math.abs(x) > HALF_X + 3 || Math.abs(z) > HALF_Z + 3) continue;
      splatAt(x, z, w);
      // Grass grows on grass; a few strays on litter and earth; none on gravel.
      const clump = noise2(x * 1.3, z * 1.3, 103);
      const keep = w[0] * (0.55 + clump * 0.7) + w[1] * 0.08 + w[2] * 0.04;
      if (r() > keep) continue;
      if (!free(x, z, 0.02)) continue;
      // Trampled round the camp fires: bare by the ring, short and sparse further out.
      const camp = CAMPS.reduce((m, c) => Math.min(m, Math.hypot(x - c.x, z - c.z)), Infinity);
      if (camp < CAMP_BARE || (camp < CAMP_SHORT && r() > (camp - CAMP_BARE) / (CAMP_SHORT - CAMP_BARE))) continue;
      const y = groundY(x, z);
      const tall = 0.08 + clump * 0.14 + r() * 0.08 + (inBlock(x, z, 0.5) ? 0.12 : 0);
      const k = Math.floor(r() * 3);
      e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.4, 'YXZ');
      q.setFromEuler(e);
      mats[k]!.push(new THREE.Matrix4().compose(V(x, y - 0.01, z), q, V(0.012 + r() * 0.01, tall, tall)));
      // As dark as the sward the ground paints (its detail texture shades it about this much), a little variation.
      const c = greens[Math.floor(r() * greens.length)]!.clone().multiplyScalar(0.5 + r() * 0.22);
      // Drier, yellower blades in the high patches.
      if (clump > 0.7) c.lerp(C(0x9a9a4c), (clump - 0.7) * 1.5);
      cols[k]!.push(c);
      count++;
    }
  }
  const mat = kit.mat('wlBlade');
  shapes.forEach((g, k) => {
    const list = mats[k]!;
    if (!list.length) return;
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, cols[k]![i]!);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.receiveShadow = true;
    im.castShadow = false;
    im.name = 'wlBlade';
    group.add(im);
  });
  return count;
}

/** A tuft of longer grass: blades fanning from one root. */
export function tuft(b: Bulk, x: number, z: number, h: number, blades: number, r: () => number, col: THREE.Color): void {
  const y = groundY(x, z);
  for (let i = 0; i < blades; i++) {
    const a = r() * Math.PI * 2;
    const lean = 0.15 + r() * 0.45;
    const hh = h * (0.6 + r() * 0.5);
    const tip = V(x + Math.cos(a) * hh * lean, y + hh * (1 - lean * 0.3), z + Math.sin(a) * hh * lean);
    const mid = V(x + Math.cos(a) * hh * lean * 0.35, y + hh * 0.55, z + Math.sin(a) * hh * lean * 0.35);
    const side = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.012 + r() * 0.006);
    const base = b.nv;
    const n = V(Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3).normalize();
    const c0 = col.clone().multiplyScalar(0.35);
    const c1 = col.clone().multiplyScalar(0.8 + r() * 0.2);
    const c2 = col.clone().multiplyScalar(1.05).lerp(C(0xb4b060), 0.25);
    const root = V(x, y - 0.02, z);
    const pts: [THREE.Vector3, number, THREE.Color][] = [[root, 1, c0], [mid, 0.75, c1], [tip, 0.05, c2]];
    for (const [p, wk, c] of pts) {
      b.v(p.x - side.x * wk, p.y, p.z - side.z * wk, n.x, n.y, n.z, c.r, c.g, c.b);
      b.v(p.x + side.x * wk, p.y, p.z + side.z * wk, n.x, n.y, n.z, c.r, c.g, c.b);
    }
    b.tri(base, base + 1, base + 2);
    b.tri(base + 1, base + 3, base + 2);
    b.tri(base + 2, base + 3, base + 4);
    b.tri(base + 3, base + 5, base + 4);
  }
}

// --- Ferns, flowers, mushrooms --------------------------------------------------------------------------------------

/** A fern: fronds arching out of a crown, each a stem with paired leaflets shrinking to its tip. */
export function fern(b: Bulk, x: number, z: number, size: number, r: () => number, full: boolean, bracken = false): void {
  const y = groundY(x, z);
  const fronds = full ? 6 + Math.floor(r() * 4) : 4;
  const green = C(bracken ? 0x5e8a2e : 0x4f8a3a).multiplyScalar(0.85 + r() * 0.25);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + r() * 0.5;
    const len = size * (0.75 + r() * 0.4);
    const rise = 0.55 + r() * 0.35;
    const out = V(Math.cos(a), 0, Math.sin(a));
    const side = V(-out.z, 0, out.x);
    // Points along the frond: up from the crown, arching over.
    const at = (t: number) => V(x, y, z).addScaledVector(out, len * t).add(V(0, len * rise * Math.sin(t * Math.PI * 0.8) * (1 - t * 0.3), 0));
    const steps = full ? 9 : 3;
    for (let i = 0; i < steps; i++) {
      const t0 = (i + 0.3) / steps;
      const p = at(t0);
      const pn = at(Math.min(1, t0 + 0.08));
      const fwd = pn.clone().sub(p).normalize();
      const leaf = len * 0.32 * Math.sin((1 - t0) * Math.PI * 0.6 + 0.25) * (full ? 1 : 1.4);
      const c = green.clone().multiplyScalar(0.55 + t0 * 0.6);
      for (const s of [-1, 1]) {
        const tip = p.clone().addScaledVector(side, s * leaf).addScaledVector(fwd, leaf * 0.35).add(V(0, -leaf * 0.25, 0));
        const w = fwd.clone().multiplyScalar(len / steps * 0.5);
        const base = b.nv;
        const n = V(0, 1, 0).addScaledVector(side, s * 0.2).normalize();
        b.v(p.x - w.x * 0.5, p.y, p.z - w.z * 0.5, n.x, n.y, n.z, c.r * 0.8, c.g * 0.8, c.b * 0.8);
        b.v(p.x + w.x, p.y + w.y, p.z + w.z, n.x, n.y, n.z, c.r, c.g, c.b);
        b.v(tip.x, tip.y, tip.z, n.x, n.y, n.z, c.r * 1.15, c.g * 1.15, c.b * 1.05);
        b.tri(base, base + 1, base + 2);
      }
    }
    if (full) {
      // The stem.
      const p0 = at(0);
      const p1 = at(0.5);
      const p2 = at(1);
      const sb = b.nv;
      const sc = green.clone().multiplyScalar(0.5);
      for (const p of [p0, p1, p2]) {
        b.v(p.x - side.x * 0.006, p.y, p.z - side.z * 0.006, 0, 1, 0, sc.r, sc.g, sc.b);
        b.v(p.x + side.x * 0.006, p.y, p.z + side.z * 0.006, 0, 1, 0, sc.r, sc.g, sc.b);
      }
      b.tri(sb, sb + 1, sb + 2);
      b.tri(sb + 1, sb + 3, sb + 2);
      b.tri(sb + 2, sb + 3, sb + 4);
      b.tri(sb + 3, sb + 5, sb + 4);
    }
  }
}

/** A small flower: a stem and a star of petals round a centre. */
function flower(b: Bulk, x: number, z: number, h: number, petal: THREE.Color, centre: THREE.Color, r: () => number, full: boolean): void {
  const y = groundY(x, z);
  const top = V(x + (r() - 0.5) * 0.04, y + h, z + (r() - 0.5) * 0.04);
  const stem = C(0x4a7a2c);
  const sb = b.nv;
  b.v(x - 0.004, y, z, 0, 1, 0, stem.r * 0.5, stem.g * 0.5, stem.b * 0.5);
  b.v(x + 0.004, y, z, 0, 1, 0, stem.r * 0.5, stem.g * 0.5, stem.b * 0.5);
  b.v(top.x, top.y, top.z, 0, 1, 0, stem.r, stem.g, stem.b);
  b.tri(sb, sb + 1, sb + 2);
  const petals = full ? 6 : 4;
  const ps = 0.025 + r() * 0.015;
  const tilt = V((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize();
  const t1 = new THREE.Vector3().crossVectors(tilt, V(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(tilt, t1);
  const cb = b.v(top.x, top.y + 0.004, top.z, tilt.x, tilt.y, tilt.z, centre.r, centre.g, centre.b);
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / petals * 0.5;
    const a2 = a0 - (Math.PI * 2) / petals * 0.5;
    const p = (a: number, s: number) => top.clone().addScaledVector(t1, Math.cos(a) * s).addScaledVector(t2, Math.sin(a) * s);
    const pa = p(a0, ps);
    const pb = p(a1, ps * 0.45);
    const pc = p(a2, ps * 0.45);
    const k = b.v(pa.x, pa.y, pa.z, tilt.x, tilt.y, tilt.z, petal.r, petal.g, petal.b);
    const kb = b.v(pb.x, pb.y, pb.z, tilt.x, tilt.y, tilt.z, petal.r * 0.85, petal.g * 0.85, petal.b * 0.85);
    const kc = b.v(pc.x, pc.y, pc.z, tilt.x, tilt.y, tilt.z, petal.r * 0.85, petal.g * 0.85, petal.b * 0.85);
    b.tri(cb, kb, k);
    b.tri(cb, k, kc);
  }
}

/** A bluebell: an arching stem with nodding bells down one side. */
function bluebell(b: Bulk, x: number, z: number, h: number, r: () => number): void {
  const y = groundY(x, z);
  const a = r() * Math.PI * 2;
  const top = V(x + Math.cos(a) * h * 0.3, y + h, z + Math.sin(a) * h * 0.3);
  const stem = C(0x3f6a2c);
  const sb = b.nv;
  b.v(x - 0.003, y, z, 0, 1, 0, stem.r * 0.5, stem.g * 0.5, stem.b * 0.5);
  b.v(x + 0.003, y, z, 0, 1, 0, stem.r * 0.5, stem.g * 0.5, stem.b * 0.5);
  b.v(top.x, top.y, top.z, 0, 1, 0, stem.r, stem.g, stem.b);
  b.tri(sb, sb + 1, sb + 2);
  const bell = C(0x5a5ad8).lerp(C(0x8a5ae0), r());
  for (let i = 0; i < 4; i++) {
    const t = 0.55 + i * 0.12;
    const p = V(x, y, z).lerp(top, t).add(V(Math.cos(a) * 0.015, -0.025, Math.sin(a) * 0.015));
    const s = 0.012;
    const k0 = b.v(p.x, p.y + s, p.z, 0, 1, 0, bell.r, bell.g, bell.b);
    const k1 = b.v(p.x - s, p.y - s, p.z, 0, 0.6, 0.6, bell.r * 0.8, bell.g * 0.8, bell.b * 0.8);
    const k2 = b.v(p.x + s, p.y - s, p.z, 0, 0.6, 0.6, bell.r * 0.8, bell.g * 0.8, bell.b * 0.8);
    const k3 = b.v(p.x, p.y - s, p.z + s, 0.6, 0.6, 0, bell.r * 0.9, bell.g * 0.9, bell.b * 0.9);
    b.tri(k0, k1, k2);
    b.tri(k0, k2, k3);
    b.tri(k0, k3, k1);
  }
}

/** A cluster of mushrooms: fly agarics (red, white spots), brown caps, or a clump of small pale ones. */
export function mushrooms(bk: Bulks, x: number, z: number, kind: 'agaric' | 'brown' | 'pale', r: () => number, full: boolean, y?: number): void {
  const n = kind === 'pale' ? 6 + Math.floor(r() * 5) : 2 + Math.floor(r() * 3);
  const solid = bk.get('wlSolid');
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * (kind === 'pale' ? 0.18 : 0.35);
    const pz = z + (r() - 0.5) * (kind === 'pale' ? 0.18 : 0.35);
    const g = y ?? groundY(px, pz);
    const s = kind === 'agaric' ? 0.05 + r() * 0.035 : kind === 'brown' ? 0.04 + r() * 0.03 : 0.012 + r() * 0.01;
    const h = s * (kind === 'pale' ? 3.2 : 1.9) * (0.8 + r() * 0.4);
    tube(solid, V(px, g - 0.01, pz), V(px, g + h, pz), s * 0.32, s * 0.26, full ? 7 : 4, 1, () => tmp.set(0xeae2d0));
    const capCol = kind === 'agaric' ? C(0xd8281c) : kind === 'brown' ? C(0x8a5530) : C(0xd9c9a2);
    const cap = new THREE.SphereGeometry(1, full ? 12 : 6, full ? 6 : 3, 0, Math.PI * 2, 0, Math.PI / 2);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4));
    bk.get('wlGloss').geo(cap, new THREE.Matrix4().compose(V(px, g + h - s * 0.15, pz), tilt, V(s, s * (kind === 'agaric' ? 0.6 : 0.7), s)), (out, _x, py) => out.copy(capCol).multiplyScalar(0.7 + Math.min(1, (py - g - h + s * 0.15) / (s * 0.6)) * 0.4));
    if (kind === 'agaric' && full) {
      // White warts on the red cap.
      for (let k = 0; k < 7; k++) {
        const a = r() * Math.PI * 2;
        const el = 0.35 + r() * 0.9;
        const d = V(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.6, Math.sin(a) * Math.cos(el)).applyQuaternion(tilt);
        lump(solid, V(px, g + h - s * 0.15, pz).addScaledVector(d, s * 1.0), s * 0.12, 0, k, (_p, _o, out) => out.set(0xf4f0e6), V(1, 0.5, 1), 0.1);
      }
    }
  }
}

// --- The scatter ----------------------------------------------------------------------------------------------------

export interface ScatterOpts {
  full: boolean;
  /** The view's eye: small things are scattered densely only near it. */
  eye: THREE.Vector3;
  /** How far the near scatter reaches (m), and a multiplier on the field-wide counts. */
  nearReach: number;
  amount: number;
}

/** Everything on the ground. */
export function buildGroundCover(bk: Bulks, o: ScatterOpts): void {
  const full = o.full;
  const r = rng(1717);
  const w: [number, number, number, number] = [0, 0, 0, 0];
  const plant = bk.get('wlPlant');
  const leafB = bk.get('wlPlant');
  // A point anywhere in the field (and a little outside), or near the eye.
  const pick = (near: boolean): [number, number] => {
    if (near) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * o.nearReach;
      return [o.eye.x + Math.cos(a) * d, o.eye.z + Math.sin(a) * d];
    }
    return [(r() * 2 - 1) * (HALF_X + 4), (r() * 2 - 1) * (HALF_Z + 4)];
  };
  const n = (base: number, near: number) => [Math.round(base * o.amount), Math.round(near * o.amount)] as const;

  // Ferns and bracken: in the woods, along the creek's south bank, at boulders' and logs' feet.
  const [fernsFar, fernsNear] = n(full ? 900 : 130, full ? 260 : 30);
  for (let i = 0; i < fernsFar + fernsNear; i++) {
    const [x, z] = pick(i >= fernsFar);
    splatAt(x, z, w);
    const woods = w[1] > 0.5 || Math.abs(z) > HALF_Z;
    const nearRock = inBlock(x, z, 0.9, ['boulder', 'log']) && !inBlock(x, z, 0.1);
    if (!woods && !nearRock && r() > 0.12) continue;
    if (!free(x, z, 0.12) || !offLane(x, z, woods ? 1.6 : 1.2) || inBush(x, z, 0.3)) continue;
    // Out in the open they stay low (under 0.3 m); in the woods they grow to 0.6 m.
    const size = woods ? 0.45 + r() * 0.35 : 0.28 + r() * 0.12;
    fern(plant, x, z, size, r, full, r() > 0.6);
  }
  // Tall grass tufts: along the fence, round rocks and trunks, at the meadow's edges.
  const [tuftFar, tuftNear] = n(full ? 2600 : 240, full ? 700 : 70);
  const tg = bk.get('wlBlade');
  for (let i = 0; i < tuftFar + tuftNear; i++) {
    const [x, z] = pick(i >= tuftFar);
    splatAt(x, z, w);
    if (w[0] < 0.4 && r() > 0.2) continue;
    if (!free(x, z, 0.05)) continue;
    const edge = inBlock(x, z, 0.8) || Math.abs(x) > HALF_X - 2 || Math.abs(z) > HALF_Z - 2;
    if (!edge && noise2(x * 0.25, z * 0.25, 104) < 0.55) continue;
    const h = edge ? 0.32 + r() * 0.2 : 0.2 + r() * 0.12;
    const col = C(0x5f8a38).lerp(C(0x9a9850), noise2(x * 0.5, z * 0.5, 105) * 0.6);
    tuft(tg, x, z, h, full ? 9 + Math.floor(r() * 7) : 5, r, col);
  }
  // Flowers on the meadow; bluebells under the trees.
  const [flowersFar, flowersNear] = n(full ? 4000 : 0, full ? 1600 : 220);
  const petals = [C(0xf2efe6), C(0xf6d23a), C(0xe9e4f2), C(0xd2475e), C(0xf0a8c8)];
  const centres = [C(0xf2c230), C(0xd89a20), C(0xf2c230), C(0xf4e0a0), C(0xf2d060)];
  for (let i = 0; i < flowersFar + flowersNear; i++) {
    const [x, z] = pick(i >= flowersFar);
    splatAt(x, z, w);
    if (!free(x, z, 0.05) || inBush(x, z, 0.1)) continue;
    const patch = noise2(x * 0.18, z * 0.18, 106);
    if (w[1] > 0.6) {
      if (patch < 0.5) continue;
      bluebell(plant, x, z, 0.14 + r() * 0.1, r);
      continue;
    }
    if (w[0] < 0.5 || patch < 0.45) continue;
    const k = Math.floor(noise2(x * 0.6, z * 0.6, 107) * 4.99);
    flower(plant, x, z, 0.08 + r() * 0.16, petals[k]!, centres[k]!, r, full);
  }
  // Mushrooms: at trunk feet, on and by logs, in the litter.
  const trees = MAP.blocks.filter((b) => b.kind === 'tree' || b.kind === 'log');
  const shrooms = Math.round((full ? 140 : 25) * o.amount);
  for (let i = 0; i < shrooms; i++) {
    const t = trees[Math.floor(r() * trees.length)]!;
    const a = r() * Math.PI * 2;
    const d = 0.08 + r() * 0.4;
    const x = t.center.x + Math.cos(a) * (t.size.x / 2 + d);
    const z = t.center.z + Math.sin(a) * (t.size.z / 2 + d);
    if (!free(x, z, 0.02) || laneDistance(x, z) < 0.6) continue;
    const kind = r() < 0.35 ? 'agaric' : r() < 0.6 ? 'brown' : 'pale';
    mushrooms(bk, x, z, kind, r, full);
  }
  if (!full) return;
  // Leaf litter and needles: flat leaves on the litter, near the view (and pine cones, sticks).
  const litter = Math.round(26000 * o.amount);
  const leafCols = [C(0x9a5a28), C(0xb8742c), C(0x7a4a24), C(0xc8902e), C(0x6a4a2a), C(0x8a6a2a)];
  for (let i = 0; i < litter; i++) {
    const [x, z] = pick(r() < 0.7);
    splatAt(x, z, w);
    if (r() > w[1] + w[0] * 0.04) continue;
    if (inBlock(x, z, 0.02)) continue;
    const y = groundY(x, z) + 0.006 + r() * 0.01;
    const s = 0.035 + r() * 0.03;
    const c = leafCols[Math.floor(r() * leafCols.length)]!.clone().multiplyScalar(0.75 + r() * 0.35);
    const n2 = V((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize();
    leafCard(leafB, V(x, y, z), n2, s, c, r() * Math.PI);
  }
  const solid = bk.get('wlBark');
  for (let i = 0; i < Math.round(900 * o.amount); i++) {
    const [x, z] = pick(r() < 0.6);
    splatAt(x, z, w);
    if (w[1] < 0.5 || inBlock(x, z, 0.05)) continue;
    const y = groundY(x, z);
    if (r() < 0.5) {
      // A pine cone.
      lump(solid, V(x, y + 0.025, z), 0.035, 1, i, (_p, o2, out) => out.set(0x7a5434).multiplyScalar(0.6 + o2.y * 0.4), V(1, 0.75, 1.5), 0.35);
    } else {
      // A fallen stick.
      const a = r() * Math.PI * 2;
      const l = 0.3 + r() * 0.7;
      tube(solid, V(x, y + 0.015, z), V(x + Math.cos(a) * l, groundY(x + Math.cos(a) * l, z + Math.sin(a) * l) + 0.012, z + Math.sin(a) * l), 0.014, 0.008, 4, 1, () => tmp.set(0x5a4636));
    }
  }
  // Pebbles at boulders' feet and along the creek bed.
  const rock = bk.get('wlRock');
  for (let i = 0; i < Math.round(1400 * o.amount); i++) {
    const [x, z] = pick(r() < 0.5);
    splatAt(x, z, w);
    const atRock = inBlock(x, z, 0.6, ['boulder']);
    if (!(w[3] > 0.4 || atRock) || inBlock(x, z, 0.02)) continue;
    const s = 0.03 + r() * (atRock ? 0.09 : 0.05);
    lump(rock, V(x, groundY(x, z) + s * 0.2, z), s, 0, i, (_p, o2, out) => out.set(0x8a867e).multiplyScalar(0.6 + o2.y * 0.35 + r() * 0.1), V(1.2, 0.6, 1), 0.3);
  }
}

/** Cut stumps (under 0.3 m) in the woods and by the woodpile, mossy, mushrooms on some; an axe in one. */
export function buildStumps(bk: Bulks, full: boolean): { axe: THREE.Vector3 } {
  const r = rng(3131);
  const spots: [number, number][] = [];
  // Round the woodpile (plan x 36–44.5, z 63–66), then scattered through the Pine Belt.
  for (let i = 0; i < 4; i++) spots.push([-22 + (r() - 0.5) * 9, -25.5 - r() * 2.5]);
  for (let i = 0; i < (full ? 40 : 12); i++) spots.push([(r() * 2 - 1) * (HALF_X - 3), -22 - r() * 16]);
  let axe = V(-20, 0, -27);
  let first = true;
  for (const [x, z] of spots) {
    if (!free(x, z, 0.5) || laneDistance(x, z) < 1.5 || inBush(x, z, -0.3)) continue;
    const g = groundY(x, z);
    const rad = 0.18 + r() * 0.14;
    const h = 0.14 + r() * 0.14;
    const bark = bk.get('wlBark');
    tube(bark, V(x, g - 0.1, z), V(x, g + h, z), rad * 1.12, rad, full ? 12 : 7, 1, (t, a, out) => {
      out.set(0x5e4a3a).multiplyScalar(0.8 + t * 0.2);
      out.lerp(C(0x5d7c2e), Math.max(0, -Math.sin(a)) * 0.6);
    });
    const end = new THREE.CircleGeometry(rad, full ? 12 : 7);
    end.rotateX(-Math.PI / 2);
    end.translate(x, g + h + 0.002, z);
    const top = C(0xd2b48a).multiplyScalar(0.8 + r() * 0.25);
    bk.get('wlLogEnd').geo(end, null, (out) => out.copy(top), { ownUv: true });
    if (first) {
      axe = V(x, g + h, z);
      first = false;
    } else if (r() < 0.4) mushrooms(bk, x + rad * 0.9, z, r() < 0.5 ? 'brown' : 'pale', r, full);
  }
  return { axe };
}

/** An axe sunk in a stump's top: ash handle, iron head with a bright worn edge. */
export function buildAxe(bk: Bulks, at: THREE.Vector3): void {
  const head = at.clone().add(V(0, 0.03, 0));
  const handleTop = head.clone().add(V(0.32, 0.36, 0.05));
  tube(bk.get('wlHewn'), head, handleTop, 0.016, 0.014, 6, 1, () => tmp.set(0xb08a5a));
  const m = new THREE.Matrix4().compose(head.clone().add(V(-0.02, -0.01, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.85)), V(1, 1, 1));
  bk.get('wlIron').geo(new THREE.BoxGeometry(0.16, 0.06, 0.02), m, (out) => out.set(0x4a4a4c));
}

