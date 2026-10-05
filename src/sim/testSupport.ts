import { NAV } from '../config/nav';
import type { MapData, SpawnPoint } from '../map/mapTypes';
import { buildNavGrid } from '../nav/navGrid';
import { createEliminationContext, deadZoneFields, type EliminationContext } from './elimination';
import { vec3 } from './vec';

/** Test fixture: a 100 m open floor with nothing on it, and its nav grid. Only used by tests. */
export const OPEN_FIELD: MapData = {
  name: 'Open field',
  blocks: [{ kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(100, 0.5, 100) }],
  killY: -10,
  spawns: [[], []],
  deadZones: [[], []],
  lanes: [],
};

export const OPEN_NAV = buildNavGrid(OPEN_FIELD, NAV);

/**
 * The open field's dead-zone fields by spots (a field is a search over 250,000 nodes, about 65 ms: a test that builds a
 * context in a loop, or a hundred tests that each build one, would pay it every time; fields are only ever read).
 */
const FIELDS = new Map<string, Float32Array[]>();

/** Elimination context on the open field with the given dead-zone spots. */
export function openFieldElimination(deadZones: readonly (readonly SpawnPoint[])[]): EliminationContext {
  const key = JSON.stringify(deadZones.map((spots) => spots.map((p) => [p.position.x, p.position.y, p.position.z])));
  let fields = FIELDS.get(key);
  if (!fields) {
    fields = deadZoneFields(deadZones, OPEN_NAV, NAV.snap);
    FIELDS.set(key, fields);
  }
  return createEliminationContext(deadZones, OPEN_NAV, NAV.snap, fields);
}
