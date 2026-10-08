import { RENDER_BACKEND, RENDERER_CHOICES, type RenderBackend, rendererNote, wantsWebGpu } from '../config/renderBackend';
import type { RendererChoice } from '../config/rendererPick';
import { el, menuRow } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

/**
 * The Renderer row (Settings › Graphics, WebGPU overhaul W1): Auto, WebGPU or WebGL, saved as `renderer` and applied on
 * the next load, with a grey line under it when the pick can't be honoured or differs from what draws. In the chunk
 * Game.create loads at boot (render/rendererStart.ts › bootRenderer), so its texts and rules (config/renderBackend.ts)
 * stay out of the main chunk; ui/graphicsSettings.ts only holds the empty row it fills.
 */

export interface RendererRowOptions {
  /** The pick this visit loaded with. */
  initial: RendererChoice;
  /** What draws now (the game's Renderer): its back end, and whether WebGL took over from a lost device mid-visit. */
  drawing: { readonly backend: RenderBackend; readonly lostToWebGL: boolean };
}

/** Fills `row` (an empty `.menu-row` already in the Graphics group) with the Renderer row. */
export function fillRendererRow(row: HTMLElement, opts: RendererRowOptions): void {
  const startedWanting = wantsWebGpu(opts.initial);
  const note = el('p', 'graphics-note');
  let picked = opts.initial;
  const showNote = (): void => {
    const text = rendererNote(picked, startedWanting, opts.drawing.backend, opts.drawing.lostToWebGL);
    note.textContent = text;
    note.hidden = text === '';
  };
  const picker = new OptionPicker('Renderer', RENDERER_CHOICES, opts.initial, 'renderer', (id) => {
    picked = id;
    showNote();
  });
  picker.root.append(note);
  row.append(...Array.from(menuRow('Renderer', RENDER_BACKEND.text.help, picker.root).children));
  showNote();
  // What draws can change after the row is built (a lost device WebGL took over from): the line is read again each
  // time the row comes into view.
  if (typeof IntersectionObserver === 'function') new IntersectionObserver((seen) => seen.some((e) => e.isIntersecting) && showNote()).observe(row);
}
