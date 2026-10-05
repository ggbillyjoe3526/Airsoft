import * as THREE from 'three';
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATMOSPHERE, LIGHTING_PRESETS, QUALITY, TONE_MAPPING } from '../config/render';
import { DEPOT } from '../map/depot';
import { RANGE_MAP } from '../map/range';
import { WOODLAND } from '../map/woodland';
import { resolveLighting } from './lightingPreset';
import type { SurfaceTextures } from './proceduralTextures';
import { handOverRenderer, releaseGpuResources, Renderer, toneMappingOf, verticalFovFor, warmSurfacesInIdle, zoomedFov } from './renderer';
import { defaultEnvironmentLook, type EnvironmentLook, environmentKey } from './replicaSheen';

describe('verticalFovFor', () => {
  it('converts a 16:9 horizontal FOV to the matching vertical FOV', () => {
    // 90° horizontal at 16:9 is ~58.7° vertical.
    expect(verticalFovFor(90)).toBeCloseTo(58.72, 1);
    expect(verticalFovFor(100)).toBeCloseTo(67.67, 1);
  });
});

describe('zoomedFov', () => {
  it('narrows the view by the zoom factor (and leaves it alone at 1)', () => {
    const fov = verticalFovFor(100);
    expect(zoomedFov(fov, 1)).toBeCloseTo(fov, 9);
    const DEG = Math.PI / 180;
    expect(Math.tan((zoomedFov(fov, 1.25) * DEG) / 2)).toBeCloseTo(Math.tan((fov * DEG) / 2) / 1.25, 12);
  });
});

describe('warmSurfacesInIdle (REN-14)', () => {
  /** A queue of idle moments run by hand. */
  function manualIdle() {
    const jobs: (() => void)[] = [];
    return { idle: (work: () => void) => void jobs.push(work), runOne: () => jobs.shift()?.(), waiting: () => jobs.length };
  }
  const fakeSet = () =>
    Object.fromEntries(['concrete', 'blockWall', 'crate'].map((id) => [id, { texture: { name: id } as unknown as THREE.Texture }])) as unknown as SurfaceTextures;

  it('draws the set in one idle moment, then uploads one texture a moment until all are up, and stops', () => {
    const { idle, runOne, waiting } = manualIdle();
    const set = fakeSet();
    const draw = vi.fn(() => set);
    const uploaded: string[] = [];
    warmSurfacesInIdle(draw, () => set, (t) => uploaded.push(t.name), idle);
    expect(draw).not.toHaveBeenCalled();
    runOne();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(uploaded).toEqual([]);
    runOne();
    expect(uploaded).toEqual(['concrete']);
    while (waiting() > 0) runOne();
    expect(uploaded).toEqual(['concrete', 'blockWall', 'crate']);
  });

  it('stops uploading once the set is dropped (a texture-size change)', () => {
    const { idle, runOne, waiting } = manualIdle();
    const set = fakeSet();
    let current: SurfaceTextures | null = set;
    const uploaded: string[] = [];
    warmSurfacesInIdle(() => set, () => current, (t) => uploaded.push(t.name), idle);
    runOne();
    runOne();
    current = null;
    while (waiting() > 0) runOne();
    expect(uploaded).toEqual(['concrete']);
  });
});

describe('toneMappingOf (audit F2)', () => {
  it('gives each Tone mapping choice its Three.js mapper and exposure, Neutral at 1 by default', () => {
    expect(toneMappingOf(TONE_MAPPING.default)).toEqual({ mapping: NeutralToneMapping, exposure: 1 });
    expect(toneMappingOf('agx').mapping).toBe(AgXToneMapping);
    expect(toneMappingOf('aces')).toEqual({ mapping: ACESFilmicToneMapping, exposure: TONE_MAPPING.exposure.aces });
  });
});

