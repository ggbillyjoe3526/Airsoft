import { DIFFICULTIES, type Difficulty } from '../config/bots';
import { DEFAULT_RULESET, recordsKeyOf, rulesetOf, type RulesetId, standardMatchText } from '../config/matchRules';
import { isAvailable } from '../config/content';
import { HAUL_TEXT } from '../config/menus';
import { MATCH_MODES, type MatchMode } from '../config/modes';
import { noNews, type RecordNews, type Records, resultKey } from '../stats/records';
import { formatTime } from './statsRows';

/** How the records read on the summary screen: a wins and losses grid, then the bests. Pure, so it's tested without a page. */
export interface RecordsView {
  /** The grid's corner heading: "Your records", or a named ruleset's ("Your Tournament records", M39). */
  title: string;
  /** Column headings: the modes. */
  modes: string[];
  /** A row per difficulty: its label and a cell per mode ("3 W · 1 L", or "–" before a match). */
  rows: { label: string; cells: { text: string; current: boolean }[] }[];
  bests: { label: string; value: string; isNew: boolean }[];
  /** Why the match just played isn't in the records (custom rules, M20; Dev settings, M24), or '' when it is. */
  notCounted: string;
}

/** After a match that used dev content (M35); the XP line says it gave none. */
export const DEV_CONTENT_NOT_RECORDED = "This match used content still being built, so it isn't in your records.";

/**
 * Why a match isn't in the records: custom rules (M20; config/matchRules countsForRecords), Dev settings (M24), or
 * content still being built (M35, config/content.ts).
 */
export type NotCounted = '' | 'rules' | 'dev' | 'devContent';

/**
 * The line over the records after a match that didn't count. Custom rules quote the standard match of the ruleset the
 * grid shows (`shown`: a named ruleset's own, M39, or Skirmish's).
 */
function notCountedLine(why: NotCounted, shown: RulesetId): string {
  if (why === 'dev') return "Dev settings changed how this match played, so it isn't in your records.";
  if (why === 'devContent') return DEV_CONTENT_NOT_RECORDED;
  const named = shown === DEFAULT_RULESET ? '' : `${rulesetOf(shown).label} `;
  return `Custom rules, so this match isn't in your ${named}records. They count the standard match: ${standardMatchText(shown)}`;
}

/**
 * The ruleset whose cells the summary's grid shows after a match of `ruleset` in `mode`: a named ruleset's own (M39);
 * Skirmish's after Skirmish, after Custom (which has none) and after an Extraction run, which always files under the
 * plain cells (MatchSession's result).
 */
export function recordsRulesetShown(ruleset: RulesetId, mode: MatchMode): RulesetId {
  return mode === 'extraction' || !recordsKeyOf(ruleset) ? DEFAULT_RULESET : ruleset;
}

/**
 * The records, with the match just played (`difficulty`, `mode`) marked and `news` flagging the bests it beat. A match
 * that didn't count (`notCounted` says why) marks nothing and says why instead. After a named ruleset's match (M39) the
 * grid shows that ruleset's cells and quotes its standard match (recordsRulesetShown).
 */
export function recordsView(
  records: Records,
  news: RecordNews,
  difficulty: Difficulty,
  mode: MatchMode,
  notCounted: NotCounted = '',
  ruleset: RulesetId = DEFAULT_RULESET,
): RecordsView {
  const counted = notCounted === '';
  if (!counted) news = noNews();
  const modes = MATCH_MODES.filter((m) => isAvailable(m.tag, false));
  const shown = recordsRulesetShown(ruleset, mode);
  const cellsOf = recordsKeyOf(shown) ?? '';
  return {
    title: shown === DEFAULT_RULESET ? 'Your records' : `Your ${rulesetOf(shown).label} records`,
    modes: modes.map((m) => m.label),
    // A dev level (Pro, M36) or mode (Extraction, M43) never enters the records (M35), so its row or column would stay
    // empty: only public ones get one.
    rows: DIFFICULTIES.filter((d) => isAvailable(d.tag, false)).map((d) => ({
      label: d.label,
      cells: modes.map((m) => {
        const wl = records.results[resultKey(d.id, m.id, cellsOf)];
        return { text: wl ? `${wl.wins} W · ${wl.losses} L` : '–', current: counted && d.id === difficulty && m.id === mode };
      }),
    })),
    bests: [
      {
        label: 'Best accuracy',
        value: records.bestAccuracy === null ? '–' : `${Math.round(records.bestAccuracy * 100)}%`,
        isNew: news.bestAccuracy,
      },
      { label: 'Wins in a row', value: `${records.streak} now · best ${records.bestStreak}`, isNew: news.bestStreak },
      // Extraction's (M47), with its column: never while the mode is dev content, whose runs aren't recorded.
      ...(modes.some((m) => m.id === 'extraction') ? extractionBests(records, news) : []),
    ],
    notCounted: counted ? '' : notCountedLine(notCounted, shown),
  };
}

/** Extraction's bests (M47): the biggest haul, extractions in a row, and the quickest one with a case's finds. Pure. */
export function extractionBests(records: Records, news: RecordNews): RecordsView['bests'] {
  return [
    { label: 'Best haul', value: records.bestHaul === null ? '–' : HAUL_TEXT.xp(records.bestHaul), isNew: news.bestHaul },
    { label: 'Extractions in a row', value: `${records.extractionStreak} now · best ${records.bestExtractionStreak}`, isNew: news.bestExtractionStreak },
    {
      label: 'Fastest extraction with a case',
      value: records.fastestExtraction === null ? '–' : formatTime(records.fastestExtraction),
      isNew: news.fastestExtraction,
    },
  ];
}
