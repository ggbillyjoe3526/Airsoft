import {
  CROSSHAIR_COLORS,
  CROSSHAIR_OUTLINES,
  CROSSHAIR_RANGES,
  CROSSHAIR_SHAPES,
  type CrosshairSettings,
  DEFAULT_CROSSHAIR,
} from '../config/matchInfo';
import { browserStorage, loadSetting, numberIn, oneOf } from '../settings/storage';

/**
 * The crosshair (M19): four arms, a centre dot and a ring, of which the picked shape shows some. Its look comes from
 * Settings → Crosshair; the gap between the centre and the arms (or the ring's radius) opens with the real spread
 * (see Hud). The same element is the live preview on the Settings screen.
 */

/** The saved crosshair, each part falling back to the default on its own. */
export function loadCrosshair(storage = browserStorage()): CrosshairSettings {
  const d = DEFAULT_CROSSHAIR;
  const whole = (r: { min: number; max: number }) => (raw: unknown) => {
    const v = numberIn(r.min, r.max)(raw);
    return v === undefined ? undefined : Math.round(v);
  };
  return {
    shape: loadSetting('crosshair.shape', oneOf(CROSSHAIR_SHAPES.map((o) => o.id)), d.shape, storage),
    size: loadSetting('crosshair.size', whole(CROSSHAIR_RANGES.size), d.size, storage),
    thickness: loadSetting('crosshair.thickness', whole(CROSSHAIR_RANGES.thickness), d.thickness, storage),
    gap: loadSetting('crosshair.gap', whole(CROSSHAIR_RANGES.gap), d.gap, storage),
    color: loadSetting('crosshair.color', oneOf(CROSSHAIR_COLORS.map((o) => o.id)), d.color, storage),
    outline: loadSetting('crosshair.outline', oneOf(CROSSHAIR_OUTLINES.map((o) => o.id)), d.outline, storage),
  };
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
  root.style.setProperty('--xh', CROSSHAIR_COLORS.find((c) => c.id === s.color)?.css ?? CROSSHAIR_COLORS[0]!.css);
}

/** The gap between the centre and the arms (the ring's radius), in pixels. */
export function setCrosshairGap(root: HTMLElement, px: number): void {
  root.style.setProperty('--gap', `${px}px`);
}
