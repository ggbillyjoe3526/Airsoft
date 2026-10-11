import { DEFAULT_RENDERER, type RendererChoice } from './rendererPick';

/**
 * Which back end draws the game (WebGPU overhaul W1, W6; the owner's ruling of 2026-10-08: WebGPU is the default, with
 * no Dev setting in front of it). One renderer draws every preset, the node renderer (`WebGPURenderer` from
 * `three/webgpu`), on a WebGPU device or on its own WebGL2 back end. The Renderer row in Settings › Graphics picks Auto
 * (the default), WebGPU or WebGL: Auto and WebGPU draw on WebGPU when the browser gives an adapter (Auto: a hardware
 * one), and on WebGL2 otherwise; WebGL draws on WebGL2 without asking. A pick applies from the next load.
 *
 * This module is read only by chunks loaded on demand (render/rendererStart.ts with the adapter probe and the row,
 * render/webgpu/nodeBackend.ts): what the main chunk needs to read the saved pick is in config/rendererPick.ts.
 */

export type { RendererChoice } from './rendererPick';

/**
 * What draws: `webgpu` is the node renderer on a WebGPU device, `webgl` the same renderer on its WebGL2 back end (W6:
 * Three's old WebGLRenderer is gone). WebGL2 is what a browser without WebGPU gets, and what the container and CI draw
 * with (`?forceWebGL` asks for it on the dev server and the e2e build).
 */
export type RenderBackend = 'webgpu' | 'webgl';

export const RENDERER_CHOICES: readonly { id: RendererChoice; label: string; blurb: string }[] = [
  { id: 'auto', label: 'Auto', blurb: 'WebGPU where the browser has it, else WebGL.' },
  { id: 'webgpu', label: 'WebGPU', blurb: 'WebGPU whenever the browser offers it.' },
  { id: 'webgl', label: 'WebGL', blurb: 'WebGL 2 only, for a browser or driver whose WebGPU misbehaves.' },
];

export const RENDER_BACKEND = {
  /** A save with no Renderer pick (every save before W1) reads as this. */
  defaultChoice: DEFAULT_RENDERER,
  /** The adapter probe gives up after this long (a browser that never answers is a browser without WebGPU). */
  probeTimeoutMs: 3000,
  /** A lost WebGPU device: a new one is asked for this many times, this far apart, before WebGL2 takes over. */
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

/** True when a visit with this pick asks for a WebGPU adapter first: Auto and WebGPU. Pure. */
export function wantsWebGpu(choice: RendererChoice): boolean {
  return choice !== 'webgl';
}

/**
 * The grey line under the Renderer row (Settings › Graphics). Pure. `startedWanting`: this visit loaded wanting WebGPU
 * (its pick was Auto or WebGPU); `backend`: what it draws with; `lostToWebGL`: the WebGPU device was lost mid-visit and
 * WebGL2 took over (Renderer.lostToWebGL). A pick that changes what draws applies from the next load; WebGPU picked and
 * WebGL drawing from the start means the browser gave no adapter (Auto says nothing then).
 */
export function rendererNote(picked: RendererChoice, startedWanting: boolean, backend: RenderBackend, lostToWebGL = false): string {
  if (!wantsWebGpu(picked)) return backend === 'webgl' ? '' : RENDER_BACKEND.text.pending;
  if (!startedWanting) return RENDER_BACKEND.text.pending;
  if (backend !== 'webgl') return '';
  if (lostToWebGL) return RENDER_BACKEND.text.lost;
  return picked === 'webgpu' ? RENDER_BACKEND.text.fallback : '';
}
