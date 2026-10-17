import { MOVEMENT } from './movement';

/**
 * How the bots move (DX7: one of the files config/bots.ts gathers into BOT_BEHAVIOUR): lanes, hunting, cover, strafing,
 * leaning, vaults and the holster. Shared by every difficulty.
 */
export const BOT_MOVEMENT = {
  // ---- Movement and cover -----------------------------------------------------------------------
  // How long a bot pauses at each lane point is its skill's holdTime (BOT_SKILL).
  /**
   * Holding at a lane point (audit AI-02): after this long (s) the bot crouches, if its crouched eyes still see this
   * far (metres) towards the enemy side (one ray per hold; behind crouch cover it stays up to see over it), and it
   * sweeps its view this far (degrees) either side of the enemy side over a period of this many seconds.
   */
  holdCrouchDelay: 0.4,
  holdLookDistance: 8,
  holdSweepDeg: 35,
  holdSweepPeriod: 4,
  /**
   * A guard leaning out at its post (M55) whose leaned eye loses its way in at some turn of that sweep sweeps no further
   * than this many degrees short of that turn from then on (BN1: a Woodland locker guard standing 4 cm off its post
   * lost the way in at the sweep's far end and saw it for 54 % of its ticks).
   */
  holdLeanSweepBackDeg: 4,
  /**
   * At a lane point, a bot may first step into cover (its skill's holdCoverChance): the best spot within this radius
   * (metres) that hides it from a point this far (metres) towards the enemy side and that it can peek from.
   */
  holdCoverRadius: 3,
  holdCoverThreatDistance: 10,
  /**
   * Bots sharing a lane (audit AI-01): a lane point with a teammate holding (or heading for a hold) within this distance
   * (metres) of it is moved this far (metres) to one side, across the way to the enemy.
   */
  laneHoldSpacing: 1.5,
  laneHoldOffset: 1,
  /**
   * Keeping apart (audit AI-01): characters don't collide with each other in the physics, so a bot steers away from
   * anyone in play whose centre is closer than this (metres; two bodies touch at twice BODY.radius), harder the
   * closer they are; standing still, it walks out of the way. Cover spots are never picked within two body radii plus
   * coverSpacingMargin (metres) of where a teammate is or is heading for cover.
   */
  separationDistance: 0.8,
  coverSpacingMargin: 0.1,
  /** A route search that finds no way to a goal isn't asked for again (or for the next goal) within this long (s; AI-07). */
  routeRetryDelay: 1,
  /** Cover search: candidate spots within this radius, how many to test, and the least time between searches (s). */
  coverRadius: 8,
  coverMinRadius: 1,
  coverCandidates: 28,
  coverCooldown: 1.5,
  /** Skip cover spots that end up closer to the threat than this fraction of the current distance (or 2 m closer). */
  coverTowardThreatFraction: 0.7,
  coverTowardThreatMetres: 2,
  /** Crouch-high cover scores as if it were this much closer (metres): you can stand up and shoot back. */
  crouchCoverBonus: 4,
  /**
   * Low blocks (crates, barriers, sills) are also tried as cover: the spot this far (metres) past a
   * block's far side from the threat. Just over the body radius, so the bot hugs the block.
   */
  lowCoverGap: 0.45,
  /** Second try behind a low block when the spot at lowCoverGap isn't walkable (metres). */
  lowCoverGapFar: 0.8,
  /** A low block counts as standing on the floor if its bottom is within this of the nav floor under it (metres). */
  lowCoverFloorGap: 0.05,
  /**
   * Corners of full-height blocks (walls, containers) are tried as lean spots: just behind the corner as
   * seen from the threat, leanSpotInset (metres) inside its shadow. More than the body's hit radius
   * (hidden standing upright) but less than the eyes move in a full lean (~0.4 m), so leaning out shows
   * the head and one shoulder, as a player peeking that corner would.
   */
  leanSpotInset: 0.27,
  /**
   * From the corner, the lean spot moves along the sight line in steps of this (metres) until standing
   * there clears the block by lowCoverGap.
   */
  leanSpotStep: 0.225,
  /** Lean spots score as if they were this much closer (metres): you can lean out and shoot back. */
  leanCoverBonus: 1.5,
  /**
   * Walk right onto a lean spot, to within this distance (metres): a few centimetres decide the peek. 0.1 until M102,
   * when a walk's last few centimetres of coasting (ai/routes.ts stepOnto) left Woodland's lean guards 7 to 9 cm off
   * their posts and some down to 64 % of their ticks seeing the way in (12 seeds); now 0 to 4 cm off and at least 92 %.
   */
  leanSpotReach: 0.03,
  /** ...and only from this close (metres): further off, the route brings the bot there first. */
  leanSpotApproachMax: 0.9,
  /** At a lean spot, the bot counts as there (to peek and fight from it) only within this distance (metres). */
  leanSpotArrive: 0.2,
  /** A lean needs this much room past the leaned eyes (metres; the lean stops this short of walls). */
  leanRoomMargin: MOVEMENT.leanWallClearance,
  /** Close enough to a cover spot to settle in (metres). */
  coverArrive: 0.9,
  /** Stay in cover this long before peeking out again (s). */
  coverTime: [1.2, 2.4] as const,
  /**
   * Crouch-peeking at crouch-high cover: how many times to stand up and look (whole number, rounded
   * down), how long each look lasts with nobody in sight (s), how long to stay up shooting once someone
   * is (s), and how long to stay ducked between looks (s). Ducks early when under fire or reloading.
   */
  peekCount: [2, 4] as const,
  peekLook: [0.6, 1.1] as const,
  peekFight: [1.2, 2.4] as const,
  peekDown: [0.8, 1.6] as const,
  /** Give up on reaching cover after this long (s), e.g. if the route there is blocked. */
  coverMaxTime: 5,
  /**
   * On spotting someone at least its skill's contactCoverMinDistance away while advancing or searching, a
   * bot first moves to crouch cover within contactCoverRadius (metres), if there is any, and fights
   * from it: the way players at a site get behind a barricade before trading BBs.
   */
  contactCoverRadius: 3.5,
  /** A whole cover episode (getting there, ducking, peeking, fighting from it) ends after this long (s). */
  coverEpisodeMax: 12,
  /**
   * After this long at a cover spot (s: time to crouch and look again), still seeing the enemy means
   * the spot doesn't hide us (or we've been flanked): leave cover and fight.
   */
  coverSettle: 0.5,
  /** Route waypoints count as reached within this distance (metres). */
  waypointReach: 0.45,
  /**
   * A bot this far (metres) off the leg it walks (pushed aside by a hold, a fight or a teammate) checks the straight
   * way from where it is to the next waypoint before walking on; if that way would take a ledge the leg doesn't, it
   * steps back onto the leg, routeRejoinAhead on from the nearest point of it (or asks for a fresh route if that way
   * takes one too). A waypoint reached from further aside than this is walked onto when cutting the corner to the next
   * would take a ledge. (G11: Stack House bots walked an old leg from a hold spot beside a stair's foot, or cut the
   * corner at a stair's foot, rode up the stair's side and fell off it.) One nav cell: a smaller push keeps the body
   * within a few centimetres of the clearance the leg was checked with, and checking only then keeps the cost low.
   */
  routeOffLeg: 0.2,
  /** How far on along the leg (metres) from its nearest point a bot pushed off it steps back onto it: it merges, not stops. */
  routeRejoinAhead: 0.5,
  /** Walking slower than this (m/s) for `stuckTime` seconds along a route means blocked: re-plan. */
  stuckSpeed: 0.3,
  stuckTime: 1,
  /**
   * Vaulting (M102): a bot's route goes over a low obstacle (nav/vaultLinks.ts) only where that saves more than this
   * many metres on foot (it is slower than its length, the replica is carried, and it is loud). A bot that got stuck on
   * a vault leg plans without vaults for `vaultRetryDelay` seconds.
   */
  vaultPrice: 3,
  vaultRetryDelay: 6,
  /** Re-plan a route to a moving goal when it has moved this far (metres). */
  replanDistance: 2.5,
  /** While fighting, sidestep for this long before switching direction (s). */
  strafeTime: [0.5, 1.2] as const,
  /** Strafing speed as a fraction of full input. */
  strafeInput: 0.6,
  /**
   * A sidestep must keep the target in sight (audit AI-05): from eyes moved this far (metres) to that side, the line to
   * the target must be clear, or the bot steps the other way (or forward or back, or stands).
   */
  strafeSightOffset: 0.6,
  /**
   * Steps off the route (sidesteps, the last few centimetres to a lean spot) look this far ahead for a
   * drop (a platform's edge, a ramp's side) and don't take it (metres): more than the body's radius, so
   * the bot turns back before its feet leave the floor.
   */
  edgeLookahead: 0.6,
  /**
   * At the end of a search (audit AI-14), a bot that found nobody crouches and looks round for this long (s), sweeping
   * its view this far (degrees) either side of the way it arrived, before it moves on.
   */
  searchLook: [1, 2] as const,
  searchLookDeg: 90,
  /**
   * Flanking (audit AI-17, the skill's flankChance): a search of a spot at least flankMinDistance (metres) away first
   * goes to a point flankOffset (metres) to one side of the straight way there.
   */
  flankMinDistance: 8,
  flankOffset: 4,
  /** How far short of the searched spot (metres, along the straight way) the flank point lies: it comes in from the side. */
  flankBack: 2,
  /** Sprint along routes when nobody has been seen or heard for this long (s), if heading mostly forward. */
  sprintWhenCalmFor: 3,
  sprintForward: 0.9,
  /**
   * The holster (M92, ai/botHolster.ts): a bot puts its replica away (slung for the run) once it has sprinted
   * `holsterAfter` seconds without a break in its own half, nobody seen or heard for `holsterCalmFor` seconds, and draws
   * it again (the slower draw) at once on a threat or in the enemy's half, or `holsterDrawAfter` seconds after the sprint
   * ends (a turn on the route doesn't draw it). Every level plays it the same way.
   */
  holsterCalmFor: 5,
  holsterAfter: 1.5,
  holsterDrawAfter: 0.5,
} as const;
