import * as THREE from 'three';
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATMOSPHERE, LIGHTING_PRESETS, QUALITY, type QualitySettings, TONE_MAPPING } from '../config/render';
import { DEPOT } from '../map/depot';
import { RANGE_MAP } from '../map/range';
import { WOODLAND } from '../map/woodland';
import { resolveLighting } from './lightingPreset';
import { PostHost } from './post/postHost';
import { PostStack } from './post/postStack';
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
  const fake = (id: string) => ({ name: id }) as unknown as THREE.Texture;

  it('draws one texture an idle moment and uploads it the next, through the list, and stops (BP2)', () => {
    const { idle, runOne, waiting } = manualIdle();
    const draw = vi.fn(fake);
    const uploaded: string[] = [];
    warmSurfacesInIdle(['concrete', 'blockWall', 'crate'], draw, (t) => uploaded.push(t.name), idle);
    expect(draw).not.toHaveBeenCalled();
    runOne();
    expect(draw.mock.calls.map(([id]) => id)).toEqual(['concrete']);
    expect(uploaded).toEqual([]);
    runOne();
    expect(uploaded).toEqual(['concrete']);
    runOne();
    expect(draw).toHaveBeenCalledTimes(2);
    while (waiting() > 0) runOne();
    expect(draw.mock.calls.map(([id]) => id)).toEqual(['concrete', 'blockWall', 'crate']);
    expect(uploaded).toEqual(['concrete', 'blockWall', 'crate']);
  });

  it('leaves the upload to its guard: one the set no longer holds (a texture-size change) is skipped', () => {
    const { idle, runOne, waiting } = manualIdle();
    const held = new Set<string>(['concrete', 'blockWall', 'crate']);
    const uploaded: string[] = [];
    warmSurfacesInIdle(['concrete', 'blockWall', 'crate'], fake, (t) => {
      if (held.has(t.name)) uploaded.push(t.name);
    }, idle);
    runOne();
    held.delete('concrete');
    while (waiting() > 0) runOne();
    expect(uploaded).toEqual(['blockWall', 'crate']);
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
      // The renderer it draws with is the device's (render/drawingDevice.ts, W1).
      device: { gl: { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }, node: null },
      toneMapping: TONE_MAPPING.default,
      lighting: LIGHTING_PRESETS.day,
      environmentLook: defaultEnvironmentLook(),
      environmentDirty: false,
      post: new PostHost(() => false),
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

/** Medium without its bloom (G5): the frame drawn straight to the canvas, as every preset drew before the post stack. */
const PLAIN = { ...QUALITY.medium, bloom: false };

/**
 * A Renderer built by its own constructor over a stand-in WebGLRenderer and context (Node has no WebGL): only what
 * render, warmShaders and the context events touch. The context counts its losses: a query made before the last one
 * is dead, and a lost context offers no extension (as the WebGL spec says) and makes no query. A scene drawn logs
 * `render`, a post pass's full-screen quad `quad`.
 */
function stubbedRenderer(quality: QualitySettings = PLAIN) {
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const ctx = {
    lost: false,
    losses: 0,
    queriesMade: 0,
    /** beginQuery on a query of a lost context (INVALID_OPERATION in a browser). */
    deadBegins: 0,
    begunOn: [] as number[],
    /** Each deleteQuery: the query's id, and whether its context was lost then or it belonged to a lost one. */
    deleted: [] as { id: number; whileLost: boolean; stale: boolean }[],
    /** What a finished query reports (ns). */
    elapsed: 2_000_000,
    QUERY_RESULT_AVAILABLE: 10,
    QUERY_RESULT: 11,
    getExtension: (name: string) => (!ctx.lost && name === 'EXT_disjoint_timer_query_webgl2' ? ext : null),
    createQuery: () => (ctx.lost ? null : { id: ++ctx.queriesMade, losses: ctx.losses }),
    deleteQuery: (q: { id: number; losses: number }) => void ctx.deleted.push({ id: q.id, whileLost: ctx.lost, stale: q.losses !== ctx.losses }),
    beginQuery: (_t: number, q: { id: number; losses: number }) => {
      if (ctx.lost || q.losses !== ctx.losses) ctx.deadBegins++;
      ctx.begunOn.push(q.id);
    },
    endQuery: () => undefined,
    getQueryParameter: (_q: unknown, p: number) => (p === 10 ? true : ctx.elapsed),
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
    render: (o: THREE.Object3D) => void calls.push(o instanceof THREE.Scene ? 'render' : 'quad'),
    // What the post stack's passes touch (G5).
    extensions: { has: () => true },
    outputColorSpace: THREE.SRGBColorSpace,
    getClearColor: (c: THREE.Color) => c,
    getClearAlpha: () => 1,
    setClearColor: () => undefined,
    clear: () => undefined,
    compile: (scene: THREE.Scene) => {
      calls.push(`compile ${scene.name} into ${renderTarget === null ? 'the canvas' : (renderTarget as { name: string }).name} with ${scene.environment ? 'the environment' : 'none'}`);
      return new Set();
    },
  };
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  vi.spyOn(Renderer.prototype as unknown as { makeWebGL: () => unknown }, 'makeWebGL').mockReturnValue(gl);
  const r = new Renderer({ appendChild: () => undefined, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement, quality);
  r.scene.name = 'world';
  // The prefiltered sky, as the sheen hands it over (no PMREM without WebGL).
  const environment = new THREE.Texture();
  const fields = r as unknown as Record<string, unknown>;
  fields.sheen = { texture: () => environment, forget: () => undefined, dispose: () => undefined, trim: () => undefined };
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

/** The stand-in WebGLRenderer behind a stubbed Renderer, to watch what it is told. */
const glOf = (r: Renderer) => (r as unknown as { gl: { setRenderTarget: (t: unknown) => void; compile: (...a: unknown[]) => unknown } }).gl;

describe('the shader warm-up into the target the frame draws to (M63, audit REN-06, QA)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('with the retro filter on, compiles the world and the held replica into its target, then frames compile nothing and the canvas is the target again', () => {
    const { r, calls, useRetro, target } = stubbedRenderer();
    useRetro();
    const targets = vi.spyOn(glOf(r), 'setRenderTarget');
    const overlay = { scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() };
    r.warmShaders(overlay);
    expect(calls).toEqual(['compile world into retro target with the environment', 'compile replica into retro target with none']);
    // Into the retro target for both compiles, then straight back to the canvas.
    expect(targets.mock.calls.map(([t]) => (t === null ? 'canvas' : 'retro'))).toEqual(['retro', 'canvas']);
    expect(target()).toBeNull();
    for (let frame = 0; frame < 3; frame++) r.render(overlay);
    expect(calls.slice(2).every((c) => c === 'render')).toBe(true);
    expect(target()).toBeNull();
  });

  it('with the retro filter off, never moves the render target off the canvas', () => {
    const { r, calls } = stubbedRenderer();
    const targets = vi.spyOn(glOf(r), 'setRenderTarget');
    r.warmShaders({ scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() });
    expect(calls).toEqual(['compile world into the canvas with the environment', 'compile replica into the canvas with none']);
    expect(targets).not.toHaveBeenCalled();
  });
});

/**
 * Where the warm-up is called from (M63, audit REN-06): MatchSession needs a page to build (its HUD), so this reads the
 * sources. One call in the whole game, at the end of MatchSession's constructor after the last thing it adds to the
 * scene; no frame path, and not the range, calls it; and nothing but the warm-up compiles.
 */
describe('the shader warm-up runs once per match build, never per frame (M63, audit REN-06, QA)', () => {
  const sources = import.meta.glob<string>(['/src/**/*.ts', '!/src/**/*.test.ts', '!/src/**/testSupport.ts', '!/src/**/*Support.ts', '!/src/**/*.d.ts'], { query: '?raw', import: 'default', eager: true });
  /** The body of the block opened by the first `{` at or after `from` (braces balanced). */
  const block = (text: string, from: number): string => {
    const open = text.indexOf('{', from);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1);
    }
    throw new Error('unbalanced');
  };
  // The signature ends its line with `{`: the body is that block.
  const bodyOf = (text: string, head: string): string => {
    const at = text.indexOf(head);
    expect(at, head).toBeGreaterThanOrEqual(0);
    return block(text, text.indexOf('{\n', at));
  };

  it('is called once in the game, from MatchSession’s constructor, after the scene is whole', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    const callers = Object.entries(sources).flatMap(([file, text]) => [...text.matchAll(/\.warmShaders\(/g)].map(() => file));
    // CombatPresentation.warmShaders hands over to Renderer.warmShaders: that and MatchSession's are the two calls.
    expect(callers.sort()).toEqual(['/src/matchSession.ts', '/src/render/combatPresentation.ts']);
    const ctor = bodyOf(sources['/src/matchSession.ts']!, '  constructor(');
    const call = ctor.indexOf('this.combat.warmShaders()');
    expect(call).toBeGreaterThan(0);
    expect(ctor.split('warmShaders(').length - 1).toBe(1);
    // Everything the session draws is in the scene by then.
    for (const built of ['this.combat = new CombatPresentation', 'this.match = new MatchPresentation', 'renderer.scene.add(this.contact.object)', 'renderer.scene.add(this.torches.object)']) {
      expect(ctor.indexOf(built), built).toBeGreaterThan(0);
      expect(ctor.indexOf(built), built).toBeLessThan(call);
    }
    expect(ctor.slice(call)).not.toMatch(/scene\.add\(/);
    // CombatPresentation's hand-over is its own method, not its frame.
    const combat = sources['/src/render/combatPresentation.ts']!;
    expect(bodyOf(combat, '  render(firstPerson')).not.toMatch(/warmShaders|compile/);
    expect(bodyOf(combat, '  warmShaders(')).toMatch(/this\.renderer\.warmShaders\(this\.overlay\)/);
    expect(sources['/src/rangeSession.ts']).not.toMatch(/warmShaders|compile\(/);
  });

  it('compiles nowhere but in Renderer.warmShaders: not in Renderer.render, nor anywhere else', () => {
    const compiles = Object.entries(sources).flatMap(([file, text]) => [...text.matchAll(/\.compile(Async)?\(/g)].map(() => file));
    // W1: the node renderer's compile (render/webgpu/nodeBackend.ts, its two compileAsync calls) is reached from
    // warmShaders alone, as WebGL's two are.
    expect(compiles).toEqual(['/src/render/renderer.ts', '/src/render/renderer.ts', '/src/render/renderer.ts', '/src/render/webgpu/nodeBackend.ts', '/src/render/webgpu/nodeBackend.ts']);
    const renderer = sources['/src/render/renderer.ts']!;
    expect(bodyOf(renderer, '  warmShaders(').split('.compile(').length - 1).toBe(3);
    expect(bodyOf(renderer, '  warmShaders(')).toMatch(/this\.node\.compile\(this\.scene, this\.camera, overlay\)/);
    expect(bodyOf(sources['/src/render/webgpu/nodeBackend.ts']!, '  compile(').split('.compileAsync(').length - 1).toBe(2);
    expect(bodyOf(renderer, '  render(overlay')).not.toMatch(/compile|warmShaders/);
  });
});

describe('the GPU timer across a lost context: forgotten, never deleted (M63, audit REN-07, QA)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('deletes no query of the lost context, times the restored one with its own query, and later deletes only that one', () => {
    const { r, ctx, lose, restore } = stubbedRenderer();
    r.gpuTiming = true;
    r.render();
    r.render();
    expect(r.gpuMs).toBe(2);
    lose();
    // No frame while the context is gone: the restore alone must leave the old query behind.
    restore();
    expect(ctx.deleted).toEqual([]);
    const before = ctx.begunOn.length;
    ctx.elapsed = 5_000_000;
    for (let frame = 0; frame < 3; frame++) r.render();
    expect(ctx.queriesMade).toBe(2);
    expect(ctx.begunOn.slice(before)).not.toContain(1);
    expect(ctx.deadBegins).toBe(0);
    // The restored context's own reading, not the lost timer's last one.
    expect(r.gpuMs).toBe(5);
    // Timing off afterwards frees the live query only.
    r.gpuTiming = false;
    r.render();
    expect(ctx.deleted).toEqual([{ id: 2, whileLost: false, stale: false }]);
    expect(r.gpuMs).toBeNaN();
  });

  it('turning GPU timing off while the context is lost deletes nothing, and turning it on after the restore times again', () => {
    const { r, ctx, lose, restore } = stubbedRenderer();
    r.gpuTiming = true;
    r.render();
    lose();
    r.gpuTiming = false;
    r.render();
    expect(ctx.deleted).toEqual([]);
    restore();
    r.gpuTiming = true;
    r.render();
    r.render();
    expect(ctx.deleted).toEqual([]);
    expect(ctx.queriesMade).toBe(2);
    expect(ctx.deadBegins).toBe(0);
    expect(r.gpuMs).toBe(2);
  });

  it('survives losing the context twice with frames drawn while it is gone: one new query per restored context', () => {
    const { r, ctx, lose, restore } = stubbedRenderer();
    r.gpuTiming = true;
    r.render();
    for (let loss = 1; loss <= 2; loss++) {
      lose();
      r.render();
      restore();
      r.render();
      r.render();
      expect(ctx.queriesMade, `loss ${loss}`).toBe(loss + 1);
      expect(ctx.begunOn.at(-1), `loss ${loss}`).toBe(loss + 1);
      expect(r.gpuMs, `loss ${loss}`).toBe(2);
    }
    expect(ctx.deadBegins).toBe(0);
    expect(ctx.deleted.filter((d) => d.whileLost || d.stale)).toEqual([]);
  });
});

