import * as THREE from 'three';
import { CANOPY } from '../config/render';
import type { MapBlock } from '../map/mapTypes';
import { type Terrain, terrainHeightAt } from '../map/terrain';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * Tree crowns (M33i): one merged mesh over a map's `tree` blocks, built from their data alone (any map with trees gets
 * them; Depot has none). A trunk CANOPY.broadFrom across or more gets a broadleaf crown of a few lumps, thinner ones a
 * pine of stacked cones. Crowns are drawing only: BBs, people and bots' sight pass through them (a trunk's block is what
 * collides), and no point of one comes lower than CANOPY.minBase over the ground beneath it (on a slope too), so it
 * never hides a standing figure. Baked shade:
 * darker underneath, cooler on the moon's side. Flat-shaded Lambert like the tree ring round the field (the same shader).
 */

/** A fixed hash of a block's position to 0..1 (`salt` picks another stream), so a tree's crown is the same every load. */
function hash01(block: MapBlock, salt: number): number {
  const q = (v: number): number => Math.round(v * 10);
  const h = Math.imul(q(block.center.x) ^ Math.imul(q(block.center.z), 19349663) ^ Math.imul(salt, 83492791), 0x5bd1e995) >>> 0;
  return (Math.imul(h ^ (h >>> 13), 2654435761) >>> 0) / 4294967296;
}

/** The ground under a trunk: the terrain's, else its block's foot. */
function groundOf(block: MapBlock, terrain: Terrain | undefined): number {
  const foot = block.center.y - block.size.y / 2;
  return (terrain && terrainHeightAt(terrain, block.center.x, block.center.z)) ?? foot;
}

/** Where a crown goes: its lowest point (m) over the ground must be at least CANOPY.minBase. */
export interface Crown {
  /** World height of the crown's lowest point. */
  base: number;
  /** World height of the ground under it. */
  ground: number;
  /** Triangles, three [x, y, z] corners each, wound counter-clockwise from outside. */
  triangles: number[];
}

/** A cone of `sides` sides from a base ring at `y0` (radius `r`, turned by `turn`) to its apex at `y1`, with its base. */
function cone(out: number[], x: number, z: number, y0: number, y1: number, r: number, sides: number, turn: number): void {
  const ring: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = turn + (i / sides) * Math.PI * 2;
    ring.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  for (let i = 0; i < sides; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % sides]!;
    // Counter-clockwise seen from outside (from above, the ring runs counter-clockwise in x, -z: the order is reversed).
    out.push(bx, y0, bz, ax, y0, az, x, y1, z);
  }
  // The base, facing down (seen from below the ring runs the other way).
  for (let i = 1; i + 1 < sides; i++) {
    const [ax, az] = ring[0]!;
    const [bx, bz] = ring[i]!;
    const [cx, cz] = ring[i + 1]!;
    out.push(ax, y0, az, bx, y0, bz, cx, y0, cz);
  }
}

/** A lumpy sphere (icosahedron of CANOPY.broad.detail) round (x, y, z), radius `r`. */
function lump(out: number[], x: number, y: number, z: number, r: number): void {
  const g = new THREE.IcosahedronGeometry(r, CANOPY.broad.detail);
  const pos = g.getAttribute('position');
  const index = g.index;
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i++) {
    const v = index ? index.getX(i) : i;
    out.push(x + pos.getX(v), y + pos.getY(v), z + pos.getZ(v));
  }
  g.dispose();
}

