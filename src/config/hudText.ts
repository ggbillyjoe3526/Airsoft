/**
 * The HUD's words (graphics overhaul G4): the replica panel's status lines and spare count, the squad cards' states,
 * the score bar's aim under the clock and the minimap's caption.
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
  /** A squad card's state line: in play (or the order your teammates carry out), or hit. */
  inPlay: 'In play',
  hit: 'Hit',
  /** The squad line's own card. */
  you: 'You',
  /** The squad's order keys, by order, as the line under the cards names them. */
  orders: { follow: 'Follow', hold: 'Hold', regroup: 'Regroup' },
  /** What a teammate on an order is doing, on their card. */
  doing: { follow: 'Following', hold: 'Holding', regroup: 'Regrouping' },
} as const;