/** The renderer's post stack (G5), or null. */
const postOf = (r: Renderer) => (r as unknown as { post: PostHost }).post.current;

describe('the post stack on the renderer (G5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Where each scene drawn went: the post stack's target, a pass's target, or the canvas. */
  function drawsOf(r: Renderer): string[] {
    const gl = glOf(r) as unknown as { render: (o: THREE.Object3D) => void; setRenderTarget: (t: unknown) => void };
    const log: string[] = [];
    let target: unknown = null;
    const set = gl.setRenderTarget;
    gl.setRenderTarget = (t) => {
      target = t;
      set(t);
    };
    gl.render = (o) => {
      if (!(o instanceof THREE.Scene)) return;
      const post = postOf(r);
      log.push(`${o.name || 'scene'} → ${target === null ? 'canvas' : target === post?.sceneTarget ? 'post' : 'other'}`);
    };
    return log;
  }

  it('builds no post stack on Low: the world and the held replica go straight to the canvas, as before', () => {
    const { r } = stubbedRenderer(QUALITY.low);
    const log = drawsOf(r);
    const overlay = { scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() };
    const built = vi.spyOn(PostStack.prototype, 'render');
    r.render(overlay);
    r.render(overlay);
    expect(postOf(r)).toBeNull();
    expect(r.postPasses).toEqual([]);
    expect(built).not.toHaveBeenCalled();
    expect(log).toEqual(['world → canvas', 'replica → canvas', 'world → canvas', 'replica → canvas']);
  });

  it('draws the world through the stack on High and the held replica on the canvas after it, never through the blend', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    const log = drawsOf(r);
    r.render({ scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() });
    expect(r.postPasses).toEqual(['ao', 'lightShafts', 'taa', 'bloom', 'output']);
    expect(log).toEqual(['world → post', 'replica → canvas']);
    // At the drawing buffer's size (the stub's 1280 × 720 at pixel ratio 1).
    expect([postOf(r)!.sceneTarget.width, postOf(r)!.sceneTarget.height]).toEqual([1280, 720]);
  });

  it('compiles the world for the stack’s target and the held replica for the canvas', () => {
    const { r, calls } = stubbedRenderer(QUALITY.high);
    const gl = glOf(r) as unknown as { setRenderTarget: (t: unknown) => void };
    const set = gl.setRenderTarget;
    gl.setRenderTarget = (t) => set(t === null ? null : Object.assign(t as object, { name: 'the post target' }));
    r.warmShaders({ scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() });
    expect(calls).toEqual(['compile world into the post target with the environment', 'compile replica into the canvas with none']);
  });

  it('disposes the stack on a quality change and builds the new one on the next frame', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    r.render();
    const first = postOf(r)!;
    const dispose = vi.spyOn(first, 'dispose');
    r.setQuality(QUALITY.ultra);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(postOf(r)).toBeNull();
    r.render();
    expect(r.postPasses).toEqual(['ao', 'reflections', 'lightShafts', 'taa', 'bloom', 'output', 'lens']);
    // Down to Low: freed, and nothing made again.
    const second = postOf(r)!;
    const dispose2 = vi.spyOn(second, 'dispose');
    r.setQuality({ ...QUALITY.low, antialias: true });
    r.render();
    expect(dispose2).toHaveBeenCalledTimes(1);
    expect(postOf(r)).toBeNull();
  });

  it('frees the stack when the context is lost, draws plain while it is gone, and builds a new one once it is back', () => {
    const { r, lose, restore } = stubbedRenderer(QUALITY.high);
    const log = drawsOf(r);
    r.render();
    const first = postOf(r)!;
    const dispose = vi.spyOn(first, 'dispose');
    lose();
    expect(dispose).toHaveBeenCalledTimes(1);
    r.render();
    expect(postOf(r)).toBeNull();
    restore();
    r.render();
    expect(postOf(r)).not.toBeNull();
    expect(postOf(r)).not.toBe(first);
    expect(log).toEqual(['world → post', 'world → canvas', 'world → post']);
  });

  it('resizes the stack with the window and the render scale', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    r.render();
    const gl = glOf(r) as unknown as { getPixelRatio: () => number };
    gl.getPixelRatio = () => 0.75;
    (r as unknown as { resize: () => void }).resize();
    expect([postOf(r)!.sceneTarget.width, postOf(r)!.sceneTarget.height]).toEqual([960, 540]);
  });

  it('hands the stack the scene’s reflective meshes after a build, and looks again only after the next', () => {
    const { r } = stubbedRenderer(QUALITY.ultra);
    const glass = Object.assign(new THREE.Mesh(new THREE.BoxGeometry()), { name: 'map-glass' });
    r.scene.add(glass);
    r.render();
    const surfaces = vi.spyOn(postOf(r)!, 'setReflectiveSurfaces');
    r.render();
    expect(surfaces).not.toHaveBeenCalled();
    r.warmShaders();
    r.render();
    expect(surfaces).toHaveBeenCalledTimes(1);
    expect(surfaces.mock.calls[0]![0].map((s) => s.mesh)).toEqual([glass]);
  });

  it('lets go of the last map’s glass when the next session sets its light, with no shader warm-up between (the range)', () => {
    const { r } = stubbedRenderer(QUALITY.ultra);
    const glass = Object.assign(new THREE.Mesh(new THREE.BoxGeometry()), { name: 'map-glass' });
    r.scene.add(glass);
    r.render();
    const reflection = (postOf(r) as unknown as { reflection: { mask: THREE.WebGLRenderTarget | null; proxies: unknown[] } }).reflection;
    expect(reflection.proxies).toHaveLength(1);
    // The range takes its map and sets its light (rangeSession.ts); it never warms the shaders.
    r.scene.remove(glass);
    r.setLighting(LIGHTING_PRESETS.day);
    r.render();
    expect(reflection.proxies).toHaveLength(0);
    expect(reflection.mask).toBeNull();
  });

  it('gives way to the retro filter while it is on', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    r.render();
    const dispose = vi.spyOn(postOf(r)!, 'dispose');
    (r as unknown as { makeRetro: () => unknown }).makeRetro = () => ({ renderTarget: {}, present: () => undefined, resize: () => undefined, setLook: () => undefined, dispose: () => undefined });
    r.setRetro({ pixelSize: 3, levels: 8 } as unknown as Parameters<Renderer['setRetro']>[0]);
    r.render();
    expect(dispose).toHaveBeenCalled();
    expect(postOf(r)).toBeNull();
  });
});

