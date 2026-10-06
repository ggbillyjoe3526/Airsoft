/**
 * A player's head as a small drawing (graphics overhaul G3): a helmet in the team's colour over a face and a visor, for
 * the stats tables and (G4) the HUD's squad line. Drawn, not rendered: G7 may swap it for a picture of the figure's own
 * head. The helmet takes `--team` from the stylesheet (.head-icon), so one drawing serves every team and colour set.
 * Decoration only: the player's name beside it is what a screen reader reads.
 */
export const HEAD_ICON =
  '<svg class="head-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path class="head-face" d="M6.5 11.5h11v4.5a5.5 5.5 0 0 1-11 0z"/>' +
  '<path class="head-helmet" d="M4 12.5a8 8 0 0 1 16 0v1H4z"/>' +
  '<rect class="head-visor" x="7" y="13.5" width="10" height="3" rx="1"/>' +
  '</svg>';

/** The head drawing in a span of its own, to put before a name. */
export function headIcon(): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'head-icon-box';
  span.innerHTML = HEAD_ICON;
  return span;
}
