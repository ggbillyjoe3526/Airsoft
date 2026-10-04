import * as THREE from 'three';
import { SURFACES, type SurfaceTextureId } from '../config/render';
import type { BlockKind, MapBlock, MapData } from '../map/mapTypes';
import { RAMP_FACES, rampCorners } from '../map/surfaces';
import type { ProceduralTexture, SurfaceTextures } from './proceduralTextures';

type UvMode = 'world' | 'perFace';

interface KindStyle {
  texture: SurfaceTextureId;
  uv: UvMode;
  /** Tint palette; each block picks one from its position (see blockTint) so props don't look cloned. */
  tints: number[];
  castShadow: boolean;
  /** Its sides darken towards their foot (SURFACES.grimeHeight): dirt and contact shade where they meet the ground. */
  grime: boolean;
}

/** Colours are warm and friendly: an airsoft site, not a military base. */
const STYLES: Record<BlockKind, KindStyle> = {
  floor: { texture: 'concrete', uv: 'world', tints: [0xffffff], castShadow: false, grime: false },
  ramp: { texture: 'concrete', uv: 'world', tints: [0xffffff], castShadow: false, grime: false },
  wall: { texture: 'blockWall', uv: 'world', tints: [0xffffff, 0xf2efe6], castShadow: true, grime: true },
  crate: { texture: 'crate', uv: 'perFace', tints: [0xffffff, 0xe8dcc8, 0xd8ccb4], castShadow: true, grime: true },
  // No team blue or orange on neutral props: those colours belong to the teams.
  container: { texture: 'corrugated', uv: 'world', tints: [0x4f8a57, 0xcdb338, 0x7a8288, 0x4f7a80], castShadow: true, grime: true },
  barrier: { texture: 'barrier', uv: 'world', tints: [0xe8e4da, 0xd9c04a], castShadow: true, grime: true },
};

/** A steel floor or ramp (MapBlock.surface 'metal', which also clanks underfoot): diamond tread plate in plain steel. */
const METAL_PLATE: KindStyle = { texture: 'steelPlate', uv: 'world', tints: [0xf4f6f8], castShadow: false, grime: false };

function styleOf(block: MapBlock): KindStyle {
  return block.surface === 'metal' ? METAL_PLATE : STYLES[block.kind];
}

/** A hash of a block's position. It uses |x|, so a block and its mirror twin across x = 0 always hash the same. */
function blockHash(block: MapBlock): number {
  const q = (v: number): number => Math.round(v * 10);
  return (Math.imul(q(Math.abs(block.center.x)), 73856093) ^ Math.imul(q(block.center.y), 19349663) ^ Math.imul(q(block.center.z), 83492791)) >>> 0;
}

/**
 * Tint for a block, picked from its kind's palette by a hash of its position, so a symmetric map looks symmetric.
 */
export function blockTint(block: MapBlock): number {
  const tints = styleOf(block).tints;
  return tints[blockHash(block) % tints.length] ?? 0xffffff;
}

/** A block's brightness (1 - SURFACES.shadeJitter .. 1), from other bits of the same hash: tint stays its hue. */
export function blockShade(block: MapBlock): number {
  return 1 - SURFACES.shadeJitter * (((blockHash(block) >>> 8) % 101) / 100);
}

interface Buffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

// Face definitions: normal, and the two axes used for U and V (V is up on every side face).
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
] as const;

/** An axis-aligned box to draw: its corners (world metres). */
interface Cuboid {
  min: [number, number, number];
  max: [number, number, number];
}

/** How a cuboid is painted: its texture mapping, colour, and where its grime band starts (the ground under it), if any. */
interface Paint {
  uv: UvMode;
  tex: ProceduralTexture;
  color: THREE.Color;
  /** Height of the ground at its foot: side faces darken from here up over SURFACES.grimeHeight. Null: no grime. */
  grimeFrom: number | null;
}

const vertexColor = new THREE.Color();

