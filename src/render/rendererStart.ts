import { type RenderBackend, type RendererChoice, wantsWebGpu } from '../config/renderBackend';
import { fillRendererRow, type RendererRowOptions } from '../ui/rendererRow';
import type { NodeBackend, NodeStart } from './webgpu/nodeBackend';
import { probeWebGpu, type WebGpuProbe } from './webgpuProbe';

/**
 * The renderer a visit starts with (WebGPU overhaul W1), in a small chunk of its own that Game.create loads alongside
 * the physics on every visit (bootRenderer, with the Renderer row's builder), so none of it weighs on the main chunk.
 * The Renderer row on WebGL draws with WebGL at once: no probe, no import. On Auto (the default) or WebGPU the adapter probe runs first; only when it finds an adapter (on Auto, a
 * hardware one: a software WebGPU is far slower than WebGL on the same machine) or `?forceWebGL` asks for the WebGL2 back
 * end is the node renderer's chunk loaded (render/webgpu/nodeBackend.ts with `three/webgpu`, never in the main chunk),
 * so a browser without WebGPU never downloads it. No adapter, or a device that can't be made, falls back to WebGL
 * quietly: the same renderer, and the same draws, as before W1.
 */

/** What a visit draws with (Game.create): the back end, the node renderer when it isn't WebGL, and the adapter's name. */
export interface StartingRenderer {
  backend: RenderBackend;
  node: NodeBackend | null;
  /** The WebGPU adapter's name ('' when none was asked for or given). */
  adapterName: string;
}

/** The node renderer's start, loaded on demand. */
async function loadNodeStart(): Promise<NodeStart> {
  return (await import('./webgpu/nodeBackend')).startNode;
}

export async function startingRenderer(
  choice: RendererChoice,
  forceWebGL: boolean,
  antialias: boolean,
  probe: () => Promise<WebGpuProbe> = probeWebGpu,
  load: () => Promise<NodeStart> = loadNodeStart,
): Promise<StartingRenderer> {
  const webgl: StartingRenderer = { backend: 'webgl', node: null, adapterName: '' };
  if (!wantsWebGpu(choice)) return webgl;
  const found = forceWebGL ? null : await probe();
  if (found) {
    webgl.adapterName = found.name;
    if (!found.available || (found.software && choice === 'auto')) return webgl;
  }
  try {
    const node = await (await load())({ antialias, forceWebGL });
    return { backend: node.kind, node, adapterName: webgl.adapterName };
  } catch {
    return webgl;
  }
}

/** What Game.create gets from this chunk: what the visit draws with, and the Renderer row's builder. */
export interface RendererBoot extends StartingRenderer {
  /** Builds the Renderer row into `row` (an empty `.menu-row`), its note read from what draws (`drawing`). */
  fillRow(row: HTMLElement, drawing: RendererRowOptions['drawing']): void;
}

/** The start for the visit's Renderer pick (startingRenderer), with the row's builder for that pick. */
export async function bootRenderer(initial: RendererChoice, forceWebGL: boolean, antialias: boolean): Promise<RendererBoot> {
  return { ...(await startingRenderer(initial, forceWebGL, antialias)), fillRow: (row, drawing) => fillRendererRow(row, { initial, drawing }) };
}
