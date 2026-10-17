import { MAP_EXCEPTIONS, type MapException, PUBLIC_MAPS } from '../config/contentRules';
import { TEAM_COLOUR_SETS } from '../config/teams';
import type { MapEntry } from '../map/maps';
import type { MapBlock } from '../map/mapTypes';
import { blockTint } from '../render/field/mapPieces/blockStyles';
import type { Vec3 } from '../sim/vec';
import { num } from './checks';

/** What the map checks share (CT2): their context, how a map, block or point reads in a result. */

/** What the map checks read besides the map: the registers, the team colours and how a block is coloured. */
export interface MapContext {
  publicMaps: Readonly<Record<string, string>>;
  exceptions: Readonly<Record<string, MapException>>;
  /** Every team colour of every set (Settings › Accessibility). */
  teamColours: readonly number[];
  /** A block's drawn colour (render/field/mapPieces/blockStyles.ts blockTint: its paint, or its kind's palette). */
  tint(block: MapBlock): number;
  /** The ids of the other maps in the list, so an id is never used twice. */
  ids: readonly string[];
}

/** The game's own context. */
export function gameMapContext(ids: readonly string[] = []): MapContext {
  return {
    publicMaps: PUBLIC_MAPS,
    exceptions: MAP_EXCEPTIONS,
    teamColours: Object.values(TEAM_COLOUR_SETS).flatMap((s) => s.figures),
    tint: blockTint,
    ids,
  };
}

export const at = (p: Readonly<Vec3>): string => `${num(p.x, 1)}, ${num(p.y, 1)}, ${num(p.z, 1)}`;
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A map's name in a result: its label and id. */
export const mapItem = (entry: Pick<MapEntry, 'id' | 'label'>): string => `${entry.label} (${entry.id})`;

/** A block in a result: its kind and where it stands. */
export const where = (b: MapBlock): string => `${b.kind} at ${b.center.x.toFixed(2)}, ${b.center.y.toFixed(2)}, ${b.center.z.toFixed(2)}`;