/** The colour at height `y` for `paint`: its colour, darkened in the grime band near its foot. */
function shadeAt(paint: Paint, y: number): THREE.Color {
  vertexColor.copy(paint.color);
  if (paint.grimeFrom === null) return vertexColor;
  const t = (y - paint.grimeFrom) / SURFACES.grimeHeight;
  if (t >= 1) return vertexColor;
  return vertexColor.multiplyScalar(SURFACES.grimeShade + (1 - SURFACES.grimeShade) * Math.max(0, t));
}

/** Rows along a side face's height (in -1..1 of its half height): split at the top of the grime band if it crosses it. */
const rows: number[] = [];

function appendCuboid(buf: Buffers, box: Cuboid, paint: Paint): void {
  const half = [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2] as const;
  const centre = [(box.max[0] + box.min[0]) / 2, (box.max[1] + box.min[1]) / 2, (box.max[2] + box.min[2]) / 2] as const;

  for (const f of FACES) {
    // Half extents along the face's u and v axes.
    const hu = Math.abs(f.u[0]) * half[0] + Math.abs(f.u[1]) * half[1] + Math.abs(f.u[2]) * half[2];
    const hv = Math.abs(f.v[0]) * half[0] + Math.abs(f.v[1]) * half[1] + Math.abs(f.v[2]) * half[2];
    const hn = Math.abs(f.n[0]) * half[0] + Math.abs(f.n[1]) * half[1] + Math.abs(f.n[2]) * half[2];
    rows.length = 0;
    rows.push(-1);
    const side = f.n[1] === 0;
    if (side && paint.grimeFrom !== null && hv > 0) {
      const split = (paint.grimeFrom + SURFACES.grimeHeight - centre[1]) / hv;
      if (split > -1 && split < 1) rows.push(split);
    }
    rows.push(1);

    for (let r = 0; r + 1 < rows.length; r++) {
      const base = buf.positions.length / 3;
      for (const [su, sv] of [
        [-1, rows[r]!],
        [1, rows[r]!],
        [1, rows[r + 1]!],
        [-1, rows[r + 1]!],
      ] as const) {
        const px = centre[0] + f.n[0] * hn + f.u[0] * hu * su + f.v[0] * hv * sv;
        const py = centre[1] + f.n[1] * hn + f.u[1] * hu * su + f.v[1] * hv * sv;
        const pz = centre[2] + f.n[2] * hn + f.u[2] * hu * su + f.v[2] * hv * sv;
        buf.positions.push(px, py, pz);
        buf.normals.push(f.n[0], f.n[1], f.n[2]);
        const c = side ? shadeAt(paint, py) : paint.color;
        buf.colors.push(c.r, c.g, c.b);
        if (paint.uv === 'world') {
          buf.uvs.push((px * f.u[0] + py * f.u[1] + pz * f.u[2]) / paint.tex.worldSize, (px * f.v[0] + py * f.v[1] + pz * f.v[2]) / paint.tex.worldSize);
        } else {
          buf.uvs.push((su + 1) / 2, (sv + 1) / 2);
        }
      }
      buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
}

const rampCorner = new Float32Array(18);
const faceNormal = new THREE.Vector3();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();

/**
 * A ramp's wedge (see map/surfaces.ts), flat-shaded with world UVs: each face is textured along the box
 * face whose normal is closest to its own (the slope like the top, so its texture stretches by 1 / cos of
 * the slope).
 */
function appendRamp(buf: Buffers, block: MapBlock, tex: ProceduralTexture, color: THREE.Color): void {
  const c = block.center;
  const p = rampCorner;
  rampCorners(block, p);
  for (const face of RAMP_FACES) {
    const [i0, i1, i2] = face as [number, number, number];
    edgeA.set(p[i1 * 3]! - p[i0 * 3]!, p[i1 * 3 + 1]! - p[i0 * 3 + 1]!, p[i1 * 3 + 2]! - p[i0 * 3 + 2]!);
    edgeB.set(p[i2 * 3]! - p[i0 * 3]!, p[i2 * 3 + 1]! - p[i0 * 3 + 1]!, p[i2 * 3 + 2]! - p[i0 * 3 + 2]!);
    faceNormal.crossVectors(edgeA, edgeB).normalize();
    let f: (typeof FACES)[number] = FACES[0];
    let best = Number.NEGATIVE_INFINITY;
    for (const g of FACES) {
      const d = g.n[0] * faceNormal.x + g.n[1] * faceNormal.y + g.n[2] * faceNormal.z;
      if (d > best) {
        best = d;
        f = g;
      }
    }
    const base = buf.positions.length / 3;
    for (const k of face) {
      const px = c.x + p[k * 3]!;
      const py = c.y + p[k * 3 + 1]!;
      const pz = c.z + p[k * 3 + 2]!;
      buf.positions.push(px, py, pz);
      buf.normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
      buf.colors.push(color.r, color.g, color.b);
      buf.uvs.push((px * f.u[0] + py * f.u[1] + pz * f.u[2]) / tex.worldSize, (px * f.v[0] + py * f.v[1] + pz * f.v[2]) / tex.worldSize);
    }
    for (let k = 2; k < face.length; k++) buf.indices.push(base, base + k - 1, base + k);
  }
}

/** The block's bounds as a cuboid (a fresh one: details shrink and slice it). */
function boundsOf(block: MapBlock): Cuboid {
  const { center: c, size: s } = block;
  return { min: [c.x - s.x / 2, c.y - s.y / 2, c.z - s.z / 2], max: [c.x + s.x / 2, c.y + s.y / 2, c.z + s.z / 2] };
}

/** One piece of a block to draw: a cuboid with its texture and paint, cast into the shadow map or not. */
export interface Piece {
  box: Cuboid;
  texture: SurfaceTextureId;
  uv: UvMode;
  color: THREE.Color;
  grime: boolean;
  castShadow: boolean;
}

const C = SURFACES.container;
const COPING = SURFACES.wallCoping;
const PALLET = SURFACES.pallet;
/** Two blocks touch top to bottom within this (metres). */
const TOUCH = 0.01;

/**
 * A shipping container (or a row or stack of them, one block): the ribbed box set `inset` in from a darker steel
 * frame of corner posts and rails at the top, bottom and between stacked containers, posts between containers in a
 * row, and locking bars on one end. Every piece stays inside the block.
 */
function containerPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const frame = color.clone().multiplyScalar(C.frameShade);
  const bars = color.clone().multiplyScalar(C.barShade);
  const piece = (min: Cuboid['min'], max: Cuboid['max'], c: THREE.Color, grime = true): void => {
    out.push({ box: { min, max }, texture: 'corrugated', uv: 'world', color: c, grime, castShadow: true });
  };
  piece([b.min[0] + C.inset, b.min[1], b.min[2] + C.inset], [b.max[0] - C.inset, b.max[1], b.max[2] - C.inset], color);
  // The long axis (0 = x, 2 = z) and the across one.
  const long = block.size.x >= block.size.z ? 0 : 2;
  const across = long === 0 ? 2 : 0;
  const levels = Math.max(1, Math.round(block.size.y / C.height));
  const levelH = block.size.y / levels;
  const span = (axis: number, from: number, to: number, a0: number, a1: number, y0: number, y1: number): [Cuboid['min'], Cuboid['max']] => {
    const min: [number, number, number] = [0, y0, 0];
    const max: [number, number, number] = [0, y1, 0];
    min[axis] = from;
    max[axis] = to;
    const other = axis === 0 ? 2 : 0;
    min[other] = a0;
    max[other] = a1;
    return [min, max];
  };
  // Rails round the top and bottom of every container in the stack, along both long sides and both ends.
  for (let level = 0; level <= levels; level++) {
    const y = b.min[1] + level * levelH;
    const y0 = Math.max(b.min[1], y - (level === 0 ? 0 : C.rail));
    const y1 = Math.min(b.max[1], y + (level === levels ? 0 : C.rail));
    for (const [axis, otherAxis] of [
      [long, across],
      [across, long],
    ] as const) {
      for (const sideAt of [b.min[otherAxis], b.max[otherAxis] - C.post]) {
        const [min, max] = span(axis, b.min[axis], b.max[axis], sideAt, sideAt + C.post, y0, y1);
        piece(min, max, frame, level === 0);
      }
    }
  }
  // Corner posts, and posts where one container in a row meets the next.
  const count = Math.max(1, Math.round(block.size[long === 0 ? 'x' : 'z'] / C.length));
  for (let i = 0; i <= count; i++) {
    const at = b.min[long] + (i / count) * (b.max[long] - b.min[long]);
    const from = Math.min(Math.max(at - C.post / 2, b.min[long]), b.max[long] - C.post);
    for (const sideAt of [b.min[across], b.max[across] - C.post]) {
      const [min, max] = span(long, from, from + C.post, sideAt, sideAt + C.post, b.min[1], b.max[1]);
      piece(min, max, frame);
    }
  }
  // Locking bars on the doors at one end (which end, from the block's hash): four per container in the stack.
  const doorAt = blockHash(block) % 2 === 0 ? b.min[long] : b.max[long] - C.inset;
  const width = b.max[across] - b.min[across];
  for (let level = 0; level < levels; level++) {
    const y0 = b.min[1] + level * levelH + C.rail;
    const y1 = b.min[1] + (level + 1) * levelH - C.rail;
    for (let k = 1; k <= 4; k++) {
      const at = b.min[across] + (k / 5) * width;
      const [min, max] = span(long, doorAt, doorAt + C.inset, at - C.bar / 2, at + C.bar / 2, y0, y1);
      piece(min, max, bars, false);
    }
  }
}

/** A wall: painted blocks under a concrete coping that stands `overhang` proud of them on both faces. */
function wallPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const thin = block.size.x <= block.size.z ? 0 : 2;
  const body = boundsOf(block);
  body.max[1] -= COPING.height;
  body.min[thin] += COPING.overhang;
  body.max[thin] -= COPING.overhang;
  out.push({ box: body, texture: 'blockWall', uv: 'world', color, grime: true, castShadow: true });
  out.push({ box: { min: [b.min[0], b.max[1] - COPING.height, b.min[2]], max: b.max }, texture: 'concrete', uv: 'world', color, grime: false, castShadow: true });
}

