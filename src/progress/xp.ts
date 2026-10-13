import type { Difficulty } from '../config/bots';
import { CUSTOM_RULES_PAY_CAP } from '../config/matchRules';
import type { XpRules } from './levels';

/**
 * What a finished match gives (LV1): its XP line by line, from levels.md's XP tables. The rules are the ones Field
 * Credits had (audit POOL-08, POOL-09): a shorter match gives less, a round sat out gives nothing, and the lower of the
 * two teams' difficulties multiplies the total, custom rules at most ×1.5. Pure.
 */

/** What a finished match was, for its XP. */
export interface MatchOutcome {
  won: boolean;
  /** Rounds your team won that you played a part in (a round sat out gives nothing). */
  roundsWon: number;
  /** Your BBs on an opponent. */
  hits: number;
  /** The match's rounds to win (5 in the standard match). */
  winsNeeded: number;
  /** The opponents' difficulty. */
  difficulty: Difficulty;
  /** Your teammates' difficulty; absent with no teammates (1v1). The lower multiplier of the two counts. */
  teammateDifficulty?: Difficulty;
  /**
   * Custom rules (M39, config/matchRules.ts standardRules: not a named ruleset's standard match): the multiplier is
   * capped at CUSTOM_RULES_PAY_CAP (Pro's ×2 is for the named rulesets). Absent: the standard match.
   */
  customRules?: boolean;
  /** Extraction (M44): the XP in the cases the runner got out with. Absent in the other modes and for a run that didn't extract. */
  haul?: { xp: number };
  /** An Extraction run (M47): it gives the haul's XP and your hits, times the difficulty, with no match or round lines. */
  extraction?: boolean;
}

/** A match's XP, line by line as the summary shows them, and the total (after the difficulty). */
export interface XpEarned {
  lines: { label: string; xp: number }[];
  /** The difficulty multiplier the lines are scaled by (the lower of the opponents' and the teammates'). */
  multiplier: number;
  total: number;
}

/** The standard match's rounds to win: Match played, Match won and Round won are given in full from here on. */
const FULL_MATCH_WINS = 5;

export function matchXp(rules: XpRules, o: MatchOutcome): XpEarned {
  const lines = o.extraction ? runLines(o) : matchLines(rules, o);
  if (o.hits > 0) lines.push({ label: `${o.hits} ${o.hits === 1 ? 'hit' : 'hits'} on an opponent`, xp: rules.earn.hit * o.hits });
  // The lower of the two teams' (audit POOL-08): Hard teammates carrying you against Hard opponents count as Hard only
  // if you're in there too, and Easy opponents never count as Hard.
  const multiplier = Math.min(
    rules.difficulty[o.difficulty],
    o.teammateDifficulty ? rules.difficulty[o.teammateDifficulty] : Number.POSITIVE_INFINITY,
    o.customRules ? CUSTOM_RULES_PAY_CAP : Number.POSITIVE_INFINITY,
  );
  const total = Math.max(0, Math.round(lines.reduce((sum, l) => sum + l.xp, 0) * multiplier));
  return { lines, multiplier, total };
}

/** A match's own lines: Match played, Match won and the rounds won, scaled to its length. */
function matchLines(rules: XpRules, o: MatchOutcome): XpEarned['lines'] {
  const scale = Math.min(1, Math.max(0, o.winsNeeded) / FULL_MATCH_WINS);
  const lines = [{ label: 'Match played', xp: Math.round(rules.earn.matchPlayed * scale) }];
  if (o.won) lines.push({ label: 'Match won', xp: Math.round(rules.earn.matchWon * scale) });
  // Scaled like the match lines (audit POOL-09): a short 1v1 is no richer a farm than the standard match.
  if (o.roundsWon > 0) lines.push({ label: `${o.roundsWon} ${o.roundsWon === 1 ? 'round' : 'rounds'} won`, xp: Math.round(rules.earn.roundWon * o.roundsWon * scale) });
  return lines;
}

/** An Extraction run's own line (M47): the XP got out with; nothing for walking out empty-handed or not getting out. */
function runLines(o: MatchOutcome): XpEarned['lines'] {
  return o.haul && o.haul.xp > 0 ? [{ label: 'Got out with', xp: o.haul.xp }] : [];
}
