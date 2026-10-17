import type { BotController } from '../ai/botController';
import { DT, playMatch } from '../ai/depotMatchSupport';
import { setUpRun } from '../ai/extractionRunSupport';
import { riggedHits } from '../ai/riggedHitsSupport';
import { botConfig, type Difficulty } from '../config/bots';
import { squadSize } from '../config/extraction';
import { hitRulesFor, type MatchRules, roundRulesFor } from '../config/matchRules';
import { type MatchMode, MODE_SHAPES, unknownMode } from '../config/modes';
import { NAV } from '../config/nav';
import { LOADOUT, replicaUnderRules } from '../config/replicas';
import type { MapData } from '../map/mapTypes';
import { buildNavGrid } from '../nav/navGrid';
import { createCharacter } from '../sim/character';
import type { GameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { lowestFloor, watchMatch, type WatchTally } from './report/matchWatch';

/**
 * Test-only (CT3, the mode checks): a short headless match of any mode with real physics and bots, everyone a bot, as
 * the game would set it up from the New game picks: the map, the opponents' level (teammates at the same), the team size
 * and the match rules (a ruleset's, or Custom's switches). Rounds modes play through ai/depotMatchSupport.ts playMatch,
 * Extraction through ai/extractionRunSupport.ts setUpRun with the runner bot; a new mode answers here too (the switch's
 * never-check). Call `initPhysics()` first.
 */

export interface ModeMatch {
  mode: MatchMode;
  map: MapData;
  level: Difficulty;
  /** Players a side as picked (Extraction: the squad is squadSize of it, the home team the map's). */
  teamSize: number;
  rules: MatchRules;
  seed: number;
  seconds: number;
  /** Elimination: the end Blue starts round 1 at, when not the rules' (to watch it from another mode's ends). */
  firstEnd?: number;
}

/** What a short match came to. */
export interface ModeMatchResult {
  /** Every round that ended (in Extraction, the run): who won, why, and after how long (s). */
  ended: { winner: number; reason: string; seconds: number }[];
  /** Characters on each team as the match started. */
  teams: [number, number];
  /** Seconds played. */
  seconds: number;
  /** What the map balance run's watch saw (ai/../report/matchWatch.ts): stuck bots, anyone falling through. */
  watched: WatchTally;
  /** Characters whose position stopped being a number, by id. */
  lost: number[];
}

/** The replicas everyone carries under the match's semi-only and realcap rules (the bots' standard kit, M39). */
const loadoutUnder = (rules: MatchRules) => LOADOUT.map((r) => replicaUnderRules(r, rules));

/** Plays `m`; `onTick` sees every tick's state (after the bots and the simulation), as playMatch's does. */
export function playModeMatch(m: ModeMatch, onTick: (state: GameState, bots: BotController) => void = () => {}): ModeMatchResult {
  const watch = watchMatch(m.map, lowestFloor(buildNavGrid(m.map, NAV).floorY), DT);
  const lost = new Set<number>();
  const teams: [number, number] = [0, 0];
  let ticks = 0;
  const tick = (state: GameState, bots: BotController): void => {
    if (ticks++ === 0) for (const c of state.characters) teams[c.team === 0 ? 0 : 1]++;
    for (const c of state.characters) if (!(Number.isFinite(c.position.x) && Number.isFinite(c.position.y) && Number.isFinite(c.position.z))) lost.add(c.id);
    watch.onTick(state, bots);
    onTick(state, bots);
  };
  const ended: ModeMatchResult['ended'] = [];
  const kit = loadoutUnder(m.rules);
  // Each figure's own hit volume (HV1), as a match and the headless bot matches play with since BD1 (KI2).
  const hits = riggedHits(hitRulesFor(m.rules));
  switch (m.mode) {
    case 'elimination':
    case 'attackDefend': {
      const stats = playMatch(m.seconds, m.seed, undefined, botConfig(m.level), m.mode, { ...roundRulesFor(m.rules), ...(m.firstEnd === undefined ? {} : { eliminationFirstEnd: m.firstEnd }) }, m.map, m.teamSize, hits, tick, (id, team) => createCharacter(id, vec3(), 0, kit, team));
      for (const r of stats.results) ended.push({ winner: r.winner, reason: r.reason, seconds: r.length });
      break;
    }
    case 'extraction': {
      const run = setUpRun({ seed: m.seed, map: m.map, squad: squadSize(m.teamSize), opponents: m.level, runnerBot: true, hits, loadout: kit });
      const start = run.state.round.clock;
      run.play(m.seconds, () => tick(run.state, run.bots));
      const r = run.state.round;
      if (r.phase === 'matchOver') ended.push({ winner: r.winner, reason: r.reason, seconds: start - r.clock });
      run.dispose();
      break;
    }
    default:
      unknownMode(m.mode);
  }
  return { ended, teams, seconds: ticks * DT, watched: watch.tally, lost: [...lost] };
}

/** Whether `mode` plays rounds (a match to a number of wins) or one run (config/modes.ts MODE_SHAPES). */
export const playsRounds = (mode: MatchMode): boolean => MODE_SHAPES[mode].play === 'rounds';
