import { FRAME_RATE_CAPS, type FrameRateCap, type QualitySettings } from './render';

/**
 * Settings → Graphics (final alpha audit section 4, UI-06): the Custom rows, one per QualitySettings field, and the two
 * rows that are not part of a preset (the frame-rate cap and the FPS readout). A new quality field is one more entry
 * here (and a value on every preset); the tab and the settings store (`graphics.<field>`) follow from this table.
 */

/** A row with a few fixed values: each saved by its `id`. */
export interface ChoiceRow<K extends keyof QualitySettings = keyof QualitySettings> {
  kind: 'choice';
  field: K;
  label: string;
  help: string;
  /** What the row costs, shown after its help so a player can trade knowingly. */
  cost: string;
  options: readonly { id: string; label: string; value: QualitySettings[K] }[];
}

/** A slider: the setting is the slider's value over `perUnit` (render scale: percent on the slider, a share in the settings). */
export interface RangeRow<K extends keyof QualitySettings = keyof QualitySettings> {
  kind: 'range';
  field: K;
  label: string;
  help: string;
  cost: string;
  min: number;
  max: number;
  step: number;
  perUnit: number;
  /** The slider's value as shown beside it. */
  format: (sliderValue: number) => string;
}

export type GraphicsRow = ChoiceRow | RangeRow;

const onOff = [
  { id: 'off', label: 'Off', value: false },
  { id: 'on', label: 'On', value: true },
] as const;

const choice = <K extends keyof QualitySettings>(row: Omit<ChoiceRow<K>, 'kind'>): ChoiceRow => ({ kind: 'choice', ...row }) as unknown as ChoiceRow;
const range = <K extends keyof QualitySettings>(row: Omit<RangeRow<K>, 'kind'>): RangeRow => ({ kind: 'range', ...row }) as unknown as RangeRow;

/** The Custom rows, in the order the tab shows them (cheapest levers first). */
export const GRAPHICS_ROWS: readonly GraphicsRow[] = [
  range({
    field: 'renderScale',
    label: 'Render scale',
    help: 'Resolution as a share of the screen’s, scaled up to fill it. Lower it first if the game stutters.',
    cost: 'GPU: the largest',
    min: 50,
    max: 100,
    step: 5,
    perUnit: 100,
    format: (v) => `${Math.round(v)}%`,
  }),
  choice({
    field: 'maxPixelRatio',
    label: 'High-DPI sharpness',
    help: 'How much of a high-DPI screen’s resolution to use. Changes nothing on a screen at 100 % scaling.',
    cost: 'GPU: large on high-DPI screens',
    options: [
      { id: '1', label: '1×', value: 1 },
      { id: '1.25', label: '1.25×', value: 1.25 },
      { id: '1.5', label: '1.5×', value: 1.5 },
      { id: '2', label: '2×', value: 2 },
    ],
  }),
  choice({ field: 'antialias', label: 'Edge smoothing', help: 'Antialiasing (4× multisampling): no shimmer on rails, tape and BB streaks.', cost: 'GPU: large', options: onOff }),
  choice({ field: 'shadows', label: 'Shadows', help: 'The sun’s shadows from walls, containers, props and players.', cost: 'GPU: high', options: onOff }),
  choice({
    field: 'shadowMapSize',
    label: 'Shadow detail',
    help: 'The shadow map’s size: sharper shadow edges on thin props.',
    cost: 'GPU: high; memory 4 / 16 / 64 MB',
    options: [
      { id: '1024', label: 'Low', value: 1024 },
      { id: '2048', label: 'High', value: 2048 },
      { id: '4096', label: 'Ultra', value: 4096 },
    ],
  }),
  range({ field: 'shadowRadius', label: 'Shadow softness', help: 'How soft shadow edges are, in shadow-map texels.', cost: 'Free', min: 1, max: 4, step: 0.5, perUnit: 1, format: (v) => v.toFixed(1) }),
  choice({
    field: 'shadowFollowsView',
    label: 'Shadow range',
    help: 'Near you: sharper shadows for about 25 m ahead, none beyond. Whole field: every shadow, softer edges.',
    cost: 'Free',
    options: [
      { id: 'field', label: 'Whole field', value: false },
      { id: 'near', label: 'Near you', value: true },
    ],
  }),
  choice({ field: 'figureShadows', label: 'Players in shadow', help: 'Players and the flag are shaded by walls and containers, not lit as if in full sun.', cost: 'GPU: small', options: onOff }),
  choice({ field: 'surfaceRelief', label: 'Surface relief', help: 'Slab joints, mortar, planks and container ribs catch the sun.', cost: 'GPU: medium', options: onOff }),
  choice({
    field: 'textureSize',
    label: 'Texture detail',
    help: 'The size of the floor, wall and prop textures: sharper close up.',
    cost: 'Memory: 3 / 11 / 45 MB',
    options: [
      { id: '256', label: 'Low', value: 256 },
      { id: '512', label: 'Medium', value: 512 },
      { id: '1024', label: 'High', value: 1024 },
    ],
  }),
  choice({
    field: 'anisotropy',
    label: 'Texture filtering',
    help: 'Anisotropic filtering keeps the floor sharp into the distance.',
    cost: 'GPU: small, more on integrated graphics',
    options: [
      { id: '1', label: 'Off', value: 1 },
      { id: '2', label: '2×', value: 2 },
      { id: '4', label: '4×', value: 4 },
      { id: '8', label: '8×', value: 8 },
      { id: '16', label: '16×', value: 16 },
    ],
  }),
  range({ field: 'dustMotes', label: 'Dust in the air', help: 'Specks of dust drifting in the sunlight round you.', cost: 'Free', min: 0, max: 300, step: 30, perUnit: 1, format: (v) => String(Math.round(v)) }),
  choice({ field: 'replicaSheen', label: 'Replica sheen', help: 'Soft reflections in the held replica’s plastic.', cost: 'GPU: small; memory 6 MB', options: onOff }),
];