describe('handOverRenderer (REN-24)', () => {
  /**
   * A stand-in for THREE.WebGLRenderer that keeps what Three keeps: a dispose listener (holding the renderer) on every
   * geometry, material, texture, instanced mesh and shadow map it draws, removed only when that object is disposed.
   */
  /** Three's DFG lookup table: one texture shared by every renderer, bound to standard materials by the renderer itself. */
  const lookupTable = new THREE.DataTexture(new Uint8Array(4), 1, 1);

  class StubRenderer {
    readonly domElement = { replaceWith: vi.fn() };
    /** The renderer's own uniforms per material (WebGLRenderer.properties). */
    private readonly own = new WeakMap<object, { uniforms?: Record<string, THREE.IUniform> }>();
    readonly properties = { get: (o: object) => this.own.get(o) ?? this.own.set(o, {}).get(o)! };
    readonly held = new Set<THREE.EventDispatcher<{ dispose: object }>>();
    disposed = false;
    lost = false;
    dispose(): void {
      this.disposed = true;
    }
    forceContextLoss(): void {
      this.lost = true;
    }
    draw(roots: THREE.Object3D[]): void {
      for (const root of roots) {
        root.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) this.hold(o);
          const { geometry, material } = o as Partial<THREE.Mesh>;
          if (geometry) this.hold(geometry);
          for (const m of material ? [material].flat() : []) {
            this.hold(m);
            if (m instanceof THREE.MeshStandardMaterial) {
              this.properties.get(m).uniforms = { dfgLUT: { value: lookupTable } };
              this.hold(lookupTable);
            }
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) this.hold(v);
            for (const u of Object.values((m as Partial<THREE.ShaderMaterial>).uniforms ?? {})) if (u.value instanceof THREE.Texture) this.hold(u.value);
          }
          const shadow = (o as Partial<THREE.DirectionalLight>).shadow;
          if (shadow && (o as THREE.Light).castShadow) this.hold((shadow.map ??= new THREE.WebGLRenderTarget(64, 64)));
        });
      }
    }
    private hold(target: THREE.EventDispatcher<{ dispose: object }>): void {
      if (this.held.has(target)) return;
      this.held.add(target);
      const listener = (): void => {
        target.removeEventListener('dispose', listener);
        this.held.delete(target);
      };
      target.addEventListener('dispose', listener);
    }
  }

  function world(): { scene: THREE.Scene; overlay: THREE.Scene; instanced: THREE.InstancedMesh } {
    const scene = new THREE.Scene();
    const map = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map })));
    const instanced = new THREE.InstancedMesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial(), 4);
    instanced.setMatrixAt(2, new THREE.Matrix4().makeTranslation(1, 2, 3));
    scene.add(instanced);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial({ uniforms: { tex: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) } } })));
    const sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    scene.add(sun);
    const overlay = new THREE.Scene();
    overlay.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial()]));
    return { scene, overlay, instanced };
  }

  it('leaves only the renderer in use holding the scenes after repeated swaps, the old ones freed with their contexts', () => {
    const { scene, overlay, instanced } = world();
    const roots = [scene, overlay];
    const made = [new StubRenderer()];
    made[0]!.draw(roots);
    for (let swap = 0; swap < 6; swap++) {
      const next = new StubRenderer();
      handOverRenderer(made.at(-1)!, next as unknown as { domElement: HTMLCanvasElement }, roots);
      next.draw(roots); // the next frame uploads everything to the new context
      made.push(next);
    }
    // Only the last renderer is still reachable from the scenes; every one before it is disposed and its context lost.
    expect(made.filter((r) => r.held.size > 0)).toEqual([made.at(-1)]);
    for (const r of made.slice(0, -1)) {
      expect([r.disposed, r.lost]).toEqual([true, true]);
      expect(r.domElement.replaceWith).toHaveBeenCalledTimes(1);
    }
    expect(made.at(-1)!.held.size).toBeGreaterThan(8);
    // Nothing on the CPU side is lost: the instances keep their matrices for the new context's upload.
    expect(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(instanced.instanceMatrix.array, 2 * 16))).toEqual(new THREE.Vector3(1, 2, 3));
  });

  it('frees a shadow map so the next renderer makes its own', () => {
    const { scene } = world();
    const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
    new StubRenderer().draw([scene]);
    const map = sun.shadow.map!;
    const freed = vi.fn();
    map.addEventListener('dispose', freed);
    releaseGpuResources(scene);
    expect(freed).toHaveBeenCalledTimes(1);
    expect(sun.shadow.map).toBeNull();
  });
});

