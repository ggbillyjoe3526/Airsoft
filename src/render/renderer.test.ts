import * as THREE from 'three';
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATMOSPHERE, LIGHTING_PRESETS, QUALITY, type QualitySettings, type RetroLook, TONE_MAPPING } from '../config/render';
import { DEPOT } from '../map/depot';
import { RANGE_MAP } from '../map/range';
import { WOODLAND } from '../map/woodland';
import { resolveLighting } from './lightingPreset';
import type { RenderBackend } from '../config/renderBackend';
import { PostHost } from './post/postHost';
import type { PostSetup } from './post/postStack';
import { handOverRenderer, releaseGpuResources, Renderer, toneMappingOf, verticalFovFor, warmSurfacesInIdle, zoomedFov } from './renderer';
import { defaultEnvironmentLook, type EnvironmentLook, environmentKey } from './replicaSheen';

import type { NodeBackend } from './webgpu/nodeBackend';
import type { NodeRenderer } from './webgpu/post/nodeKit';
import { DirectOutput } from './webgpu/post/nodeOutput';
import { NodePostStack } from './webgpu/post/nodePostStack';
import { NodeRetroFilter } from './webgpu/post/nodeRetro';

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
   * A stand-in for the node renderer that keeps what Three keeps: a dispose listener (holding the renderer) on every
   * geometry, material, texture, instanced mesh and shadow map it draws, removed only when that object is disposed.
   */
  class StubRenderer {
    readonly domElement = { replaceWith: vi.fn() };
    readonly held = new Set<THREE.EventDispatcher<{ dispose: object }>>();
    disposed = false;
    dispose(): void {
      this.disposed = true;
    }
    draw(roots: THREE.Object3D[]): void {
      for (const root of roots) {
        root.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) this.hold(o);
          const { geometry, material } = o as Partial<THREE.Mesh>;
          if (geometry) this.hold(geometry);
          for (const m of material ? [material].flat() : []) {
            this.hold(m);
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) this.hold(v);
            for (const u of Object.values((m as Partial<THREE.ShaderMaterial>).uniforms ?? {})) if (u.value instanceof THREE.Texture) this.hold(u.value);
          }
          const shadow = (o as Partial<THREE.DirectionalLight>).shadow;
          if (shadow && (o as THREE.Light).castShadow) this.hold((shadow.map ??= new THREE.RenderTarget(64, 64)));
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

  it('leaves only the renderer in use holding the scenes after repeated swaps, the old ones freed', () => {
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
    // Only the last renderer is still reachable from the scenes; every one before it is disposed.
    expect(made.filter((r) => r.held.size > 0)).toEqual([made.at(-1)]);
    for (const r of made.slice(0, -1)) {
      expect(r.disposed).toBe(true);
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
  /** A Renderer without a GPU: only what setLighting and setToneMapping touch. */
  function bareRenderer(): Renderer {
    const r = Object.create(Renderer.prototype) as Renderer;
    const fields = r as unknown as Record<string, unknown>;
    Object.assign(fields, {
      scene: new THREE.Scene(),
      gl: { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 },
      node: null,
      toneMapping: TONE_MAPPING.default,
      lighting: LIGHTING_PRESETS.day,
      environmentLook: defaultEnvironmentLook(),
      environmentDirty: false,
      post: new PostHost((setup, w, h) => new NodePostStack(setup, w, h, new DirectOutput())),
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

  it('frees the stack on a map change (W4)', () => {
    const r = bareRenderer();
    const host = (r as unknown as { post: PostHost }).post;
    const stack = host.stackFor(QUALITY.high, LIGHTING_PRESETS.day, false)!;
    const freed = vi.spyOn(stack, 'dispose');
    r.setLighting(resolveLighting(DEPOT));
    expect(freed).toHaveBeenCalledTimes(1);
    expect(host.current).toBeNull();
    // The next frame makes the new map's.
    const next = host.stackFor(QUALITY.high, LIGHTING_PRESETS.day, false);
    expect(next).not.toBe(stack);
    next?.dispose();
  });
});

/** Medium without its bloom (G5): the frame drawn straight to the canvas, as every preset drew before the post stack. */
const PLAIN = { ...QUALITY.medium, bloom: false };

type Overlay = { scene: THREE.Scene; camera: THREE.Camera };

/**
 * A stand-in for the node renderer (Node has no GPU): what the Renderer, the post stack, the retro filter and the output
 * step (render/webgpu/post) touch. A scene drawn logs `render`, a pass's full-screen quad `quad`; a compile logs the
 * scene, the target it compiles into (named by `targetName`) and whether the scene had its environment then.
 */
function stubGl(calls: string[], targetName: (target: unknown) => string) {
  let renderTarget: unknown = null;
  return {
    domElement: { className: '', replaceWith: () => undefined, remove: () => undefined },
    info: { autoReset: true, reset: () => undefined },
    shadowMap: { enabled: false, type: 0 },
    autoClear: true,
    toneMapping: THREE.NoToneMapping as THREE.ToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace as string,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    samples: 4,
    contextNode: { context: () => ({}) } as unknown,
    getPixelRatio: () => 1,
    setPixelRatio: (_ratio: number) => undefined,
    setSize: () => undefined,
    setRenderTarget: (t: unknown) => void (renderTarget = t),
    getRenderTarget: () => renderTarget,
    getClearColor: (c: THREE.Color) => c,
    getClearAlpha: () => 1,
    setClearColor: () => undefined,
    clear: () => undefined,
    clearDepth: () => undefined,
    render: (o: THREE.Object3D, _camera: THREE.Camera) => void calls.push(o instanceof THREE.Scene ? 'render' : 'quad'),
    compileAsync: (scene: THREE.Scene) => {
      calls.push(`compile ${scene.name} into ${targetName(renderTarget)} with ${scene.environment ? 'the environment' : 'none'}`);
      return Promise.resolve();
    },
  };
}
type StubGl = ReturnType<typeof stubGl>;

/** The prefiltered sky, as the node renderer hands it over (no PMREM without a GPU). */
const ENVIRONMENT_MAP = new THREE.Texture();

/**
 * A node renderer as the Renderer sees it, drawing as render/webgpu/nodeBackend.ts does: the frame through the post
 * stack or the retro filter the Renderer holds (the real ones, made here), or on Low straight onto the canvas; a
 * compile through the same. Its device can be lost (`lose`): `next` is then what replaces it.
 */
function stubNode(calls: string[], targetName: (target: unknown) => string) {
  const gl = stubGl(calls, targetName);
  const drawing = gl as unknown as NodeRenderer;
  const output = new DirectOutput();
  let lostListener: () => void = () => undefined;
  const node = {
    kind: 'webgpu' as RenderBackend,
    renderer: gl,
    lost: false,
    gpuMs: Number.NaN,
    antialiased: true,
    maxAnisotropy: 16,
    samples: 4,
    clustered: false,
    webglContext: null,
    stats: { calls: 0, triangles: 0, dressingTriangles: 0, programs: 0, geometries: 0, textures: 0 },
    next: null as unknown,
    onLost: (listener: () => void) => void (lostListener = listener),
    setTiming: () => undefined,
    frameDone: () => undefined,
    prepare: () => undefined,
    rescan: () => undefined,
    trimSky: () => undefined,
    environment: (on: boolean) => (on ? ENVIRONMENT_MAP : null),
    postStack: (setup: PostSetup, width: number, height: number) => new NodePostStack(setup, width, height, output),
    retro: (look: RetroLook) => new NodeRetroFilter(look),
    draw: (scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay: Overlay | undefined, drawer: object | null) =>
      drawer ? (drawer as NodePostStack).draw(drawing, scene, camera, overlay) : output.drawScreen(drawing, scene, camera, overlay),
    compile: (scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay: Overlay | undefined, drawer: object | null) =>
      void (drawer ? (drawer as NodePostStack).compile(drawing, scene, camera, overlay) : output.compile(drawing, scene, camera, overlay)),
    replacement: () => Promise.resolve(node.next),
    dispose: () => undefined,
    lose: () => {
      node.lost = true;
      lostListener();
    },
  };
  return node;
}

/** The renderer's post stack (G5), or null. */
const postOf = (r: Renderer) => (r as unknown as { post: PostHost }).post.current as NodePostStack | null;
/** The renderer's retro filter, or null. */
const retroOf = (r: Renderer) => (r as unknown as { retro: NodeRetroFilter | null }).retro;
/** The stand-in node renderer behind a stubbed Renderer (a new one after a lost device), to watch what it is told. */
const glOf = (r: Renderer) => r.renderer as unknown as StubGl;

/**
 * A Renderer built by its own constructor over a stand-in node renderer. `lose` loses its device; `recover` waits for
 * the next renderer (a stand-in like the first) to take its place.
 */
function stubbedRenderer(quality: QualitySettings = PLAIN) {
  const calls: string[] = [];
  let r: Renderer | null = null;
  const targetName = (t: unknown): string => {
    if (t === null) return 'the canvas';
    if (r && t === retroOf(r)?.renderTarget) return 'the retro target';
    if (r && t === postOf(r)?.sceneTarget) return 'the post target';
    if (r && t === postOf(r)?.overlayBuffer) return 'the replica target';
    return 'another target';
  };
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  let node = stubNode(calls, targetName);
  const renderer = new Renderer({ appendChild: () => undefined, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement, quality, node as unknown as NodeBackend);
  r = renderer;
  renderer.scene.name = 'world';
  return {
    r: renderer,
    calls,
    lose: () => {
      const next = stubNode(calls, targetName);
      node.next = next;
      node.lose();
      node = next;
    },
    recover: () => new Promise<void>((done) => setTimeout(done, 0)),
  };
}

const replica = (): Overlay => ({ scene: Object.assign(new THREE.Scene(), { name: 'replica' }), camera: new THREE.PerspectiveCamera() });

describe('the shader warm-up (M63, audit REN-06)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('compiles the world and the held replica once, under the environment and target the first frame draws with', () => {
    const { r, calls } = stubbedRenderer();
    const overlay = replica();
    r.warmShaders(overlay);
    // The environment is set first: a pipeline compiled without it would be compiled again on the first frame.
    expect(calls).toEqual(['compile world into the canvas with the environment', 'compile replica into the canvas with none']);
    // Frames compile nothing themselves.
    r.render(overlay);
    r.render(overlay);
    expect(calls.slice(2)).toEqual(['render', 'render', 'render', 'render']);
  });

  it('compiles into the retro filter’s target while the filter is on (tone mapping depends on the target), then gives the canvas back', () => {
    const { r, calls } = stubbedRenderer();
    r.setRetro({ pixelSize: 4, levels: 6 });
    r.warmShaders(replica());
    expect(calls).toEqual(['compile world into the retro target with the environment', 'compile replica into the retro target with none']);
    expect(glOf(r).getRenderTarget()).toBeNull();
    for (let frame = 0; frame < 3; frame++) r.render(replica());
    expect(calls.slice(2).every((c) => !c.startsWith('compile'))).toBe(true);
    expect(glOf(r).getRenderTarget()).toBeNull();
  });

  it('compiles the world for the stack’s target and warms the held replica by drawing it into its own once (BP3)', () => {
    const { r, calls } = stubbedRenderer(QUALITY.high);
    r.warmShaders(replica());
    expect(calls).toEqual(['compile world into the post target with the environment', 'render']);
  });

  it('with no post stack and the retro filter off, never moves the render target off the canvas', () => {
    const { r } = stubbedRenderer();
    const targets = vi.spyOn(glOf(r), 'setRenderTarget');
    r.warmShaders(replica());
    r.render(replica());
    expect(targets.mock.calls.every(([t]) => t === null)).toBe(true);
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
    // The node renderer's compile (render/webgpu/nodeBackend.ts) is reached from warmShaders alone (W1); it hands over
    // to the frame's own compile (W4: Low's output step, the post stack, the retro filter).
    const post = '/src/render/webgpu/post/';
    expect(compiles).toEqual([
      '/src/render/renderer.ts',
      '/src/render/webgpu/nodeBackend.ts',
      '/src/render/webgpu/nodeBackend.ts',
      `${post}nodeOutput.ts`,
      `${post}nodeOutput.ts`,
      `${post}nodePostStack.ts`,
      `${post}nodeRetro.ts`,
      `${post}nodeRetro.ts`,
    ]);
    const renderer = sources['/src/render/renderer.ts']!;
    expect(bodyOf(renderer, '  warmShaders(')).toMatch(/this\.node\.compile\(this\.scene, this\.camera, overlay, /);
    const node = sources['/src/render/webgpu/nodeBackend.ts']!;
    expect(bodyOf(node, '  compile(').split('.compile(').length - 1).toBe(2);
    expect(bodyOf(node, '  draw(')).not.toMatch(/compile/);
    const output = sources[`${post}nodeOutput.ts`]!;
    expect(bodyOf(output, '  compile(').split('.compileAsync(').length - 1).toBe(2);
    // The held replica on the stack's presets is warmed by one real draw into its target (BP3: a compile built it for
    // the renderer's own context, after an await).
    expect(bodyOf(sources[`${post}nodePostStack.ts`]!, '  compile(')).toMatch(/this\.output\.drawInto\(/);
    for (const file of ['nodePostStack.ts', 'nodeRetro.ts']) {
      const text = sources[`${post}${file}`]!;
      const signature = '(gl: NodeRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: Overlay)';
      expect(bodyOf(text, `  compile${signature}: Promise<void> {`).split('.compileAsync(').length - 1, file).toBe(file === 'nodeRetro.ts' ? 2 : 1);
      expect(bodyOf(text, `  draw${signature}: void {`), file).not.toMatch(/compile/);
    }
    expect(bodyOf(output, '  drawScreen(')).not.toMatch(/compile/);
    expect(bodyOf(output, '  drawInto(')).not.toMatch(/compile/);
    expect(bodyOf(renderer, '  render(overlay')).not.toMatch(/compile|warmShaders/);
  });
});

describe('the post stack on the renderer (G5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Where each scene drawn went: the post stack's target, the held replica's, a pass's, or the canvas. */
  function drawsOf(r: Renderer): string[] {
    const gl = glOf(r);
    const log: string[] = [];
    gl.render = (o) => {
      if (!(o instanceof THREE.Scene)) return;
      const t = gl.getRenderTarget();
      const post = postOf(r);
      log.push(`${o.name || 'scene'} → ${t === null ? 'canvas' : t === post?.sceneTarget ? 'post' : t === post?.overlayBuffer ? 'replica target' : 'other'}`);
    };
    return log;
  }

  it('builds no post stack on Low: the world and the held replica go straight to the canvas, as before', () => {
    const { r } = stubbedRenderer(QUALITY.low);
    const log = drawsOf(r);
    const overlay = replica();
    const built = vi.spyOn(NodePostStack.prototype, 'draw');
    r.render(overlay);
    r.render(overlay);
    expect(postOf(r)).toBeNull();
    expect(r.postPasses).toEqual([]);
    expect(built).not.toHaveBeenCalled();
    expect(log).toEqual(['world → canvas', 'replica → canvas', 'world → canvas', 'replica → canvas']);
  });

  it('draws the world through the stack on High and the held replica into its own target, never through the blend', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    const log = drawsOf(r);
    r.render(replica());
    expect(r.postPasses).toEqual(['ao', 'lightShafts', 'taa', 'bloom', 'output']);
    // The replica first, into the target the last pass lays on (W4), then the world through the stack.
    expect(log).toEqual(['replica → replica target', 'world → post']);
    // At the drawing buffer's size (the stub's 1280 × 720 at pixel ratio 1).
    expect([postOf(r)!.sceneTarget.width, postOf(r)!.sceneTarget.height]).toEqual([1280, 720]);
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
    r.setQuality(QUALITY.low);
    r.render();
    expect(dispose2).toHaveBeenCalledTimes(1);
    expect(postOf(r)).toBeNull();
  });

  it('draws nothing while the device is lost, then builds a new stack on the renderer that takes over', async () => {
    const s = stubbedRenderer(QUALITY.high);
    const { r } = s;
    r.render();
    const first = postOf(r)!;
    const dispose = vi.spyOn(first, 'dispose');
    s.lose();
    const drawn = s.calls.length;
    r.render();
    expect(s.calls).toHaveLength(drawn);
    await s.recover();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(postOf(r)).toBeNull();
    const log = drawsOf(r);
    r.render();
    expect(postOf(r)).not.toBeNull();
    expect(postOf(r)).not.toBe(first);
    expect(log).toEqual(['world → post']);
  });

  it('resizes the stack with the window and the render scale', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    r.render();
    glOf(r).getPixelRatio = () => 0.75;
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
    const surfaces = () => (postOf(r) as unknown as { reflection: { surfaces: number } }).reflection.surfaces;
    expect(surfaces()).toBe(1);
    // The range takes its map and sets its light (rangeSession.ts); it never warms the shaders.
    r.scene.remove(glass);
    r.setLighting(LIGHTING_PRESETS.day);
    r.render();
    expect(surfaces()).toBe(0);
  });

  it('gives way to the retro filter while it is on', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    r.render();
    const dispose = vi.spyOn(postOf(r)!, 'dispose');
    r.setRetro({ pixelSize: 3, levels: 8 });
    r.render();
    expect(dispose).toHaveBeenCalled();
    expect(postOf(r)).toBeNull();
  });

  it('makes the retro filter for the look in use at once, sized to the window, and frees it when off', () => {
    const { r } = stubbedRenderer(QUALITY.high);
    r.setRetro({ pixelSize: 5, levels: 4 });
    const retro = retroOf(r)!;
    expect(retro).toBeInstanceOf(NodeRetroFilter);
    expect(retro.renderTarget.width).toBe(Math.ceil(r.width / 5));
    r.setRetro({ pixelSize: 8, levels: 4 });
    expect(retroOf(r)).toBe(retro);
    const freed = vi.spyOn(retro, 'dispose');
    r.setRetro(null);
    expect(retroOf(r)).toBeNull();
    expect(freed).toHaveBeenCalledOnce();
  });
});

// ---- G5 QA: the post stack's lifecycle across every teardown path, Low's plain draw, the jitter and the sizes. ----

/** Every object of `kind` reachable from `root` through own properties, arrays and maps (the stack's targets and materials). */
function reachableOf<T>(root: unknown, kind: abstract new (...a: never[]) => T): Set<T> {
  const found = new Set<T>();
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 7 || v instanceof THREE.Object3D) return;
    seen.add(v);
    if (v instanceof kind) found.add(v as T);
    for (const child of Array.isArray(v) ? v : v instanceof Map ? [...v.values()] : Object.values(v)) walk(child, depth + 1);
  };
  walk(root, 0);
  return found;
}

