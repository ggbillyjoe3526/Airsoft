import {
  CROSSHAIR_COLORS,
  CROSSHAIR_DYNAMIC,
  CROSSHAIR_OUTLINES,
  CROSSHAIR_PREVIEW_SPREAD,
  CROSSHAIR_RANGES,
  CROSSHAIR_SHAPES,
  type CrosshairSettings,
} from '../config/matchInfo';
import { HIT_MARKER_CHOICES, HIT_MARKER_COLORS, HIT_MARKER_OUTLINES, HIT_MARKER_RANGES, type HitMarkerSettings } from '../config/hits';
import { crosshairElement, hexColour, setCrosshairGap, styleCrosshair } from './crosshair';
import { hitMarkerElement, styleHitMarker } from './hitMarkerLook';
import { saveSetting, saveSettingSoon } from '../settings/storage';
import { el, menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface CrosshairSettingsOptions {
  initial: CrosshairSettings;
  onChange: (crosshair: CrosshairSettings) => void;
  /** The Hit marker rows (M97; its look, the owner's 0.1 Dev 5 playtest, note 4): the X when your BB lands. None without it. */
  hitMarker?: { initial: HitMarkerSettings; onChange: (settings: HitMarkerSettings) => void };
}

/**
 * The Crosshair tab's rows (Settings → Crosshair, M19): a live preview (standing still, and opened up as when moving),
 * then shape, size, thickness, gap, colour (any colour too, audit UI-21), opacity, dynamic or static, and outline; then
 * the hit marker's rows. Each saves and applies as it changes.
 */
export function crosshairSettings(opts: CrosshairSettingsOptions): HTMLDivElement[] {
  const current: CrosshairSettings = { ...opts.initial };
  const preview = el('div', 'menu-row-control crosshair-preview');
  const samples = [
    { caption: 'Standing still', spread: 0 },
    { caption: 'Moving', spread: CROSSHAIR_PREVIEW_SPREAD },
  ].map(({ caption, spread }) => {
    const cell = el('div', 'crosshair-preview-cell');
    const crosshair = crosshairElement();
    cell.append(crosshair, el('span', 'crosshair-preview-caption', caption));
    preview.append(cell);
    return { crosshair, spread };
  });
  const marker = hitMarkerRows(opts.hitMarker);
  const refresh = (): void => {
    for (const { crosshair, spread } of samples) {
      styleCrosshair(crosshair, current);
      setCrosshairGap(crosshair, current.gap + (current.dynamic === 'on' ? spread : 0));
    }
    marker.showCrosshair(current);
  };
  const change = <K extends keyof CrosshairSettings>(key: K, value: CrosshairSettings[K]): void => {
    current[key] = value;
    refresh();
    opts.onChange({ ...current });
  };
  refresh();

  const px = (v: number): string => `${v} px`;
  return [
    menuRow('Preview', 'Your BBs land inside the arms (or the ring): it opens as you move.', preview),
    menuRow('Shape', 'Arms, a ring or a dot: how the crosshair is drawn.', new OptionPicker('Shape', CROSSHAIR_SHAPES, current.shape, 'crosshair.shape', (v) => change('shape', v)).root),
    menuRow('Size', 'Length of the arms (the cross shapes).', rangeControl('Crosshair size', CROSSHAIR_RANGES.size, current.size, px, 'crosshair.size', (v) => change('size', v))),
    menuRow(
      'Thickness',
      'Width of the lines and the dot.',
      rangeControl('Crosshair thickness', CROSSHAIR_RANGES.thickness, current.thickness, px, 'crosshair.thickness', (v) => change('thickness', v)),
    ),
    menuRow(
      'Gap',
      'Space in the middle when your aim is steady.',
      rangeControl('Crosshair gap', CROSSHAIR_RANGES.gap, current.gap, px, 'crosshair.gap', (v) => change('gap', v)),
    ),
    menuRow(
      'Colour',
      'One that stands out on every map. Blue and orange are left out: they are the teams’.',
      colourPicker('Colour', 'crosshair', CROSSHAIR_COLORS, current, (color, customColor) => (change('customColor', customColor), change('color', color))),
    ),
    menuRow(
      'Opacity',
      'How solid the crosshair is drawn.',
      rangeControl('Crosshair opacity', CROSSHAIR_RANGES.opacity, current.opacity, (v) => `${Math.round(v * 100)}%`, 'crosshair.opacity', (v) => change('opacity', v)),
    ),
    menuRow('Spread', 'Whether the crosshair opens as you move and fire.', new OptionPicker('Spread', CROSSHAIR_DYNAMIC, current.dynamic, 'crosshair.dynamic', (v) => change('dynamic', v)).root),
    menuRow('Outline', 'A thin dark edge round the crosshair.', new OptionPicker('Outline', CROSSHAIR_OUTLINES, current.outline, 'crosshair.outline', (v) => change('outline', v)).root),
    ...marker.rows,
  ];
}

/**
 * The hit marker's rows (M97; its look, the owner's 0.1 Dev 5 playtest, note 4), saved as `hitMarker` and
 * `hitMarker.<field>`: on or off (the tick you hear is the same either way), a preview of the X round your crosshair,
 * then its scale, thickness, outline and colour, as the crosshair's own. `showCrosshair` draws the crosshair as set.
 */
function hitMarkerRows(opt: CrosshairSettingsOptions['hitMarker']): { rows: HTMLDivElement[]; showCrosshair: (c: CrosshairSettings) => void } {
  if (!opt) return { rows: [], showCrosshair: () => {} };
  const current: HitMarkerSettings = { ...opt.initial };
  const preview = el('div', 'menu-row-control crosshair-preview');
  const cell = el('div', 'crosshair-preview-cell');
  const crosshair = crosshairElement();
  const marker = hitMarkerElement();
  marker.classList.add('preview');
  cell.append(crosshair, marker, el('span', 'crosshair-preview-caption', 'Your BB lands'));
  preview.append(cell);
  const change = <K extends keyof HitMarkerSettings>(key: K, value: HitMarkerSettings[K]): void => {
    current[key] = value;
    styleHitMarker(marker, current);
    opt.onChange({ ...current });
  };
  styleHitMarker(marker, current);
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const R = HIT_MARKER_RANGES;
  const rows = [
    menuRow(
      'Hit marker',
      'An X over the crosshair when your BB hits someone. The hit tick sounds either way.',
      new OptionPicker('Hit marker', HIT_MARKER_CHOICES, current.on ? 'on' : 'off', 'hitMarker', (v) => change('on', v === 'on')).root,
    ),
    menuRow('Marker preview', 'The X as it flashes when your BB lands (light blue on a teammate).', preview),
    menuRow('Marker scale', 'How big the X is: its arms and the space it leaves round the crosshair.', rangeControl('Hit marker scale', R.scale, current.scale, pct, 'hitMarker.scale', (v) => change('scale', v))),
    menuRow(
      'Marker thickness',
      'Width of the X’s arms.',
      rangeControl('Hit marker thickness', R.thickness, current.thickness, (v) => `${v} px`, 'hitMarker.thickness', (v) => change('thickness', v)),
    ),
    menuRow('Marker outline', 'A dark edge round the X.', new OptionPicker('Marker outline', HIT_MARKER_OUTLINES, current.outline, 'hitMarker.outline', (v) => change('outline', v)).root),
    menuRow(
      'Marker colour',
      'Red unless you pick another. Blue and orange are left out: they are the teams’.',
      colourPicker('Marker colour', 'hitMarker', HIT_MARKER_COLORS, current, (color, customColor) => (change('customColor', customColor), change('color', color))),
    ),
  ];
  return { rows, showCrosshair: (c) => styleCrosshair(crosshair, c) };
}

/**
 * A colour picker (the crosshair's or the hit marker's, saved as `<field>.color` and `<field>.customColor`), each button
 * with a swatch of its colour, and a colour box for Custom (audit UI-21): picking in the box makes Custom the colour.
 * `change` gets the colour and the custom colour after every pick.
 */
function colourPicker<C extends string>(
  name: string,
  field: 'crosshair' | 'hitMarker',
  colours: readonly { id: C; label: string; blurb: string; css: string }[],
  initial: { color: C; customColor: string },
  change: (color: C, customColor: string) => void,
): HTMLDivElement {
  let { color, customColor } = initial;
  const picker = new OptionPicker(name, colours, color, `${field}.color`, (v) => change((color = v), customColor));
  picker.addSwatches(colours.map((c) => (c.id === 'custom' ? { css: customColor } : c)));
  const customSwatch = [...picker.root.querySelectorAll<HTMLElement>('.crosshair-swatch')][colours.findIndex((c) => c.id === 'custom')];
  const box = el('input', 'crosshair-custom');
  box.type = 'color';
  box.value = customColor;
  box.setAttribute('aria-label', field === 'crosshair' ? 'Custom crosshair colour' : 'Custom hit marker colour');
  box.addEventListener('input', () => {
    const hex = hexColour(box.value);
    if (!hex) return;
    if (customSwatch) customSwatch.style.background = hex;
    customColor = hex;
    saveSettingSoon(`${field}.customColor`, hex);
    if (color !== 'custom') {
      color = 'custom' as C;
      picker.show(color);
      saveSetting(`${field}.color`, color);
    }
    change(color, customColor);
  });
  picker.root.querySelector('.picker-row')!.append(box);
  return picker.root;
}