// ---- G5 QA: the post stack's lifecycle across every teardown path, Low's plain draw, the jitter and the sizes. ----

/** Every object of `kind` reachable from `root` through own properties and arrays (the stack's targets and materials). */
function reachableOf<T>(root: unknown, kind: abstract new (...a: never[]) => T): Set<T> {
  const found = new Set<T>();
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 6 || v instanceof THREE.Object3D) return;
    seen.add(v);
    if (v instanceof kind) found.add(v as T);
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child, depth + 1);
  };
  walk(root, 0);
  return found;
}

/** What a post stack holds on the GPU: render targets, materials (the reflection stand-ins included) and textures. */
function holdings(stack: PostStack) {
  const materials = reachableOf(stack, THREE.Material) as Set<THREE.Material>;
  const reflection = (stack as unknown as { reflection: { proxies: { mesh: THREE.Mesh }[] } | null }).reflection;
  for (const p of reflection?.proxies ?? []) materials.add(p.mesh.material as THREE.Material);
  return {
    targets: reachableOf(stack, THREE.WebGLRenderTarget) as Set<THREE.WebGLRenderTarget>,
    materials,
    textures: new Set<THREE.Texture>([...reachableOf(stack, THREE.DataTexture), ...reachableOf(stack, THREE.DepthTexture)]),
  };
}

