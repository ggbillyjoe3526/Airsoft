import { expect, type Page } from '@playwright/test';

/**
 * What the W2 and W3 browser checks share (e2e/webgpuWorld.spec.ts, e2e/webgpuWorld.qa.spec.ts, e2e/webgpuLights.spec.ts):
 * one boot per map into a night or day match on High with the node renderer on its WebGL2 back end (`?forceWebGL`, the
 * e2e build only) or, for W3's lights, on a real WebGPU device; the in-page helpers, the twin coverage of the whole
 * scene and the read-back of a twin's per-object uniform. The pages are
 * small (VIEWPORT): every check counts changed pixels or reads values, and a small frame draws several times faster in
 * SwiftShader; each pixel threshold was checked against the counts at this size.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the in-page code reads the game's untyped debug handle. */
export type Any = any;

/**
 * The flags that give headless Chromium a real WebGPU device without a GPU (W3), on top of the project's SwiftShader
 * ones: SwiftShader's Vulkan, as pipeline/webgpuCompare.mjs WEBGPU_ARGS. Without the Vulkan ones the device is lost on
 * its first draw.
 */
export const WEBGPU_LAUNCH = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'];

/** The checks' page size. */
export const VIEWPORT = { width: 640, height: 360 };

export function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return () => errors;
}

/**
 * Starts `map` at `light` on High in the node renderer, waits for the match to draw, and installs the in-page helpers.
 * On its WebGL2 back end unless `webgpu` (W3: a real WebGPU device, in a browser launched with WEBGPU_ARGS); returns
 * what drew, or null when `webgpu` was asked for and the browser gave no device (nothing is booted then).
 */
export async function boot(page: Page, map: string, light: string, webgpu = false): Promise<string | null> {
  await page.addInitScript((text) => {
    if (sessionStorage.getItem('w2-seeded')) return;
    sessionStorage.setItem('w2-seeded', '1');
    localStorage.setItem('airsoft.settings', text);
  }, JSON.stringify({ version: 1, renderer: 'webgpu', map, mode: 'elimination', [`lighting.${map}`]: light, 'dev.enabled': true, 'dev.devContent': 'on', ruleset: 'skirmish' }));
  await page.goto(`/?nolock&seed=1&quality=high${webgpu ? '' : '&forceWebGL'}`);
  await page.waitForSelector('.menu-title-start', { timeout: 60_000 });
  const backend: string = await page.evaluate(() => (window as Any).airsoft.renderer.backend);
  if (webgpu && backend !== 'webgpu') return null;
  expect(backend).toBe(webgpu ? 'webgpu' : 'webgpu-webgl2');
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await setup.locator('.map-cards .choice-card.selected').waitFor({ timeout: 60_000 });
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 60_000 });
  await page.waitForFunction(() => (window as Any).airsoft?.state && (window as Any).airsoft.state.tick > 5, null, { timeout: 120_000 });
  // Frames are drawn: the node renderer's render() calls climb.
  const renders = () => page.evaluate(() => (window as Any).airsoft.renderer.renderer.info.render.calls as number);
  const before = await renders();
  await expect.poll(renders, { timeout: 60_000 }).toBeGreaterThan(before + 5);
  await page.evaluate(() => {
    const w = window as Any;
    const game = w.airsoft;
    const r = game.renderer;
    const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const qa = {
      sleep,
      /** The first object under the scene for which `pred` holds. */
      find(pred: (o: Any) => boolean): Any {
        let found: Any = null;
        r.scene.traverse((o: Any) => {
          if (!found && pred(o)) found = o;
        });
        return found;
      },
      /** The canvas's pixels as drawn by the last render (read in the task that rendered). */
      grab(): Uint8ClampedArray {
        const c = r.renderer.domElement as HTMLCanvasElement;
        canvas.width = c.width;
        canvas.height = c.height;
        ctx.drawImage(c, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      },
      /** How many pixels differ by more than `th` in any channel. */
      over(a: Uint8ClampedArray, b: Uint8ClampedArray, th = 1): number {
        let n = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) > th || Math.abs(a[i + 1]! - b[i + 1]!) > th || Math.abs(a[i + 2]! - b[i + 2]!) > th) n++;
        return n;
      },
      /** Renders until the node renderer has compiled what is in view (its draw count settles), then once more. */
      async settle(): Promise<void> {
        let calls = -1;
        for (let i = 0, still = 0; i < 40 && still < 3; i++) {
          r.render();
          const now = r.stats.calls;
          still = now === calls ? still + 1 : 0;
          calls = now;
          await sleep(120);
        }
        r.render();
      },
      /**
       * The game's own loop keeps running; each render first puts the camera where `aim` says (it is given a function
       * returning {from, to}), and every other render after a warm-up is kept (drawn without the post stack). Returns how many pixels changed between
       * successive kept frames (more than `th` in any channel).
       */
      async watch(aim: () => { from: Any; to: Any }, frames = 5, th = 1): Promise<number[]> {
        const original = r.render.bind(r);
        // What moves is the world's: the frames are drawn without the post stack (W4), whose temporal antialiasing
        // moves the picture by a sub-pixel step every frame by design.
        r.postStack = () => null;
        const kept: Uint8ClampedArray[] = [];
        let n = 0;
        r.render = () => {
          const { from, to } = aim();
          const cam = r.camera;
          cam.position.set(from.x, from.y, from.z);
          cam.fov = 62;
          cam.aspect = 16 / 9;
          cam.updateProjectionMatrix();
          cam.lookAt(to.x, to.y, to.z);
          cam.updateMatrixWorld();
          original();
          if (++n > 4 && n % 2 === 0 && kept.length < frames) kept.push(new Uint8ClampedArray(qa.grab()));
        };
        for (let i = 0; i < 1200 && kept.length < frames; i++) await sleep(100);
        r.render = original;
        delete r.postStack;
        return kept.slice(1).map((f, i) => qa.over(kept[i]!, f, th));
      },
      /** Figures out of the way (their motion is not what is measured). */
      hideFigures(): void {
        game.session.match.characters.object.visible = false;
      },
      points(): Any[] {
        const out: Any[] = [];
        r.scene.traverse((o: Any) => {
          if (o.isPoints) out.push(o);
        });
        return out;
      },
      /** Only the Points named `name` (all of them with null) are shown; the rest are hidden. Returns the earlier states. */
      showOnly(name: string | null): () => void {
        const saved = qa.points().map((p: Any) => [p, p.visible] as const);
        for (const [p] of saved) p.visible = name !== null && p.name === name;
        return () => saved.forEach(([p, v]: Any) => (p.visible = v));
      },
      /** Settings › Accessibility › Reduced motion turned on or off mid-match, as the menu does. */
      reduceMotion(on: boolean): void {
        game.changeReducedMotion(on);
      },
    };
    w.__qa = qa;
  });
  return backend;
}

