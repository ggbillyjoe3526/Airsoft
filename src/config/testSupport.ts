/**
 * The bot tuning numbers as they stood before M41 moved the Pro-only ones into one block of BOT_BEHAVIOUR (commit
 * f54c566, src/config/bots.ts), as plain data: config/botsTuning.test.ts compares today's file against it, so a
 * moved key that changed a value (or a lost or added key) fails the suite. Replace it only when the owner re-tunes.
 */
export const BOTS_BEFORE_M41 = {
 "BOT_BEHAVIOUR": {
  "thinkInterval": 0.1,
  "fovDeg": 120,
  "viewDistance": 40,
  "closeAwareness": 2.5,
  "foliageSeeThrough": 0.6,
  "hearingDistance": 22,
  "footstepHearingRun": 11,
  "footstepHearingSprint": 16,
  "footstepHearingLand": 12,
  "footstepHearingRattle": 7,
  "wallHearing": 0.6,
  "hearingError": 0.3,
  "hearingContactTime": 2,
  "memoryTime": 6,
  "suppressionRadius": 1.6,
  "suppressionTime": 0.4,
  "contactGrace": 1.2,
  "targetSwitchMargin": 3,
  "aimFirstErrorMin": 0.6,
  "aimWanderRate": 0.7,
  "fireCone": 3,
  "aimHeightFraction": 0.7,
  "headHeightFraction": 0.93,
  "tacticalReloadFraction": 0.35,
  "friendlyMargin": 0.3,
  "friendlySpreadSigmas": 2,
  "friendlyBeyondTarget": 15,
  "friendlyWallClearance": 0.6,
  "friendlyWallProbe": 0.2,
  "friendlyPastWall": 0.8,
  "aimWallFraction": 0.5,
  "holdCrouchDelay": 0.4,
  "holdLookDistance": 8,
  "holdSweepDeg": 35,
  "holdSweepPeriod": 4,
  "angleFanDeg": 140,
  "angleRays": 29,
  "angleJump": 2.5,
  "anglePast": 0.6,
  "angleMinDist": 2,
  "angleMaxDist": 30,
  "angleBestDist": 10,
  "angleSeparationDeg": 15,
  "angleSwitchTime": 3,
  "angleRefresh": 2,
  "angleMoveRefresh": 0.5,
  "angleBushMinHeight": 1,
  "anglePostMaxHalf": 0.75,
  "anglePostSquareness": 0.75,
  "angleGapMin": 0.8,
  "angleGapMax": 4,
  "angleGapFacing": 0.5,
  "angleLevelRise": 0.9,
  "angleRampRun": 8,
  "angleRampSlope": 0.3,
  "angleFlatSlope": 0.02,
  "angleLandingRun": 1,
  "angleTopMerge": 1.5,
  "preAimConeDeg": 6,
  "tradeTime": 4,
  "tradeCoverRadius": 6,
  "sliceLeanDistance": 6,
  "boundDistance": 15,
  "boundWaitMax": 8,
  "crossfireTurnDeg": [
   35,
   65
  ],
  "crossfireMinDeg": 30,
  "latePushTime": 30,
  "holdCoverRadius": 3,
  "holdCoverThreatDistance": 10,
  "laneHoldSpacing": 1.5,
  "laneHoldOffset": 1,
  "separationDistance": 0.8,
  "coverSpacingMargin": 0.1,
  "routeRetryDelay": 1,
  "coverRadius": 8,
  "coverMinRadius": 1,
  "coverCandidates": 28,
  "coverCooldown": 1.5,
  "coverTowardThreatFraction": 0.7,
  "coverTowardThreatMetres": 2,
  "crouchCoverBonus": 4,
  "lowCoverGap": 0.45,
  "lowCoverGapFar": 0.8,
  "lowCoverFloorGap": 0.05,
  "leanSpotInset": 0.27,
  "leanSpotStep": 0.225,
  "leanCoverBonus": 1.5,
  "leanSpotReach": 0.1,
  "leanSpotApproachMax": 0.9,
  "leanSpotArrive": 0.2,
  "leanRoomMargin": 0.2,
  "coverArrive": 0.9,
  "coverTime": [
   1.2,
   2.4
  ],
  "peekCount": [
   2,
   4
  ],
  "peekLook": [
   0.6,
   1.1
  ],
  "peekFight": [
   1.2,
   2.4
  ],
  "peekDown": [
   0.8,
   1.6
  ],
  "coverMaxTime": 5,
  "contactCoverRadius": 3.5,
  "coverEpisodeMax": 12,
  "coverSettle": 0.5,
  "waypointReach": 0.45,
  "stuckSpeed": 0.3,
  "stuckTime": 1,
  "replanDistance": 2.5,
  "strafeTime": [
   0.5,
   1.2
  ],
  "strafeInput": 0.6,
  "strafeSightOffset": 0.6,
  "edgeLookahead": 0.6,
  "searchLook": [
   1,
   2
  ],
  "searchLookDeg": 90,
  "flankMinDistance": 8,
  "flankOffset": 4,
  "flankBack": 2,
  "sprintWhenCalmFor": 3,
  "sprintForward": 0.9,
  "planSplitWeight": 0.4,
  "planPairWeight": 0.4,
  "planStackWeight": 0.2,
  "laneFollowDelay": [
   0.8,
   1.6
  ],
  "laneJitter": 1.2,
  "laneJitterTries": 6,
  "teamSpread": 7,
  "teamWaitMax": 4,
  "huntSectorSize": 4,
  "huntCandidates": 12,
  "huntTriesPerCandidate": 20,
  "huntFarBias": 0.01,
  "huntMiddleBias": 1,
  "darkSpotRadius": 8,
  "darkSpotStep": 1,
  "darkSpotDirections": 16,
  "flagStand": 0.8,
  "flagArrive": 0.5,
  "flagGuardRadius": 6,
  "flagGuardThreatDistance": 10,
  "raiserSwitchMargin": 3,
  "defendForwardChance": 0.3,
  "defendSearchRadius": 12,
  "retakers": 2,
  "pathsPerTick": 1
 },
 "BOT_SKILL": {
  "easy": {
   "reactionTime": [
    0.6,
    1
   ],
   "turnRate": 3.2,
   "aimErrorStartDeg": 8,
   "aimErrorSettledDeg": 1.7,
   "aimSettleTime": 1.3,
   "aimErrorStartMetres": 1,
   "aimErrorMovingDeg": 2,
   "aimErrorTracking": 0.12,
   "leadFactor": 0.25,
   "burst": [
    0.15,
    0.35
   ],
   "burstPause": [
    0.45,
    0.9
   ],
   "holdTime": [
    1,
    2.5
   ],
   "holdCoverChance": 0.2,
   "contactCoverMinDistance": 12,
   "searchWalkDistance": 4,
   "flankChance": 0,
   "holdsAngles": false,
   "preAimReactionTime": [
    0.6,
    1
   ],
   "preAimSettled": 0,
   "slicesCorners": false,
   "peekWatchTime": [
    0,
    0
   ],
   "teamPlay": false,
   "huntsMiddle": false,
   "keepsDark": false
  },
  "normal": {
   "reactionTime": [
    0.35,
    0.6
   ],
   "turnRate": 4.5,
   "aimErrorStartDeg": 4.5,
   "aimErrorSettledDeg": 1.1,
   "aimSettleTime": 1,
   "aimErrorStartMetres": 0.75,
   "aimErrorMovingDeg": 1.5,
   "aimErrorTracking": 0.09,
   "leadFactor": 0.5,
   "burst": [
    0.2,
    0.45
   ],
   "burstPause": [
    0.3,
    0.65
   ],
   "holdTime": [
    0.8,
    2.5
   ],
   "holdCoverChance": 0.5,
   "contactCoverMinDistance": 8,
   "searchWalkDistance": 12,
   "flankChance": 0.25,
   "holdsAngles": false,
   "preAimReactionTime": [
    0.35,
    0.6
   ],
   "preAimSettled": 0,
   "slicesCorners": false,
   "peekWatchTime": [
    0,
    0
   ],
   "teamPlay": false,
   "huntsMiddle": false,
   "keepsDark": false
  },
  "hard": {
   "reactionTime": [
    0.25,
    0.45
   ],
   "turnRate": 5.5,
   "aimErrorStartDeg": 4,
   "aimErrorSettledDeg": 0.9,
   "aimSettleTime": 0.8,
   "aimErrorStartMetres": 0.25,
   "aimErrorMovingDeg": 1.2,
   "aimErrorTracking": 0.06,
   "leadFactor": 0.7,
   "burst": [
    0.25,
    0.55
   ],
   "burstPause": [
    0.2,
    0.5
   ],
   "holdTime": [
    0.4,
    1.2
   ],
   "holdCoverChance": 0.8,
   "contactCoverMinDistance": 5,
   "searchWalkDistance": 20,
   "flankChance": 0.7,
   "holdsAngles": false,
   "preAimReactionTime": [
    0.25,
    0.45
   ],
   "preAimSettled": 0,
   "slicesCorners": false,
   "peekWatchTime": [
    0,
    0
   ],
   "teamPlay": false,
   "huntsMiddle": false,
   "keepsDark": false
  },
  "pro": {
   "reactionTime": [
    0.25,
    0.45
   ],
   "turnRate": 6,
   "aimErrorStartDeg": 3.5,
   "aimErrorSettledDeg": 0.75,
   "aimSettleTime": 0.7,
   "aimErrorStartMetres": 0.2,
   "aimErrorMovingDeg": 1,
   "aimErrorTracking": 0.05,
   "leadFactor": 0.85,
   "burst": [
    0.15,
    0.35
   ],
   "burstPause": [
    0.2,
    0.4
   ],
   "holdTime": [
    1.2,
    3
   ],
   "holdCoverChance": 0.9,
   "contactCoverMinDistance": 4,
   "searchWalkDistance": 30,
   "flankChance": 0.7,
   "holdsAngles": true,
   "preAimReactionTime": [
    0.18,
    0.28
   ],
   "preAimSettled": 0.5,
   "slicesCorners": true,
   "peekWatchTime": [
    1.5,
    3
   ],
   "teamPlay": true,
   "huntsMiddle": true,
   "keepsDark": true
  }
 },
 "BOT_LOADOUTS": {
  "easy": "factory",
  "normal": "factory",
  "hard": "random",
  "pro": "random"
 },
 "RANDOM_LOADOUT": {
  "partChance": 0.6,
  "chaseChance": 0.05
 },
 "BOT_PART_CHANCE": {
  "easy": 0,
  "normal": 0,
  "hard": 0.6,
  "pro": 0.8
 },
 "NIGHT_SIGHT": {
  "lit": 40,
  "open": 25,
  "canopy": 10,
  "canopyTrees": 3,
  "canopyRadius": 4,
  "canopyCell": 1
 }
};