/**
 * Records what each PostStack held at the moment it was disposed, and every target, material and texture freed since
 * (stand-ins for the GPU's own bookkeeping: Three frees a target's textures with the target).
 */
function watchDisposals() {
  const disposed: ReturnType<typeof holdings>[] = [];
  const freed = { targets: new Set<unknown>(), materials: new Set<unknown>(), textures: new Set<unknown>() };
  const dispose = PostStack.prototype.dispose;
  vi.spyOn(PostStack.prototype, 'dispose').mockImplementation(function (this: PostStack) {
    disposed.push(holdings(this));
    dispose.call(this);
  });
  vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose').mockImplementation(function (this: unknown) {
    freed.targets.add(this);
  });
  vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (this: unknown) {
    freed.materials.add(this);
  });
  vi.spyOn(THREE.Texture.prototype, 'dispose').mockImplementation(function (this: unknown) {
    freed.textures.add(this);
  });
  /** Everything every disposed stack held is freed: names what was left. */
  const leftover = (): string[] => {
    const left: string[] = [];
    disposed.forEach((h, i) => {
      for (const t of h.targets) if (!freed.targets.has(t)) left.push(`stack ${i}: a ${t.width}x${t.height} target`);
      for (const m of h.materials) if (!freed.materials.has(m)) left.push(`stack ${i}: a ${m.type}`);
      for (const t of h.textures) if (!freed.textures.has(t)) left.push(`stack ${i}: a ${t.type} texture`);
    });
    return left;
  };
  return { disposed, leftover };
}

