import { type RenderBackend, type RendererChoice, wantsWebGpu } from '../config/renderBackend';
import { fillRendererRow, type RendererRowOptions } from '../ui/rendererRow';
import type { NodeBackend, NodeStart } from './webgpu/nodeBackend';
import { probeWebGpu, type WebGpuProbe } from './webgpuProbe';

/**
 * The renderer a visit starts with (WebGPU overhaul W1, W6), in a small chunk of its own that Game.create loads alongside
 * the physics on every visit (bootRenderer, with the Renderer row's builder), so none of it weighs on the main chunk.
 * One renderer draws every visit: the node renderer (render/webgpu/nodeBackend.ts with `three/webgpu`, a chunk of its
 * own), on WebGPU or on its WebGL2 back end. On Auto (the default) or WebGPU the adapter probe runs first, and WebGPU
 * draws when it finds an adapter (on Auto, a hardware one: a software WebGPU is far slower than WebGL2 on the same
 * machine). The WebGL pick, `?forceWebGL`, no adapter, or a device that can't be made draw on WebGL2, quietly. Only a
 * browser that gives neither throws: the game can't draw there, and the start-up pane says so.
 */

/** What a visit draws with (Game.create): the back end, the node renderer, and the adapter's name. */
export interface StartingRenderer {
  backend: RenderBackend;
  node: NodeBackend;
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
  // The chunk downloads while the probe asks for an adapter.
  const loading = load();
  const found = wantsWebGpu(choice) && !forceWebGL ? await probe() : null;
  const adapterName = found?.name ?? '';
  const start = await loading;
  const onWebGpu = found !== null && found.available && !(found.software && choice === 'auto');
  if (onWebGpu) {
    // A device that can't be made (lost at boot, refused) falls through to WebGL2, as no adapter does.
    const node = await start({ antialias, forceWebGL: false }).catch(() => null);
    if (node) return { backend: node.kind, node, adapterName };
  }
  const node = await start({ antialias, forceWebGL: true }).catch((error: unknown) => {
    throw new Error(`Neither WebGPU nor WebGL 2 could be started (${error instanceof Error ? error.message : String(error)})`);
  });
  return { backend: node.kind, node, adapterName };
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
