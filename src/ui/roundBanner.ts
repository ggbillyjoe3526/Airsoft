import { TEAMS } from '../config/teams';
import { halfTimeAfterRound, type RoundRules, type RoundState } from '../sim/round';

/**
 * The round message in the middle of the screen, worded from your side: the result of the round just
 * played (and the countdown to the next, with a note at half-time), the match result, or
 * "Round N" (with your job in flag mode) just after a round starts. Empty when there's nothing to say.
 */
export function roundBanner(r: RoundState, playerTeam: number, showStart: boolean, secondsToNext: number, rules: RoundRules): string {
  if (r.phase === 'matchOver') return r.matchWinner === playerTeam ? 'You win the match!' : 'You lose the match';
  const flagMode = r.mode === 'attackDefend';
  if (r.phase === 'over') {
    const mine = r.winner === playerTeam;
    const winner = r.winner >= 0 ? TEAMS[r.winner]!.name : '';
    let result: string;
    if (r.reason === 'captured') result = mine ? 'Flag raised · your team wins the round' : `${winner} raised their flag · your team loses the round`;
    else if (flagMode && r.reason === 'time') result = mine ? "Time's up · your team held the pole" : `Time's up · ${winner} held the pole`;
    else if (r.winner < 0) result = r.reason === 'time' ? "Time's up · draw" : 'Draw';
    else result = mine ? 'Your team wins the round' : `Your team loses the round (${winner} wins)`;
    const halfTime = halfTimeAfterRound(r.number, rules) ? (flagMode ? ' · half-time, sides swap' : ' · half-time, ends swap') : '';
    return `${result}${halfTime} · next round in ${secondsToNext}`;
  }
  if (!showStart) return '';
  if (!flagMode) return `Round ${r.number}`;
  return r.attackers === playerTeam ? `Round ${r.number} · Attack: raise your flag on their pole` : `Round ${r.number} · Defend your pole`;
}