/** The crown of one trunk (exported for the tests): a pine's stacked cones, or a broadleaf's lumps. */
export function crownOf(block: MapBlock, terrain: Terrain | undefined): Crown {
  const ground = groundOf(block, terrain);
  const top = block.center.y + block.size.y / 2;
  const height = top - ground;
  const j = (salt: number): number => 1 + CANOPY.jitter * (hash01(block, salt) * 2 - 1);
  const x = block.center.x;
  const z = block.center.z;
  const triangles: number[] = [];
  const width = Math.min(block.size.x, block.size.z);
  let base: number;
  if (width >= CANOPY.broadFrom) {
    const B = CANOPY.broad;
    const r = B.radius * height * j(1);
    const cy = Math.max(ground + CANOPY.minBase + r, ground + B.lift * height);
    const sizes = [1, 0.78, 0.66];
    base = Number.POSITIVE_INFINITY;
    for (let k = 0; k < B.lumps; k++) {
      const rk = r * sizes[k % sizes.length]!;
      const a = hash01(block, 10 + k) * Math.PI * 2;
      const off = k === 0 ? 0 : B.spread * r;
      const ky = cy + (k === 0 ? 0 : rk * 0.35);
      lump(triangles, x + Math.cos(a) * off, ky, z + Math.sin(a) * off, rk);
      base = Math.min(base, ky - rk);
    }
  } else {
    const P = CANOPY.pine;
    // The crown hangs from just above the trunk's top down most of its height, never below minBase over the ground.
    const apex = top + P.apexAbove * j(2);
    const bottom = Math.max(ground + CANOPY.minBase, top - P.depth * height * j(3));
    const span = apex - bottom;
    const turn = hash01(block, 4) * Math.PI * 2;
    for (const t of P.tiers) cone(triangles, x, z, bottom + t.from * span, bottom + t.to * span, t.radius * j(5), P.sides, turn);
    base = bottom;
  }
  // On a slope the ground under a crown's edge is higher than at its trunk: lift the whole crown until every point of
  // it is CANOPY.minBase over the ground directly beneath.
  if (terrain) {
    let lift = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const under = terrainHeightAt(terrain, triangles[i]!, triangles[i + 2]!);
      if (under !== undefined) lift = Math.max(lift, under + CANOPY.minBase - triangles[i + 1]!);
    }
    if (lift > 0) {
      for (let i = 1; i < triangles.length; i += 3) triangles[i]! += lift;
      base += lift;
    }
  }
  return { base, ground, triangles };
}

const faceA = new THREE.Vector3();
const faceB = new THREE.Vector3();
const faceC = new THREE.Vector3();
const faceN = new THREE.Vector3();
const edge = new THREE.Vector3();
const tint = new THREE.Color();
const rim = new THREE.Color();

/**
 * Every crown of `blocks`' trees as one mesh (null when there are none), shaded face by face: darker towards its foot
 * (CANOPY.underShade) and cooler on the side facing `moon` (a unit vector towards the key light). It casts shadows when
 * `castShadow` (the shadow map follows the view: High).
 */
export function buildCanopyMesh(blocks: readonly MapBlock[], terrain: Terrain | undefined, moon: THREE.Vector3, castShadow: boolean): THREE.Mesh | null {
  const trees = blocks.filter((b) => b.kind === 'tree');
  if (trees.length === 0) return null;
  const positions: number[] = [];
  const colours: number[] = [];
  const normals: number[] = [];
  rim.setHex(CANOPY.rim, THREE.SRGBColorSpace);
  for (const tree of trees) {
    const crown = crownOf(tree, terrain);
    const colour = CANOPY.colours[Math.floor(hash01(tree, 6) * CANOPY.colours.length)]!;
    const t = crown.triangles;
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let i = 1; i < t.length; i += 3) {
      lo = Math.min(lo, t[i]!);
      hi = Math.max(hi, t[i]!);
    }
    for (let i = 0; i < t.length; i += 9) {
      faceA.set(t[i]!, t[i + 1]!, t[i + 2]!);
      faceB.set(t[i + 3]!, t[i + 4]!, t[i + 5]!);
      faceC.set(t[i + 6]!, t[i + 7]!, t[i + 8]!);
      faceN.subVectors(faceB, faceA).cross(edge.subVectors(faceC, faceA)).normalize();
      const up = ((faceA.y + faceB.y + faceC.y) / 3 - lo) / Math.max(1e-6, hi - lo);
      const k = CANOPY.underShade + (1 - CANOPY.underShade) * up;
      tint.setHex(colour, THREE.SRGBColorSpace).multiplyScalar(k).lerp(rim, CANOPY.rimStrength * Math.max(0, faceN.dot(moon)) * k);
      for (let v = 0; v < 9; v++) positions.push(t[i + v]!);
      for (let v = 0; v < 3; v++) {
        colours.push(tint.r, tint.g, tint.b);
        normals.push(faceN.x, faceN.y, faceN.z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geo.computeBoundingSphere();
  // As the tree ring round the field (render/atmosphere.ts): flat-shaded Lambert off the environment map, one shader.
  const mesh = new THREE.Mesh(geo, withoutEnvironment(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  mesh.name = 'map-canopy';
  mesh.castShadow = castShadow;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