describe('the lighting preset on the renderer (M33f, acceptance 4)', () => {
  /** A Renderer without WebGL: only what setLighting and setToneMapping touch. */
  function bareRenderer(): Renderer {
    const r = Object.create(Renderer.prototype) as Renderer;
    const fields = r as unknown as Record<string, unknown>;
    Object.assign(fields, {
      scene: new THREE.Scene(),
      gl: { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 },
      toneMapping: TONE_MAPPING.default,
      lighting: LIGHTING_PRESETS.day,
      environmentLook: defaultEnvironmentLook(),
      environmentDirty: false,
    });
    r.scene.background = new THREE.Color();
    r.scene.fog = new THREE.Fog(0xffffff);
    return r;
  }
  const look = (r: Renderer) => {
    const fog = r.scene.fog as THREE.Fog;
    const gl = (r as unknown as { gl: { toneMappingExposure: number } }).gl;
    return { fog: [fog.color.getHex(), fog.near, fog.far], background: (r.scene.background as THREE.Color).getHex(), exposure: gl.toneMappingExposure, env: environmentKey((r as unknown as { environmentLook: EnvironmentLook }).environmentLook) };
  };

  it('scales the exposure by the preset', () => {
    expect(toneMappingOf('agx', 1.15).exposure).toBeCloseTo(TONE_MAPPING.exposure.agx * 1.15);
    expect(toneMappingOf('neutral')).toEqual(toneMappingOf('neutral', 1));
  });

  it('sets the night’s haze, exposure and environment, and gives the day’s back on the next day map', () => {
    const r = bareRenderer();
    r.setLighting(LIGHTING_PRESETS.day);
    const day = look(r);
    expect(day).toEqual({ fog: [ATMOSPHERE.horizon, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar], background: ATMOSPHERE.horizon, exposure: TONE_MAPPING.exposure[TONE_MAPPING.default], env: environmentKey(defaultEnvironmentLook()) });
    const fog = r.scene.fog;
    r.setLighting(resolveLighting(WOODLAND));
    const night = LIGHTING_PRESETS.night;
    expect(look(r).fog).toEqual([night.fog.colour, night.fog.near, night.fog.far]);
    expect(look(r).background).toBe(night.fog.colour);
    expect(look(r).exposure).toBeCloseTo(TONE_MAPPING.exposure[TONE_MAPPING.default] * night.exposureScale);
    expect(look(r).env).not.toBe(day.env);
    expect(r.scene.fog).toBe(fog); // changed in place, never a new object
    r.setLighting(resolveLighting(DEPOT));
    expect(look(r)).toEqual(day);
    r.setLighting(resolveLighting(RANGE_MAP));
    expect(look(r)).toEqual(day);
  });

  it('keeps the preset’s exposure when the tone mapping row changes', () => {
    const r = bareRenderer();
    r.setLighting(LIGHTING_PRESETS.night);
    r.setToneMapping('aces');
    expect(look(r).exposure).toBeCloseTo(TONE_MAPPING.exposure.aces * LIGHTING_PRESETS.night.exposureScale);
  });
});

/**
 * A Renderer built by its own constructor over a stand-in WebGLRenderer and context (Node has no WebGL): only what
 * render, warmShaders and the context events touch. The context counts its losses: a query made before the last one
 * is dead, and a lost context offers no extension (as the WebGL spec says) and makes no query.
 */
