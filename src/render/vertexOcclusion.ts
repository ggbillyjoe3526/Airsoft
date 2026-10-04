/**
 * Baked vertex occlusion (audit section 5, F3): how much of the open air round a point on the map is blocked by the
 * map's own boxes, so corners, the floor at a wall's foot and the ground under the dock's lip can sit in a soft shade.
 * Worked out once as the map is built (static, so it costs nothing a frame) by casting a fixed fan of rays from each
 * vertex against the boxes near it. Pure: no Three.js, no allocation per ray.
 */

/** Axis-aligned boxes, six numbers each: min x, y, z, then max x, y, z (metres). */
export type BoxList = readonly (readonly [number, number, number, number, number, number])[];

/** The boxes, and a grid over the ground (cells `reach` metres across) of which boxes each cell's rays can reach. */
export interface Occluders {
  readonly boxes: Float64Array;
  readonly cells: Map<number, number[]>;
  readonly reach: number;
}

const cellKey = (ix: number, iz: number): number => (ix + 32768) * 65536 + (iz + 32768);

/** Indexes `boxes` for rays of length `reach`: each box goes into every grid cell within `reach` of it. */
export function buildOccluders(boxes: BoxList, reach: number): Occluders {
  const flat = new Float64Array(boxes.length * 6);
  const cells = new Map<number, number[]>();
  boxes.forEach((b, i) => {
    flat.set(b, i * 6);
    const x0 = Math.floor((b[0] - reach) / reach);
    const x1 = Math.floor((b[3] + reach) / reach);
    const z0 = Math.floor((b[2] - reach) / reach);
    const z1 = Math.floor((b[5] + reach) / reach);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = cellKey(ix, iz);
        let list = cells.get(key);
        if (!list) cells.set(key, (list = []));
        list.push(i);
      }
    }
  });
  return { boxes: flat, cells, reach };
}

/** The ray's entry and exit so far (rayBox's slab test), shared to keep the bake free of allocation. */
const span = { near: 0, far: 0 };

/** Narrows `span` to where the ray is between `lo` and `hi` on one axis; false once it can't be. */
function slab(o: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
  let t0 = (lo - o) / d;
  let t1 = (hi - o) / d;
  if (t0 > t1) [t0, t1] = [t1, t0];
  if (t0 > span.near) span.near = t0;
  if (t1 < span.far) span.far = t1;
  return span.near <= span.far;
}

/**
 * Distance along the ray from (ox, oy, oz) in the unit direction (dx, dy, dz) to box `i` of `boxes`, or Infinity if it
 * misses within `maxT`. A ray starting inside a box hits it at 0.
 */
export function rayBox(boxes: Float64Array, i: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  const b = i * 6;
  span.near = 0;
  span.far = maxT;
  if (!slab(ox, dx, boxes[b]!, boxes[b + 3]!) || !slab(oy, dy, boxes[b + 1]!, boxes[b + 4]!) || !slab(oz, dz, boxes[b + 2]!, boxes[b + 5]!)) {
    return Number.POSITIVE_INFINITY;
  }
  return span.near;
}

/**
 * The fixed ray fans, in a frame of the surface's normal (n), a tangent across it (t) and the third axis (b, up the
 * face for a wall, along the floor for a top): [n, t, b] weights per ray, each normalised when used. A side face looks
 * out, out-and-sideways (45° and 80°) and out-and-up (no ray points down: the floor under every wall would darken it all,
 * which the grime band already draws). A top face looks up and round a 30° ring.
 */
const SIDE_FAN: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [1, 1, 0],
  [1, -1, 0],
  [0.18, 1, 0],
  [0.18, -1, 0],
  [1, 0, 1],
  [0.6, 0.7, 0.6],
  [0.6, -0.7, 0.6],
];
const TOP_FAN: readonly (readonly [number, number, number])[] = (() => {
  const fan: [number, number, number][] = [[1, 0, 0]];
  const ring = 7;
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * Math.PI * 2;
    // 30° up from the surface: sin 30° along n, cos 30° round it.
    fan.push([0.5, Math.cos(a) * 0.866, Math.sin(a) * 0.866]);
  }
  return fan;
})();

/** Scratch for one query: the candidate boxes' indices are read straight from the grid. */
const dir = [0, 0, 0];

/**
 * The share (0..1) of the air round a surface point that the boxes block, for a point (px, py, pz) on a surface with the
 * unit normal (nx, ny, nz): each ray of the fan that hits a box within `reach` counts by how near the hit is
 * (1 - (t / reach)², so the shade fades out with distance), averaged over the fan. Rays start `lift` off the surface
 * (and `lift` up, so a wall's foot on the floor doesn't hit the floor it stands on). Downward faces get 0 (unseen).
 * `skip` is the index of the box the point is on (its own box never shades it).
 */
export function occlusionAt(occ: Occluders, px: number, py: number, pz: number, nx: number, ny: number, nz: number, lift: number, skip = -1): number {
  if (ny < -0.7) return 0;
  const top = ny > 0.7;
  const fan = top ? TOP_FAN : SIDE_FAN;
  // The frame: n; t across it (horizontal for a side face); b = n × t (up a side face).
  let tx: number, ty: number, tz: number;
  if (top) {
    tx = 1;
    ty = 0;
    tz = 0;
  } else {
    const len = Math.hypot(nz, nx) || 1;
    tx = -nz / len;
    ty = 0;
    tz = nx / len;
  }
  const bx = ny * tz - nz * ty;
  const by = nz * tx - nx * tz;
  const bz = nx * ty - ny * tx;
  // A side face's b must point up (its fan's tilted rays look up, never down).
  const flip = !top && by < 0 ? -1 : 1;
  const ox = px + nx * lift;
  const oy = py + ny * lift + lift;
  const oz = pz + nz * lift;
  const list = occ.cells.get(cellKey(Math.floor(px / occ.reach), Math.floor(pz / occ.reach)));
  if (!list) return 0;
  let blocked = 0;
  for (const [wn, wt, wb] of fan) {
    dir[0] = nx * wn + tx * wt + bx * wb * flip;
    dir[1] = ny * wn + ty * wt + by * wb * flip;
    dir[2] = nz * wn + tz * wt + bz * wb * flip;
    const len = Math.hypot(dir[0]!, dir[1]!, dir[2]!);
    let nearest = occ.reach;
    for (const i of list) {
      if (i === skip) continue;
      const t = rayBox(occ.boxes, i, ox, oy, oz, dir[0]! / len, dir[1]! / len, dir[2]! / len, nearest);
      if (t < nearest) nearest = t;
    }
    if (nearest < occ.reach) blocked += 1 - (nearest / occ.reach) ** 2;
  }
  return blocked / fan.length;
}

/** The brightness (1 - strength .. 1) a vertex keeps for an occlusion share (0..1). */
export function occlusionShade(occlusion: number, strength: number): number {
  return 1 - strength * Math.min(1, Math.max(0, occlusion));
}
