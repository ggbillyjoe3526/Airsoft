import {
  CROSSHAIR_COLORS,
  CROSSHAIR_OUTLINES,
  CROSSHAIR_PREVIEW_SPREAD,
  CROSSHAIR_RANGES,
  CROSSHAIR_SHAPES,
  type CrosshairSettings,
} from '../config/matchInfo';
import { crosshairElement, setCrosshairGap, styleCrosshair } from './crosshair';
import { el, menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface CrosshairSettingsOptions {
  initial: CrosshairSettings;
  onChange: (crosshair: CrosshairSettings) => void;
}

/**
 * The Crosshair tab's rows (Settings → Crosshair, M19): a live preview (standing still, and opened up as when moving),
 * then shape, size, thickness, gap, colour and outline. Each saves and applies as it changes.
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
  const refresh = (): void => {
    for (const { crosshair, spread } of samples) {
      styleCrosshair(crosshair, current);
      setCrosshairGap(crosshair, current.gap + spread);
    }
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
    menuRow('Shape', '', new OptionPicker('Shape', CROSSHAIR_SHAPES, current.shape, 'crosshair.shape', (v) => change('shape', v)).root),
    menuRow('Size', 'Length of the arms.', rangeControl('Crosshair size', CROSSHAIR_RANGES.size, current.size, px, 'crosshair.size', (v) => change('size', v))),
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
    menuRow('Colour', '', colourPicker(current, (v) => change('color', v))),
    menuRow('Outline', '', new OptionPicker('Outline', CROSSHAIR_OUTLINES, current.outline, 'crosshair.outline', (v) => change('outline', v)).root),
  ];
}

/** The colour picker, each button with a swatch of its colour. */
function colourPicker(current: CrosshairSettings, onChange: (color: CrosshairSettings['color']) => void): HTMLDivElement {
  const picker = new OptionPicker('Colour', CROSSHAIR_COLORS, current.color, 'crosshair.color', onChange);
  picker.root.querySelectorAll('.picker-button').forEach((button, i) => {
    const swatch = el('span', 'crosshair-swatch');
    swatch.style.background = CROSSHAIR_COLORS[i]!.css;
    button.prepend(swatch);
  });
  return picker.root;
}