/** A stubbed renderer whose pixel ratio follows setPixelRatio, with a pane of the map's glass in the scene. */
function postRenderer(quality: QualitySettings) {
  const s = stubbedRenderer(quality);
  const gl = glOf(s.r) as unknown as { getPixelRatio: () => number; setPixelRatio: (v: number) => void };
  let ratio = 1;
  gl.getPixelRatio = () => ratio;
  gl.setPixelRatio = (v) => void (ratio = v);
  s.r.scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry()), { name: 'map-glass' }));
  allowContextSwaps(s.r);
  return s;
}

/**
 * Lets the renderer swap its context the way the game does for antialiasing: each new context is a stub like the first
 * (a fresh canvas that takes the old one's place), made from the one in use.
 */
function allowContextSwaps(r: Renderer): void {
  const withHandOver = (gl: Record<string, unknown>) =>
    Object.assign(gl, {
      properties: { get: () => undefined },
      dispose: () => undefined,
      forceContextLoss: () => undefined,
      domElement: Object.assign(gl.domElement as object, { replaceWith: () => undefined, remove: () => undefined }),
    });
  withHandOver(glOf(r) as unknown as Record<string, unknown>);
  (Renderer.prototype as unknown as { makeWebGL: { mockImplementation: (f: () => unknown) => void } }).makeWebGL.mockImplementation(() =>
    withHandOver({ ...(glOf(r) as unknown as Record<string, unknown>), domElement: new EventTarget() }),
  );
}

