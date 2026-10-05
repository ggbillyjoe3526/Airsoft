import type { MapId } from './maps';
import type { MapData } from './mapTypes';
import { NEON_HEIGHTS } from './neonHeights';
import { WOODLAND } from './woodland';

/**
 * The dev maps' data (M50, audit CORE-01): imported only through map/maps.ts loadDevMaps, so the bundler gives it its
 * own chunk, fetched once Dev content is on. A map that goes public moves its import to map/maps.ts.
 */
export const DEV_MAP_DATA: Partial<Record<MapId, MapData>> = { woodland: WOODLAND, neonHeights: NEON_HEIGHTS };
