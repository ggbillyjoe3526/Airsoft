/**
 * How the bots play as a team (DX7: one of the files config/bots.ts gathers into BOT_BEHAVIOUR): the team plans, routes,
 * the flag, Elimination's overtime flag, and Pro's tuning (held angles, clearing corners, team play, map balance).
 */
export const BOT_SQUAD = {
  // ---- Team play and routes -------------------------------------------------------------------
  /**
   * Each round a team picks a plan for its bots, by these weights: split (each on a different lane),
   * pair (two share a lane, the rest take others) or stack (all on one lane).
   */
  planSplitWeight: 0.4,
  planPairWeight: 0.4,
  planStackWeight: 0.2,
  /** Bots sharing a lane set off this long apart (s), so they don't walk on each other's heels. */
  laneFollowDelay: [0.8, 1.6] as const,
  /** Lane points are moved up to this far at random (metres, onto walkable ground), so no two rounds run the same line. */
  laneJitter: 1.2,
  laneJitterTries: 6,
  /**
   * Moving as a team: a bot more than this far (metres, towards the enemy side) ahead of its rearmost
   * bot teammate waits at lane points, for at most teamWaitMax seconds per point.
   */
  teamSpread: 7,
  teamWaitMax: 4,

  /**
   * Hunting, once a bot has swept its lane: the map is split into square sectors (metres) and the bot
   * heads for whichever of `huntCandidates` random spots its team visited least recently, so hiding
   * players are eventually found.
   */
  huntSectorSize: 4,
  huntCandidates: 12,
  /** Random cells drawn per candidate before giving up (most of the grid is walkable). */
  huntTriesPerCandidate: 20,
  /** Among never-visited sectors, each metre further from home counts like this many seconds staler. */
  huntFarBias: 0.01,
  /**
   * Checking by eye (M87, playtest note 15: bots went to corners that were obviously empty): a sector counts as checked
   * by the team once one of its bots sees a spot in it empty, within this many metres, inside its field of view and, at
   * night, no further than someone standing there could be made out (perception.ts seesSpot). Each bot glances at one
   * spot a tick, spread over its field of view; a hunt spot it can see from where it picks is not picked; and a bot
   * whose hunt goal its team checked meanwhile picks another. How long a check holds is the skill's huntMemory.
   * 0: only where someone stood counts (as before M87).
   */
  huntClearRange: 19,
  // ---- Flag mode -------------------------------------------------------------------------------
  /**
   * Bots stand at a random spot within this distance of the pole (metres): close enough to work the
   * rope (FLAG.radius) once within flagArrive of the spot, and spread out so they don't stand in a heap.
   */
  flagStand: 0.8,
  /** Close enough to that spot to stop, crouch and work the rope (metres). */
  flagArrive: 0.5,
  /**
   * Attackers at the pole (audit AI-06): one raises the flag; each other attacker who has swept its lane holds cover
   * within flagGuardRadius (metres) of the pole, hidden from a point flagGuardThreatDistance (metres) from the pole
   * towards the defenders' end (or from where an enemy was last seen or heard), and watches from there.
   */
  flagGuardRadius: 6,
  flagGuardThreatDistance: 10,
  /**
   * The raiser keeps the rope unless another attacker in flag mode is this much nearer the pole (metres): close enough
   * that a guard by the pole takes over from a raiser still on its way, far enough that two bots don't swap every tick.
   */
  raiserSwitchMargin: 3,
  /**
   * Defenders hold the first point of their lane (nearest home). The first bot on a shared lane holds
   * the next one, and a bot alone on its lane does so this often: a forward hold.
   */
  defendForwardChance: 0.3,
  /**
   * Defenders go after someone seen or heard within this distance of the pole (metres); further away
   * they hold their post and watch that way, so the attackers have to come to them.
   */
  defendSearchRadius: 12,
  /**
   * Once the flag is off the bottom, this many defenders (those nearest the pole) go and pull it down;
   * the rest hold their posts.
   */
  retakers: 2,
  // ---- Elimination's overtime flag (Dev 6 item 45) ------------------------------------------------------------------
  /**
   * When the flag goes up, each bot goes for it after its skill's overtimeReaction, straight to its foot (a touch wins:
   * no rope, no spot beside it). A personality that watches the flag first (bots.md › Habits) holds cover by it as the
   * attackers' guards hold the pole (flagGuardRadius, flagGuardThreatDistance), aiming at it; with overtimeGoBy seconds
   * of the overtime left or less, every watcher goes in, whatever its watch.
   */
  overtimeGoBy: 10,
  /**
   * A bot whose flank roll (the skill's flankChance, once per overtime) comes up, at least overtimeFlankMinDistance
   * (metres) from the flag, goes round by a point overtimeFlankOffset (metres) to one side of the straight way and
   * overtimeFlankBack (metres) short of the flag first, so it comes at the flag from the side.
   */
  overtimeFlankMinDistance: 15,
  overtimeFlankOffset: 6,
  overtimeFlankBack: 6,

  // ---- Pro tuning (M37, M38, M40; Pro's skill is BOT_SKILL.pro in config/botsSkill.ts) --------------------------------------
  // Every number only Pro uses, in one place for the owner's playtest on each map. Nothing here changes Easy, Normal or
  // Hard: each is read only by a bot whose skill sets the flag named (holdsAngles, slicesCorners, teamPlay). The map
  // balance numbers at the end of this block (huntMiddleBias, darkSpot*) are shared since Audit 2 (huntsMiddle at every
  // level, keepsDark from Normal up). The rest of Pro's tuning: BOT_SKILL.pro (reaction, aim, holds),
  // bot-kits.md's Pro column (kits, BG1) and the Difficulty multiplier in pool.md (pay). What to turn when a map plays wrong (docs/PLAYTEST.md "Pro"):
  //  - Pro never finds the corner you hide behind, or aims at the wrong gap: angle* (the ray fan and what counts as an edge).
  //  - A held corner is wrongly picked on bushes, trunks or stairs: angleBush*, anglePost*, angleGap*, angleLevel*, angleRamp*.
  //  - Slicing is too slow or too cautious near the enemy: sliceLeanDistance, then skill peekWatchTime.
  //  - The team trades too eagerly, or bunches up: tradeTime, tradeCoverRadius, boundDistance, boundWaitMax, crossfire*.
  //  - A round drags when Pro is ahead or behind: latePushTime.
  //  - One end of a map is easier than the other, or bots sit in the light at night: huntMiddleBias, darkSpot* (every level).
  // Held angles (M37, holdsAngles), M40's map features (bushes, trunk gaps, stair tops) and pre-aiming:
  /**
   * Held angles (M37, for skills with holdsAngles): holding still, the bot fans this many rays at eye height across
   * this wide a view (degrees) of the enemy side and aims where a ray that stops at a wall sits beside one that runs on
   * at least angleJump (metres) further than the wall itself would reach (so a long wall seen at a slant is no corner): a
   * corner or doorway someone would step out of. It aims anglePast (metres) past
   * the wall's distance, at head height. Edges nearer than angleMinDist or beyond angleMaxDist (metres) are skipped,
   * those near angleBestDist (metres) preferred; it keeps two at least angleSeparationDeg apart, switches between them
   * every angleSwitchTime (s) and looks again every angleRefresh (s).
   */
  angleFanDeg: 140,
  angleRays: 29,
  angleJump: 2.5,
  anglePast: 0.6,
  angleMinDist: 2,
  angleMaxDist: 30,
  angleBestDist: 10,
  angleSeparationDeg: 15,
  angleSwitchTime: 3,
  angleRefresh: 2,
  /** ...or as soon as it has moved this far (metres) since it last looked. */
  angleMoveRefresh: 0.5,
  /**
   * Held angles beyond walls (M40, map data and nav only, ai/angleFeatures.ts). A bush at least angleBushMinHeight
   * (metres) tall stops a fan ray like a wall, so its edges are corners too. A gap of angleGapMin to angleGapMax
   * (metres) between two narrow tall blocks (trunks, posts: at most anglePostMaxHalf either side of their centre) is a
   * doorway, held when the line of sight crosses it at least as squarely as angleGapFacing (the sine of the angle). A post
   * is about as deep as it is wide (its short side at least anglePostSquareness of its long one): a wall's stub by a
   * door or window is not one.
   */
  angleBushMinHeight: 1,
  anglePostMaxHalf: 0.75,
  anglePostSquareness: 0.75,
  angleGapMin: 0.8,
  angleGapMax: 4,
  angleGapFacing: 0.5,
  /**
   * A stair or ramp top (M40): the edge of a landing (floor no steeper than angleFlatSlope for angleLandingRun metres, or
   * up to a wall) where the floor falls, angleRampSlope per metre or steeper on average, by angleLevelRise (metres) or
   * more onto another landing within angleRampRun (metres): where someone coming up or down appears. Tops within
   * angleTopMerge (metres) count as one.
   */
  angleLevelRise: 0.9,
  angleRampRun: 8,
  angleRampSlope: 0.3,
  angleFlatSlope: 0.02,
  angleLandingRun: 1,
  angleTopMerge: 1.5,
  /** Someone appearing within this angle (degrees) of where a bot already aims counts as pre-aimed (the skill's preAim*). */
  preAimConeDeg: 6,
  // Clearing corners and team play (M38, slicesCorners / teamPlay):
  /**
   * After a teammate's hit call it heard, a bot that trades goes for where the shot came from for this long (s): to a
   * spot within tradeCoverRadius (metres) it can peek that way from, or straight there at a run.
   */
  tradeTime: 4,
  tradeCoverRadius: 6,
  /** Slicing a corner (slicesCorners): leans out past the corner it aims at once it is this near (metres). */
  sliceLeanDistance: 6,
  /**
   * Moving in pairs: a bot sharing a lane with a teammate within boundDistance (metres) doesn't set off from a lane
   * point while that teammate is on the move, so one always holds while the other moves (for at most boundWaitMax s
   * at a point, counting its hold there; a partner slicing corners at a walk takes longer than teamWaitMax).
   */
  boundDistance: 15,
  boundWaitMax: 8,
  /**
   * Crossfire: of two defenders on one lane, the second holds as far from the lane's next point (the choke) as its own
   * point, but swung round the choke by between these many degrees (the smaller end, the middle, then the larger, either
   * way), on the same floor with a clear view of the choke; the two then see it from angles at least crossfireMinDeg
   * apart.
   */
  crossfireTurnDeg: [35, 65],
  crossfireMinDeg: 30,
  /** Elimination: with this many seconds left, the side with fewer players in play goes looking for the others. */
  latePushTime: 30,
  // Map balance (huntsMiddle / keepsDark; M40 for Pro, every level since Audit 2, keepsDark from Normal up):
  /**
   * With the skill's huntsMiddle (M40), each metre nearer the middle of the map (halfway between the two ends) counts like
   * this many seconds staler instead.
   */
  huntMiddleBias: 1,
  /**
   * With the skill's keepsDark (M40), a lane point in a light pool moves to the nearest dark spot on its floor within
   * darkSpotRadius (metres), tried in rings darkSpotStep (metres) apart, darkSpotDirections round each.
   */
  darkSpotRadius: 8,
  darkSpotStep: 1,
  darkSpotDirections: 16,
} as const;
