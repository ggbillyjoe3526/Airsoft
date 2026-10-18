import * as THREE from 'three';
import type { BlockKind, MapBlock } from '../../../map/mapTypes';
import { blockShade, blockTint } from './blockStyles';
import { cityPropPieces, type CityPropKind } from './cityProps';
import { type Piece, plainPieces } from './pieceKit';
import { gabionPieces, generatorPieces, ibcPieces, rackPieces, sandbagPieces, skipPieces, toiletPieces, wrappedPieces } from './propPieces';
import { barrierPieces, ceilingPieces, containerPieces, hasCeiling, onCrate, palletPieces, wallPieces } from './sitePieces';

/**
 * What each block kind is drawn as (A8): one builder a kind, every kind listed, so a new kind picks its own. A builder
 * pushes the block's pieces into `out`, each inside the block; `detail` is QualitySettings.mapDetail, `blocks` the
 * map's drawn blocks (a crate on a crate shares the bottom one's pallet).
 */
export type PieceBuilder = (block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean, blocks: readonly MapBlock[]) => void;

/** A city prop (M34f, cityProps.ts): only ever handed a block of its own kind. */
const cityProp: PieceBuilder = (block, color, out) => cityPropPieces(block as MapBlock & { kind: CityPropKind }, color, out);

/**
 * The builders by kind. One box (plainPieces): floors, fences, and the woods' trunks, boulders and logs (drawn in their
 * shape over it, natureShapes.ts); a ramp's mesh is its wedge (rampWedge.ts).
 */
export const PIECE_BUILDERS: Readonly<Record<BlockKind, PieceBuilder>> = {
  floor: plainPieces,
  ramp: plainPieces,
  wall: wallPieces,
  crate: (block, color, out, detail, blocks) => (onCrate(block, blocks) ? plainPieces(block, color, out) : palletPieces(block, color, out, detail)),
  container: containerPieces,
  // Map detail recesses a plastic barrier's top; a steel one stays a box.
  barrier: (block, color, out, detail) => (detail && block.surface !== 'metal' ? barrierPieces(block, color, out) : plainPieces(block, color, out)),
  toilet: toiletPieces,
  rack: rackPieces,
  gabion: gabionPieces,
  wrapped: wrappedPieces,
  ibc: ibcPieces,
  sandbags: sandbagPieces,
  generator: generatorPieces,
  skip: skipPieces,
  tree: plainPieces,
  boulder: plainPieces,
  log: plainPieces,
  fence: plainPieces,
  cabinet: cityProp,
  vending: cityProp,
  stall: cityProp,
  planter: cityProp,
  booth: cityProp,
  van: cityProp,
};

/**
 * Every piece a block is drawn as (most are just the block itself); `detail` (QualitySettings.mapDetail) adds the
 * finer prop detail. Every piece stays inside its block either way. A finished block (M34f) is one box in its finish;
 * a wall keeps its coping, a raised floor has a ceiling under it.
 */
export function blockPieces(block: MapBlock, blocks: readonly MapBlock[], detail = false): Piece[] {
  const color = new THREE.Color().setHex(blockTint(block), THREE.SRGBColorSpace).multiplyScalar(blockShade(block));
  const out: Piece[] = [];
  if (hasCeiling(block)) ceilingPieces(block, color, out);
  else if (block.finish && block.kind === 'wall') wallPieces(block, color, out);
  else if (block.finish) plainPieces(block, color, out);
  else PIECE_BUILDERS[block.kind](block, color, out, detail, blocks);
  return out;
}