/** A crate standing on the ground: the crate on a pallet (top and bottom decks on three runners), inside its bounds. */
function palletPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const deck = PALLET.height;
  out.push({
    box: { min: [b.min[0] + PALLET.inset, b.min[1] + deck, b.min[2] + PALLET.inset], max: [b.max[0] - PALLET.inset, b.max[1], b.max[2] - PALLET.inset] },
    texture: 'crate',
    uv: 'perFace',
    color,
    grime: false,
    castShadow: true,
  });
  const wood = color.clone().multiplyScalar(PALLET.shade);
  const board = PALLET.deck;
  const add = (min: Cuboid['min'], max: Cuboid['max']): void => {
    out.push({ box: { min, max }, texture: 'crate', uv: 'perFace', color: wood, grime: true, castShadow: true });
  };
  add([b.min[0], b.min[1] + deck - board, b.min[2]], [b.max[0], b.min[1] + deck, b.max[2]]);
  add([b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1] + board, b.max[2]]);
  const depth = b.max[2] - b.min[2];
  for (const at of [0, 0.5, 1]) {
    const z0 = b.min[2] + at * (depth - PALLET.runner);
    add([b.min[0], b.min[1] + board, z0], [b.max[0], b.min[1] + deck - board, z0 + PALLET.runner]);
  }
}

