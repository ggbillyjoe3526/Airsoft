import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RENDERER } from '../config/rendererPick';
import { WEBGL_ERROR } from '../config/crash';
import { RENDER_BACKEND } from '../config/renderBackend';
import { FakeElement, fakeDocument, findAll } from '../ui/testSupport';
import { bootRenderer, startingRenderer } from './rendererStart';
import type { NodeBackend, NodeStart } from './webgpu/nodeBackend';
import { noWebGpu, probeWebGpu, type WebGpuProbe } from './webgpuProbe';

// WebGPU overhaul W1 and W6 (the owner's ruling of 2026-10-08): Auto, the default, draws on WebGPU where the browser
// gives an adapter and on the same renderer's WebGL2 back end everywhere else.
describe('the renderer a visit starts with (W1, W6)', () => {
  const gpu = { kind: 'webgpu' } as NodeBackend;
  const gl2 = { kind: 'webgl' } as NodeBackend;
  const found = (available: boolean) => vi.fn((): Promise<WebGpuProbe> => Promise.resolve({ ...noWebGpu(), available, name: available ? 'test gpu' : '' }));
  /** A start that gives WebGPU when asked for it and WebGL2 when forced. */
  const starts = () => vi.fn<NodeStart>((o) => Promise.resolve(o.forceWebGL ? gl2 : gpu));
  const loader = (start: NodeStart) => vi.fn(() => Promise.resolve(start));

  it('on Auto (every save’s default) with no adapter draws on WebGL2', async () => {
    expect(DEFAULT_RENDERER).toBe('auto');
    const probe = found(false);
    const start = starts();
    expect(await startingRenderer('auto', false, true, probe, loader(start))).toEqual({ backend: 'webgl', node: gl2, adapterName: '' });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledExactlyOnceWith({ antialias: true, forceWebGL: true });
  });

  it('on Auto in a browser without navigator.gpu, or whose adapter comes back null (this container), is WebGL2 with no console error', async () => {
    const error = vi.spyOn(console, 'error');
    for (const nav of [{}, { gpu: { requestAdapter: () => Promise.resolve(null) } }]) {
      const start = starts();
      expect((await startingRenderer('auto', false, false, () => probeWebGpu(nav), loader(start))).backend).toBe('webgl');
      expect(start).toHaveBeenCalledExactlyOnceWith({ antialias: false, forceWebGL: true });
    }
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('on the WebGL pick asks for no adapter and draws on WebGL2', async () => {
    const probe = found(true);
    const start = starts();
    expect(await startingRenderer('webgl', false, true, probe, loader(start))).toEqual({ backend: 'webgl', node: gl2, adapterName: '' });
    expect(probe).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledExactlyOnceWith({ antialias: true, forceWebGL: true });
  });

  it('on Auto or WebGPU with an adapter draws on WebGPU with the visit’s antialiasing', async () => {
    for (const choice of ['auto', 'webgpu'] as const) {
      const start = starts();
      expect(await startingRenderer(choice, false, true, found(true), loader(start)), choice).toEqual({ backend: 'webgpu', node: gpu, adapterName: 'test gpu' });
      expect(start).toHaveBeenCalledExactlyOnceWith({ antialias: true, forceWebGL: false });
    }
  });

  it('on Auto leaves a software adapter alone (WebGL2 is far faster on that machine); a WebGPU pick still takes it', async () => {
    const software = vi.fn((): Promise<WebGpuProbe> => Promise.resolve({ ...noWebGpu(), available: true, software: true, name: 'swiftshader' }));
    expect(await startingRenderer('auto', false, false, software, loader(starts()))).toEqual({ backend: 'webgl', node: gl2, adapterName: 'swiftshader' });
    expect(await startingRenderer('webgpu', false, false, software, loader(starts()))).toEqual({ backend: 'webgpu', node: gpu, adapterName: 'swiftshader' });
  });

  it('with ?forceWebGL asks for no adapter and draws on WebGL2', async () => {
    const probe = found(true);
    const start = starts();
    expect((await startingRenderer('webgpu', true, false, probe, loader(start))).backend).toBe('webgl');
    expect(probe).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledExactlyOnceWith({ antialias: false, forceWebGL: true });
  });

  it('falls back to WebGL2 quietly when no WebGPU device can be made (a device lost at boot)', async () => {
    const error = vi.spyOn(console, 'error');
    const start = vi.fn<NodeStart>((o) => (o.forceWebGL ? Promise.resolve(gl2) : Promise.reject(new Error('device lost'))));
    expect(await startingRenderer('auto', false, false, found(true), loader(start))).toEqual({ backend: 'webgl', node: gl2, adapterName: 'test gpu' });
    expect(start).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('fails the start, naming WebGL (the start-up pane’s advice), when neither back end can be made', async () => {
    const start = vi.fn<NodeStart>(() => Promise.reject(new Error('no context')));
    await expect(startingRenderer('auto', false, false, found(true), loader(start))).rejects.toThrow(/WebGPU nor WebGL 2.*no context/);
    expect(WEBGL_ERROR.test('Neither WebGPU nor WebGL 2 could be started (x)')).toBe(true);
  });
});

describe('the boot chunk Game.create loads (W1)', () => {
  it('starts the visit’s pick and builds the Renderer row for that pick, its note read from what draws', async () => {
    vi.doMock('./webgpu/nodeBackend', () => ({ startNode: () => Promise.resolve({ kind: 'webgl' }) }));
    const boot = await bootRenderer('webgl', false, true);
    vi.doUnmock('./webgpu/nodeBackend');
    expect({ backend: boot.backend, adapterName: boot.adapterName }).toEqual({ backend: 'webgl', adapterName: '' });
    vi.stubGlobal('document', fakeDocument());
    const row = new FakeElement('div');
    // Loaded on WebGL while WebGPU draws (never in practice): the note says the pick waits for the next load.
    boot.fillRow(row as unknown as HTMLElement, { backend: 'webgpu', lostToWebGL: false });
    vi.unstubAllGlobals();
    expect(row.children.length).toBeGreaterThan(0);
    expect(findAll(row, 'graphics-note')[0]!.textContent).toBe(RENDER_BACKEND.text.pending);
  });
});