describe('every post target, material and texture is freed on each teardown path (G5 QA)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const paths: Record<string, { run: (s: ReturnType<typeof postRenderer>) => void; after: (s: ReturnType<typeof postRenderer>) => void }> = {
    'a quality change': { run: (s) => void s.r.setQuality({ ...QUALITY.ultra, shadows: false }), after: () => undefined },
    'a lost context': { run: (s) => s.lose(), after: (s) => s.restore() },
    'the antialiasing swap': {
      run: (s) => {
        expect(s.r.setQuality({ ...QUALITY.ultra, antialias: false })).toBe(true);
      },
      after: () => undefined,
    },
    'the retro filter': {
      run: (s) => {
        (s.r as unknown as { makeRetro: () => unknown }).makeRetro = () => ({ renderTarget: {}, present: () => undefined, resize: () => undefined, setLook: () => undefined, dispose: () => undefined });
        s.r.setRetro({ pixelSize: 3, levels: 8 } as unknown as Parameters<Renderer['setRetro']>[0]);
      },
      after: (s) => s.r.setRetro(null),
    },
  };

  it('builds the stack again when antialiasing is swapped while the context is lost (the old restore never comes)', () => {
    const s = postRenderer(QUALITY.high);
    s.r.render();
    expect(postOf(s.r)).not.toBeNull();
    s.lose();
    expect(s.r.setQuality({ ...QUALITY.high, antialias: false })).toBe(true);
    s.r.render();
    expect(postOf(s.r), 'post effects come back on the new context').not.toBeNull();
  });

  for (const [name, path] of Object.entries(paths)) {
    it(`frees all of Ultra's stack, the reflection mask too, on ${name}, and makes the whole stack again after`, () => {
      const s = postRenderer(QUALITY.ultra);
      const watch = watchDisposals();
      s.r.render();
      const first = postOf(s.r)!;
      const before = holdings(first);
      expect(before.targets.size).toBeGreaterThan(8);
      expect(before.textures.size).toBeGreaterThan(0);
      expect((first as unknown as { reflection: { mask: unknown } }).reflection.mask, 'a mask for the glass').not.toBeNull();
      path.run(s);
      expect(watch.disposed, `${name}: the stack disposed once`).toHaveLength(1);
      expect(watch.disposed[0]!.targets).toEqual(before.targets);
      expect(watch.leftover()).toEqual([]);
      expect(postOf(s.r)).toBeNull();
      path.after(s);
      s.r.render();
      const second = postOf(s.r)!;
      expect(second).not.toBe(first);
      expect(s.r.postPasses).toEqual(['ao', 'reflections', 'lightShafts', 'taa', 'bloom', 'output', 'lens']);
      expect(holdings(second).targets.size).toBeGreaterThan(8);
    });
  }

  it('leaks nothing over repeated toggles of the preset, the retro filter and the context', () => {
    const s = postRenderer(QUALITY.ultra);
    const watch = watchDisposals();
    const seen = new Set<PostStack>();
    const frame = () => {
      s.r.render();
      const p = postOf(s.r);
      if (p) seen.add(p);
    };
    const retro = () => ({ renderTarget: {}, present: () => undefined, resize: () => undefined, setLook: () => undefined, dispose: () => undefined });
    (s.r as unknown as { makeRetro: () => unknown }).makeRetro = retro;
    frame();
    for (let i = 0; i < 4; i++) {
      for (const q of [QUALITY.high, QUALITY.ultra, QUALITY.medium, QUALITY.low, QUALITY.ultra]) {
        s.r.setQuality(q);
        frame();
      }
      s.lose();
      frame();
      s.restore();
      frame();
      s.r.setRetro({ pixelSize: 2, levels: 4 } as unknown as Parameters<Renderer['setRetro']>[0]);
      frame();
      s.r.setRetro(null);
      frame();
    }
    // Each stack made was disposed but the one in force.
    const live = postOf(s.r)!;
    expect(seen.size).toBeGreaterThanOrEqual(20);
    expect(watch.disposed).toHaveLength(seen.size - 1);
    expect(seen.has(live)).toBe(true);
    expect(watch.leftover()).toEqual([]);
    // The renderer's own disposal frees the last.
    const gl = glOf(s.r) as unknown as Record<string, unknown>;
    Object.assign(gl, { dispose: () => undefined, forceContextLoss: () => undefined });
    (gl.domElement as { remove?: () => void }).remove = () => undefined;
    s.r.dispose();
    expect(watch.disposed).toHaveLength(seen.size);
    expect(watch.leftover()).toEqual([]);
  });
});

describe('the held replica across an edge-smoothing swap (BP2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** An overlay scene (the held replica) whose geometry tells whether it was released. */
  function heldReplica() {
    const geometry = new THREE.BoxGeometry();
    const released = vi.spyOn(geometry, 'dispose');
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    return { overlay: { scene, camera: new THREE.PerspectiveCamera() }, released };
  }

  it('releases the held replica on a swap made while spectating (no overlay drawn that frame)', () => {
    const s = postRenderer(QUALITY.medium);
    const { overlay, released } = heldReplica();
    s.r.render(overlay);
    s.r.render();
    expect(s.r.setQuality({ ...QUALITY.medium, antialias: false })).toBe(true);
    expect(released).toHaveBeenCalled();
  });

  it('keeps nothing of a match that is over: a scene it let go of is not released again on a later swap', () => {
    const s = postRenderer(QUALITY.medium);
    const { overlay, released } = heldReplica();
    s.r.render(overlay);
    s.r.forgetOverlay(overlay.scene);
    expect(s.r.setQuality({ ...QUALITY.medium, antialias: false })).toBe(true);
    expect(released).not.toHaveBeenCalled();
  });
});

