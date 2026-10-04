import { afterEach, describe, expect, it, vi } from 'vitest';
import { gpuTier, isSoftwareRenderer, lacksHardwareAcceleration, probeGpu } from './gpuCheck';

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
 * asking to fail on a major performance caveat is given. Counts the contexts made and the probes' contexts given back.
 */
function stubBrowser(webgl2: boolean, flagged: boolean, name = 'ANGLE (Intel, Intel(R) UHD Graphics 620)') {
  const counts = { released: 0, made: 0 };
  const gl = {
    RENDERER: 0x1f01,
    getParameter: () => name,
    getExtension: (ext: string) => (ext === 'WEBGL_lose_context' ? { loseContext: () => counts.released++ } : null),
  };
  const getContext = (kind: string, attributes?: WebGLContextAttributes) => {
    if (kind !== 'webgl2' || !webgl2) return null;
    if (attributes?.failIfMajorPerformanceCaveat && !flagged) return null;
    counts.made++;
    return gl;
  };
  vi.stubGlobal('document', { createElement: () => ({ getContext }) });
  return counts;
}

describe('probeGpu (audit M-02, REN-18)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('makes one context on a hardware GPU, reads its name from it and gives it back', () => {
    const counts = stubBrowser(true, true, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11)');
    expect(probeGpu()).toEqual({ software: false, name: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11)' });
    expect(counts).toEqual({ made: 1, released: 1 });
  });

  it('spots a software renderer by the flagged context\'s name', () => {
    const counts = stubBrowser(true, true, 'Google SwiftShader');
    expect(probeGpu().software).toBe(true);
    expect(counts.made).toBe(1);
  });

  it('is software when only the context asking to fail on a caveat is refused, and gives the plain probe back', () => {
    const counts = stubBrowser(true, false);
    expect(probeGpu()).toEqual({ software: true, name: 'ANGLE (Intel, Intel(R) UHD Graphics 620)' });
    expect(counts).toEqual({ made: 1, released: 1 });
  });

  it('is not software when the browser refuses WebGL2 altogether (blocked, or too many contexts): that is no caveat', () => {
    stubBrowser(false, false);
    expect(probeGpu()).toEqual({ software: false, name: '' });
  });

  it('is not software when making a canvas throws', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('no DOM');
      },
    });
    expect(probeGpu()).toEqual({ software: false, name: '' });
  });
});

describe('lacksHardwareAcceleration (audit M-02)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('spots a software renderer by name and a performance caveat behind a real-sounding name', () => {
    stubBrowser(true, true, 'Google SwiftShader');
    expect(lacksHardwareAcceleration()).toBe(true);
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

describe('gpuTier (REN-03)', () => {
  it('sorts real renderer strings into integrated, discrete, software and unknown', () => {
    const table: [string, string][] = [
      // Windows (ANGLE on Direct3D 11)
      ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
      ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (AMD, AMD Radeon(TM) RX Vega 10 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (AMD, AMD Radeon(TM) RX Vega 11 Graphics (0x000015DD) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (AMD, AMD Radeon RX Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (AMD, AMD Radeon(TM) 680M (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (AMD, AMD Radeon RX Vega 56 (0x0000687F) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
      ['ANGLE (AMD, Radeon RX Vega 64 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
      ['ANGLE (AMD, AMD Radeon RX 7600M XT (0x00007480) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
      ['ANGLE (AMD, AMD Radeon RX 6800 XT (0x000073BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
      ['ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 (0x00002B85) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
      ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
      ['ANGLE (NVIDIA, NVIDIA GeForce MX450 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) X1-85 GPU Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
      ['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'software'],
      // macOS
      ['Apple M2', 'integrated'],
      ['ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)', 'integrated'],
      ['AMD Radeon Pro 5500M OpenGL Engine', 'discrete'],
      // Linux
      ['Mesa Intel(R) UHD Graphics 620 (KBL GT2)', 'integrated'],
      ['AMD Radeon RX 6700 XT (navi22, LLVM 15.0.7, DRM 3.49, 6.1.0)', 'discrete'],
      ['AMD Radeon Vega 8 Graphics (raven, LLVM 15.0.7, DRM 3.42, 5.15.0)', 'integrated'],
      ['AMD RAVEN (DRM 3.40.0, 5.10.0, LLVM 11.0.1)', 'integrated'],
      ['AMD Radeon Graphics (renoir, LLVM 15.0.7, DRM 3.49, 6.1.0)', 'integrated'],
      ['AMD Radeon RX Vega (vega10, LLVM 15.0.7, DRM 3.49, 6.1.0)', 'discrete'],
      ['NVIDIA GeForce GTX 1060 6GB/PCIe/SSE2', 'discrete'],
      ['llvmpipe (LLVM 15.0.7, 256 bits)', 'software'],
      ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'software'],
      // Hidden or generic names (Firefox's fingerprinting protection, a blocked extension)
      ['Mozilla', 'unknown'],
      ['WebKit WebGL', 'unknown'],
      ['', 'unknown'],
    ];
    for (const [name, tier] of table) expect(gpuTier(name), name).toBe(tier);
  });

  it('is software whatever the name when the probe found a caveat', () => {
    expect(gpuTier('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', true)).toBe('software');
  });
});
