import * as THREE from 'three';
import type { BlockKind, MapBlock, MapData } from '../map/mapTypes';
import { RAMP_FACES, rampCorners } from '../map/surfaces';
import type { ProceduralTexture, SurfaceTextures } from './proceduralTextures';

type UvMode = 'world' | 'perFace';

interface KindStyle {
  texture: keyof SurfaceTextures;
  uv: UvMode;
  /** Tint palette; each block picks one from its position (see blockTint) so props don't look cloned. */
  tints: number[];
  castShadow: boolean;
}

/** Colours are warm and friendly: an airsoft site, not a military base. */
const STYLES: Record<BlockKind, KindStyle> = {
  floor: { texture: 'concrete', uv: 'world', tints: [0xffffff], castShadow: false },
  ramp: { texture: 'concrete', uv: 'world', tints: [0xffffff], castShadow: false },
  wall: { texture: 'blockWall', uv: 'world', tints: [0xffffff, 0xf2efe6], castShadow: true },
  crate: { texture: 'crate', uv: 'perFace', tints: [0xffffff, 0xe8dcc8, 0xd8ccb4], castShadow: true },
  // No team blue or orange on neutral props: those colours belong to the teams.
  container: { texture: 'corrugated', uv: 'world', tints: [0x4f8a57, 0xcdb338, 0x7a8288, 0x4f7a80], castShadow: true },
  barrier: { texture: 'barrier', uv: 'world', tints: [0xe8e4da, 0xd9c04a], castShadow: true },
};


/**
 * Tint for a block, picked from its kind's palette by a hash of its position. The hash uses |x|, so a
 * block and its mirror twin across x = 0 always match and a symmetric map looks symmetric.
 */
export function blockTint(block: MapBlock): number {
  const tints = STYLES[block.kind].tints;
  const q = (v: number): number => Math.round(v * 10);
  const h = (Math.imul(q(Math.abs(block.center.x)), 73856093) ^ Math.imul(q(block.center.y), 19349663) ^ Math.imul(q(block.center.z), 83492791)) >>> 0;
  return tints[h % tints.length] ?? 0xffffff;
}

interface Buffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

// Face definitions: normal, and the two axes used for U and V.
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
] as const;

const tmpColor = new THREE.Color();

function appendBox(buf: Buffers, block: MapBlock, uvMode: UvMode, tex: ProceduralTexture, tint: number): void {
  const { center: c, size: s } = block;
  const half = [s.x / 2, s.y / 2, s.z / 2] as const;
  const centre = [c.x, c.y, c.z] as const;
  tmpColor.setHex(tint, THREE.SRGBColorSpace);

  for (const f of FACES) {
    const base = buf.positions.length / 3;
    // Half extents along the face's u and v axes.
    const hu = Math.abs(f.u[0]) * half[0] + Math.abs(f.u[1]) * half[1] + Math.abs(f.u[2]) * half[2];
    const hv = Math.abs(f.v[0]) * half[0] + Math.abs(f.v[1]) * half[1] + Math.abs(f.v[2]) * half[2];
    const hn = Math.abs(f.n[0]) * half[0] + Math.abs(f.n[1]) * half[1] + Math.abs(f.n[2]) * half[2];

    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const px = centre[0] + f.n[0] * hn + f.u[0] * hu * su + f.v[0] * hv * sv;
      const py = centre[1] + f.n[1] * hn + f.u[1] * hu * su + f.v[1] * hv * sv;
      const pz = centre[2] + f.n[2] * hn + f.u[2] * hu * su + f.v[2] * hv * sv;
      buf.positions.push(px, py, pz);
      buf.normals.push(f.n[0], f.n[1], f.n[2]);
      buf.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      if (uvMode === 'world') {
        const u = (px * f.u[0] + py * f.u[1] + pz * f.u[2]) / tex.worldSize;
        const v = (px * f.v[0] + py * f.v[1] + pz * f.v[2]) / tex.worldSize;
        buf.uvs.push(u, v);
      } else {
        buf.uvs.push((su + 1) / 2, (sv + 1) / 2);
      }
    }
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
function appendRamp(buf: Buffers, block: MapBlock, tex: ProceduralTexture, tint: number): void {
  const c = block.center;
  const p = rampCorner;
  rampCorners(block, p);
  tmpColor.setHex(tint, THREE.SRGBColorSpace);
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
      buf.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      buf.uvs.push((px * f.u[0] + py * f.u[1] + pz * f.u[2]) / tex.worldSize, (px * f.v[0] + py * f.v[1] + pz * f.v[2]) / tex.worldSize);
    }
    for (let k = 2; k < face.length; k++) buf.indices.push(base, base + k - 1, base + k);
  }
}

/**
 * Builds the static level as one merged mesh per surface texture (a handful of draw calls for the
 * whole map). Returns a group; call `disposeMapMeshes` to free GPU resources.
 */
export function buildMapMeshes(map: MapData, textures: SurfaceTextures): THREE.Group {
  const group = new THREE.Group();
  group.name = 'map';
  const byTexture = new Map<keyof SurfaceTextures, { buf: Buffers; castShadow: boolean }>();

  for (const block of map.blocks) {
    const style = STYLES[block.kind];
    let entry = byTexture.get(style.texture);
    if (!entry) {
      entry = { buf: { positions: [], normals: [], uvs: [], colors: [], indices: [] }, castShadow: false };
      byTexture.set(style.texture, entry);
    }
    entry.castShadow ||= style.castShadow;
    const tint = blockTint(block);
    if (block.kind === 'ramp') appendRamp(entry.buf, block, textures[style.texture], tint);
    else appendBox(entry.buf, block, style.uv, textures[style.texture], tint);
  }

  for (const [texKey, { buf, castShadow }] of byTexture) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
    geo.setIndex(buf.indices);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ map: textures[texKey].texture, vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `map-${texKey}`;
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
