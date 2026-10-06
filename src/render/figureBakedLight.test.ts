import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BAKED_LIGHT } from '../config/bake';
import { HITS } from '../config/hits';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { CharacterRenderer } from './characterRenderer';
import type { ProbeGrid } from './probeGrid';

/** The figures under the map's baked light (G6): read from the probes round them as they move, CPU side. */

/** Dark (the sky hidden) where x < 0, open with an orange bounce where x ≥ 0. */
function grid(): ProbeGrid {
  const nx = 20;
  const ny = 4;
  const nz = 4;
  const data = new Uint8Array(nx * ny * nz * 4);
  for (let i = 0; i < nx * ny * nz; i++) data.set(i % nx < 10 ? [0, 0, 0, 0] : [255, 128, 32, 255], i * 4);
  return { version: 1, preset: 'day', hash: 0, nx, ny, nz, origin: [-9.5, 0, -1.5], spacing: 1, scale: 1, data };
}

/** Each figure's own material (the one its body is drawn with). */
function materials(r: CharacterRenderer, count: number): THREE.MeshStandardMaterial[] {
  const found: THREE.MeshStandardMaterial[] = [];
  r.object.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !found.includes(o.material)) found.push(o.material);
  });
  expect(found).toHaveLength(count);
  return found;
}

describe('figures under the baked light (G6)', () => {
  beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterAll(() => vi.unstubAllGlobals());
  const F = BAKED_LIGHT.look.figure;

  it('dims a figure where the sky is hidden and lights one by the bounce, and follows them as they move', () => {
    const characters = [createCharacter(0, vec3(-6, 0, 0), 0), createCharacter(1, vec3(6, 0, 0), 1)];
    const r = new CharacterRenderer(characters, [0x3d8bff, 0xff8a2a], HITS);
    const [shaded, open] = materials(r, 2);
    r.setBakedLight(grid());
    r.update(1, 0.016, -1);
    expect(shaded!.color.r).toBeCloseTo(1 - F.indirectShare, 6);
    expect(shaded!.emissive.r).toBeCloseTo(0, 6);
    expect(open!.color.r).toBeCloseTo(1, 6);
    expect(open!.emissive.r).toBeCloseTo(F.bounce, 6);
    expect(open!.emissive.r).toBeGreaterThan(open!.emissive.b);
    // Walk the shaded one into the open: it brightens on the next frame.
    characters[0]!.position.x = 6;
    characters[0]!.prevPosition.x = 6;
    r.update(1, 0.016, -1);
    expect(shaded!.color.r).toBeCloseTo(1, 6);
    r.dispose();
  });

  it('adds the bounce to the torch beams’ glow, and lets go of both when the light is turned off', () => {
    const characters = [createCharacter(0, vec3(6, 0, 0), 0)];
    const r = new CharacterRenderer(characters, [0x3d8bff, 0xff8a2a], HITS);
    const [m] = materials(r, 1);
    r.setBakedLight(grid());
    r.setTorchLift(new Float32Array([0.5]), 0xffffff);
    r.update(1, 0.016, -1);
    expect(m!.emissive.g).toBeCloseTo(0.5 + F.bounce * (128 / 255), 6);
    r.setBakedLight(null);
    expect(m!.color.r).toBe(1);
    expect(m!.emissive.g).toBeCloseTo(0.5, 6);
    r.update(1, 0.016, -1);
    expect(m!.color.r).toBe(1);
    r.dispose();
  });

  it('leaves the figures alone without a map’s baked light', () => {
    const characters = [createCharacter(0, vec3(-6, 0, 0), 0)];
    const r = new CharacterRenderer(characters, [0x3d8bff, 0xff8a2a], HITS);
    const [m] = materials(r, 1);
    r.update(1, 0.016, -1);
    expect(m!.color.getHex()).toBe(0xffffff);
    expect(m!.emissive.getHex()).toBe(0);
    r.dispose();
  });
});
