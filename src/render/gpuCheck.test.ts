import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSoftwareRenderer, lacksHardwareAcceleration, performanceCaveat } from './gpuCheck';

describe('isSoftwareRenderer (M18b)', () => {
  it('spots the software rasterisers browsers fall back to', () => {
    for (const name of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Google SwiftShader',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'softpipe',
    ]) {
      expect(isSoftwareRenderer(name), name).toBe(true);
    }
  });

  it('leaves real GPUs alone', () => {
    for (const name of [
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M2',
      'AMD Radeon Pro 5500M OpenGL Engine',
      'Mali-G78',
      '',
    ]) {
      expect(isSoftwareRenderer(name), name).toBe(false);
    }
  });
});

/**
 * A stand-in `document` whose canvases give a WebGL2 context named `name` (or none). `flagged` says whether a context
 * asking to fail on a major performance caveat is given. Counts the probes' contexts given back.
 */
function stubBrowser(webgl2: boolean, flagged: boolean, name = 'ANGLE (Intel, Intel(R) UHD Graphics 620)') {
  const released = { count: 0 };
  const gl = {
    RENDERER: 0x1f01,
    getParameter: () => name,
    getExtension: (ext: string) => (ext === 'WEBGL_lose_context' ? { loseContext: () => released.count++ } : null),
  };
  const getContext = (kind: string, attributes?: WebGLContextAttributes) => {
    if (kind !== 'webgl2' || !webgl2) return null;
    return attributes?.failIfMajorPerformanceCaveat && !flagged ? null : gl;
  };
  vi.stubGlobal('document', { createElement: () => ({ getContext }) });
  return released;
}

describe('performanceCaveat (audit M-02)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is true when only the context asking to fail on a caveat is refused', () => {
    const released = stubBrowser(true, false);
    expect(performanceCaveat()).toBe(true);
    expect(released.count).toBe(1); // the plain probe, given back
  });

  it('is false when the browser refuses WebGL2 altogether (blocked, or too many contexts): that is no caveat', () => {
    stubBrowser(false, false);
    expect(performanceCaveat()).toBe(false);
  });

  it('is false when the flagged context is given', () => {
    const released = stubBrowser(true, true);
    expect(performanceCaveat()).toBe(false);
    expect(released.count).toBe(1);
  });

  it('is false when making a canvas throws', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('no DOM');
      },
    });
    expect(performanceCaveat()).toBe(false);
  });
});

describe('lacksHardwareAcceleration (audit M-02)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('spots a software renderer by name, and gives its probe back', () => {
    const released = stubBrowser(true, true, 'Google SwiftShader');
    expect(lacksHardwareAcceleration()).toBe(true);
    expect(released.count).toBeGreaterThanOrEqual(1);
  });

  it('spots a performance caveat behind a real-sounding name', () => {
    stubBrowser(true, false);
    expect(lacksHardwareAcceleration()).toBe(true);
  });

  it('passes a real GPU, and a browser with no WebGL2 at all', () => {
    stubBrowser(true, true);
    expect(lacksHardwareAcceleration()).toBe(false);
    stubBrowser(false, false);
    expect(lacksHardwareAcceleration()).toBe(false);
  });
});
