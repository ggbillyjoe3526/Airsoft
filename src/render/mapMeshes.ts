import * as THREE from 'three';
import type { BlockKind, MapBlock, MapData } from '../map/mapTypes';
import type { ProceduralTexture, SurfaceTextures } from './proceduralTextures';

type UvMode = 'world' | 'perFace';

interface KindStyle {
  texture: keyof SurfaceTextures;
  uv: UvMode;
  /** Tints cycled per block so repeated props don't look cloned. */
  tints: number[];
  castShadow: boolean;
}

/** Colours are warm and friendly: an airsoft site, not a military base. */
const STYLES: Record<BlockKind, KindStyle> = {
  floor: { texture: 'concrete', uv: 'world', tints: [0xffffff], castShadow: false },
  wall: { texture: 'blockWall', uv: 'world', tints: [0xffffff, 0xf2efe6], castShadow: true },
  crate: { texture: 'crate', uv: 'perFace', tints: [0xffffff, 0xe8dcc8, 0xd8ccb4], castShadow: true },
  container: { texture: 'corrugated', uv: 'world', tints: [0x3d6ea8, 0xb5533c, 0x4f8a57, 0xd2a23a], castShadow: true },
  barrier: { texture: 'barrier', uv: 'world', tints: [0xf07c2a, 0xf2f2ea], castShadow: true },
};

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

/**
 * Builds the static level as one merged mesh per surface texture (a handful of draw calls for the
 * whole map). Returns a group; call `disposeMapMeshes` to free GPU resources.
 */
export function buildMapMeshes(map: MapData, textures: SurfaceTextures): THREE.Group {
  const group = new THREE.Group();
  group.name = 'map';
  const byTexture = new Map<keyof SurfaceTextures, { buf: Buffers; castShadow: boolean }>();
  const tintCounters = new Map<BlockKind, number>();

  for (const block of map.blocks) {
    const style = STYLES[block.kind];
    let entry = byTexture.get(style.texture);
    if (!entry) {
      entry = { buf: { positions: [], normals: [], uvs: [], colors: [], indices: [] }, castShadow: false };
      byTexture.set(style.texture, entry);
    }
    entry.castShadow ||= style.castShadow;
    const n = tintCounters.get(block.kind) ?? 0;
    tintCounters.set(block.kind, n + 1);
    const tint = style.tints[n % style.tints.length] ?? 0xffffff;
    appendBox(entry.buf, block, style.uv, textures[style.texture], tint);
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
