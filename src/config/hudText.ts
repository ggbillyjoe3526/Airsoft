/**
 * The HUD's words (graphics overhaul G4): the replica panel's status lines and spare count, the score bar's aim under
 * the clock and the minimap's caption.
 */
export const HUD_TEXT = {
  reloading: 'Reloading',
  outOfBBs: 'Out of BBs',
  lastMagazine: 'Last magazine',
  /** Under the loaded count: the BBs in the spare magazines and how many of them still hold any. */
  spare: (bbs: number, mags: number) => `/ ${bbs} · ${mags} spare`,
  /** Under the clock: what wins the match. */
  firstTo: (wins: number, by = 1) => (by > 1 ? `First to ${wins}, by ${by}` : `First to ${wins}`),
  /** Under the clock in Extraction (no round score): the run itself. */
  run: 'Extraction',
  /** The minimap's caption: the map and the round. */
  where: (map: string, round: number) => (round > 0 ? `${map} · Round ${round}` : map),
  /**
   * Skip to next round (M83), on the spectating line once you are out: how to skip (Esc, then the pause menu's button),
   * and the line while the rest of the round is played out.
   */
  skip: { round: 'Esc to skip the round', result: 'Esc to skip to the result', skipping: 'Skipping the round…' },
  /** The pause menu's button, by what it skips to. */
  skipButton: { round: 'Skip to next round', result: 'Skip to the result' },
} as const;

/** What the spectating line says about skipping the round (M83): how, that it is under way, or nothing. */
export type SkipLabel = keyof typeof HUD_TEXT.skip | null;