/** True if `block` stands on a crate (stacked crates share one pallet, under the bottom one). */
function onCrate(block: MapBlock, blocks: readonly MapBlock[]): boolean {
  const bottom = block.center.y - block.size.y / 2;
  return blocks.some(
    (o) =>
      o !== block &&
      o.kind === 'crate' &&
      Math.abs(o.center.y + o.size.y / 2 - bottom) < TOUCH &&
      Math.abs(o.center.x - block.center.x) < (o.size.x + block.size.x) / 2 &&
      Math.abs(o.center.z - block.center.z) < (o.size.z + block.size.z) / 2,
  );
}

/** Every piece a block is drawn as (most are just the block itself). Exported for the tests. */
export function blockPieces(block: MapBlock, blocks: readonly MapBlock[]): Piece[] {
  const style = styleOf(block);
  const color = new THREE.Color().setHex(blockTint(block), THREE.SRGBColorSpace).multiplyScalar(blockShade(block));
  const out: Piece[] = [];
  if (block.kind === 'container') containerPieces(block, color, out);
  else if (block.kind === 'wall') wallPieces(block, color, out);
  else if (block.kind === 'crate' && !onCrate(block, blocks)) palletPieces(block, color, out);
  else out.push({ box: boundsOf(block), texture: style.texture, uv: style.uv, color, grime: style.grime, castShadow: style.castShadow });
  return out;
}

