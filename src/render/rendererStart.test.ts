import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RENDERER } from '../config/rendererPick';
import { RENDER_BACKEND } from '../config/renderBackend';
import { FakeElement, fakeDocument, findAll } from '../ui/testSupport';
import { bootRenderer, startingRenderer } from './rendererStart';
import type { NodeBackend, NodeStart } from './webgpu/nodeBackend';
import { noWebGpu, probeWebGpu, type WebGpuProbe } from './webgpuProbe';

// WebGPU overhaul W1 (the owner's ruling of 2026-10-08): Auto, the default, draws with WebGPU where the browser gives an
// adapter and with WebGL, exactly as before, everywhere else; the node renderer's chunk loads only after an adapter is found.
describe('the renderer a visit starts with (W1)', () => {
  const node = { kind: 'webgpu' } as NodeBackend;
  const webgl = { backend: 'webgl', node: null, adapterName: '' };
  const found = (available: boolean) => vi.fn((): Promise<WebGpuProbe> => Promise.resolve({ ...noWebGpu(), available, name: available ? 'test gpu' : '' }));
  const loader = (start: NodeStart = vi.fn(() => Promise.resolve(node))) => vi.fn(() => Promise.resolve(start));

  it('on Auto (every save’s default) with no adapter is WebGL, the renderer every player drew with before: no chunk loaded', async () => {
    expect(DEFAULT_RENDERER).toBe('auto');
    const probe = found(false);
    const load = loader();
    expect(await startingRenderer('auto', false, true, probe, load)).toEqual(webgl);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });

  it('on Auto in a browser without navigator.gpu, or whose adapter comes back null (this container), is WebGL with no console error', async () => {
    const error = vi.spyOn(console, 'error');
    for (const nav of [{}, { gpu: { requestAdapter: () => Promise.resolve(null) } }]) {
      const load = loader();
      expect(await startingRenderer('auto', false, false, () => probeWebGpu(nav), load)).toEqual(webgl);
      expect(load).not.toHaveBeenCalled();
    }
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('on the WebGL pick asks for no adapter and loads nothing', async () => {
    const probe = found(true);
    const load = loader();
    expect(await startingRenderer('webgl', false, true, probe, load)).toEqual(webgl);
    expect(probe).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('on Auto or WebGPU with an adapter loads the chunk and starts the node renderer with the visit’s antialiasing', async () => {
    for (const choice of ['auto', 'webgpu'] as const) {
      const start = vi.fn<NodeStart>(() => Promise.resolve(node));
      expect(await startingRenderer(choice, false, true, found(true), loader(start)), choice).toEqual({ backend: 'webgpu', node, adapterName: 'test gpu' });
      expect(start).toHaveBeenCalledWith({ antialias: true, forceWebGL: false });
    }
  });

  it('on Auto leaves a software adapter alone (WebGL is far faster on that machine); a WebGPU pick still takes it', async () => {
    const software = vi.fn((): Promise<WebGpuProbe> => Promise.resolve({ ...noWebGpu(), available: true, software: true, name: 'swiftshader' }));
    const load = loader();
    expect(await startingRenderer('auto', false, false, software, load)).toEqual({ ...webgl, adapterName: 'swiftshader' });
    expect(load).not.toHaveBeenCalled();
    const start = vi.fn<NodeStart>(() => Promise.resolve(node));
    expect(await startingRenderer('webgpu', false, false, software, loader(start))).toEqual({ backend: 'webgpu', node, adapterName: 'swiftshader' });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('with ?forceWebGL asks for no adapter and starts the node renderer on its WebGL2 back end', async () => {
    const probe = found(false);
    const start = vi.fn<NodeStart>(() => Promise.resolve({ kind: 'webgpu-webgl2' } as NodeBackend));
    expect((await startingRenderer('webgpu', true, false, probe, loader(start))).backend).toBe('webgpu-webgl2');
    expect(probe).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith({ antialias: false, forceWebGL: true });
  });

  it('falls back to WebGL quietly when the chunk can’t be loaded or no device can be made (a device lost at boot)', async () => {
    const error = vi.spyOn(console, 'error');
    const named = { ...webgl, adapterName: 'test gpu' };
    expect(await startingRenderer('webgpu', false, false, found(true), () => Promise.reject(new Error('chunk failed')))).toEqual(named);
    expect(await startingRenderer('auto', false, false, found(true), loader(() => Promise.reject(new Error('device lost'))))).toEqual(named);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('the boot chunk Game.create loads (W1)', () => {
  it('starts the visit’s pick and builds the Renderer row for that pick, its note read from what draws', async () => {
    const boot = await bootRenderer('webgl', false, true);
    expect({ backend: boot.backend, node: boot.node, adapterName: boot.adapterName }).toEqual({ backend: 'webgl', node: null, adapterName: '' });
    vi.stubGlobal('document', fakeDocument());
    const row = new FakeElement('div');
    // Loaded on WebGL while the node renderer draws (never in practice): the note says the pick waits for the next load.
    boot.fillRow(row as unknown as HTMLElement, { backend: 'webgpu', lostToWebGL: false });
    vi.unstubAllGlobals();
    expect(row.children.length).toBeGreaterThan(0);
    expect(findAll(row, 'graphics-note')[0]!.textContent).toBe(RENDER_BACKEND.text.pending);
  });
});