/** What a post stack holds on the GPU: render targets, materials (the reflection stand-ins included) and textures. */
function holdings(stack: NodePostStack) {
  const materials = reachableOf(stack, THREE.Material) as Set<THREE.Material>;
  const reflection = (stack as unknown as { reflection: { proxies: { mesh: THREE.Mesh }[] } | null }).reflection;
  for (const p of reflection?.proxies ?? []) materials.add(p.mesh.material as THREE.Material);
  return {
    targets: reachableOf(stack, THREE.RenderTarget) as Set<THREE.RenderTarget>,
    materials,
    textures: new Set<THREE.Texture>([...reachableOf(stack, THREE.DataTexture), ...reachableOf(stack, THREE.DepthTexture)]),
  };
}

/**
 * Records what each stack held at the moment it was disposed, and every target, material and texture freed since
 * (stand-ins for the GPU's own bookkeeping: Three frees a target's textures with the target).
 */
function watchDisposals() {
  const disposed: ReturnType<typeof holdings>[] = [];
  const freed = { targets: new Set<unknown>(), materials: new Set<unknown>(), textures: new Set<unknown>() };
  const dispose = NodePostStack.prototype.dispose;
  vi.spyOn(NodePostStack.prototype, 'dispose').mockImplementation(function (this: NodePostStack) {
    disposed.push(holdings(this));
    dispose.call(this);
  });
  vi.spyOn(THREE.RenderTarget.prototype, 'dispose').mockImplementation(function (this: unknown) {
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

/**
 * A stubbed renderer whose pixel ratio follows setPixelRatio, with a pane of the map's glass in the scene. `follow`
 * does the same for the renderer that takes over after a lost device.
 */
function postRenderer(quality: QualitySettings) {
  const s = stubbedRenderer(quality);
  const follow = (): void => {
    const gl = glOf(s.r);
    let ratio = 1;
    gl.getPixelRatio = () => ratio;
    gl.setPixelRatio = (v: number) => void (ratio = v);
  };
  follow();
  s.r.scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry()), { name: 'map-glass' }));
  return { ...s, follow };
}

