import {
  CROSSHAIR_COLORS,
  CROSSHAIR_DYNAMIC,
  CROSSHAIR_OUTLINES,
  CROSSHAIR_PREVIEW_SPREAD,
  CROSSHAIR_RANGES,
  CROSSHAIR_SHAPES,
  type CrosshairSettings,
} from '../config/matchInfo';
import { crosshairElement, hexColour, setCrosshairGap, styleCrosshair } from './crosshair';
import { saveSetting, saveSettingSoon } from '../settings/storage';
import { el, menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface CrosshairSettingsOptions {
  initial: CrosshairSettings;
  onChange: (crosshair: CrosshairSettings) => void;
}

/**
 * The Crosshair tab's rows (Settings → Crosshair, M19): a live preview (standing still, and opened up as when moving),
 * then shape, size, thickness, gap, colour (any colour too, audit UI-21), opacity, dynamic or static, and outline. Each
 * saves and applies as it changes.
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
      setCrosshairGap(crosshair, current.gap + (current.dynamic === 'on' ? spread : 0));
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
    menuRow('Colour', 'One that stands out on every map. Blue and orange are left out: they are the teams’.', colourPicker(current, change)),
    menuRow(
      'Opacity',
      'How solid the crosshair is drawn.',
      rangeControl('Crosshair opacity', CROSSHAIR_RANGES.opacity, current.opacity, (v) => `${Math.round(v * 100)}%`, 'crosshair.opacity', (v) => change('opacity', v)),
    ),
    menuRow('Spread', 'Whether the crosshair opens as you move and fire.', new OptionPicker('Spread', CROSSHAIR_DYNAMIC, current.dynamic, 'crosshair.dynamic', (v) => change('dynamic', v)).root),
    menuRow('Outline', 'A thin dark edge round the crosshair.', new OptionPicker('Outline', CROSSHAIR_OUTLINES, current.outline, 'crosshair.outline', (v) => change('outline', v)).root),
  ];
}

/**
 * The colour picker, each button with a swatch of its colour, and a colour box for Custom (audit UI-21): picking in the
 * box makes Custom the colour.
 */
function colourPicker(current: CrosshairSettings, change: <K extends keyof CrosshairSettings>(key: K, value: CrosshairSettings[K]) => void): HTMLDivElement {
  const picker = new OptionPicker('Colour', CROSSHAIR_COLORS, current.color, 'crosshair.color', (v) => change('color', v));
  picker.addSwatches(CROSSHAIR_COLORS.map((c) => (c.id === 'custom' ? { css: current.customColor } : c)));
  const customSwatch = [...picker.root.querySelectorAll<HTMLElement>('.crosshair-swatch')][CROSSHAIR_COLORS.findIndex((c) => c.id === 'custom')];
  const box = el('input', 'crosshair-custom');
  box.type = 'color';
  box.value = current.customColor;
  box.setAttribute('aria-label', 'Custom crosshair colour');
  box.addEventListener('input', () => {
    const hex = hexColour(box.value);
    if (!hex) return;
    if (customSwatch) customSwatch.style.background = hex;
    saveSettingSoon('crosshair.customColor', hex);
    change('customColor', hex);
    if (current.color !== 'custom') {
      picker.show('custom');
      saveSetting('crosshair.color', 'custom');
      change('color', 'custom');
    }
  });
  picker.root.querySelector('.picker-row')!.append(box);
  return picker.root;
}
