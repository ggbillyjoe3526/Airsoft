import { backendFor, type RenderBackend, type RendererChoice, wantsWebGpu } from '../config/renderBackend';
import type { NodeBackend, NodeStart } from './webgpu/nodeBackend';
import { probeWebGpu, type WebGpuProbe } from './webgpuProbe';

/**
 * The renderer a visit starts with (WebGPU overhaul W1). The Renderer row on WebGL draws with WebGL at once: no probe,
 * no import. On Auto (the default) or WebGPU the adapter probe runs first; only when it finds an adapter (or
 * `?forceWebGL` asks for the WebGL2 back end) is the node renderer's chunk loaded (render/webgpu/nodeBackend.ts with
 * `three/webgpu`, never in the main chunk), so a browser without WebGPU never downloads it. No adapter, or a device
 * that can't be made, falls back to WebGL quietly: the same renderer, and the same draws, as before W1.
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
  if (!wantsWebGpu(choice)) return { backend: 'webgl', node: null, adapterName: '' };
  const found = forceWebGL ? null : await probe();
  const webgl: StartingRenderer = { backend: 'webgl', node: null, adapterName: found?.name ?? '' };
  if (backendFor(true, found?.available === true, forceWebGL) === 'webgl') return webgl;
  try {
    const node = await (await load())({ antialias, forceWebGL });
    return { backend: node.kind, node, adapterName: webgl.adapterName };
  } catch {
    return webgl;
  }
}
