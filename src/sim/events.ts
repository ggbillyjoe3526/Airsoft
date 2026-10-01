import type { FootstepKind } from './footsteps';
import type { Vec3 } from './vec';

/**
 * Things that happened during a tick, for presentation (sound, effects, HUD). The simulation never
 * reads them back. Cleared at the start of every tick.
 */
export type GameEvent =
  | { type: 'shot'; characterId: number; replicaId: string; position: Vec3 }
  | { type: 'dryFire'; characterId: number; replicaId: string }
  | { type: 'reloadStart'; characterId: number; replicaId: string }
  | { type: 'reloadEnd'; characterId: number; replicaId: string }
  | { type: 'draw'; characterId: number; replicaId: string }
  | { type: 'bbImpact'; position: Vec3 }
  /** A character's footstep or landing, heard at its feet (walking and crouched moves are silent). */
  | { type: 'footstep'; characterId: number; kind: FootstepKind }
  /** A BB hit a character: they are eliminated and start calling their hit. `direction` is the BB's flight direction. */
  | { type: 'characterHit'; victimId: number; shooterId: number; position: Vec3; direction: Vec3 }
  /**
   * A round ended: `winner` is the team that won it, or -1 for a draw (elimination: time ran out, or
   * both teams out at once). In flag mode the attackers win by raising the flag ('captured') and the
   * defenders when time runs out.
   */
  | { type: 'roundOver'; winner: number; reason: RoundEndReason }
  | { type: 'matchOver'; winner: number }
  | { type: 'roundStart'; round: number }
  /** The flag passed another notch of its rope, going up (`raising`) or being pulled down. */
  | { type: 'flagRope'; position: Vec3; raising: boolean };

export type RoundEndReason = 'eliminated' | 'time' | 'captured';
