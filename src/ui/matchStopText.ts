import { formatRoundTime } from '../config/matchRules';
import { unknownMode } from '../config/modes';
import { TEAMS } from '../config/teams';
import { attackersInRound, type RoundRules, type RoundState } from '../sim/round';

/** The result screen's lines for a decided match (audit CORE-05: composed here, Game.pause only shows them). */
export interface ResultText {
  /** "You win!" or "You lose". */
  headline: string;
  /** Under the headline: the score with the teams' names, then the rounds played (and drawn). */
  scoreLine: string;
  /** The headline and the score in one line, for the end-of-match summary. */
  result: string;
}

/** `Blue (you) 5 – 3 Orange`: your team first. */
function scoreText(r: RoundState, mine: number): string {
  const theirs = 1 - mine;
  return `${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name}`;
}

/**
 * The result screen's text for a decided match, from the player's team `mine`. Extraction (M43): how the run ended and
 * how long it took, out of `runTime` seconds.
 */
export function resultText(r: RoundState, mine: number, runTime = 0): ResultText {
  switch (r.mode) {
    case 'elimination':
    case 'attackDefend':
      return roundsResultText(r, mine);
    case 'extraction':
      return runResultText(r, runTime);
    default:
      return unknownMode(r.mode);
  }
}

/** A mode played in rounds: who won the match, the score and the rounds played. */
function roundsResultText(r: RoundState, mine: number): ResultText {
  const played = r.score[0] + r.score[1] + r.draws;
  const headline = r.matchWinner === mine ? 'You win!' : 'You lose';
  const score = scoreText(r, mine);
  return {
    headline,
    scoreLine: `${score} · ${played} rounds${r.draws > 0 ? `, ${r.draws} drawn` : ''}`,
    result: `${headline} · ${score}`,
  };
}

function runResultText(r: RoundState, runTime: number): ResultText {
  const headline = r.reason === 'extracted' ? 'Extracted!' : r.reason === 'time' ? 'Caught out' : 'Out of the run';
  const used = formatRoundTime(Math.max(0, runTime - r.clock));
  const how = r.reason === 'extracted' ? `Counted out after ${used}` : r.reason === 'time' ? `Still in when time ran out (${formatRoundTime(runTime)})` : `Hit with no respawn left after ${used}`;
  return { headline, scoreLine: `Extraction · ${how}`, result: `${headline} · ${how}` };
}

/**
 * The pause screen's line for a match in play or between rounds: the round, your role in Attack / Defend (between
 * rounds the one you'll have next round: it swaps at half-time), the score and the wins needed.
 */
export function pauseText(r: RoundState, mine: number, rules: RoundRules): string {
  switch (r.mode) {
    case 'elimination':
      return roundsPauseText(r, mine, rules, '');
    case 'attackDefend': {
      const between = r.phase === 'over';
      const attackers = between ? attackersInRound(r.number + 1, rules) : r.attackers;
      return roundsPauseText(r, mine, rules, ` · attack / defend, you ${attackers === mine ? 'attack' : 'defend'}${between ? ' next' : ''}`);
    }
    case 'extraction':
      return `Extraction · ${formatRoundTime(Math.ceil(r.clock))} left`;
    default:
      return unknownMode(r.mode);
  }
}

/** A mode played in rounds: the round (or the one just played), `role`, the score and the wins needed. */
function roundsPauseText(r: RoundState, mine: number, rules: RoundRules, role: string): string {
  const between = r.phase === 'over';
  return `${between ? `After round ${r.number}` : `Round ${r.number}`}${role} · ${scoreText(r, mine)} · first to ${rules.winsNeeded}`;
}
