import type { RangeTargetKind } from '../config/range';
import type { FireMode } from '../config/replicas';
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
  /** Reload pressed but no spare magazine has more BBs than the loaded one: nothing happens (the HUD says why). */
  | { type: 'reloadRefused'; characterId: number; replicaId: string }
  | { type: 'draw'; characterId: number; replicaId: string }
  /** The fire selector moved to `mode`. */
  | { type: 'fireMode'; characterId: number; replicaId: string; mode: FireMode }
  /** A BB hit level geometry; `ownerId` fired it. */
  | { type: 'bbImpact'; position: Vec3; ownerId: number }
  /** A character's footstep or landing, heard at its feet (walking and crouched moves are silent). */
  | { type: 'footstep'; characterId: number; kind: FootstepKind }
  /**
   * A BB hit a character: they are eliminated and start calling their hit. `direction` is the BB's flight direction;
   * `ricochet`: it had bounced off something first (only when the match counts ricochets).
   */
  | { type: 'characterHit'; victimId: number; shooterId: number; position: Vec3; direction: Vec3; ricochet: boolean }
  /** A ricochet ticked a character, in a match where ricochets don't count (M20): they feel it and play on. */
  | { type: 'ricochetTick'; victimId: number; shooterId: number; position: Vec3; direction: Vec3 }
  /** A BB went without hitting anything: it fell out of the level or flew past its lifetime (M21: the range's readout). */
  | { type: 'bbLost'; position: Vec3; ownerId: number }
  /** A BB hit a practice range target (M21; sim/rangeTargets.ts). `ricochet`: it had bounced on the way. */
  | { type: 'targetHit'; targetId: number; kind: RangeTargetKind; shooterId: number; position: Vec3; ricochet: boolean }
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
