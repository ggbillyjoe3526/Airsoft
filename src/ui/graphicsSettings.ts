import {
  FRAME_RATE_CAP_CHOICES,
  GRAPHICS_ROWS,
  GRAPHICS_TEXT,
  type GraphicsRow,
  graphicsKey,
  rowEnabled,
  SHOW_FPS_CHOICES,
  storedValue,
  TONE_MAPPING_CHOICES,
} from '../config/graphics';
import {
  type FrameRateCap,
  QUALITY,
  QUALITY_CHOICES,
  type QualityChoice,
  qualityChoiceOf,
  type QualitySettings,
  resolveQuality,
  type ToneMappingId,
} from '../config/render';
import { saveSetting } from '../settings/storage';
import { el, menuRow, rangeControl } from './menus/menuParts';
import { loadCustomQuality } from './menus/savedChoices';
import { OptionPicker } from './optionPicker';

/** What the renderer really gives, for the rows a browser can't always honour (REN-21). */
export interface GraphicsStatus {
  /** The screen is multisampled. */
  antialiased: boolean;
  /** Antialiasing was changed but a new context couldn't be made: it applies on the next load (REN-04). */
  antialiasPending: boolean;
  /** The most anisotropic filtering the card offers. */
  maxAnisotropy: number;
}

export interface GraphicsSettingsOptions {
  quality: {
    initial: QualityChoice;
    /** The settings in force at start (the choice resolved, config/render.ts startingQuality). */
    settings: QualitySettings;
    /** Called with the choice and the settings to apply; the store is already written. */
    onChange: (choice: QualityChoice, settings: QualitySettings) => void;
    status: () => GraphicsStatus;
  };
  frameRateCap: { initial: FrameRateCap; onChange: (cap: FrameRateCap) => void };
  showFps: { initial: boolean; onChange: (on: boolean) => void };
  /** Tone mapping (F2): not part of a preset; the picker saves it. */
  toneMapping: { initial: ToneMappingId; onChange: (id: ToneMappingId) => void };
}

/** One Custom row's control, and how to show a value on it without saving. */
interface RowControl {
  row: GraphicsRow;
  show: (value: QualitySettings[keyof QualitySettings]) => void;
  /** A grey line under the row for what the browser can't honour (null when the row has none). */
  note: HTMLParagraphElement | null;
  /** The row and its inputs, greyed out and disabled while the setting it needs is off (config/graphics.ts `needs`). */
  element: HTMLDivElement;
  inputs: readonly (HTMLButtonElement | HTMLInputElement)[];
}

/**
 * Settings → Graphics's quality rows (final alpha audit section 4, UI-06): the Quality picker (Low, Medium, High,
 * Custom), the frame-rate cap and FPS readout, and the Custom block with one row per quality setting, always showing
 * the values in force (folded under a preset, M68). Picking a preset shows its values on every row; changing a row
 * turns the picker to Custom (or to the preset the values now equal). The Custom rows' values are saved as
 * `graphics.<field>` when the choice becomes Custom, and row by row while it stays Custom; a preset's are never saved
 * (the preset says them).
 */
export class GraphicsSettings {
  readonly qualityRow: HTMLDivElement;
  readonly frameRateRow: HTMLDivElement;
  readonly showFpsRow: HTMLDivElement;
  readonly toneMappingRow: HTMLDivElement;
  /**
   * The "Custom settings" disclosure (M68, audit UI-09): its heading is the summary, then the rows. Open when the choice
   * is Custom; under a preset it starts folded, and the player's own opening or folding stays for the session (the page
   * is built once; nothing of it is saved).
   */
  readonly customBlock: HTMLDetailsElement;
  private readonly picker: OptionPicker<QualityChoice>;
  private readonly controls: RowControl[] = [];
  private choice: QualityChoice;
  private settings: QualitySettings;

  constructor(private readonly opts: GraphicsSettingsOptions) {
    this.choice = opts.quality.initial;
    this.settings = opts.quality.settings;
    this.picker = new OptionPicker('Quality', QUALITY_CHOICES, this.choice, 'quality', (c) => this.pick(c));
    this.qualityRow = menuRow('Quality', GRAPHICS_TEXT.qualityHelp, this.picker.root);

    const cap = FRAME_RATE_CAP_CHOICES.find((c) => c.value === opts.frameRateCap.initial) ?? FRAME_RATE_CAP_CHOICES[0]!;
    const capPicker = new OptionPicker('Frame-rate limit', FRAME_RATE_CAP_CHOICES, cap.id, 'frameRateCap', (id) =>
      opts.frameRateCap.onChange(FRAME_RATE_CAP_CHOICES.find((c) => c.id === id)!.value),
    );
    this.frameRateRow = menuRow('Frame-rate limit', GRAPHICS_TEXT.frameRateHelp, capPicker.root);
    const fps = new OptionPicker('Show FPS', SHOW_FPS_CHOICES, opts.showFps.initial ? 'on' : 'off', 'showFps', (id) => opts.showFps.onChange(id === 'on'));
    this.showFpsRow = menuRow('Show FPS', GRAPHICS_TEXT.showFpsHelp, fps.root);
    const tone = new OptionPicker('Tone mapping', TONE_MAPPING_CHOICES, opts.toneMapping.initial, 'toneMapping', (id) => opts.toneMapping.onChange(id));
    this.toneMappingRow = menuRow('Tone mapping', GRAPHICS_TEXT.toneMappingHelp, tone.root);

    this.customBlock = el('details', 'graphics-custom');
    this.customBlock.open = this.choice === 'custom';
    this.customBlock.append(el('summary', 'menu-kicker graphics-subhead', GRAPHICS_TEXT.customHeading), el('p', 'menu-readout', GRAPHICS_TEXT.customIntro));
    for (const row of GRAPHICS_ROWS) this.customBlock.append(this.buildRow(row));
    this.refreshNotes();
  }

