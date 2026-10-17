import type { RangeTargetKind } from '../config/range';
import type { FireMode } from '../config/replicas';
import type { FloorSurface } from '../config/sounds';
import type { BlockKind } from '../map/mapTypes';
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
  /** A weapon torch was switched `on` or off (M33h): its click. */
  | { type: 'torch'; characterId: number; on: boolean }
  /** The fire selector moved to `mode`. */
  | { type: 'fireMode'; characterId: number; replicaId: string; mode: FireMode }
  /**
   * The hop-up dial of the replica in hand was turned (Dev 6 playtest item 15): it now reads `dial`; `moved` is false
   * when it was already at the end of its range in that direction (the HUD still shows where it is).
   */
  | { type: 'hopUp'; characterId: number; replicaId: string; dial: number; moved: boolean }
  /**
   * A BB hit level geometry; `ownerId` fired it. `bodyId` is set when it stopped on a body that couldn't be knocked out
   * (M85: already hit, a teammate with friendly fire off, a cease-fire, a grace): a soft knock on that body, no dust.
   * `leaves` is set when a bush's leaves stopped it (Dev 6 item 44, sim/leaves.ts): a rustle and leaves, no tick.
   * `from` is set once the BB has bounced (KI2): where this tick's path began, the side it came from (before a bounce
   * that is the shooter's side, so presentation reads `ownerId` instead).
   */
  | { type: 'bbImpact'; position: Vec3; ownerId: number; bodyId?: number; leaves?: true; from?: Vec3 | undefined }
  /**
   * A BB came out through the edge of a bush and flew on, thrown off its line (Dev 6 item 44): a brush of leaves there.
   * `from` as for bbImpact.
   */
  | { type: 'bbLeaves'; position: Vec3; ownerId: number; from?: Vec3 | undefined }
  /**
   * A character's footstep or landing, heard at its feet (walking and crouched moves are silent). `surface`: what a run,
   * sprint or landing came down on (WorldQuery.surfaceUnder; absent where the world can't tell, or for a hi-cap's
   * rattle and a vault): steps on noisy ground carry further (NP1, NOISE.ground).
   */
  | { type: 'footstep'; characterId: number; kind: FootstepKind; surface?: FloorSurface | undefined }
  /**
   * A noisy prop made a noise (NP1, sim/propNoise.ts): `characterId` ran into it, or (`shot`) a BB of theirs rang off it.
   * `prop` is its index in WorldQuery.noisyProps, `kind` its block kind, `position` where on it; the other team's bots
   * within `range` m hear it (walls muffling it), and only those with no fresher news turn to a BB's ring.
   */
  | { type: 'propNoise'; characterId: number; prop: number; kind: BlockKind; position: Vec3; range: number; shot: boolean }
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
   * A round ended: `winner` is the team that won it, or -1 for a draw (elimination: time ran out with nobody taking the
   * overtime flag, or both teams out at once). In flag mode the attackers win by raising the flag ('captured') and the
   * defenders when time runs out.
   */
  | { type: 'roundOver'; winner: number; reason: RoundEndReason }
  | { type: 'matchOver'; winner: number }
  | { type: 'roundStart'; round: number }
  /** The flag passed another notch of its rope, going up (`raising`) or being pulled down. */
  | { type: 'flagRope'; position: Vec3; raising: boolean }
  /**
   * Elimination (Dev 6 item 45): the clock ran out with the teams level and the overtime flag went up at `position`: the
   * first team to touch it wins the round (sim/overtimeFlag.ts).
   */
  | { type: 'overtime'; position: Vec3 }
  /** Extraction (M43): a hit squad member is back at the insertion, with `respawnsLeft` more this run. */
  | { type: 'respawned'; characterId: number; respawnsLeft: number }
  /** Extraction (M45): a hit opponent back in play in a wave, at a regen point out of the squad's sight. */
  | { type: 'returned'; characterId: number }
  /** Extraction: the runner's count at exit `exit` passed another second; `secondsLeft` to go. */
  | { type: 'exitCount'; exit: number; secondsLeft: number }
  /** Extraction: a late exit opened (index into RunState.exits). */
  | { type: 'exitOpened'; exit: number }
  /** Extraction: the marshal's whistle, `secondsLeft` before the run's time is up. */
  | { type: 'runWarning'; secondsLeft: number }
  /** Extraction (M44): case `case` (RunState.cases, of `kind`) is being opened; the noise carries `range` m (bots hear it). */
  | { type: 'caseNoise'; characterId: number; case: number; kind: string; position: Vec3; range: number }
  /** Extraction: case `case` was opened, its finds now carried (a BB resupply used). */
  | { type: 'caseOpened'; characterId: number; case: number; kind: string; position: Vec3 }
  /** Extraction: the runner was hit carrying finds; they lie in case `case` where they fell. */
  | { type: 'caseDropped'; characterId: number; case: number }
  /** A magazine left `fromId`'s hand for teammate `toId` (MG1, sim/magShare.ts), `bbs` taken out of a spare of `replicaId`. */
  | { type: 'magToss'; fromId: number; toId: number; bbs: number; replicaId: string }
  /** `toId` caught the magazine `fromId` tossed: `bbs` went into its spares for `replicaId`. */
  | { type: 'magCaught'; fromId: number; toId: number; bbs: number; replicaId: string }
  /** The magazine `fromId` tossed `toId` was lost: the catcher was out of play when it landed, or the round was decided. */
  | { type: 'magLost'; fromId: number; toId: number };

/**
 * Why a round (in Extraction, the run) ended. Elimination: 'overtimeFlag' (a team touched the overtime flag first, Dev 6
 * item 45). Extraction: 'extracted' (counted out at an exit), 'out' (hit with no respawn left) or 'time' (caught out when
 * time ran out).
 */
export type RoundEndReason = 'eliminated' | 'time' | 'captured' | 'overtimeFlag' | 'extracted' | 'out';
