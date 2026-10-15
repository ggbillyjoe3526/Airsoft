/**
 * Pings (PG1): marking a spot for your team (ai/pings.ts where it lands, ui/pingMarkers.ts how it shows). How your bot
 * teammates answer and how often they mark a sighting for you is callouts.md; how long they keep a ping in mind is
 * BOT_BEHAVIOUR.pingMemory (config/bots.ts).
 */
export const PINGS = {
  /** How far your view reaches for a ping (m): a spot further off, or the sky, pings nothing. */
  range: 120,
  /**
   * An enemy is the one pinged when the crosshair passes within this angle (degrees) of their chest or head, or within
   * `enemyReach` metres of it up close, nearer than whatever the view meets behind them.
   */
  enemyConeDeg: 2.5,
  enemyReach: 0.5,
  /** The floor spot your teammates go to or watch: the nearest walkable one within this many metres of the ping. */
  spotSnap: 3,
  /** Off a wall or crate, the spot is looked for this far back towards you (m), in front of it rather than inside. */
  backOff: 0.4,
  /** A ping shows for this long (s of play: a pause holds it), fading over the last `fadeTime`. */
  lifetime: 8,
  fadeTime: 1,
  /** Your pings are at least this far apart (s): a double click of the button is one ping. */
  minGap: 0.25,
  /** The marker sits this high over a floor spot (m; an enemy's at their chest), and this far inside the screen's edge (px). */
  markerHeight: 0.3,
  markerEdge: 48,
  /** What a marker says over its distance: your spot, or an enemy seen there. */
  labels: { spot: 'Ping', enemy: 'Contact' },
} as const;

/** Settings › HUD › Ping markers (PG1): the ping markers over the field and on the minimap shown, or hidden. */
export type PingMarkersMode = 'on' | 'off';

export const PING_MARKER_CHOICES: readonly { id: PingMarkersMode; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'No ping markers. Your pings still reach your teammates, and they still answer.' },
  { id: 'on', label: 'On', blurb: 'Your pings and your teammates’ marks over the field with their distance, and on the minimap.' },
];

export const DEFAULT_PING_MARKERS: PingMarkersMode = 'on';
