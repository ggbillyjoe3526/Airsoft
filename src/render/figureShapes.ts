import * as THREE from 'three';

/**
 * Shapes for the figures built in code (graphics overhaul G7, ported from the concept's anatomy): tapered limbs, curved
 * bands (goggles, masks, rails), helmet shells with a cut edge, chamfered blocks, and the joint maths that places them
 * (two-bone IK, a frame along a bone). Pure geometry: no colour, no material.
 */

export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A frame whose Y axis runs along `dir` and whose Z axis is as close to `ref` as it can be. */
export function basis(dir: THREE.Vector3, ref: THREE.Vector3): THREE.Matrix4 {
  const y = dir.clone().normalize();
  let z = ref.clone().addScaledVector(y, -ref.dot(y));
  if (z.lengthSq() < 1e-6) z = V(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

/** Two-bone IK: the middle joint of a chain from `root` to `target` with bones `l1` and `l2`, bent towards `pole`. */
export function ik(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): THREE.Vector3 {
  const v = target.clone().sub(root);
  const d = Math.min(v.length(), (l1 + l2) * 0.999);
  const dir = v.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return root.clone().addScaledVector(dir, a).addScaledVector(perp, h);
}

/** A radius profile stop along a limb: [t from 0 at its root to 1 at its end, radius across, radius front to back]. */
export type ProfileStop = readonly [t: number, rx: number, rz: number];

/**
 * A limb along +Y from 0 to `len`: an elliptical tube `radial` sides round and `rings` rings long whose radii follow
 * `prof` (smoothly between stops), closed at both ends when `caps`.
 */
export function limbGeo(len: number, prof: readonly ProfileStop[], radial: number, rings: number, caps = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (t: number): [number, number] => {
    for (let i = 1; i < prof.length; i++) {
      const [t1, x1, z1] = prof[i]!;
      const [t0, x0, z0] = prof[i - 1]!;
      if (t <= t1) {
        const u = (t - t0) / Math.max(1e-6, t1 - t0);
        const s = u * u * (3 - 2 * u);
        return [x0 + (x1 - x0) * s, z0 + (z1 - z0) * s];
      }
    }
    const last = prof[prof.length - 1]!;
    return [last[1], last[2]];
  };
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const [rx, rz] = at(t);
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      pos.push(Math.sin(a) * rx, t * len, -Math.cos(a) * rz);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < radial; i++) {
      const a = r * radial + i;
      const b = r * radial + ((i + 1) % radial);
      idx.push(a, a + radial, b, b, a + radial, b + radial);
    }
  }
  if (caps) {
    const c0 = pos.length / 3;
    pos.push(0, 0, 0, 0, len, 0);
    for (let i = 0; i < radial; i++) {
      idx.push(c0, i, (i + 1) % radial);
      idx.push(c0 + 1, rings * radial + ((i + 1) % radial), rings * radial + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The frame that puts a piece built along +Y (from 0) at `a`, running to `b`, its Z towards `ref`. */
export function frameBetween(a: THREE.Vector3, b: THREE.Vector3, ref: THREE.Vector3 = V(0, 0, -1)): THREE.Matrix4 {
  return basis(b.clone().sub(a), ref).setPosition(a);
}

/**
 * Bends a piece built straight along X (centred, its front face at -Z) round the Y axis at radius `r`, so it wraps a
 * head or a torso, the middle of the piece straight ahead (-Z).
 */
export function bend(g: THREE.BufferGeometry, r: number): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  g.dispose();
  const p = out.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / r;
    const rr = r - p.getZ(i);
    p.setXYZ(i, Math.sin(a) * rr, p.getY(i), -Math.cos(a) * rr);
  }
  out.deleteAttribute('normal');
  return out;
}

/** A curved band `arc` metres long round radius `r`, `h` tall and `t` thick, in `segs` pieces. */
export function band(arc: number, h: number, t: number, r: number, segs: number): THREE.BufferGeometry {
  return bend(new THREE.BoxGeometry(arc, h, t, segs, 1, 1), r);
}

/**
 * A curved band whose bottom and top edges follow `lo(xn)` and `hi(xn)` (metres from its centre line, xn from -1 at one
 * end to 1 at the other), bulging `bulge` metres forward at its middle: goggle frames with a nose cut-out, a cupped
 * mesh mask, a visor.
 */
export function shapedBand(
  arc: number,
  t: number,
  r: number,
  segs: number,
  rows: number,
  lo: (xn: number) => number,
  hi: (xn: number) => number,
  bulge = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(arc, 1, t, segs, rows, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const xn = (p.getX(i) / arc) * 2;
    const v = p.getY(i) + 0.5;
    const y0 = lo(xn);
    const y1 = hi(xn);
    const yn = (v - 0.5) * 2;
    const push = bulge * (1 - xn * xn) ** 2 * (1 - 0.5 * yn * yn);
    p.setXYZ(i, p.getX(i), y0 + (y1 - y0) * v, p.getZ(i) - push);
  }
  return bend(g, r);
}

/**
 * A shell on the unit sphere (a helmet) cut at a polar angle that changes with direction: `cut(front, side)` gets how
 * far forward (-Z, 1) or back (-1) a point faces and how far to the side (0..1), and returns where the shell ends.
 */
export function shellGeo(ws: number, hs: number, cut: (front: number, side: number) => number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const th = Math.acos(THREE.MathUtils.clamp(y, -1, 1));
    const hl = Math.hypot(x, z);
    const dx = hl > 1e-6 ? x / hl : 0;
    const dz = hl > 1e-6 ? z / hl : -1;
    const nt = (th / Math.PI) * cut(-dz, Math.abs(dx));
    p.setXYZ(i, Math.sin(nt) * dx, Math.cos(nt), Math.sin(nt) * dz);
  }
  g.computeVertexNormals();
  return g;
}

/** The same geometry seen from inside (winding flipped), scaled by `scale`: the inside of a helmet. */
export function insideOf(g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g.clone();
  o.scale(scale, scale, scale);
  const p = o.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1);
    const y = p.getY(i + 1);
    const z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  o.deleteAttribute('normal');
  return o;
}