/** The row for a field (every QualitySettings field has one: config/graphics.test.ts). */
export function graphicsRow(field: keyof QualitySettings): GraphicsRow | undefined {
  return GRAPHICS_ROWS.find((r) => r.field === field);
}

/** The settings store's key for a Custom row (settings/storage.ts `graphics.${string}`). */
export function graphicsKey(field: keyof QualitySettings): `graphics.${string}` {
  return `graphics.${field}`;
}

/** What a row saves for a value: a choice row's option id, a slider's position. Undefined for a value the row can't show. */
export function storedValue(row: GraphicsRow, value: QualitySettings[keyof QualitySettings]): string | number | undefined {
  if (row.kind === 'choice') return row.options.find((o) => o.value === value)?.id;
  return typeof value === 'number' ? Math.round((value * row.perUnit) / row.step) * row.step : undefined;
}

/** A saved row back to its value, or undefined for anything the row doesn't offer (a stale or hand-edited save). */
export function parseStored(row: GraphicsRow, raw: unknown): QualitySettings[keyof QualitySettings] | undefined {
  if (row.kind === 'choice') return row.options.find((o) => o.id === raw)?.value;
  const v = typeof raw === 'number' ? raw : Number.NaN;
  if (!Number.isFinite(v) || v < row.min || v > row.max || Math.abs((v - row.min) / row.step - Math.round((v - row.min) / row.step)) > 1e-6) return undefined;
  return v / row.perUnit;
}

/** The frame-rate cap row (not part of a preset). */
export const FRAME_RATE_CAP_CHOICES: readonly { id: string; label: string; blurb: string; value: FrameRateCap }[] = FRAME_RATE_CAPS.map((cap) => ({
  id: cap === 0 ? 'off' : String(cap),
  label: cap === 0 ? 'Off' : String(cap),
  blurb:
    cap === 0
      ? 'As many frames as the screen shows.'
      : `At most ${cap} frames a second: a laptop runs cooler and quieter. The game still plays at 60 ticks a second.`,
  value: cap,
}));

/** The FPS readout (a small counter in the top-left corner while playing). */
export const SHOW_FPS_CHOICES = [
  { id: 'off', label: 'Off', blurb: '' },
  { id: 'on', label: 'On', blurb: 'Frames a second and the frame time, in the top-left corner while you play.' },
] as const;

/** The Graphics tab's words. */
export const GRAPHICS_TEXT = {
  qualityHelp: 'Sets every row below. Lower it if the game stutters.',
  customHeading: 'Custom settings',
  customIntro: 'Each row applies at once. The cost after each one says what it takes from your graphics card.',
  frameRateHelp: 'A cap on frames a second. Off follows the screen.',
  showFpsHelp: 'A frame counter while you play.',
  /** Under Edge smoothing when the browser gave no multisampling (Firefox on Linux, some drivers; REN-21). */
  antialiasRefused: 'Not available in this browser: the picture is drawn without edge smoothing.',
  /** Under Edge smoothing when a new graphics context could not be made: the change waits for the next load (REN-04). */
  antialiasPending: 'Changes from the next time the game loads.',
  /** Under Texture filtering when the card filters at most `max`×. */
  anisotropyCapped: (max: number) => `This graphics card filters at most ${max}×.`,
  /** The HUD line when the game lowered its own pick (REN-03). */
  steppedDown: (preset: string) => `Graphics set to ${preset} to keep the game smooth · Settings → Graphics`,
} as const;
