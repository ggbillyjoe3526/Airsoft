/**
 * What Play does (audit CORE-05, CORE-23): Game.play reads its flags into a PlayPress and acts on the answer, so the
 * whole decision is a pure function with a table test (sessionPlan.test.ts) rather than branches wired to DOM callbacks.
 */

/** What Play (New game's Play, Practice range, Tutorial, Resume, Play Again) finds when it is pressed. */
export interface PlayPress {
  /** The graphics context is lost: nothing can be drawn, so play can't start or resume. */
  graphicsLost: boolean;
  /** Play has begun in what's loaded. */
  started: boolean;
  /** The press asks for the practice range (the title's Practice range or Tutorial button), not a match. */
  practice: boolean;
  loaded: 'match' | 'range' | null;
  /** The loaded match is decided (Play Again on the result screen). */
  matchOver: boolean;
  /** New game's choices (or the team colours) changed since the match was built. */
  setupChanged: boolean;
  /** The loadout (or the team colours) changed since the range was built. */
  loadoutChanged: boolean;
}

/**
 * - `none`: nothing (the graphics context is lost);
 * - `buildRange`: the practice range, fresh (the tutorial from the step it was left at);
 * - `rebuildRange`: the range again with the new kit, where you stood (Resume after the Loadout on its pause menu);
 * - `buildMatch`: a new match from New game's choices, with its own seed;
 * - `reuse`: what is loaded carries on (Resume; or a match built for a Play whose mouse lock was refused, audit L-33).
 */
export type SessionAction = 'none' | 'buildRange' | 'rebuildRange' | 'buildMatch' | 'reuse';

/**
 * What Play does. Before play has begun, a match is built unless one built for this setup is waiting. Play Again always
 * builds a new one with its own seed (audit SIM-08): restarting the old one in place kept the simulation's and the
 * bots' random streams going, so its seed didn't replay it.
 */
export function nextSessionAction(p: PlayPress): SessionAction {
  if (p.graphicsLost) return 'none';
  if (!p.started) {
    if (p.practice) return 'buildRange';
    return p.setupChanged || p.loaded !== 'match' ? 'buildMatch' : 'reuse';
  }
  if (p.loaded === 'range') return p.loadoutChanged ? 'rebuildRange' : 'reuse';
  return p.loaded === 'match' && p.matchOver ? 'buildMatch' : 'reuse';
}