/** Runs `fn` in the page with the helpers and the game's handle. */
export const qa = <T>(page: Page, fn: (qa: Any, game: Any) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__qa, window.airsoft)`) as Promise<T>;

/** What the scene draws and how: each patched material's verdict, each program key's twin, the sized Points, the sky. */
export interface Coverage {
  /** Patched materials drawn neither by a twin, by Three's own library by design, nor as a sprite twin's Points. */
  unaccounted: string[];
  kinds: Record<string, number>;
  /** Each program key of a mesh, and whether the node library gives its twin (a surface recipe, the flames' sway, the smoke's fade). */
  keys: Record<string, boolean>;
  /** The visible sized Points: their layers and sprite children. */
  points: { name: string; mask: number; sprites: number }[];
  /** The sprite twins the CPU feeds (render/webgpu/pointSprites.ts) and those a compute pass drives (W5: motes, fireflies). */
  sprites: number;
  computed: number;
  environment: boolean;
}

export function coverage(page: Page): Promise<Coverage> {
  return qa(page, (_q, game) => {
    const r = game.renderer;
    const library = r.renderer.library;
    const unaccounted: string[] = [];
    const kinds: Record<string, number> = {};
    const keys: Record<string, boolean> = {};
    const points: { name: string; mask: number; sprites: number }[] = [];
    const seen = new Set();
    let computed = 0;
    // What Three's own node library draws as it is by design: the moon and the plain Lambert off the environment need
    // nothing added. The figures' per-vertex finish has its twin since W3.
    const OWN = ['without-environment', 'night-sky-moon'];
    const isTwin = (twin: Any) => twin?.isNodeMaterial === true && (twin.surface != null || twin.positionNode != null || twin.opacityNode != null || twin.roughnessNode != null);
    r.scene.traverse((o: Any) => {
      if (o.isPoints && o.visible) {
        points.push({ name: o.name, mask: o.layers.mask, sprites: o.children.filter((c: Any) => c.isSprite).length });
        if ((o.userData.gpuMotes ?? o.userData.gpuFireflies)?.gpu) computed++;
      }
      if (o.isMesh && !Array.isArray(o.material) && !o.material.isNodeMaterial) {
        const key = o.material.customProgramCacheKey();
        if (!(key in keys)) keys[key] = isTwin(library.fromMaterial(o.material));
      }
      const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of materials) {
        if (seen.has(m)) continue;
        seen.add(m);
        if (m.onBeforeCompile.toString().replace(/\s/g, '') === 'onBeforeCompile(){}' || m.onBeforeCompile.toString().replace(/\s/g, '').startsWith('onBeforeCompile(/*')) continue;
        const label = `${o.type}:${o.name || '-'}:${m.customProgramCacheKey().slice(0, 40)}`;
        if (o.isPoints) {
          if (o.layers.mask === 0 && o.children.filter((child: Any) => child.isSprite).length === 1) kinds.sprites = (kinds.sprites ?? 0) + 1;
          else unaccounted.push(`${label} (a Points drawn as pixels)`);
          continue;
        }
        if (OWN.includes(m.customProgramCacheKey())) {
          kinds.threes = (kinds.threes ?? 0) + 1;
          continue;
        }
        if (isTwin(library.fromMaterial(m))) kinds.twins = (kinds.twins ?? 0) + 1;
        else unaccounted.push(label);
      }
    });
    return { unaccounted, kinds, keys, points, sprites: r.node?.world.sprites.count ?? -1, computed, environment: r.scene.environment?.isTexture === true };
  });
}

/**
 * The coverage every map must have: no patched material unaccounted for, more than two twins, every surface program
 * (at least `surfaces` of them) and each of `keys` a twin, each of `points` among the sized Points, every sized Points one
 * sprite twin with its own layers off (fed by the CPU or driven by a compute pass), and the node renderer's prefiltered sky as the scene's environment.
 */
export function expectCoverage(c: Coverage, want: { keys: readonly string[]; points: readonly string[]; surfaces: number }): void {
  expect(c.unaccounted).toEqual([]);
  expect(c.kinds.twins ?? 0).toBeGreaterThan(2);
  const surfaces = Object.keys(c.keys).filter((k) => k.startsWith('surface:'));
  expect(surfaces.length).toBeGreaterThanOrEqual(want.surfaces);
  for (const k of [...surfaces, ...want.keys]) expect(c.keys[k], k).toBe(true);
  const names = c.points.map((p) => p.name);
  for (const name of want.points) expect(names).toContain(name);
  for (const p of c.points) expect(p, p.name).toMatchObject({ mask: 0, sprites: 1 });
  expect(c.sprites + c.computed).toBe(c.points.length);
  expect(c.environment).toBe(true);
}

/**
 * W2-QA-1: a twin's per-object uniform reaches the GPU on every frame, not only on the object's first draw. With the
 * game's loop stopped, the patch's own uniform `name` (on the mesh named `mesh`) is set to each of `values` in turn and
 * one frame drawn, and the value is read back from the drawn object's uniform buffer (what is uploaded). Stops the loop.
 */
export async function expectUploaded(page: Page, u: { mesh: string; name: string; values: readonly (readonly number[])[] }): Promise<void> {
  const uploaded = await page.evaluate(async (u) => {
    const game = (window as Any).airsoft;
    cancelAnimationFrame(game.rafId);
    await new Promise((done) => setTimeout(done, 100));
    const r = game.renderer;
    let mesh: Any = null;
    r.scene.traverse((o: Any) => {
      if (o.name === u.mesh && o.isMesh) mesh = o;
    });
    if (!mesh) return { error: `no ${u.mesh}` };
    const shader = { uniforms: {} as Record<string, Any>, vertexShader: '', fragmentShader: '', defines: {} };
    mesh.material.onBeforeCompile(shader);
    const patch = shader.uniforms[u.name];
    if (!patch) return { error: `no uniform ${u.name}` };
    // The drawn object's render object, caught as the renderer asks whether to refresh it.
    let ro: Any = null;
    const nodes = r.renderer._nodes;
    const ask = nodes.needsRefresh;
    nodes.needsRefresh = function (x: Any, ...rest: Any[]) {
      if (x.object === mesh) ro = x;
      return ask.call(this, x, ...rest);
    };
    const gpu = (): number[] | null => {
      for (const b of ro?.getBindings() ?? []) {
        for (const g of b.bindings) {
          for (const un of g.uniforms ?? []) if (un.nodeUniform?.node?.patchUniform === u.name) return Array.from(g.buffer.slice(un.offset, un.offset + u.values[0]!.length) as Float32Array);
        }
      }
      return null;
    };
    const read: (number[] | null)[] = [];
    for (const v of u.values) {
      if (typeof patch.value === 'number') patch.value = v[0]!;
      else patch.value.set(...v);
      r.render();
      read.push(gpu());
    }
    nodes.needsRefresh = ask;
    return { read };
  }, u);
  expect(uploaded).not.toHaveProperty('error');
  const read = (uploaded as { read: (number[] | null)[] }).read;
  u.values.forEach((want, i) => {
    expect(read[i], `${u.name} frame ${i}`).not.toBeNull();
    want.forEach((x, k) => expect(read[i]![k], `${u.name}[${k}] frame ${i}`).toBeCloseTo(x, 5));
  });
}
