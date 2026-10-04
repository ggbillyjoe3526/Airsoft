import { DIFFICULTIES, type Difficulty } from '../config/bots';
import { standardMatchText } from '../config/matchRules';
import { MATCH_MODES, type MatchMode } from '../config/modes';
import { type RecordNews, type Records, resultKey } from '../stats/records';

/** How the records read on the summary screen: a wins and losses grid, then the bests. Pure, so it's tested without a page. */
export interface RecordsView {
  /** Column headings: the modes. */
  modes: string[];
  /** A row per difficulty: its label and a cell per mode ("3 W · 1 L", or "–" before a match). */
  rows: { label: string; cells: { text: string; current: boolean }[] }[];
  bests: { label: string; value: string; isNew: boolean }[];
  /** Why the match just played isn't in the records (custom rules, M20), or '' when it is. */
  notCounted: string;
}

const NO_NEWS: RecordNews = { bestAccuracy: false, bestStreak: false };

/** The line over the records after a custom match: only the standard match counts (M20; config/matchRules countsForRecords). */
function notCountedLine(): string {
  return `Custom rules, so this match isn't in your records. They count the standard match: ${standardMatchText()}`;
}

/**
 * The records, with the match just played (`difficulty`, `mode`) marked and `news` flagging the bests it beat. A match
 * that didn't count (`counted` false: custom rules) marks nothing and says why instead.
 */
export function recordsView(records: Records, news: RecordNews, difficulty: Difficulty, mode: MatchMode, counted = true): RecordsView {
  if (!counted) news = NO_NEWS;
  return {
    modes: MATCH_MODES.map((m) => m.label),
    rows: DIFFICULTIES.map((d) => ({
      label: d.label,
      cells: MATCH_MODES.map((m) => {
        const wl = records.results[resultKey(d.id, m.id)];
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
    ],
    notCounted: counted ? '' : notCountedLine(),
  };
}