describe('Low draws exactly as before the post stack (G5 QA)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Every call the renderer makes on the stub, as text: the scene drawn, the targets set, the quads drawn. */
  function trace(r: Renderer): string[] {
    const gl = glOf(r) as unknown as { render: (o: THREE.Object3D, c: THREE.Camera) => void; setRenderTarget: (t: unknown) => void; compile: (...a: unknown[]) => unknown };
    const log: string[] = [];
    const render = gl.render;
    gl.render = (o, c) => {
      log.push(o instanceof THREE.Scene ? `scene ${o.name}` : 'quad');
      render(o, c);
    };
    const set = gl.setRenderTarget;
    gl.setRenderTarget = (t) => {
      log.push(t === null ? 'target canvas' : 'target OFFSCREEN');
      set(t);
    };
    return log;
  }

  it('sets no render target, draws no quad and holds no stack, frame after frame, with the held replica after the world', () => {
    const { r } = stubbedRenderer(QUALITY.low);
    const log = trace(r);
    const overlay = { scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() };
    for (let i = 0; i < 3; i++) r.render(overlay);
    expect(log).toEqual(Array.from({ length: 3 }, () => ['scene world', 'scene replica']).flat());
    expect(log.some((l) => l.includes('OFFSCREEN') || l === 'quad')).toBe(false);
    expect(postOf(r)).toBeNull();
    expect(r.postPasses).toEqual([]);
  });

  it('is drawn the same by a renderer that was on Ultra and came down, as by one that always was Low', () => {
    const fresh = stubbedRenderer(QUALITY.low);
    const freshLog = trace(fresh.r);
    fresh.r.render();
    fresh.r.render();
    const down = postRenderer(QUALITY.ultra);
    down.r.render();
    down.r.render();
    down.r.setQuality(QUALITY.low);
    const downLog = trace(down.r);
    down.r.render();
    down.r.render();
    expect(postOf(down.r)).toBeNull();
    // The comparison is of what each draws: one scene a frame, onto the canvas, nothing else.
    expect(downLog.filter((l) => l !== 'target canvas')).toEqual(freshLog.filter((l) => l !== 'target canvas'));
    expect(downLog.some((l) => l.includes('OFFSCREEN'))).toBe(false);
    // Low with only a lens finish asked for would build a stack (output and lens): a post effect on is not Low's plain draw.
    const lens = stubbedRenderer({ ...QUALITY.low, lensFinish: true });
    lens.r.render();
    expect(lens.r.postPasses).toEqual(['output', 'lens']);
  });

  it('compiles the world for the canvas, as before', () => {
    const { r, calls } = stubbedRenderer(QUALITY.low);
    r.warmShaders({ scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() });
    expect(calls).toEqual(['compile world into the canvas with the environment', 'compile replica into the canvas with none']);
    expect(postOf(r)).toBeNull();
  });
});

describe('the temporal jitter goes with TAA on the renderer (G5 QA)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** The main camera's projection each time a scene is drawn through it. */
  function sceneProjections(r: Renderer): number[][] {
    const gl = glOf(r) as unknown as { render: (o: THREE.Object3D, c: THREE.Camera) => void };
    const seen: number[][] = [];
    const render = gl.render;
    gl.render = (o, c) => {
      if (o instanceof THREE.Scene && c === r.camera) seen.push([...r.camera.projectionMatrix.elements]);
      render(o, c);
    };
    return seen;
  }

  it('jitters the world on High, restores the camera, and draws it unjittered once TAA is off', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    allowContextSwaps(r);
    const plain = [...r.camera.projectionMatrix.elements];
    const seen = sceneProjections(r);
    r.render();
    r.render();
    expect(seen[0]).not.toEqual(plain);
    expect(seen[1]).not.toEqual(seen[0]);
    expect([...r.camera.projectionMatrix.elements]).toEqual(plain);
    // TAA off, bloom still on (Medium): the plain projection, frame after frame.
    r.setQuality({ ...QUALITY.high, temporalAA: false });
    r.render();
    r.render();
    expect(seen[2]).toEqual(plain);
    expect(seen[3]).toEqual(plain);
    // Low too, and the inverse is the plain one's.
    r.setQuality(QUALITY.low);
    r.render();
    expect(seen[4]).toEqual(plain);
    const inverse = r.camera.projectionMatrixInverse.clone().multiply(r.camera.projectionMatrix);
    inverse.elements.forEach((v, i) => expect(v).toBeCloseTo(i % 5 === 0 ? 1 : 0, 9));
  });

  it('jitters again from a fresh sequence after TAA comes back, and reads a zoom change through the jitter', () => {
    const { r } = stubbedRenderer(QUALITY.medium);
    const seen = sceneProjections(r);
    r.render();
    const plain = [...r.camera.projectionMatrix.elements];
    expect(seen[0]).toEqual(plain);
    r.setQuality({ ...QUALITY.medium, temporalAA: true, antialias: true });
    r.render();
    expect(seen[1]).not.toEqual(plain);
    // Zoomed (aiming down an optic): the jitter rides on the zoomed projection, and the zoomed one is what is put back.
    r.setZoom(2);
    const zoomed = [...r.camera.projectionMatrix.elements];
    r.render();
    expect(seen[2]![0]).toBeCloseTo(zoomed[0]!, 9);
    expect(seen[2]).not.toEqual(zoomed);
    expect([...r.camera.projectionMatrix.elements]).toEqual(zoomed);
  });
});