/**
 * A block with chamfered edges and corners, `w` by `h` by `d`, its chamfer `c` (44 triangles against a rounded box's
 * 108): the Marathon-style slab of the detailed figure, whose bevel faces catch the light.
 */
export function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  const cc = Math.max(1e-4, Math.min(c, ...half.map((v) => v * 0.9)));
  /** The point of corner (sx, sy, sz) on the face across `axis`. */
  const pt = (s: readonly number[], axis: number): THREE.Vector3 =>
    V(...([0, 1, 2].map((k) => s[k]! * (k === axis ? half[k]! : half[k]! - cc)) as [number, number, number]));
  const polys: THREE.Vector3[][] = [];
  const signs = [-1, 1];
  // The six faces.
  for (let axis = 0; axis < 3; axis++) {
    for (const s of signs) {
      const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
      const corner = (a: number, b: number): THREE.Vector3 => {
        const k = [0, 0, 0];
        k[axis] = s;
        k[u] = a;
        k[v] = b;
        return pt(k, axis);
      };
      polys.push([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
    }
  }
  // The twelve edges: between the faces across `a` and `b`, along the third axis.
  for (let along = 0; along < 3; along++) {
    const [a, b] = [(along + 1) % 3, (along + 2) % 3];
    for (const sa of signs) {
      for (const sb of signs) {
        const k = (sl: number): number[] => {
          const s = [0, 0, 0];
          s[a] = sa;
          s[b] = sb;
          s[along] = sl;
          return s;
        };
        polys.push([pt(k(-1), a), pt(k(1), a), pt(k(1), b), pt(k(-1), b)]);
      }
    }
  }
  // The eight corners.
  for (const sx of signs) for (const sy of signs) for (const sz of signs) polys.push([0, 1, 2].map((axis) => pt([sx, sy, sz], axis)));
  const pos: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (const poly of polys) {
    centre.set(0, 0, 0);
    for (const p of poly) centre.add(p);
    centre.divideScalar(poly.length);
    // Wound to face outward (away from the block's centre).
    const outward = e1.subVectors(poly[1]!, poly[0]!).cross(e2.subVectors(poly[2]!, poly[0]!)).dot(centre) > 0;
    const ordered = outward ? poly : [...poly].reverse();
    for (let i = 1; i < ordered.length - 1; i++) for (const p of [ordered[0]!, ordered[i]!, ordered[i + 1]!]) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
