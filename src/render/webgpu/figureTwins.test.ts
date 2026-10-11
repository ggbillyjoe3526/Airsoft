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
import { useSleeveCamo } from '../figureCamo';
import { FINISH_ATTRIBUTE, useVertexFinish } from '../figureFinish';
import { resolveLighting } from '../lightingPreset';
import { TorchBeams } from '../torchBeams';
import { Viewmodel } from '../viewmodel';
import { figureTwin } from './figureNodes';
import { emptyGrid } from './surfaceNodes';
import { clearSwizzle, fitBrowser, no3DAttachment, rejects3DLayerWrite, rejectsStringSwizzle } from './webgpuCompat';
import { worldTwin } from './worldTwins';
import { nodePatchOf, patchUniforms } from '../nodePatch';

/**
 * W3: what draws the figures, replicas, arms, hands and torch beams on the node path. Every material they draw with
 * either carries a node patch with its twin (the figures' per-vertex finish, the sleeves' camo) or none (so Three's own
 * conversion is the same material); the twin reads the same attribute the WebGL path's GLSL read. The pictures are
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

const patched = (m: THREE.Material): boolean => nodePatchOf(m) !== null;

function torchBearer(id: number, x: number, team: number): Character {
  const c = createCharacter(id, vec3(x, 0, -2 * id), 0, LOADOUT, team);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  c.torchOn = true;
  return c;
}

describe('the figures, replicas, arms, hands and torch beams on the node path (W3 criterion 1)', () => {
  const grid = emptyGrid();
  afterAll(() => grid.dispose());

  it('every patched material they draw with has a twin; the rest carry no patch', () => {
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
    const seen = { twinned: 0, plain: 0 };
    for (const root of [figures.object, low.object, held.scene, torches.object]) {
      for (const m of materialsOf(root)) {
        if (!patched(m)) {
          seen.plain++;
          continue;
        }
        expect(worldTwin(m, grid), `${m.type} ${m.customProgramCacheKey()}`).not.toBeNull();
        seen.twinned++;
      }
    }
    // The detailed figures' finish (one material per figure) and your sleeves' camo (G11), and the plain rest (the
    // beams' three light materials among them: Three's node Basic never takes the environment).
    expect(seen.twinned).toBe(characters.length + 1);
    expect(seen.plain).toBeGreaterThan(10);
    for (const r of [figures, low]) r.dispose();
    held.dispose();
    torches.dispose();
  });

  it('the finish twin reads each vertex’s roughness and metalness from its attribute, and copies the rest', () => {
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
    // The patch carries no uniforms: nothing per object to read (no everyDraw needed).
    expect(Object.keys(patchUniforms(plain))).toEqual([]);
    // Only the finish's key: a plain Standard or another patch gets no figure twin.
    expect(figureTwin(new THREE.MeshStandardMaterial())).toBeNull();
    expect(figureTwin(useVertexFinish(new THREE.MeshStandardMaterial()))).not.toBeNull();
    // The camo (G11): the twin prints it on the colour, which Three multiplies by the vertex colours; the sleeves have one too.
    expect(twin.colorNode).not.toBeNull();
    const sleeve = useSleeveCamo(new THREE.MeshStandardMaterial({ vertexColors: true }));
    const sleeveTwin = worldTwin(sleeve, grid) as MeshStandardNodeMaterial;
    expect(sleeveTwin).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(sleeveTwin.colorNode).not.toBeNull();
    expect(sleeveTwin.roughnessNode).toBeNull();
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

  it('finds a browser that rejects the string swizzle, and frees the test texture either way', async () => {
    for (const rejects of [true, false]) {
      const t = texture(rejects);
      expect(rejectsStringSwizzle({ createTexture: () => t })).toBe(rejects);
      expect(t.destroy).toHaveBeenCalledOnce();
    }
    expect(await fitBrowser(undefined)).toEqual([]);
    expect(await fitBrowser({ createTexture: () => texture(false) })).toEqual([]);
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

describe('the WebGPU 3D texture layer-write fit (W3)', () => {
  /** A device whose layer write into a 3D drawable texture raises `error` (null: none), recording what it was given. */
  const device = (error: unknown) => {
    const made: { usage: number; dimension: string | undefined }[] = [];
    const t = { createView: vi.fn(), destroy: vi.fn() };
    return {
      made,
      t,
      createTexture: (d: { size: [number, number, number?]; format: string; usage: number; dimension?: string }) => {
        made.push({ usage: d.usage, dimension: d.dimension });
        return t;
      },
      queue: { writeTexture: vi.fn() },
      pushErrorScope: vi.fn(),
      popErrorScope: async () => error,
    };
  };

  it('finds a browser that fails a layer written into a 3D texture made for drawing into, and frees the test texture', async () => {
    for (const error of [{ message: 'view dimension' }, null]) {
      const d = device(error);
      expect(await rejects3DLayerWrite(d)).toBe(error !== null);
      expect(d.made).toEqual([{ usage: 0x16, dimension: '3d' }]);
      expect(d.queue.writeTexture).toHaveBeenCalledOnce();
      expect(d.t.destroy).toHaveBeenCalledOnce();
    }
    // A device with no error scopes (none of these browsers) is taken as fine.
    expect(await rejects3DLayerWrite({ createTexture: () => ({ createView: vi.fn(), destroy: vi.fn() }) })).toBe(false);
  });

  it('makes 3D textures without the drawing use, in the descriptor it is given, once per page; 2D textures keep it', () => {
    const made: number[] = [];
    const proto = { createTexture: (d: { usage: number }) => (made.push(d.usage), { createView: vi.fn(), destroy: vi.fn() }) };
    expect(no3DAttachment(proto as never)).toBe(true);
    const flat = { size: [4, 4] as [number, number], format: 'rgba8unorm', usage: 0x17 };
    const deep = { size: [4, 4, 4] as [number, number, number], format: 'rgba8unorm', usage: 0x17, dimension: '3d' };
    proto.createTexture(flat);
    proto.createTexture(deep);
    expect(made).toEqual([0x17, 0x07]);
    expect(deep.usage).toBe(0x07);
    expect(no3DAttachment(proto as never)).toBe(false);
  });
});
