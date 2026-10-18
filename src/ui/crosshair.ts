import { CROSSHAIR_COLORS, CROSSHAIR_SHAPES, type CrosshairSettings, DEFAULT_CROSSHAIR } from '../config/matchInfo';
import { HUD } from '../config/render';
import { hexColour } from '../settings/hudPrefs';

/**
 * The crosshair (M19): four arms, a centre dot and a ring, of which the picked shape shows some. Its look comes from
 * Settings → Crosshair; the gap between the centre and the arms (or the ring's radius) opens with the real spread
 * (see Hud). The same element is the live preview on the Settings screen.
 */

/** The crosshair's colour as CSS: the picked swatch's, or the custom one. */
export function crosshairCss(s: CrosshairSettings): string {
  if (s.color === 'custom') return hexColour(s.customColor) ?? DEFAULT_CROSSHAIR.customColor;
  return CROSSHAIR_COLORS.find((c) => c.id === s.color)?.css ?? CROSSHAIR_COLORS[0]!.css;
}

/**
 * The gap between the centre and the arms (px) for a spread of `spreadPx` (one standard deviation on screen): opened to
 * cover HUD.crosshairSpreadSigmas of it when dynamic, never below the player's gap, and in HUD.crosshairGapStep steps
 * (fewer DOM writes). A static crosshair keeps the player's gap (audit UI-21).
 */
export function crosshairGap(minGap: number, spreadPx: number, dynamic: boolean): number {
  if (!dynamic) return minGap;
  return Math.round(Math.max(minGap, HUD.crosshairSpreadSigmas * spreadPx) / HUD.crosshairGapStep) * HUD.crosshairGapStep;
}

/** A crosshair element (`hud-crosshair` in the stylesheet): arms, dot and ring; style it with styleCrosshair. */
export function crosshairElement(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'hud-crosshair';
  root.innerHTML = '<i></i><i></i><i></i><i></i><b></b><u></u>';
  return root;
}

/** Applies the player's crosshair look: which parts show, size, thickness, colour and outline. */
export function styleCrosshair(root: HTMLElement, s: CrosshairSettings): void {
  for (const { id } of CROSSHAIR_SHAPES) root.classList.toggle(`shape-${id}`, id === s.shape);
  root.classList.toggle('no-outline', s.outline === 'off');
  root.style.setProperty('--arm', `${s.size}px`);
  root.style.setProperty('--thick', `${s.thickness}px`);
  // Whole pixels either side of the centre line, so odd thicknesses stay sharp.
  root.style.setProperty('--half', `${Math.floor(s.thickness / 2)}px`);
  root.style.setProperty('--xh', crosshairCss(s));
  root.style.opacity = String(s.opacity);
}

/** The gap between the centre and the arms (the ring's radius), in pixels. */
export function setCrosshairGap(root: HTMLElement, px: number): void {
  root.style.setProperty('--gap', `${px}px`);
}
