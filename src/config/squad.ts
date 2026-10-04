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
  /** Where a follow spot isn't walkable (a wall, a drop), the spot is tried straight behind you, then this much closer (m). */
  followFallbackStep: 1.5,
  /**
   * A follow spot must also be in a straight walkable line from you (not behind a wall). That line starts at the
   * nearest walkable ground within this (m) when you stand inside the margin bots keep from walls and edges.
   */
  followLineSnap: 0.8,
  /** Close enough to the follow spot to stop there while you stand still (m). */
  followArrive: 1.2,
  /** Settled at the spot, followers stay put until it is this much further off (m), so they don't shuffle. */
  followSettle: 0.8,
  /**
   * More than this behind their spot along your way (m), followers go a pace faster than you until back on it; more
   * than this ahead of it, a pace slower until back on it.
   */
  catchUpGap: 1.5,
  /** With you on the move, followers head your way plus this much (1/s) of the gap to their spot, closing it smoothly. */
  followPull: 1.5,
  /**
   * Further than this from you (m), followers sprint to catch up (otherwise they keep your pace: walk, run or sprint),
   * until rushEase inside it.
   */
  catchUp: 8,
  rushEase: 3,
  /** Hurrying followers sprint while at least this much of their move is forward (bots' own gate is stricter). */
  sprintForward: 0.6,
  /** Your heading is the way you move, once you move at least this fast (m/s); standing still keeps it. */
  headingSpeed: 1,
  /** Followers' idea of your heading turns at most this fast (rad/s), so their spots swing round rather than jump. */
  headingTurnRate: 1.5,
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
  /** Team plan picked on the order wheel (M23) with no order in force. */
  onPlan: 'Squad already on the team plan',
  nobody: 'No teammates in play to order',
  /** An order key pressed while you are out, or between rounds: ignored, with this notice. */
  notNow: 'Orders wait for the next round',
  noticeTime: 2,
} as const;

/** What the order wheel (M23) gives: one of the orders, or `cancel`, back to the team plan. */
export type SquadCommand = SquadOrderKind | 'cancel';

/**
 * How an order on the wheel is picked (Settings → Controls, M23): `hover` points at it and lets go of the wheel key;
 * `click` points at it and clicks (letting go without a click gives nothing).
 */
export type WheelSelect = 'hover' | 'click';

export const WHEEL_SELECT_MODES: readonly { id: WheelSelect; label: string; blurb: string }[] = [
  { id: 'hover', label: 'Hover', blurb: 'Point at an order and let go of the key to give it. Let go in the middle to give nothing.' },
  { id: 'click', label: 'Click', blurb: 'Point at an order and click to give it. Letting go of the key closes the wheel.' },
];

export const DEFAULT_WHEEL_SELECT: WheelSelect = 'hover';

/**
 * The order wheel (M23): hold its key and the mouse moves a pointer on the wheel instead of the view, so turning,
 * aiming and the replica stay as they were; your feet still move. The wheel's pointer is its own, not the view's.
 */
export const ORDER_WHEEL = {
  /** Clockwise from the top. Each order is a button on the wheel, so its label is in title case (owner, 2026-10-04). */
  items: [
    { command: 'follow', label: 'Follow Me' },
    { command: 'hold', label: 'Hold Here' },
    { command: 'regroup', label: 'Regroup' },
    { command: 'cancel', label: 'Team Plan' },
  ] as readonly { command: SquadCommand; label: string }[],
  /** Pixels the wheel's pointer moves per mouse count, times the mouse sensitivity. */
  pointerGain: 0.5,
  /** The pointer stays this close to the middle (px). */
  pointerReach: 90,
  /** Within this of the middle the pointer is on no order (px). */
  deadZone: 24,
  /** Distance of the orders from the wheel's middle on screen (px). */
  radius: 112,
} as const;
