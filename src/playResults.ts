import type { DevSettings } from './config/dev';
import type { MatchSession } from './matchSession';
import { settleAdaptive } from './adaptivePicks';
import { contentPool } from './pool/contentPool';
import { GAME_POOL } from './pool/gamePool';
import { GAME_LEVELS } from './progress/gameLevels';
import { standing } from './progress/levels';
import { type Progress, saveProgress } from './progress/progress';
import { browserStorage } from './settings/storage';
import { addChallengeRun, loadRecords, noNews, type RecordNews, type Records, saveRecords } from './stats/records';
import { type NoXp, settleMatch } from './stats/settleMatch';
import { haulSummary, type MatchSummary, type XpSummary, xpSummary } from './ui/menus/summaryScreen';
import { recordsView } from './ui/recordsView';

/** What settling reads of the setup (playSetup.ts): the progress (another tab's newer save first), the kit's flags. */
export interface ResultsSetup {
  syncedProgress(): Progress;
  kitChanged(): void;
}

/**
 * What play leaves behind (out of game.ts, DX8): a decided match's records, XP and adaptive line, given once the frame it
 * is decided and shown on its result screen, and a timed challenge's best on the range.
 */
export class PlayResults {
  /** What the last match finished changed in the local records (M19). */
  private recordNews: RecordNews = noNews();
  /** What the last match gave in XP and where it left the player's level (LV1), for its summary. */
  private lastXp: XpSummary | null = null;
  /** Why the last match gave no XP, for the summary (audit POOL-22), or null when it gave some. */
  private noXpReason: NoXp | null = null;
  /** What the last match did to adaptive difficulty (AD1), for its summary, or null when it played a fixed level. */
  private adaptiveLine: string | null = null;
  /** The match session already recorded and given its XP (settleMatch runs once per session). */
  private settledSession: MatchSession | null = null;

  constructor(
    private readonly setup: ResultsSetup,
    /** The Dev settings in force (M24): Adaptive difficulty, Dev content. */
    private readonly dev: () => DevSettings,
    /** The menus read everything again once a match changed the level or the rating. */
    private readonly menus: { refresh(): void },
    /** The local records (M19). */
    readonly records: Records = loadRecords(browserStorage()),
  ) {}

  /**
   * A decided match goes into the records and gives its XP as soon as it is decided (audit CORE-06; LV1), not when the
   * mouse is given back for the result screen: a tab closed in between, or a browser that never reports the lock's
   * release, lost it. Once per match (the session's take latches); the result screen only shows what this saved.
   */
  settle(s: MatchSession): void {
    // Once per session, on the first frame the match is over: nothing is built on the frames after (CLAUDE.md §9).
    if (s.state.round.phase !== 'matchOver' || this.settledSession === s) return;
    this.settledSession = s;
    const dev = this.dev();
    // Adaptive difficulty (AD1) learns from the match, unless it was switched off since: the summary says how.
    const adaptive = s.adaptiveResult();
    this.adaptiveLine = adaptive && s.setup.adaptive && dev.adaptiveDifficulty ? settleAdaptive(adaptive, s.setup.adaptive.from) : null;
    // The Match screen's note reads the new rating.
    if (this.adaptiveLine) this.menus.refresh();
    const progress = this.setup.syncedProgress();
    const settled = settleMatch(this.records, progress, GAME_LEVELS, s.takeMatchResult(), s.takeOutcome());
    if (settled.news) {
      this.recordNews = settled.news;
      saveRecords(this.records, browserStorage());
    }
    if (settled.xp) {
      // What a level gave is named as the menus offer it: an item still being built stays unnamed with Dev content off.
      const offered = contentPool(GAME_POOL, dev.devContent);
      const up = settled.levelUp && { ...settled.levelUp, unlocked: settled.levelUp.unlocked.filter((id) => offered.byId.has(id)) };
      this.lastXp = xpSummary(settled.xp, up, standing(GAME_LEVELS, progress.xp), (id) => offered.byId.get(id)!.name);
      this.noXpReason = null;
      saveProgress(progress);
      // What the levels unlocked is in the Loadout from the next look at it, and in the next match's kit choices.
      if (settled.levelUp && settled.levelUp.unlocked.length > 0) this.setup.kitChanged();
      this.menus.refresh();
    } else if (!s.givesXp) {
      // No XP (Dev settings, dev content): the summary says why (audit POOL-22), not what an earlier match gave.
      this.lastXp = null;
      this.noXpReason = s.noXpReason ?? 'dev';
    }
  }

  /** The result screen's summary of a decided match (settled first), with its `view`: the records, the XP, the finds. */
  summary(s: MatchSession, view: ReturnType<MatchSession['resultView']>): MatchSummary {
    return {
      result: view.result,
      blocks: view.summaryBlocks,
      records: recordsView(this.records, this.recordNews, s.setup.difficulty, s.mode, s.notCountedReason, s.setup.ruleset),
      xp: this.lastXp,
      noXp: this.noXpReason,
      haul: haulSummary(s.runFinds(), this.lastXp !== null),
      adaptive: this.adaptiveLine,
    };
  }

  /** The best timed challenge run on `course` (M93), 0 before any. */
  challengeBest(course: string): number {
    return this.records.bestChallenge[course] ?? 0;
  }

  /** A timed challenge run that beats the best is kept at once (M93), like a match's records. */
  challengeRun(course: string, hits: number): void {
    if (addChallengeRun(this.records, course, hits)) saveRecords(this.records, browserStorage());
  }
}
