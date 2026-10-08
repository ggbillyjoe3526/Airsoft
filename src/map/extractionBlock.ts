import type { Vec3 } from '../sim/vec';
import type { CaseSpot, ExitZone, ExtractionData, Insertion, SpawnPoint } from './mapTypes';

/**
 * What every map's Extraction block shares (M51, audit CORE-16): its points written on the map's own plan, then placed
 * on the level by the map's own helpers, so a map file holds only its numbers. Each map's data tests
 * (extractionData.test.ts, extractionRegens.test.ts) check every placed point against the real level.
 */

/** A case's or a returner's facing on the plan (as a spawn's yaw: a case's front, its back to the wall beside it). */
export const FACING = { north: Math.PI, south: 0, east: -Math.PI / 2, west: Math.PI / 2 } as const;

/** What a case spot may hold (pool.md Caches' Keys): the marshal's locker spot, a room's, a lane's. */
export const SPOT_KINDS = {
  locker: ['locker', 'field-case'],
  room: ['field-case', 'ammo-can'],
  lane: ['ammo-can'],
} as const satisfies Record<string, readonly string[]>;

/** A point on a map's plan: x, the floor's height and z (a map on one floor gives 0; its placer finds the ground). */
export type PlanPoint = readonly [x: number, y: number, z: number];

/** A map's run, on its plan (ExtractionData's fields, before placing). */
export interface RunPlan {
  runTime: number;
  baseOpponents: number;
  regenDistance: number;
  exitRadius: number;
  /** In world coordinates already: a squad goes in where a team would start. */
  insertions: readonly (Omit<Insertion, 'spawns'> & { spawns: readonly SpawnPoint[] })[];
  exits: readonly { name: string; at: PlanPoint; late?: boolean }[];
  opponentStarts: readonly PlanPoint[];
  cases: readonly (readonly [x: number, y: number, z: number, yaw: number, kinds: readonly string[]])[];
  regens: readonly (readonly [x: number, y: number, z: number, yaw: number])[];
  insertionBerth?: number;
}

/** How a map puts a plan point on its level: as a point (an exit's centre) and as a spawn (facing `yaw` on the plan). */
export interface PlanPlacer {
  point(at: PlanPoint): Vec3;
  spawn(at: PlanPoint, yaw: number): SpawnPoint;
}

/** The map's ExtractionData: every plan point placed by `at`. */
export function placeRun(plan: RunPlan, at: PlanPlacer): ExtractionData {
  return {
    runTime: plan.runTime,
    baseOpponents: plan.baseOpponents,
    insertions: plan.insertions.map((i) => ({ ...i, spawns: [...i.spawns] })),
    exits: plan.exits.map((e): ExitZone => ({ name: e.name, position: at.point(e.at), radius: plan.exitRadius, ...(e.late ? { late: true } : {}) })),
    opponentStarts: plan.opponentStarts.map((p) => at.spawn(p, 0)),
    cases: plan.cases.map(([x, y, z, yaw, kinds]): CaseSpot => ({ ...at.spawn([x, y, z], yaw), kinds: [...kinds] })),
    regens: plan.regens.map(([x, y, z, yaw]) => at.spawn([x, y, z], yaw)),
    regenDistance: plan.regenDistance,
    ...(plan.insertionBerth !== undefined ? { insertionBerth: plan.insertionBerth } : {}),
  };
}
