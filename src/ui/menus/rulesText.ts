import { EXTRACTION } from '../../config/extraction';
import { formatRoundTime } from '../../config/matchRules';
import type { MatchMode } from '../../config/modes';
import type { ExtractionData } from '../../map/mapTypes';

/** What the New game screen needs to explain the match. */
export interface MatchRulesText {
  teamSize: number;
  winsNeeded: number;
  roundTime: number;
  playerTeam: string;
  enemyTeam: string;
  /** Seconds to raise the flag (flag mode), rounds before the teams swap ends (both modes), and whether your team attacks first. */
  raiseTime: number;
  halfTimeAfter: number;
  attackFirst: boolean;
  /** The map end (0 west, 1 east) your team starts each mode's match at (sim/round.ts teamEnd). */
  eliminationStartEnd: number;
  attackDefendStartEnd: number;
  /** The match's friendly fire and ricochet rules (M20). */
  friendlyFire: boolean;
  ricochetsCount: boolean;
}

/** A map end's name (0 is west, MapData.spawns). */
const END_NAMES = ['west', 'east'] as const;

/**
 * Extraction's goal paragraph (M43): the squad, the home team's numbers, the clock, the exits and the one respawn. On a
 * map without Extraction data the match is played as Elimination (MatchSession), and the paragraph says so.
 */
function describeRun(r: MatchRulesText, x: ExtractionData | undefined): string {
  if (!x) return 'This map has no Extraction yet: the match is played as Elimination.';
  const mates = r.teamSize - 1;
  const squad = mates === 0 ? 'Solo: just you' : `You and ${mates} bot teammate${mates === 1 ? '' : 's'}, who follow you`;
  return (
    `${squad} (${r.playerTeam}), against ${x.baseOpponents + r.teamSize} ${r.enemyTeam} bots of the home team. ` +
    `You have ${formatRoundTime(x.runTime)} to get to an open exit and stand in it for ${EXTRACTION.extractTime} s while you're counted out; ` +
    `someone from the home team in the exit pauses the count. A late exit opens with ${formatRoundTime(EXTRACTION.lateExitAt)} left. ` +
    `Hit once and you're back at the insertion straight away; hit again and you're out of the run.`
  );
}

/** The goal paragraph for `mode` (Extraction: on a map with `extraction` data). */
export function describeRules(r: MatchRulesText, mode: MatchMode, extraction?: ExtractionData): string {
  if (mode === 'extraction') return describeRun(r, extraction);
  const minutes = Math.floor(r.roundTime / 60);
  const seconds = String(Math.round(r.roundTime % 60)).padStart(2, '0');
  const mates = r.teamSize - 1;
  const opponents = r.teamSize === 1 ? `one ${r.enemyTeam} bot` : r.enemyTeam;
  const teams =
    mates === 0
      ? `1v1: you (${r.playerTeam}) against ${opponents}. `
      : `${r.teamSize}v${r.teamSize} with bots: you and ${mates} bot teammate${mates === 1 ? '' : 's'} (${r.playerTeam}) against ${opponents}. `;
  const fire = mates === 0 ? '' : r.friendlyFire ? ' Friendly fire counts.' : ' Friendly fire is off.';
  const ricochets = r.ricochetsCount ? ' Ricochets count.' : " Ricochets don't count.";
  const end = `First to ${r.winsNeeded} rounds wins the match. One hit and you're out.${fire}${ricochets}`;
  if (mode === 'attackDefend') {
    return (
      teams +
      `Each round one team attacks the other's flagpole: stand by it for ${r.raiseTime} s to raise your flag and win the round. ` +
      `Defenders by the pole pull it back down, and win if the clock (${minutes}:${seconds}) runs out. Knocking out the whole other team also wins. ` +
      `Your team ${r.attackFirst ? 'attacks' : 'defends'} first, from the ${END_NAMES[r.attackDefendStartEnd === 0 ? 0 : 1]} end; sides swap after round ${r.halfTimeAfter}. ` +
      end
    );
  }
  return (
    teams +
    `Knock out the whole other team to win a round (${minutes}:${seconds} on the clock; if time runs out it's a draw). ` +
    `You start at the ${END_NAMES[r.eliminationStartEnd === 0 ? 0 : 1]} end; teams swap ends after round ${r.halfTimeAfter}. ` +
    end
  );
}
