import { TEAMS } from '../config/teams';
import { halfTimeAfterRound, roundDrawn, type RoundRules, type RoundState } from '../sim/round';

/**
 * The round message in the middle of the screen, worded from your side: the result of the round just
 * played (and the countdown to the next, with a note at half-time), the match result, or
 * "Round N" (with your job in flag mode) just after a round starts. Empty when there's nothing to say.
 */
export function roundBanner(r: RoundState, playerTeam: number, showStart: boolean, secondsToNext: number, rules: RoundRules): string {
  if (r.mode === 'extraction') return runBanner(r, showStart);
  if (r.phase === 'matchOver') return r.matchWinner === playerTeam ? 'You win the match!' : 'You lose the match';
  const flagMode = r.mode === 'attackDefend';
  if (r.phase === 'over') {
    const mine = r.winner === playerTeam;
    const winner = r.winner >= 0 ? TEAMS[r.winner]!.name : '';
    let result: string;
    if (r.reason === 'captured') result = mine ? 'Flag raised · your team wins the round' : `${winner} raised their flag · your team loses the round`;
    else if (flagMode && r.reason === 'time') result = mine ? "Time's up · your team held the pole" : `Time's up · ${winner} held the pole`;
    else if (r.winner < 0) result = r.reason === 'time' ? "Time's up · draw" : 'Draw';
    // An Elimination time-out given to the team with more players left (Tournament, M39; BP2).
    else if (r.reason === 'time') result = mine ? "Time's up · your team had more players left" : `Time's up · ${winner} had more players left`;
    else result = mine ? 'Your team wins the round' : `Your team loses the round (${winner} wins)`;
    // A draw is played again (audit SIM-19): same round, same ends, so no half-time after it.
    if (roundDrawn(r)) return `${result} · round ${r.number} again in ${secondsToNext}`;
    const halfTime = halfTimeAfterRound(r.number, rules) ? (flagMode ? ' · half-time, sides swap' : ' · half-time, ends swap') : '';
    return `${result}${halfTime}${NEXT_ROUND}${secondsToNext}`;
  }
  if (!showStart) return '';
  if (!flagMode) return `Round ${r.number}`;
  // Short, so it fits on one line beside the hit feed at 1280 px (KNOWN_ISSUES row 138): the scoreboard says the rest.
  return r.attackers === playerTeam ? `Round ${r.number} · Attack` : `Round ${r.number} · Defend`;
}

/** Extraction (M43): how the run ended, or what to do just after it starts. */
function runBanner(r: RoundState, showStart: boolean): string {
  if (r.phase === 'matchOver') {
    if (r.reason === 'extracted') return 'Counted out · you made it!';
    if (r.reason === 'time') return "Caught out · time's up";
    return 'Out of the run';
  }
  return showStart ? 'Extraction · get to an exit' : '';
}

/** Said for a moment after you're back at the insertion from a hit (M43), with the respawns you have `left`. */
export function respawnBanner(left: number): string {
  return `Back in at the insertion · ${left === 0 ? 'no' : left} respawn${left > 1 ? 's' : ''} left`;
}

/** Before the countdown in the between-rounds message. */
const NEXT_ROUND = ' · next round in ';

/** The round message as a screen reader says it (audit UI-15): without the countdown, which changes every second. */
export function spokenRoundMessage(text: string): string {
  const at = text.indexOf(NEXT_ROUND);
  return at < 0 ? text : text.slice(0, at);
}
