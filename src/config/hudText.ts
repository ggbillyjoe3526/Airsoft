/**
 * The HUD's words (graphics overhaul G4): the replica panel's status lines and spare count, the score bar's aim under
 * the clock and the minimap's caption.
 */
export const HUD_TEXT = {
  reloading: 'Reloading',
  outOfBBs: 'Out of BBs',
  lastMagazine: 'Last magazine',
  /** The replica is put away (M92): a trigger pull, aim or its key draws it. */
  holstered: 'Holstered',
  /** Under the loaded count: the BBs in the spare magazines (how many magazines hold any, the bars show). */
  spare: (bbs: number) => `/ ${bbs}`,
  /**
   * The hop-up readout on the replica panel while you turn the dial in play (Dev 6 playtest item 15, ui/hopGauge.ts):
   * its label, and what the setting does to a level shot.
   */
  hop: {
    label: 'Hop-up',
    flatTo: (m: number) => `Flat to ${m} m`,
    past: (m: number) => `Flat past ${m} m`,
    floats: 'Too much · floats',
  },
  /** Under the clock: what wins the match. */
  firstTo: (wins: number, by = 1) => (by > 1 ? `First to ${wins}, by ${by}` : `First to ${wins}`),
  /** Under the clock in Extraction (no round score): the run itself. */
  run: 'Extraction',
  /** Under the clock while Elimination's overtime flag is up (Dev 6 item 45): the clock is the overtime's. */
  overtime: 'Overtime',
  /** The minimap's caption: the map and the round. */
  where: (map: string, round: number) => (round > 0 ? `${map} · Round ${round}` : map),
  /**
   * Skip to next round (M83), on the spectating line once you are out: how to skip (Esc skips at once, the owner's 0.1 Dev
   * 5 playtest, note 10; the pause menu's button too), and the line while the rest of the round is played out.
   */
  skip: { round: 'Esc to skip the round', result: 'Esc to skip to the result', skipping: 'Skipping the round…' },
  /**
   * Esc skipped the round without the pause menu (the owner's 0.1 Dev 5 playtest, note 10): the browser took the mouse
   * back, so a click takes it again and plays on; Esc again opens the menu.
   */
  playPrompt: 'Click to play · Esc for the menu',
  /** The pause menu's button, by what it skips to. */
  skipButton: { round: 'Skip to next round', result: 'Skip to the result' },
  /**
   * The stamp at a round's end (Dev 6 playtest item 33, ui/roundResult.ts): the word, the line under it, and how a click
   * moves on. Set in capitals by the stylesheet.
   */
  result: {
    won: 'Won',
    lost: 'Lost',
    draw: 'Draw',
    round: (n: number) => `Round ${n}`,
    match: 'Match',
    nextRound: 'Click for the next round',
    results: 'Click for the results',
  },
  /** The practice range's pause menu (M93): the timed challenge's switch, by whether it is on. */
  challengeButton: { on: 'Timed challenge: On', off: 'Timed challenge: Off' },
} as const;

/** What the spectating line says about skipping the round (M83): how, that it is under way, or nothing. */
export type SkipLabel = keyof typeof HUD_TEXT.skip | null;
