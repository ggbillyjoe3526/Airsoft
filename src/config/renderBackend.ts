import { DEFAULT_RENDERER, type RendererChoice } from './rendererPick';

/**
 * Which renderer draws the game (WebGPU overhaul W1; the owner's ruling of 2026-10-08: WebGPU is the default, with no
 * Dev setting in front of it). The Renderer row in Settings › Graphics picks Auto (the default), WebGPU or WebGL; Auto
 * and WebGPU draw with the node renderer (`WebGPURenderer` from `three/webgpu`) when the browser gives a WebGPU adapter
 * (Auto: a hardware one), and with Three's `WebGLRenderer`, the game as it has always been, otherwise. A pick applies
 * from the next load.
 *
 * This module is read only by chunks loaded on demand (render/rendererStart.ts with the adapter probe and the row,
 * render/webgpu/nodeBackend.ts): what the main chunk needs to read the saved pick is in config/rendererPick.ts.
 */

export type { RendererChoice } from './rendererPick';

/**
 * What draws: `webgl` is Three's WebGLRenderer (the game as it has always been); `webgpu` is the node renderer on a
 * WebGPU device; `webgpu-webgl2` is the node renderer on its WebGL2 back end (only on the dev server and the e2e build,
 * with `?forceWebGL`: how the node path runs in a container without WebGPU).
 */
export type RenderBackend = 'webgl' | 'webgpu' | 'webgpu-webgl2';

export const RENDERER_CHOICES: readonly { id: RendererChoice; label: string; blurb: string }[] = [
  { id: 'auto', label: 'Auto', blurb: 'WebGPU where the browser has it, else WebGL.' },
  { id: 'webgpu', label: 'WebGPU', blurb: 'The new renderer, still being built.' },
  { id: 'webgl', label: 'WebGL', blurb: 'The renderer the game has always used.' },
];

export const RENDER_BACKEND = {
  /** A save with no Renderer pick (every save before W1) reads as this. */
  defaultChoice: DEFAULT_RENDERER,
  /** The adapter probe gives up after this long (a browser that never answers is a browser without WebGPU). */
  probeTimeoutMs: 3000,
  /** A lost WebGPU device: a new one is asked for this many times, this far apart, before WebGL takes over. */
  recoverTries: 3,
  recoverDelayMs: 1000,
  /** The GPU timer (debug overlay): timestamp queries read back once every this many frames, one read at a time. */
  timestampEvery: 10,
  text: {
    help: 'What draws the game. From the next load.',
    /** Under the row when WebGPU was picked but the browser gave no adapter. */
    fallback: 'No WebGPU here: drawn with WebGL.',
    /** Under the row when the WebGPU device was lost mid-visit and no new one could be made. */
    lost: 'The WebGPU device was lost: WebGL draws until the next load.',
    /** Under the row when the pick differs from what this visit draws with. */
    pending: 'Changes from the next time the game loads.',
  },
} as const;

/** True when a visit with this pick tries the node renderer (asks for an adapter first): Auto and WebGPU. Pure. */
export function wantsWebGpu(choice: RendererChoice): boolean {
  return choice !== 'webgl';
}

/**
 * The grey line under the Renderer row (Settings › Graphics). Pure. `startedWanting`: this visit loaded wanting the
 * node renderer (its pick was Auto or WebGPU); `backend`: what it draws with; `lostToWebGL`: the node renderer's device
 * was lost mid-visit and WebGL took over (Renderer.lostToWebGL). A pick that changes what draws applies from the next
 * load; WebGPU picked and WebGL drawing from the start means the browser gave no adapter (Auto says nothing then).
 */
export function rendererNote(picked: RendererChoice, startedWanting: boolean, backend: RenderBackend, lostToWebGL = false): string {
  if (!wantsWebGpu(picked)) return backend === 'webgl' ? '' : RENDER_BACKEND.text.pending;
  if (!startedWanting) return RENDER_BACKEND.text.pending;
  if (backend !== 'webgl') return '';
  if (lostToWebGL) return RENDER_BACKEND.text.lost;
  return picked === 'webgpu' ? RENDER_BACKEND.text.fallback : '';
}
