import { MOVEMENT } from './movement';

/**
 * The bots' senses, reaction and trigger (DX7: one of the files config/bots.ts gathers into BOT_BEHAVIOUR): what they
 * see and hear and how soon, how they aim and how they fire. Shared by every difficulty; the skill per level is
 * BOT_SKILL (config/botsSkill.ts).
 */
export const BOT_SENSES = {
  /** Seconds between perception updates per bot (staggered across bots). */
  thinkInterval: 0.1,

  // ---- Perception -------------------------------------------------------------------------------
  /** Field of view (degrees, full angle) and how far bots can make out a player (metres). */
  fovDeg: 120,
  viewDistance: 40,
  /** Anyone this close is noticed whatever way the bot faces (footsteps, rustling). */
  closeAwareness: 2.5,
  /**
   * How much bush (M33e, map/foliage.ts) a bot can see someone through (metres of leaves along the sight line): someone
   * at the edge of a bush is seen, someone deeper in or behind one is not. `closeAwareness` still notices them.
   */
  foliageSeeThrough: 0.6,
  /** Gunfire within this distance gives away roughly where the shooter is (metres). */
  hearingDistance: 22,
  /**
   * How far an enemy's footsteps carry (metres): running, sprinting, and the thud of landing a jump.
   * Walking and moving crouched are silent (only `closeAwareness` gives those away), unless a hi-cap magazine
   * rattles (M17b): heard this far on quiet moves.
   */
  footstepHearingRun: 11,
  footstepHearingSprint: 16,
  footstepHearingLand: 12,
  footstepHearingRattle: 7,
  /**
   * A vault's hands and kit on the obstacle (M102): louder than any step (owner, 2026-10-13: "Vaulting allows quick
   * movement but at the cost of making noise"), and its landing is heard as well (`footstepHearingLand`).
   */
  footstepHearingVault: 18,
  /**
   * Through walls (M22): a sound fully blocked from a bot carries only this fraction of its range, and half blocked
   * (low cover) halfway between. Judged by the same rays (ear to the source's knees and head) that muffle sounds for
   * the player (AUDIO.occlusion), so bots hear through walls no better than the player does.
   */
  wallHearing: 0.6,
  /** A heard position is off by up to this fraction of the distance (hearing through walls is vague). */
  hearingError: 0.3,
  /**
   * Gunfire heard within this long (s) of the last, from within the current guess's margin of error,
   * keeps the same guess of where the noise is (one guess per contact, not per BB or per shooter).
   */
  hearingContactTime: 2,
  /** How long a bot keeps hunting a last-known position after losing sight or hearing (s); after this it forgets the contact. */
  memoryTime: 6,
  /**
   * A teammate's ping (PG1, ai/pings.ts) stays in a bot's mind this long (s), longer than a noise: long enough to cross
   * a map to check it, unless it gets there and has looked, or real news of an enemy takes its place first.
   */
  pingMemory: 20,
  /** An enemy BB landing this close (metres) makes a bot want cover. */
  suppressionRadius: 1.6,
  /** A bot counts as under fire for this long after a near miss (s). */
  suppressionTime: 0.4,

  // ---- Reaction and aim (the skill values live in BOT_SKILL) -------------------------------------
  /** Seconds a target can be out of sight and still count as "the same contact" (no new reaction delay). */
  contactGrace: 1.2,
  /** Stay on the current target unless another is at least this much closer (metres). */
  targetSwitchMargin: 3,
  /**
   * On a new contact the aim error starts at least this fraction of its full size off target (in a
   * random direction), then settles: a hasty first aim, never dead on.
   */
  aimFirstErrorMin: 0.6,
  /**
   * ...and points to one side, tilted at most this far from level (degrees; G11). Up close an error the size of a body's
   * width still lands when it points down (the legs) or up (the head), so the first BBs whizz past a shoulder instead,
   * where the player sees them coming.
   */
  aimFirstErrorTiltDeg: 30,
  /**
   * How much of the reaction delay the aim error already settles over (0..1; G11). At 1 the error shrinks from first
   * sight, so the opening burst came already on target after a reaction (the owner's "bots land hits within a few
   * moments at 5 to 10 metres"); lower, a bot walks its BBs onto its target once it opens fire, which gives the player a
   * fair moment to answer.
   */
  aimSettleWhileReacting: 0,
  /** How fast the error drifts around (Hz): low values look like a hand correcting, not jitter. */
  aimWanderRate: 0.7,
  /**
   * How fast the error eases towards each new wander goal, as a multiple of aimWanderRate: 3 settles about 95 % of the
   * way before the next goal is drawn (audit AI-08).
   */
  aimWanderSettle: 3,
  /** Fire only when the view is within this of the (erroneous) aim point (degrees). */
  fireCone: 3,
  /** Aim at this height on the target's body, as a fraction of its hit-volume height (chest). */
  aimHeightFraction: 0.7,
  /** Bots look for a target's head at this fraction of its hit-volume height. */
  headHeightFraction: 0.93,

  // ---- Firing -----------------------------------------------------------------------------------
  /** Reload when the magazine is below this fraction and nobody is in sight. */
  tacticalReloadFraction: 0.35,
  /** Never fire if a teammate is this close to the line of fire (metres, beyond their hit volume). */
  friendlyMargin: 0.3,
  /**
   * ...widened with the distance to them by this many standard deviations of the replica's spread: a BB strays further
   * from the aim line the further it flies, so a teammate 20 m down the line needs more room than one 2 m away. The
   * spread the bot shoots with now (M92): walking, it is wider (Character.spreadScale).
   */
  friendlySpreadSigmas: 2,
  /**
   * ...and a teammate on the move is checked where they would be had they sped up to this pace (m/s, running) in the
   * way they are heading while the BBs fly: one strafing in a close duel speeds up across the line between shots (RE1:
   * Depot, Elimination with ricochets counting, seed 2, a teammate at 2.7 m/s and rising stepped into a BB in flight).
   */
  friendlyMateSpeed: MOVEMENT.runSpeed,
  /**
   * ...and this far (metres) past the target too: a BB that misses keeps flying, so a teammate just
   * behind the target in the line of fire is as much in the way as one in front. 25 since G11 (15 before): a fresh
   * contact's first BBs go wide on purpose, so more of them fly on past the target, and one reached a teammate 23.5 m
   * down the line (Depot, Attack / Defend with ricochets counting, seed 16).
   */
  friendlyBeyondTarget: 25,
  /**
   * ...unless a wall stops the line first. What the aim line meets counts as a wall only if it also stands
   * this much higher (metres) where the line meets it: BBs (spread, hop-up) can sail over low cover such
   * as a crate with a teammate crouched behind it, but not over a wall.
   */
  friendlyWallClearance: 0.6,
  /** The raised check looks for the wall from this far (metres) before the point the aim line meets it, to as far past it. */
  friendlyWallProbe: 0.2,
  /**
   * ...and a teammate up to this far (metres) past where the aim line meets a wall still counts: a line that only grazes
   * a wall's corner lets BBs (spread, aim error) past it, onto a teammate stepping out from behind that corner.
   */
  friendlyPastWall: 0.8,
  /**
   * Hold fire when the aim line itself (aim error included) meets a wall within this fraction of the
   * distance to the target: the clear line to the target doesn't help if the BB would go into the door frame.
   */
  aimWallFraction: 0.5,
  /**
   * Hold fire when the line to the target runs through more than this much bush (metres of leaves; Dev 6 item 44): BBs
   * pushed that far in come out well off their line or not at all (BallisticsConfig.leaves), so the bot waits for a
   * clearer shot. Easy fires into the leaves anyway, as far as BBs could get through them (BotSkill.firesIntoLeaves).
   */
  foliageFireThrough: 0.25,
} as const;
