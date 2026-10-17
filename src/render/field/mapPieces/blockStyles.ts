import { SURFACES, type SurfaceTextureId } from '../../../config/render';
import type { BlockKind, MapBlock } from '../../../map/mapTypes';
import type { UvMode } from '../cuboidMesh';

/**
 * How each block kind is painted (A8): its surface, UVs, tint palette, shadow and grime, and the per-block tint and
 * shade picked from a hash of its position. Read by the piece builders, the merged meshes and the light bake.
 */
export interface KindStyle {
  texture: SurfaceTextureId;
  uv: UvMode;
  /** Tint palette; each block picks one from its position (see blockTint) so props don't look cloned. */
  tints: number[];
  castShadow: boolean;
  /** Its sides darken towards their foot (SURFACES.grimeHeight): dirt and contact shade where they meet the ground. */
  grime: boolean;
  /** With map detail, its faces are cut into tiles this size for the baked shade (default SURFACES.occlusion.cell). */
  cell?: number;
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
  // Site props (M25b): each kind's main colour; their details are shades of it (propPieces.ts).
  toilet: { texture: 'barrier', uv: 'world', tints: [0x5f8f5c, 0x7d8a78, 0xa9a48e], castShadow: true, grime: true },
  rack: { texture: 'barrier', uv: 'world', tints: [0x8a9096, 0x6f7c6a], castShadow: true, grime: true },
  gabion: { texture: 'gabion', uv: 'world', tints: [0xffffff, 0xe8eaec], castShadow: true, grime: true },
  wrapped: { texture: 'barrier', uv: 'world', tints: [0xe9ecef, 0xddd8cc], castShadow: true, grime: true },
  ibc: { texture: 'barrier', uv: 'world', tints: [0xf2f0ea, 0xe6e2d6], castShadow: true, grime: true },
  sandbags: { texture: 'sandbag', uv: 'world', tints: [0xffffff, 0xeee6d6], castShadow: true, grime: true },
  generator: { texture: 'barrier', uv: 'world', tints: [0xcdb338, 0x5f7f52], castShadow: true, grime: true },
  skip: { texture: 'corrugated', uv: 'world', tints: [0xcdb338, 0x4f8a57, 0x7a8288], castShadow: true, grime: true },
  // The woods (M33; M33i's look, render/field/natureShapes.ts): trunks and logs in bark, boulders in stone, the fence in
  // weathered boards. Trunks stay mid-value, so a figure in front of one still reads (readability first).
  tree: { texture: 'bark', uv: 'world', tints: [0xccbca6, 0xbeb09a, 0xd4c4ae], castShadow: true, grime: true },
  boulder: { texture: 'stone', uv: 'world', tints: [0xd6d2ca, 0xc8c4bc, 0xdcd6cc], castShadow: true, grime: true },
  log: { texture: 'bark', uv: 'world', tints: [0xd2c0a4, 0xc6b69c], castShadow: true, grime: true },
  // Long boundary panels with little near enough to shade them: coarse tiles (M33i, Medium's triangle ceiling).
  fence: { texture: 'planks', uv: 'world', tints: [0xd8d0c4, 0xccc4b8], castShadow: true, grime: true, cell: SURFACES.occlusion.coarseCell },
  // The city (M34f, render/field/mapPieces/cityProps.ts): drawn as more than a box, in their paint (MapBlock.paint) or these.
  cabinet: { texture: 'barrier', uv: 'world', tints: [0x3a2b4a, 0x2b3a35], castShadow: true, grime: true },
  vending: { texture: 'barrier', uv: 'world', tints: [0xe0459a, 0x2fc9a0, 0xf2f0ea], castShadow: true, grime: true },
  stall: { texture: 'barrier', uv: 'world', tints: [0xe0459a, 0x2fb59a, 0xe8d040], castShadow: true, grime: true },
  planter: { texture: 'planks', uv: 'world', tints: [0xe0d6c8, 0xd6ccbe], castShadow: true, grime: true },
  booth: { texture: 'barrier', uv: 'world', tints: [0x2fb59a, 0xd04098], castShadow: true, grime: true },
  van: { texture: 'barrier', uv: 'world', tints: [0xf2f0ea, 0x9ad8c0], castShadow: true, grime: true },
};

/** A steel floor or ramp (MapBlock.surface 'metal', which also clanks underfoot): diamond tread plate in plain steel. */
const METAL_PLATE: KindStyle = { texture: 'steelPlate', uv: 'world', tints: [0xf4f6f8], castShadow: false, grime: false };

/**
 * How a block is drawn: in its finish if it has one (M34f: that surface, with its kind's shadow and grime), else as its
 * kind (a steel floor or ramp as tread plate).
 */
export function styleOf(block: MapBlock): KindStyle {
  if (block.finish) {
    const kind = STYLES[block.kind];
    return { texture: block.finish, uv: 'world', tints: kind.tints, castShadow: kind.castShadow, grime: kind.grime, ...(kind.cell === undefined ? {} : { cell: kind.cell }) };
  }
  return block.surface === 'metal' ? METAL_PLATE : STYLES[block.kind];
}

/** Whether a block's mesh casts the sun's shadow: its kind's rule, and every floor or ramp that rises above the ground (a dock). */
export function castsShadow(block: MapBlock): boolean {
  if (styleOf(block).castShadow) return true;
  return (block.kind === 'floor' || block.kind === 'ramp') && block.center.y + block.size.y / 2 > SURFACES.raisedFrom;
}

/** A hash of a block's position. It uses |x|, so a block and its mirror twin across x = 0 always hash the same. */
export function blockHash(block: MapBlock): number {
  const q = (v: number): number => Math.round(v * 10);
  return (Math.imul(q(Math.abs(block.center.x)), 73856093) ^ Math.imul(q(block.center.y), 19349663) ^ Math.imul(q(block.center.z), 83492791)) >>> 0;
}

/**
 * Tint for a block: its paint (M34f), else picked from its kind's palette by a hash of its position, so a symmetric map
 * looks symmetric.
 */
export function blockTint(block: MapBlock): number {
  if (block.paint !== undefined) return block.paint;
  const tints = styleOf(block).tints;
  return tints[blockHash(block) % tints.length] ?? 0xffffff;
}

/** A block's brightness (1 - SURFACES.shadeJitter .. 1), from other bits of the same hash: tint stays its hue. */
export function blockShade(block: MapBlock): number {
  return 1 - SURFACES.shadeJitter * (((blockHash(block) >>> 8) % 101) / 100);
}