describe('every post target, material and texture is freed on each teardown path (G5 QA)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  type Stubbed = ReturnType<typeof postRenderer>;
  const paths: Record<string, { run: (s: Stubbed) => Promise<void> | void; after: (s: Stubbed) => void }> = {
    'a quality change': { run: (s) => void s.r.setQuality({ ...QUALITY.ultra, shadows: false }), after: () => undefined },
    'a lost device': {
      run: async (s) => {
        s.lose();
        await s.recover();
        s.follow();
      },
      after: () => undefined,
    },
    'the retro filter': { run: (s) => s.r.setRetro({ pixelSize: 3, levels: 8 }), after: (s) => s.r.setRetro(null) },
  };

  for (const [name, path] of Object.entries(paths)) {
    it(`frees all of Ultra's stack, the reflection mask too, on ${name}, and makes the whole stack again after`, async () => {
      const s = postRenderer(QUALITY.ultra);
      const watch = watchDisposals();
      s.r.render();
      const first = postOf(s.r)!;
      const before = holdings(first);
      expect(before.targets.size).toBeGreaterThan(8);
      expect(before.textures.size).toBeGreaterThan(0);
      expect((first as unknown as { reflection: { mask: unknown } }).reflection.mask, 'a mask for the glass').not.toBeNull();
      await path.run(s);
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

  it('leaks nothing over repeated toggles of the preset, the retro filter and the device', async () => {
    const s = postRenderer(QUALITY.ultra);
    const watch = watchDisposals();
    const seen = new Set<NodePostStack>();
    const frame = (): void => {
      s.r.render();
      const p = postOf(s.r);
      if (p) seen.add(p);
    };
    frame();
    for (let i = 0; i < 4; i++) {
      for (const q of [QUALITY.high, QUALITY.ultra, QUALITY.medium, QUALITY.low, QUALITY.ultra]) {
        s.r.setQuality(q);
        frame();
      }
      s.lose();
      frame();
      await s.recover();
      s.follow();
      frame();
      s.r.setRetro({ pixelSize: 2, levels: 4 });
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
    s.r.dispose();
    expect(watch.disposed).toHaveLength(seen.size);
    expect(watch.leftover()).toEqual([]);
  });
});

describe('the held replica across a device swap (BP2)', () => {
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

  it('releases the held replica on a swap made while spectating (no overlay drawn that frame)', async () => {
    const s = postRenderer(QUALITY.medium);
    const { overlay, released } = heldReplica();
    s.r.render(overlay);
    s.r.render();
    s.lose();
    await s.recover();
    expect(released).toHaveBeenCalled();
  });

  it('keeps nothing of a match that is over: a scene it let go of is not released again on a later swap', async () => {
    const s = postRenderer(QUALITY.medium);
    const { overlay, released } = heldReplica();
    s.r.render(overlay);
    s.r.forgetOverlay(overlay.scene);
    s.lose();
    await s.recover();
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
    const gl = glOf(r);
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

  it('sets no target but the canvas, draws no quad and holds no stack, frame after frame, with the held replica after the world', () => {
    const { r } = stubbedRenderer(QUALITY.low);
    const log = trace(r);
    const overlay = replica();
    for (let i = 0; i < 3; i++) r.render(overlay);
    expect(log).toEqual(Array.from({ length: 3 }, () => ['target canvas', 'scene world', 'scene replica']).flat());
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
    expect(downLog).toEqual(freshLog);
    expect(downLog.some((l) => l.includes('OFFSCREEN') || l === 'quad')).toBe(false);
    // Low with only a lens finish asked for would build a stack (output and lens): a post effect on is not Low's plain draw.
    const lens = stubbedRenderer({ ...QUALITY.low, lensFinish: true });
    lens.r.render();
    expect(lens.r.postPasses).toEqual(['output', 'lens']);
  });

  it('compiles the world for the canvas, as before', () => {
    const { r, calls } = stubbedRenderer(QUALITY.low);
    r.warmShaders(replica());
    // Low has no environment lighting.
    expect(calls).toEqual(['compile world into the canvas with none', 'compile replica into the canvas with none']);
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
    const gl = glOf(r);
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
    const seen = sceneProjections(r);
    r.render();
    // The stack sets the camera's clip space for the node renderer on the first frame, before the jitter goes on.
    const plain = [...r.camera.projectionMatrix.elements];
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
    const gl = glOf(r);
    const into: string[] = [];
    gl.render = (o) => {
      if (!(o instanceof THREE.Scene)) return;
      const target = gl.getRenderTarget();
      into.push(target === null ? 'canvas' : target === retroOf(r)?.renderTarget ? 'retro' : target === postOf(r)?.sceneTarget ? 'post' : 'other');
    };
    r.render();
    const first = postOf(r)!;
    r.setRetro({ pixelSize: 3, levels: 8 });
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
