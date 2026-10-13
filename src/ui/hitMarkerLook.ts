import {
  DEFAULT_HIT_MARKER,
  DEFAULT_HIT_MARKER_SETTINGS,
  HIT_MARKER_CHOICES,
  HIT_MARKER_COLORS,
  HIT_MARKER_FRIENDLY,
  HIT_MARKER_OUTLINES,
  HIT_MARKER_RANGES,
  HIT_MARKER_SHAPE,
  type HitMarkerSettings,
} from '../config/hits';
import { browserStorage, loadSetting, numberIn, oneOf } from '../settings/storage';
import { hexColour } from './crosshair';

/**
 * The hit marker's look (the owner's 0.1 Dev 5 playtest, note 4): an X of four arms on the diagonals round the
 * crosshair, sized, thickened, outlined and coloured from Settings › Gameplay, as the crosshair is. The same element is
 * the live preview on the Settings screen.
 */

/** The saved hit marker, each part falling back to the default on its own (off on a clean save, M97). */
export function loadHitMarker(storage = browserStorage()): HitMarkerSettings {
  const d = DEFAULT_HIT_MARKER_SETTINGS;
  const t = HIT_MARKER_RANGES.thickness;
  const thickness = (raw: unknown): number | undefined => {
    const v = numberIn(t.min, t.max)(raw);
    return v === undefined ? undefined : Math.round(v);
  };
  return {
    on: loadSetting('hitMarker', oneOf(HIT_MARKER_CHOICES.map((c) => c.id)), DEFAULT_HIT_MARKER ? 'on' : 'off', storage) === 'on',
    scale: loadSetting('hitMarker.scale', numberIn(HIT_MARKER_RANGES.scale.min, HIT_MARKER_RANGES.scale.max), d.scale, storage),
    thickness: loadSetting('hitMarker.thickness', thickness, d.thickness, storage),
    outline: loadSetting('hitMarker.outline', oneOf(HIT_MARKER_OUTLINES.map((o) => o.id)), d.outline, storage),
    color: loadSetting('hitMarker.color', oneOf(HIT_MARKER_COLORS.map((o) => o.id)), d.color, storage),
    customColor: loadSetting('hitMarker.customColor', hexColour, d.customColor, storage),
  };
}

/** The marker's colour as CSS: the picked swatch's, or the custom one. */
export function hitMarkerCss(s: HitMarkerSettings): string {
  if (s.color === 'custom') return hexColour(s.customColor) ?? DEFAULT_HIT_MARKER_SETTINGS.customColor;
  return HIT_MARKER_COLORS.find((c) => c.id === s.color)?.css ?? HIT_MARKER_COLORS[0]!.css;
}

/** The X's arm length and the gap it leaves round the crosshair at `scale` (whole pixels, so the arms stay sharp). */
export function hitMarkerSize(scale: number): { arm: number; gap: number } {
  return { arm: Math.max(1, Math.round(HIT_MARKER_SHAPE.arm * scale)), gap: Math.round(HIT_MARKER_SHAPE.gap * scale) };
}

/** A hit marker element (`hitfx-marker` in the stylesheet): the X's four arms; style it with styleHitMarker. */
export function hitMarkerElement(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'hitfx-marker';
  root.innerHTML = '<i></i><i></i><i></i><i></i>';
  return root;
}

/** Applies the player's hit marker look to a `.hitfx-marker` element (its four arms are drawn by the stylesheet). */
export function styleHitMarker(root: HTMLElement, s: HitMarkerSettings): void {
  const { arm, gap } = hitMarkerSize(s.scale);
  root.classList.toggle('no-outline', s.outline === 'off');
  root.style.setProperty('--hm-arm', `${arm}px`);
  root.style.setProperty('--hm-gap', `${gap}px`);
  root.style.setProperty('--hm-thick', `${s.thickness}px`);
  root.style.setProperty('--hm-colour', hitMarkerCss(s));
  root.style.setProperty('--hm-friendly', HIT_MARKER_FRIENDLY);
}