  /** The tab's rows below Field of view, in order. */
  rows(fullscreen: HTMLElement): HTMLElement[] {
    return [this.qualityRow, fullscreen, this.frameRateRow, this.showFpsRow, this.toneMappingRow, this.customBlock];
  }

  /** Shows a choice and its settings without saving them (the game's own step-down, REN-03). */
  show(choice: QualityChoice, settings: QualitySettings): void {
    this.choice = choice;
    this.settings = settings;
    this.picker.show(choice);
    this.unfoldForCustom();
    this.showRows();
  }

  /** A pick on the Quality picker (already saved as `quality`). */
  private pick(choice: QualityChoice): void {
    if (choice === 'custom') {
      // The saved mix; with none yet, the values in force become the first one.
      const saved = loadCustomQuality();
      const settings = Object.keys(saved).length > 0 ? resolveQuality('custom', saved) : { ...this.settings };
      this.saveCustom(settings);
      this.settings = settings;
    } else {
      this.settings = QUALITY[choice];
    }
    this.choice = choice;
    this.unfoldForCustom();
    this.showRows();
    this.apply();
  }

  /** Picking Custom opens its block; any other pick leaves it as the player has it. */
  private unfoldForCustom(): void {
    if (this.choice === 'custom') this.customBlock.open = true;
  }

  /** A Custom row changed (its own control saved it). */
  private changeRow<K extends keyof QualitySettings>(field: K, value: QualitySettings[K]): void {
    const settings = { ...this.settings, [field]: value };
    const choice = qualityChoiceOf(settings);
    if (choice === 'custom' && this.choice !== 'custom') this.saveCustom(settings);
    if (choice !== this.choice) {
      saveSetting('quality', choice);
      this.picker.show(choice);
    }
    this.choice = choice;
    this.settings = settings;
    this.apply();
  }

  private apply(): void {
    this.opts.quality.onChange(this.choice, this.settings);
    this.refreshNotes();
  }

  /** Every Custom row's value, saved: the mix the Custom choice reads back (savedChoices.ts loadCustomQuality). */
  private saveCustom(settings: QualitySettings): void {
    for (const row of GRAPHICS_ROWS) {
      const v = storedValue(row, settings[row.field]);
      if (v !== undefined) saveSetting(graphicsKey(row.field), v);
    }
  }

  private showRows(): void {
    for (const c of this.controls) c.show(this.settings[c.row.field]);
    this.refreshNotes();
  }

  private buildRow(row: GraphicsRow): HTMLDivElement {
    const key = graphicsKey(row.field);
    const initial = this.settings[row.field];
    let control: HTMLElement;
    let show: RowControl['show'];
    if (row.kind === 'choice') {
      const options = row.options.map((o) => ({ id: o.id, label: o.label, blurb: '' }));
      const picker = new OptionPicker(row.label, options, storedValue(row, initial) as string, key, (id) =>
        this.changeRow(row.field, row.options.find((o) => o.id === id)!.value),
      );
      control = picker.root;
      show = (v) => {
        const id = storedValue(row, v);
        if (typeof id === 'string') picker.show(id);
      };
    } else {
      const position = storedValue(row, initial) as number;
      control = rangeControl(row.label, row, position, row.format, key, (v) => this.changeRow(row.field, v / row.perUnit));
      const slider = control.querySelector('input')!;
      const output = control.querySelector('output')!;
      show = (v) => {
        const p = storedValue(row, v) as number;
        slider.value = String(p);
        output.textContent = row.format(p);
        slider.setAttribute('aria-valuetext', row.format(p));
      };
    }
    const r = menuRow(row.label, row.help, control);
    r.firstElementChild!.append(el('span', 'menu-row-cost', row.cost));
    const note = row.field === 'antialias' || row.field === 'anisotropy' ? el('p', 'graphics-note') : null;
    if (note) {
      note.hidden = true;
      control.append(note);
    }
    this.controls.push({ row, show, note, element: r, inputs: [...control.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')] });
    return r;
  }

  /**
   * The grey lines under the rows a browser can't always honour, from what the renderer reports (REN-21), and the rows
   * greyed out while the setting they need is off (the shadow rows while Shadows is Off).
   */
  private refreshNotes(): void {
    const status = this.opts.quality.status();
    for (const { row, note, element, inputs } of this.controls) {
      const enabled = rowEnabled(row, this.settings);
      element.classList.toggle('menu-row-off', !enabled);
      for (const input of inputs) input.disabled = !enabled;
      if (!note) continue;
      let text = '';
      if (row.field === 'antialias') {
        if (status.antialiasPending) text = GRAPHICS_TEXT.antialiasPending;
        else if (this.settings.antialias && !status.antialiased) text = GRAPHICS_TEXT.antialiasRefused;
      } else if (row.field === 'anisotropy' && this.settings.anisotropy > status.maxAnisotropy) {
        text = GRAPHICS_TEXT.anisotropyCapped(status.maxAnisotropy);
      }
      note.textContent = text;
      note.hidden = text === '';
    }
  }
}
