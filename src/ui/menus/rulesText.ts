import type { MatchMode } from '../../config/modes';

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
  /** The match's friendly fire and ricochet rules (M20). */
  friendlyFire: boolean;
  ricochetsCount: boolean;
}

/** The goal paragraph for `mode`. */
export function describeRules(r: MatchRulesText, mode: MatchMode): string {
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
      `Your team ${r.attackFirst ? 'attacks' : 'defends'} first; sides swap after round ${r.halfTimeAfter}. ` +
      end
    );
  }
  return (
    teams +
    `Knock out the whole other team to win a round (${minutes}:${seconds} on the clock; if time runs out it's a draw). ` +
    `Teams swap ends after round ${r.halfTimeAfter}. ` +
    end
  );
}
