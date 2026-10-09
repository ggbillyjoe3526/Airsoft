import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HITS } from '../../config/hits';
import { BODY } from '../../config/movement';
import { LOADOUT } from '../../config/replicas';
import { WOODLAND } from '../../map/woodland';
import { fitParts, type WorldQuery } from '../../sim/armament';
import { type Character, createCharacter } from '../../sim/character';
import { vec3 } from '../../sim/vec';
import { CharacterRenderer } from '../characterRenderer';
import { FINISH_ATTRIBUTE, useVertexFinish } from '../figureFinish';
import { resolveLighting } from '../lightingPreset';
import { TorchBeams } from '../torchBeams';
import { Viewmodel } from '../viewmodel';
import { figureTwin } from './figureNodes';
import { emptyGrid } from './surfaceNodes';
import { patchUniforms } from './twinUniforms';
import { clearSwizzle, fitBrowser, rejectsStringSwizzle } from './webgpuCompat';
import { worldTwin } from './worldTwins';

/**
 * W3: what draws the figures, replicas, arms, hands and torch beams on the node path. Every material they draw with is
 * either patched with a node twin (the figures' per-vertex finish) or carries no patch Three's node library would drop
 * (so Three's own conversion is the same material); the twin reads the same attribute the GLSL reads. The pictures are
 * compared in the browser (pipeline/webgpu-compare.mjs, W3's figure views).
 */

beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
afterAll(() => vi.unstubAllGlobals());

/** Every material in `root`. */
function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const out = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) for (const one of Array.isArray(m) ? m : [m]) out.add(one);
  });
  return [...out];
}

const patched = (m: THREE.Material): boolean => m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;

/** The program keys whose patch Three's node materials need no twin for (W2: node Lambert and Basic never take the environment). */
const OWN_BY_DESIGN = new Set(['without-environment']);

function torchBearer(id: number, x: number, team: number): Character {
  const c = createCharacter(id, vec3(x, 0, -2 * id), 0, LOADOUT, team);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  c.torchOn = true;
  return c;
}

describe('the figures, replicas, arms, hands and torch beams on the node path (W3 criterion 1)', () => {
  const grid = emptyGrid();
  afterAll(() => grid.dispose());

  it('every patched material they draw with has a twin, or is Three’s own by design; the rest carry no patch', () => {
    const night = resolveLighting(WOODLAND);
    const characters = [torchBearer(0, 0, 0), torchBearer(1, 2, 0), torchBearer(2, -2, 1), torchBearer(3, 4, 1)];
    const robots = { robots: [false, true, false, true], realistic: false };
    const figures = new CharacterRenderer(characters, [0x3d8bff, 0xff8a2a], HITS, null, 'high', robots);
    const low = new CharacterRenderer(characters, [0x3d8bff, 0xff8a2a], HITS, null, 'low', robots);
    const held = new Viewmodel(16 / 9, 0x3d8bff, LOADOUT, { replica: 'high', hands: 'high' });
    const ground: WorldQuery = { raycastStatic: (_o, _d, max) => Math.min(8, max) };
    const torches = new TorchBeams(characters, night, { poolLights: 2 }, ground, BODY, HITS);
    const cam = new THREE.PerspectiveCamera();
    torches.update(cam, characters[0]!, true, 1);
    const seen = { twinned: 0, own: 0, plain: 0 };
    for (const root of [figures.object, low.object, held.scene, torches.object]) {
      for (const m of materialsOf(root)) {
        if (!patched(m)) {
          seen.plain++;
          continue;
        }
        const twin = worldTwin(m, grid);
        if (twin) seen.twinned++;
        else {
          expect(OWN_BY_DESIGN.has(m.customProgramCacheKey()), `${m.type} ${m.customProgramCacheKey()}`).toBe(true);
          seen.own++;
        }
      }
    }
    // The detailed figures' finish (one material per figure), the beams' three light materials, and the plain rest.
    expect(seen.twinned).toBe(characters.length);
    expect(seen.own).toBe(3);
    expect(seen.plain).toBeGreaterThan(10);
    for (const r of [figures, low]) r.dispose();
    held.dispose();
    torches.dispose();
  });

  it('the finish twin reads each vertex’s roughness and metalness from the attribute the GLSL reads, and copies the rest', () => {
    const plain = useVertexFinish(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, transparent: true, opacity: 0.4 }));
    plain.color.setRGB(0.5, 0.6, 0.7);
    plain.emissive.setRGB(0.1, 0, 0);
    const twin = worldTwin(plain, grid) as MeshStandardNodeMaterial;
    expect(twin).toBeInstanceOf(MeshStandardNodeMaterial);
    const read = (node: unknown) => node as { node: { _attributeName: string }; components: string };
    expect(read(twin.roughnessNode).node._attributeName).toBe(FINISH_ATTRIBUTE);
    expect(read(twin.roughnessNode).components).toBe('x');
    expect(read(twin.metalnessNode).node._attributeName).toBe(FINISH_ATTRIBUTE);
    expect(read(twin.metalnessNode).components).toBe('y');
    expect(twin.vertexColors).toBe(true);
    expect(twin.transparent).toBe(true);
    expect(twin.opacity).toBe(0.4);
    expect(twin.color).toBe(plain.color);
    expect(twin.emissive).toBe(plain.emissive);
    // The GLSL patch adds no uniforms: nothing per object to read (no everyDraw needed).
    expect(Object.keys(patchUniforms(plain))).toEqual([]);
    // Only the finish's key: a plain Standard or another patch gets no figure twin.
    expect(figureTwin(new THREE.MeshStandardMaterial())).toBeNull();
    expect(figureTwin(useVertexFinish(new THREE.MeshStandardMaterial()))).not.toBeNull();
  });
});

describe('the WebGPU texture-view swizzle fit (W3)', () => {
  const texture = (rejects: boolean) => ({
    createView: (d?: { swizzle?: unknown }) => {
      if (rejects && typeof d?.swizzle === 'string') throw new TypeError('not a GPUTextureComponentSwizzle');
      return d;
    },
    destroy: vi.fn(),
  });

  it('finds a browser that rejects the string swizzle, and frees the test texture either way', () => {
    for (const rejects of [true, false]) {
      const t = texture(rejects);
      expect(rejectsStringSwizzle({ createTexture: () => t })).toBe(rejects);
      expect(t.destroy).toHaveBeenCalledOnce();
    }
    expect(fitBrowser(undefined)).toEqual([]);
    expect(fitBrowser({ createTexture: () => texture(false) })).toEqual([]);
  });

  it('clears the swizzle in the descriptor it is given (no copy), once per page', () => {
    const proto = texture(true);
    expect(clearSwizzle(proto)).toBe(true);
    const descriptor = { swizzle: 'rgba' as unknown, format: 'rgba8unorm' };
    expect(proto.createView(descriptor)).toBe(descriptor);
    expect(descriptor.swizzle).toBeUndefined();
    expect(clearSwizzle(texture(true))).toBe(false);
  });
});
