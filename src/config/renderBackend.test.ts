import { describe, expect, it } from 'vitest';
import { RENDER_BACKEND, RENDERER_CHOICES, rendererNote, wantsWebGpu } from './renderBackend';
import { DEFAULT_RENDERER, RENDERER_IDS } from './rendererPick';

// WebGPU overhaul W1 (the owner's ruling of 2026-10-08): the Renderer row, Auto by default, WebGPU first where it is offered.
describe('which renderer a visit draws with (W1)', () => {
  it('offers Auto, WebGPU and WebGL, Auto by default, the row and the boot-time pick agreeing', () => {
    expect(RENDERER_CHOICES.map((c) => c.id)).toEqual(['auto', 'webgpu', 'webgl']);
    expect(RENDERER_IDS).toEqual(RENDERER_CHOICES.map((c) => c.id));
    expect(RENDER_BACKEND.defaultChoice).toBe('auto');
    expect(DEFAULT_RENDERER).toBe(RENDER_BACKEND.defaultChoice);
    for (const c of RENDERER_CHOICES) expect(c.blurb.length, c.id).toBeGreaterThan(0);
  });

  it('tries the node renderer on Auto and WebGPU, never on WebGL', () => {
    expect(wantsWebGpu('auto')).toBe(true);
    expect(wantsWebGpu('webgpu')).toBe(true);
    expect(wantsWebGpu('webgl')).toBe(false);
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

  it('says what happened when the WebGPU device was lost mid-visit and WebGL took over: not that there is no WebGPU', () => {
    const { lost, fallback, pending } = RENDER_BACKEND.text;
    expect(rendererNote('webgpu', true, 'webgl', true)).toBe(lost);
    expect(rendererNote('auto', true, 'webgl', true)).toBe(lost);
    expect(rendererNote('webgpu', true, 'webgl', true)).not.toBe(fallback);
    // WebGL picked after it: WebGL draws already.
    expect(rendererNote('webgl', true, 'webgl', true)).toBe('');
    // Before any loss, the same lines as ever.
    expect(rendererNote('webgpu', true, 'webgpu', false)).toBe('');
    expect(rendererNote('webgl', true, 'webgpu', false)).toBe(pending);
  });
});
