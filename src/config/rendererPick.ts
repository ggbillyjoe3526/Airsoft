/**
 * The Renderer row's picks as boot reads them (WebGPU overhaul W1; Settings › Graphics, saved as `renderer`). Kept apart
 * from config/renderBackend.ts, which holds the row's texts and the renderers' tuning: those are read only by chunks
 * loaded on demand (render/rendererStart.ts, render/webgpu/nodeBackend.ts), so they never weigh on the main chunk.
 */

export type RendererChoice = 'auto' | 'webgpu' | 'webgl';

export const RENDERER_IDS: readonly RendererChoice[] = ['auto', 'webgpu', 'webgl'];

/** A save with no Renderer pick (every save before W1) reads as this. */
export const DEFAULT_RENDERER: RendererChoice = 'auto';
