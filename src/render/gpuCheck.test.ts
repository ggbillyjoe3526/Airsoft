import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer } from './gpuCheck';

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
