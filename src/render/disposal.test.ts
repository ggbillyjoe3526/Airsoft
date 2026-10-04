import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HITS } from '../config/hits';
import { HIT_PUFFS, IMPACT_PUFFS, QUALITY, SURFACES, type SurfaceTextureId } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { DEPOT } from '../map/depot';
import { RANGE_MAP } from '../map/range';
import { createBBPool } from '../sim/ballistics';
import { createCharacter } from '../sim/character';
import { createRangeTargets } from '../sim/rangeTargets';
import { vec3 } from '../sim/vec';
import { addAtmosphere } from './atmosphere';
import { BBPathsDebug } from './bbPathsDebug';
import { BBRenderer } from './bbRenderer';
import { CharacterRenderer } from './characterRenderer';
import { DustMotes } from './dustMotes';
import { FlagRenderer } from './flagRenderer';
import { ImpactPuffs } from './impactPuffs';
import { addLighting } from './lighting';
import { buildMapMeshes, disposeMapMeshes } from './mapMeshes';
import type { SurfaceTextures } from './proceduralTextures';
import { RangeTargetsRenderer } from './rangeTargetsRenderer';

/**
 * Every pooled scene object a session builds leaves the scene empty when disposed and frees every geometry and
 * material it drew with (audit L-06): leaks here only show after several Play Again cycles. No WebGL is needed; the
 * canvases for the HIT! sign, the range's boards and the soft dots are stood in for (they draw nothing here).
 */
describe('disposal', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  /** Every geometry and material under `scene` (Sprites share one geometry module-wide, so theirs is left out). */
  function resources(scene: THREE.Scene): Set<THREE.BufferGeometry | THREE.Material> {
    const out = new Set<THREE.BufferGeometry | THREE.Material>();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) out.add(o.geometry);
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments || o instanceof THREE.Sprite) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) out.add(m as THREE.Material);
      }
    });
    return out;
  }

  /** Builds into a fresh scene with `build`, disposes with what it returns, and checks nothing is left. */
  function expectClean(name: string, build: (scene: THREE.Scene) => () => void): void {
    const scene = new THREE.Scene();
    const dispose = build(scene);
    const used = resources(scene);
    expect(used.size, `${name} draws something`).toBeGreaterThan(0);
    const freed = new Set<unknown>();
    for (const r of used) r.addEventListener('dispose', () => freed.add(r));
    dispose();
    expect(scene.children, `${name} leaves the scene`).toHaveLength(0);
    expect([...used].filter((r) => !freed.has(r)).map((r) => `${r.type} ${r.name}`), `${name} frees everything`).toEqual([]);
  }

  /** Stand-in surface textures (canvases need a browser): only their world size matters to the geometry. */
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: new THREE.Texture() as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
  const colours = TEAM_COLOUR_SETS.standard.figures;

  it('the BBs, their debug paths, the puffs and the dust', () => {
    const pool = createBBPool(16);
    expectClean('BBRenderer', (scene) => {
      const r = new BBRenderer(pool, 1 / 60);
      scene.add(r.object);
      return () => r.dispose();
    });
    expectClean('BBPathsDebug', (scene) => {
      const r = new BBPathsDebug(pool);
      scene.add(r.object);
      return () => r.dispose();
    });
    for (const cfg of [IMPACT_PUFFS, HIT_PUFFS]) {
      expectClean('ImpactPuffs', (scene) => {
        const r = new ImpactPuffs(cfg);
        scene.add(r.object);
        return () => r.dispose();
      });
    }
    expectClean('DustMotes', (scene) => {
      const r = new DustMotes(QUALITY.high.dustMotes);
      scene.add(r.object);
      return () => r.dispose();
    });
  });

  it('the figures, the flag and the range targets', () => {
    const characters = [createCharacter(0, vec3(), 0, LOADOUT, 0), createCharacter(1, vec3(2, 0, 0), 1, LOADOUT, 1)];
    expectClean('CharacterRenderer', (scene) => {
      const r = new CharacterRenderer(characters, colours, HITS);
      scene.add(r.object);
      return () => r.dispose();
    });
    expectClean('FlagRenderer', (scene) => {
      const r = new FlagRenderer(colours, 2);
      scene.add(r.object);
      return () => r.dispose();
    });
    expectClean('RangeTargetsRenderer', (scene) => {
      const r = new RangeTargetsRenderer(createRangeTargets(), HITS);
      scene.add(r.object);
      return () => r.dispose();
    });
  });

  it('the map, the sky and trees, and the daylight with its shadow map', () => {
    for (const map of [DEPOT, RANGE_MAP]) {
      expectClean('buildMapMeshes', (scene) => {
        const group = buildMapMeshes(map, textures, true);
        scene.add(group);
        return () => disposeMapMeshes(group);
      });
    }
    expectClean('addAtmosphere', (scene) => addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)));
    const shadowMap = vi.fn();
    expectClean('addLighting', (scene) => {
      const daylight = addLighting(scene, DEPOT, QUALITY.high);
      const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
      sun.shadow.map = { dispose: shadowMap } as unknown as THREE.WebGLRenderTarget; // as Three.js makes at the first shadow pass
      return () => daylight.dispose();
    });
    expect(shadowMap).toHaveBeenCalled();
  });
});