/**
 * The material for a merged surface mesh: its texture, doubled as a bump map when surface relief is on (the bump
 * scale is set once; it does nothing while there is no bump map).
 */
function surfaceMaterial(tex: ProceduralTexture, id: SurfaceTextureId, relief: boolean): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: tex.texture, vertexColors: true, bumpScale: SURFACES.relief[id] });
  setMaterialRelief(mat, relief);
  return mat;
}

function setMaterialRelief(mat: THREE.MeshLambertMaterial, on: boolean): void {
  const map = on ? mat.map : null;
  if (mat.bumpMap === map) return;
  mat.bumpMap = map;
  mat.needsUpdate = true;
}

/** Surface relief on or off for a built map (Settings → Graphics → Quality): the shaders rebuild once. */
export function setMapRelief(group: THREE.Group, on: boolean): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) setMaterialRelief(obj.material, on);
  });
}

/**
 * Builds the static level as one merged mesh per surface texture (and whether it casts shadows): a handful of draw
 * calls for the whole map, details included. Returns a group; call `disposeMapMeshes` to free GPU resources.
 */
export function buildMapMeshes(map: MapData, textures: SurfaceTextures, relief: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'map';
  const meshes = new Map<string, { buf: Buffers; texture: SurfaceTextureId; castShadow: boolean }>();
  const entry = (texture: SurfaceTextureId, castShadow: boolean): Buffers => {
    const key = `${texture}${castShadow ? '' : '-flat'}`;
    let e = meshes.get(key);
    if (!e) meshes.set(key, (e = { buf: { positions: [], normals: [], uvs: [], colors: [], indices: [] }, texture, castShadow }));
    return e.buf;
  };

  for (const block of map.blocks) {
    if (block.kind === 'ramp') {
      const style = styleOf(block);
      const color = new THREE.Color().setHex(blockTint(block), THREE.SRGBColorSpace).multiplyScalar(blockShade(block));
      appendRamp(entry(style.texture, style.castShadow), block, textures[style.texture], color);
      continue;
    }
    const bottom = block.center.y - block.size.y / 2;
    for (const p of blockPieces(block, map.blocks)) {
      appendCuboid(entry(p.texture, p.castShadow), p.box, { uv: p.uv, tex: textures[p.texture], color: p.color, grimeFrom: p.grime ? bottom : null });
    }
  }

  for (const [key, { buf, texture, castShadow }] of meshes) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
    geo.setIndex(buf.indices);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, surfaceMaterial(textures[texture], texture, relief));
    mesh.name = `map-${key}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  return group;
}

export function disposeMapMeshes(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
  });
  group.removeFromParent();
}
