/**
 * Which renderer draws the game (WebGPU overhaul W1; the owner's ruling of 2026-10-08: WebGPU is the default, with no
 * Dev setting in front of it). The Renderer row in Settings › Graphics picks Auto (the default), WebGPU or WebGL; Auto
 * and WebGPU draw with the node renderer (`WebGPURenderer` from `three/webgpu`) when the browser gives a WebGPU adapter,
 * and with Three's `WebGLRenderer`, the game as it has always been, otherwise. A pick applies from the next load.
 */

/** The Renderer row (Settings › Graphics): saved as `renderer`. */
export type RendererChoice = 'auto' | 'webgpu' | 'webgl';

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
  defaultChoice: 'auto' as RendererChoice,
  /** What Auto tries first (WebGL when the browser gives no WebGPU adapter). */
  auto: 'webgpu' as Exclude<RendererChoice, 'auto'>,
  /** The adapter probe gives up after this long (a browser that never answers is a browser without WebGPU). */
  probeTimeoutMs: 3000,
  /** A lost WebGPU device: a new one is asked for this many times, this far apart, before the game stays paused. */
  recoverTries: 3,
  recoverDelayMs: 1000,
  /** The GPU timer (debug overlay): timestamp queries read back once every this many frames, one read at a time. */
  timestampEvery: 10,
  text: {
    help: 'What draws the game. From the next load.',
    /** Under the row when WebGPU was picked but the browser gave no adapter. */
    fallback: 'No WebGPU here: drawn with WebGL.',
    /** Under the row when the pick differs from what this visit draws with. */
    pending: 'Changes from the next time the game loads.',
  },
} as const;

/** True when a visit with this pick tries the node renderer (asks for an adapter first). Pure. */
export function wantsWebGpu(choice: RendererChoice): boolean {
  return (choice === 'auto' ? RENDER_BACKEND.auto : choice) === 'webgpu';
}

/**
 * The back end a visit draws with. Pure. `adapter`: the probe found a WebGPU adapter (asked only when WebGPU is wanted);
 * `forceWebGL`: the node renderer on its WebGL2 back end without asking (the dev server's and e2e build's `?forceWebGL`).
 */
export function backendFor(wanted: boolean, adapter: boolean, forceWebGL: boolean): RenderBackend {
  if (!wanted) return 'webgl';
  if (forceWebGL) return 'webgpu-webgl2';
  return adapter ? 'webgpu' : 'webgl';
}

/**
 * The grey line under the Renderer row (Settings › Graphics). Pure. `startedWanting`: this visit loaded wanting the
 * node renderer (its pick was Auto or WebGPU); `backend`: what it draws with. A pick that changes what draws applies
 * from the next load; WebGPU picked and WebGL drawing means the browser gave no adapter (Auto says nothing then).
 */
export function rendererNote(picked: RendererChoice, startedWanting: boolean, backend: RenderBackend): string {
  if (!wantsWebGpu(picked)) return backend === 'webgl' ? '' : RENDER_BACKEND.text.pending;
  if (!startedWanting) return RENDER_BACKEND.text.pending;
  return backend === 'webgl' && picked === 'webgpu' ? RENDER_BACKEND.text.fallback : '';
}