function stubbedRenderer() {
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const ctx = {
    lost: false,
    losses: 0,
    queriesMade: 0,
    /** beginQuery on a query of a lost context (INVALID_OPERATION in a browser). */
    deadBegins: 0,
    begunOn: [] as number[],
    QUERY_RESULT_AVAILABLE: 10,
    QUERY_RESULT: 11,
    getExtension: (name: string) => (!ctx.lost && name === 'EXT_disjoint_timer_query_webgl2' ? ext : null),
    createQuery: () => (ctx.lost ? null : { id: ++ctx.queriesMade, losses: ctx.losses }),
    deleteQuery: () => undefined,
    beginQuery: (_t: number, q: { id: number; losses: number }) => {
      if (ctx.lost || q.losses !== ctx.losses) ctx.deadBegins++;
      ctx.begunOn.push(q.id);
    },
    endQuery: () => undefined,
    getQueryParameter: (_q: unknown, p: number) => (p === 10 ? true : 2_000_000),
    getParameter: () => false,
  };
  const calls: string[] = [];
  const canvas = new EventTarget();
  const target = { name: 'retro target' };
  let renderTarget: unknown = null;
  const gl = {
    domElement: canvas,
    info: { autoReset: true, reset: () => undefined },
    shadowMap: { enabled: false },
    autoClear: true,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    getContext: () => ctx,
    getPixelRatio: () => 1,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    setRenderTarget: (t: unknown) => void (renderTarget = t),
    clearDepth: () => undefined,
    render: () => void calls.push('render'),
    compile: (scene: THREE.Scene) => {
      calls.push(`compile ${scene.name} into ${renderTarget === null ? 'the canvas' : (renderTarget as { name: string }).name} with ${scene.environment ? 'the environment' : 'none'}`);
      return new Set();
    },
  };
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  vi.spyOn(Renderer.prototype as unknown as { makeWebGL: () => unknown }, 'makeWebGL').mockReturnValue(gl);
  const r = new Renderer({ appendChild: () => undefined, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement, QUALITY.medium);
  r.scene.name = 'world';
  // The prefiltered sky, as the sheen hands it over (no PMREM without WebGL).
  const environment = new THREE.Texture();
  const fields = r as unknown as Record<string, unknown>;
  fields.sheen = { texture: () => environment, forget: () => undefined, dispose: () => undefined };
  return {
    r,
    ctx,
    calls,
    useRetro: () => void (fields.retro = { renderTarget: target, present: (g: typeof gl) => g.setRenderTarget(null) }),
    target: () => renderTarget,
    lose: () => {
      ctx.lost = true;
      ctx.losses++;
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    },
    restore: () => {
      ctx.lost = false;
      canvas.dispatchEvent(new Event('webglcontextrestored'));
    },
  };
}

describe('the shader warm-up (M63, audit REN-06)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('compiles the world and the held replica once, under the environment and target the first frame draws with', () => {
    const { r, calls } = stubbedRenderer();
    const overlay = { scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() };
    r.warmShaders(overlay);
    // The environment is set first: a program compiled without it would be compiled again on the first frame.
    expect(calls).toEqual(['compile world into the canvas with the environment', 'compile replica into the canvas with none']);
    // Frames compile nothing themselves.
    r.render(overlay);
    r.render(overlay);
    expect(calls.slice(2)).toEqual(['render', 'render', 'render', 'render']);
  });

  it('compiles into the retro filter’s target while the filter is on (tone mapping depends on the target), then gives the canvas back', () => {
    const { r, calls, useRetro, target } = stubbedRenderer();
    useRetro();
    r.warmShaders();
    expect(calls).toEqual(['compile world into retro target with the environment']);
    expect(target()).toBeNull();
  });
});

describe('the GPU timer across a lost context (M63, audit REN-07)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('times the restored context with a query of its own, never one of the lost context', () => {
    const { r, ctx, lose, restore } = stubbedRenderer();
    r.gpuTiming = true;
    r.render();
    r.render();
    expect(ctx.queriesMade).toBe(1);
    expect(r.gpuMs).toBe(2);
    lose();
    // A frame drawn while the context is gone (before play stops) makes a timer the lost context can't serve.
    r.render();
    restore();
    for (let frame = 0; frame < 3; frame++) r.render();
    expect(ctx.queriesMade).toBe(2);
    expect(ctx.begunOn.at(-1)).toBe(2);
    expect(ctx.deadBegins).toBe(0);
    // Timing again: the overlay's GPU milliseconds come back.
    expect(r.gpuMs).toBe(2);
  });
});
