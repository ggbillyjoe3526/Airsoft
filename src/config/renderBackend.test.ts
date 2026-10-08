import { describe, expect, it } from 'vitest';
import { backendFor, RENDER_BACKEND, RENDERER_CHOICES, rendererNote, wantsWebGpu } from './renderBackend';

// WebGPU overhaul W1 (the owner's ruling of 2026-10-08): the Renderer row, Auto by default, WebGPU first where it is offered.
describe('which renderer a visit draws with (W1)', () => {
  it('offers Auto, WebGPU and WebGL, Auto by default, and Auto tries WebGPU first', () => {
    expect(RENDERER_CHOICES.map((c) => c.id)).toEqual(['auto', 'webgpu', 'webgl']);
    expect(RENDER_BACKEND.defaultChoice).toBe('auto');
    expect(RENDER_BACKEND.auto).toBe('webgpu');
    for (const c of RENDERER_CHOICES) expect(c.blurb.length, c.id).toBeGreaterThan(0);
  });

  it('tries the node renderer on Auto and WebGPU, never on WebGL', () => {
    expect(wantsWebGpu('auto')).toBe(true);
    expect(wantsWebGpu('webgpu')).toBe(true);
    expect(wantsWebGpu('webgl')).toBe(false);
  });

  it('draws with WebGL unless the node renderer is wanted and either an adapter was found or the WebGL2 back end forced', () => {
    for (const adapter of [false, true]) for (const force of [false, true]) expect(backendFor(false, adapter, force)).toBe('webgl');
    expect(backendFor(true, false, false)).toBe('webgl');
    expect(backendFor(true, true, false)).toBe('webgpu');
    expect(backendFor(true, false, true)).toBe('webgpu-webgl2');
    expect(backendFor(true, true, true)).toBe('webgpu-webgl2');
  });

  it('notes under the row a pick that changes what draws from the next load, and a WebGPU pick the browser could not honour', () => {
    const { pending, fallback } = RENDER_BACKEND.text;
    // Loaded on the WebGL pick: Auto and WebGPU try WebGPU from the next load.
    expect(rendererNote('webgl', false, 'webgl')).toBe('');
    expect(rendererNote('auto', false, 'webgl')).toBe(pending);
    expect(rendererNote('webgpu', false, 'webgl')).toBe(pending);
    // Loaded wanting WebGPU and given it.
    expect(rendererNote('webgpu', true, 'webgpu')).toBe('');
    expect(rendererNote('webgpu', true, 'webgpu-webgl2')).toBe('');
    expect(rendererNote('auto', true, 'webgpu')).toBe('');
    expect(rendererNote('webgl', true, 'webgpu')).toBe(pending);
    expect(rendererNote('webgl', true, 'webgpu-webgl2')).toBe(pending);
    // Loaded wanting WebGPU, but no adapter: WebGL draws. Only the WebGPU pick says so (Auto falling back is Auto's job),
    // and going back to WebGL or Auto changes nothing.
    expect(rendererNote('webgpu', true, 'webgl')).toBe(fallback);
    expect(rendererNote('auto', true, 'webgl')).toBe('');
    expect(rendererNote('webgl', true, 'webgl')).toBe('');
  });
});
