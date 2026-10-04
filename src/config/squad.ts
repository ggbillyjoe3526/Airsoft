/**
 * Squad orders for your bot teammates (M22): a first step towards team communication. Each is a key (rebindable,
 * config/controls.ts); without an order the bots play their team plan. An order holds until it is given again (that
 * cancels it), you are hit, or the round ends. Bots still fight whoever they see; orders replace where they go
 * between fights.
 */
export type SquadOrderKind = 'follow' | 'hold' | 'regroup';

export const SQUAD_ORDERS = {
  /** Follow me: each teammate keeps a spot this far behind you (m), either side of your heading. */
  followDistance: 3.2,
  /** How far either side of straight behind you the follow spots are (degrees). */
  followSpreadDeg: 40,
  /** Each further pair of followers keeps this much further back (m). */
  followRowGap: 1.6,
  /** Close enough to the follow spot to stop there (m). */
  followArrive: 1.2,
  /** Further than this from you (m), followers sprint to catch up; they also sprint when you do. */
  catchUp: 8,
  /** Your heading is the way you move, once you move at least this fast (m/s); standing still keeps it. */
  headingSpeed: 1,
  /**
   * Where followers look once at their spot, turned from your heading (degrees): the first straight behind you, the
   * next to either side, so they cover your back.
   */
  followWatchDeg: [180, 90, -90] as readonly number[],
  /** Hold here: the spot you look at, up to this far (m); nothing that close: each holds where it stands. */
  holdRange: 40,
  /** Held spots stop this far short of the wall you look at (m). */
  holdWallGap: 0.6,
  /** Teammates holding a spot stand this far apart, across your line of sight (m). */
  holdSpacing: 1.4,
  /** Close enough to the held spot to stop (m). */
  holdArrive: 0.7,
  /** Hold here again, looking at least this far from the held spot (m), moves it; nearer cancels the order. */
  holdMove: 3,
  /** The hold marker sits this high over the held spot (m), and stays this far inside the screen's edge (px). */
  markerHeight: 1.2,
  markerEdge: 48,
  /** Regroup: teammates sprint back to you and follow once this close (m). */
  regroupArrive: 4,
  /** What the HUD calls each order. */
  labels: { follow: 'Follow me', hold: 'Hold here', regroup: 'Regroup' } satisfies Record<SquadOrderKind, string>,
  /** The HUD line after an order is cancelled, or given with no teammate left to take it, for `noticeTime` seconds. */
  cancelled: 'Back to the team plan',
  nobody: 'No teammates left to order',
  /** An order key pressed while you are out, or between rounds: ignored, with this notice. */
  notNow: 'Orders wait for the next round',
  noticeTime: 2,
} as const;
