import { DIFFICULTIES, type Difficulty } from '../config/bots';
import { standardMatchText } from '../config/matchRules';
import { isAvailable } from '../config/content';
import { MATCH_MODES, type MatchMode } from '../config/modes';
import { type RecordNews, type Records, resultKey } from '../stats/records';

/** How the records read on the summary screen: a wins and losses grid, then the bests. Pure, so it's tested without a page. */
export interface RecordsView {
  /** Column headings: the modes. */
  modes: string[];
  /** A row per difficulty: its label and a cell per mode ("3 W · 1 L", or "–" before a match). */
  rows: { label: string; cells: { text: string; current: boolean }[] }[];
  bests: { label: string; value: string; isNew: boolean }[];
  /** Why the match just played isn't in the records (custom rules, M20; Dev settings, M24), or '' when it is. */
  notCounted: string;
}

/** After a match that used dev content (M35); the Field Credits line says it paid nothing. */
export const DEV_CONTENT_NOT_RECORDED = "This match used content still being built, so it isn't in your records.";

const NO_NEWS: RecordNews = { bestAccuracy: false, bestStreak: false };

/**
 * Why a match isn't in the records: custom rules (M20; config/matchRules countsForRecords), Dev settings (M24), or
 * content still being built (M35, config/content.ts).
 */
export type NotCounted = '' | 'rules' | 'dev' | 'devContent';

/** The line over the records after a match that didn't count. */
function notCountedLine(why: NotCounted): string {
  if (why === 'dev') return "Dev settings changed how this match played, so it isn't in your records.";
  if (why === 'devContent') return DEV_CONTENT_NOT_RECORDED;
  return `Custom rules, so this match isn't in your records. They count the standard match: ${standardMatchText()}`;
}

/**
 * The records, with the match just played (`difficulty`, `mode`) marked and `news` flagging the bests it beat. A match
 * that didn't count (`notCounted` says why) marks nothing and says why instead.
 */
export function recordsView(records: Records, news: RecordNews, difficulty: Difficulty, mode: MatchMode, notCounted: NotCounted = ''): RecordsView {
  const counted = notCounted === '';
  if (!counted) news = NO_NEWS;
  const modes = MATCH_MODES.filter((m) => isAvailable(m.tag, false));
  return {
    modes: modes.map((m) => m.label),
    // A dev level (Pro, M36) or mode (Extraction, M43) never enters the records (M35), so its row or column would stay
    // empty: only public ones get one.
    rows: DIFFICULTIES.filter((d) => isAvailable(d.tag, false)).map((d) => ({
      label: d.label,
      cells: modes.map((m) => {
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
    notCounted: counted ? '' : notCountedLine(notCounted),
  };
}
