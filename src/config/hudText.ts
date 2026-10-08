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
} as const;
