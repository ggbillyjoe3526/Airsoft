import { SURFACES } from '../../../config/render';
import type { MapBlock } from '../../../map/mapTypes';
import { type CuboidShape, PLAIN } from '../cuboidMesh';
import { type Occluders, occlusionAt, occlusionShade } from '../vertexOcclusion';
import { styleOf } from './blockStyles';
import type { Piece } from './pieceKit';

/**
 * What map detail adds to a piece: its bevel, its tiles and its baked shade (or, without detail, `plain`: the plain box,
 * or the box cut into tiles for Low's baked light to land on).
 */
export function pieceShape(piece: Piece, block: MapBlock, index: number, occ: Occluders | null, plain: CuboidShape = PLAIN): CuboidShape {
  if (!occ) return plain;
  const O = SURFACES.occlusion;
  const B = SURFACES.bevel;
  const flat = block.kind === 'floor' || block.kind === 'ramp';
  const thinnest = Math.min(piece.box.max[0] - piece.box.min[0], piece.box.max[1] - piece.box.min[1], piece.box.max[2] - piece.box.min[2]);
  const bevel = flat || thinnest < B.minPiece ? 0 : Math.min(B.size, B.maxShare * thinnest);
  const ground = block.kind === 'floor';
  return {
    bevel,
    cell: styleOf(block).cell ?? O.cell,
    shade: (x, y, z, nx, ny, nz) => {
      const k = occlusionShade(occlusionAt(occ, x, y, z, nx, ny, nz, O.lift, index), O.strength);
      return ground && ny > 0.9 ? k * (1 + SURFACES.groundNoise.amount * groundNoise(x, z)) : k;
    },
  };
}

/** A smooth value noise over the ground (-1..1), about SURFACES.groundNoise.period metres from light to dark. */
export function groundNoise(x: number, z: number): number {
  const G = SURFACES.groundNoise;
  const fx = x / G.period;
  const fz = z / G.period;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const hash = (a: number, b: number): number => ((Math.imul(a * 73856093 ^ b * 19349663 ^ G.seed, 0x5bd1e995) >>> 0) / 4294967295) * 2 - 1;
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const tx = smooth(fx - ix);
  const tz = smooth(fz - iz);
  const top = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * tx;
  const bottom = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * tx;
  return top + (bottom - top) * tz;
}