describe('the retro filter off brings the post stack back (G5 QA)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws the world through the stack, then onto the retro target while it is on, then through a new stack after', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    const gl = glOf(r) as unknown as { render: (o: THREE.Object3D) => void };
    const into: string[] = [];
    let target: unknown = null;
    const set = (glOf(r) as unknown as { setRenderTarget: (t: unknown) => void }).setRenderTarget;
    (glOf(r) as unknown as { setRenderTarget: (t: unknown) => void }).setRenderTarget = (t) => {
      target = t;
      set(t);
    };
    const retroTarget = { name: 'retro' };
    gl.render = (o) => {
      if (!(o instanceof THREE.Scene)) return;
      into.push(target === null ? 'canvas' : target === retroTarget ? 'retro' : target === postOf(r)?.sceneTarget ? 'post' : 'other');
    };
    (r as unknown as { makeRetro: () => unknown }).makeRetro = () => ({ renderTarget: retroTarget, present: () => undefined, resize: () => undefined, setLook: () => undefined, dispose: () => undefined });
    r.render();
    const first = postOf(r)!;
    r.setRetro({ pixelSize: 3, levels: 8 } as unknown as Parameters<Renderer['setRetro']>[0]);
    r.render();
    expect(postOf(r)).toBeNull();
    expect(r.postPasses).toEqual([]);
    r.setRetro(null);
    r.render();
    expect(into).toEqual(['post', 'retro', 'post']);
    expect(postOf(r)).not.toBe(first);
    expect(r.postPasses).toEqual(['ao', 'lightShafts', 'taa', 'bloom', 'output']);
  });
});

describe('the post stack follows the window and the render scale (G5 QA)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** The sizes of every target in the stack, as `WxH` text. */
  const sizesOf = (r: Renderer): Set<string> => new Set([...holdings(postOf(r)!).targets].map((t) => `${t.width}x${t.height}`));
  /** The sizes a stack at `w` x `h` may hold: the buffer's, and its halves (the light shafts', bloom's mip chain). */
  const halves = (w: number, h: number): string[] => {
    const out: string[] = [];
    for (let k = 0; k < 8; k++, w = Math.round(w / 2), h = Math.round(h / 2)) out.push(`${w}x${h}`);
    return out;
  };
  const within = (r: Renderer, w: number, h: number): void => {
    const allowed = halves(w, h);
    expect(sizesOf(r)).toContain(`${w}x${h}`);
    for (const size of sizesOf(r)) expect(allowed, `a target left at ${size}`).toContain(size);
  };

  it('sizes the stack to the window times the pixel ratio and render scale, at its first frame and after every change', () => {
    const { r } = postRenderer(QUALITY.ultra);
    const container = (r as unknown as { container: { clientWidth: number; clientHeight: number } }).container;
    const resize = () => (r as unknown as { resize: () => void }).resize();
    resize();
    r.render();
    expect([postOf(r)!.sceneTarget.width, postOf(r)!.sceneTarget.height]).toEqual([1280, 720]);
    // A high-DPI screen (the window moved to another monitor): twice the pixels, Ultra's cap is 2.
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 2, innerWidth: 1280, innerHeight: 720 });
    resize();
    within(r, 2560, 1440);
    expect(postOf(r)!.sceneTarget.width).toBe(2560);
    // A smaller window.
    container.clientWidth = 800;
    container.clientHeight = 450;
    resize();
    within(r, 1600, 900);
    expect([postOf(r)!.sceneTarget.width, postOf(r)!.sceneTarget.height]).toEqual([1600, 900]);
    // Render scale 0.75 (a new quality: a new stack, made at the size in force).
    r.setQuality({ ...QUALITY.ultra, renderScale: 0.75 });
    r.render();
    within(r, 1200, 675);
    expect([postOf(r)!.sceneTarget.width, postOf(r)!.sceneTarget.height]).toEqual([1200, 675]);
    // The window grows again, the stack as it is.
    container.clientWidth = 1920;
    container.clientHeight = 1080;
    const before = postOf(r);
    resize();
    expect(postOf(r)).toBe(before);
    within(r, 2880, 1620);
  });
});
