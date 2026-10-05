import { NAV } from '../config/nav';
import type { MapData, SpawnPoint } from '../map/mapTypes';
import { buildNavGrid } from '../nav/navGrid';
import { createEliminationContext, type EliminationContext } from './elimination';
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

/** Elimination context on the open field with the given dead-zone spots. */
export function openFieldElimination(deadZones: readonly (readonly SpawnPoint[])[]): EliminationContext {
  return createEliminationContext(deadZones, OPEN_NAV, NAV.snap);
}
