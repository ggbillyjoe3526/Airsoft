import { expect, type Page, test } from '@playwright/test';

/**
 * The world's materials on the node renderer (WebGPU overhaul W2). The node renderer runs on its WebGL2 back end here
 * (`?forceWebGL`, the e2e build only; this container's Chromium has no WebGPU adapter). A night match on High of
 * Woodland and of Neon Heights between them draw every kind of world twin: the surfaces (weathering, baked light, the
 * neon junk), the sky host, the fire's flames, the steam, and the sized points (stars, embers, fireflies) as sprites;
 * the scene has the node renderer's prefiltered sky. How close the
 * pictures come to WebGL's is measured by pipeline/webgpu-compare.mjs; this checks that the twins are what draws, with
 * zero console and page errors.
 */

interface Obj {
  name: string;
  type: string;
  isPoints?: boolean;
  isMesh?: boolean;
  isSprite?: boolean;
  visible: boolean;
  layers: { mask: number };
  children: Obj[];
  material: { customProgramCacheKey(): string; isNodeMaterial?: boolean } & Record<string, unknown>;
  traverse(f: (o: Obj) => void): void;
}
interface GameHandle {
  airsoft: {
    state: { tick: number } | null;
    renderer: {
      backend: string;
      scene: Obj & { environment: { isTexture?: boolean } | null };
      renderer: { info: { render: { calls: number } }; library: { fromMaterial(m: unknown): (Record<string, unknown> & { isNodeMaterial?: boolean }) | null } };
      node: { world: { sprites: { count: number } } } | null;
    };
  };
}

function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return () => errors;
}

/** Each case: a map at night on High, the program keys it must draw as twins and the sized points it must draw as sprites. */
const CASES = [
  {
    map: 'woodland', label: 'Woodland', keys: ['light-fixtures-flames'], points: ['night-stars', 'fire-embers', 'fireflies'],
    // The fires' clock, which sways and flickers the flames.
    uniform: { mesh: 'fire-flames', name: 'fxTime', values: [[3.25], [7.5]] },
  },
  {
    map: 'neonHeights', label: 'Neon Heights', keys: ['smoke-plumes', 'without-environment:sky-host'], points: ['night-stars'],
    // The neon tubes' three flicker channels.
    uniform: { mesh: 'map-junk', name: 'neonFlicker', values: [[0.2, 0.45, 0.7], [0.9, 0.15, 0.55]] },
  },
] as const;

for (const c of CASES) {
  test(`a ${c.label} night match on High draws its world with the node twins (surfaces, ${c.keys.join(', ')}, sprites, the sky) without errors`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    await page.addInitScript((text) => {
      if (sessionStorage.getItem('w2-seeded')) return;
      sessionStorage.setItem('w2-seeded', '1');
      localStorage.setItem('airsoft.settings', text);
    }, JSON.stringify({ version: 1, renderer: 'webgpu', map: c.map, mode: 'elimination', [`lighting.${c.map}`]: 'night', 'dev.enabled': true, 'dev.devContent': 'on' }));
    await page.goto('/?nolock&seed=1&quality=high&forceWebGL');
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.backend)).toBe('webgpu-webgl2');
    await page.locator('.menu-title-start').click();
    const setup = page.locator('.menu-setup');
    await expect(setup.locator('.play-map-line')).toContainText(c.label, { timeout: 30_000 });
    await setup.getByRole('button', { name: 'Start match', exact: true }).click();
    await expect(page.locator('.menus')).toBeHidden({ timeout: 30_000 });
    const renders = () => page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.renderer.info.render.calls);
    const before = await renders();
    await expect.poll(renders, { timeout: 60_000 }).toBeGreaterThan(before + 5);

    const world = await page.evaluate(() => {
      const r = (window as unknown as GameHandle).airsoft.renderer;
      const library = r.renderer.library;
      // Each program key drawn, and whether the node library gives its twin: a surface's recipe, the flames' sway, the smoke's fade.
      const keys: Record<string, boolean> = {};
      const points: { name: string; mask: number; sprites: number }[] = [];
      r.scene.traverse((o) => {
        if (o.isPoints && o.visible) points.push({ name: o.name, mask: o.layers.mask, sprites: o.children.filter((c) => c.isSprite).length });
        if (!o.isMesh || Array.isArray(o.material)) return;
        const key = o.material.customProgramCacheKey();
        if (key in keys) return;
        const twin = library.fromMaterial(o.material);
        keys[key] = twin?.isNodeMaterial === true && (twin.surface != null || twin.positionNode != null || twin.opacityNode != null);
      });
      return { keys, points, sprites: r.node?.world.sprites.count ?? -1, environment: r.scene.environment?.isTexture === true };
    });
    // Every surface program has its twin (weathering and baked light on High), and so has each effect's.
    const surfaces = Object.keys(world.keys).filter((k) => k.startsWith('surface:'));
    expect(surfaces.length).toBeGreaterThanOrEqual(2);
    for (const k of [...surfaces, ...c.keys]) expect(world.keys[k], k).toBe(true);
    // The sized points each draw as one sprite twin, the Points themselves hidden from every camera.
    const names = world.points.map((p) => p.name);
    for (const name of c.points) expect(names).toContain(name);
    for (const p of world.points) expect(p, p.name).toMatchObject({ mask: 0, sprites: 1 });
    expect(world.sprites).toBe(world.points.length);
    expect(world.environment).toBe(true);
    await testInfo.attach(`node-world-${c.map}-night`, { body: await page.screenshot(), contentType: 'image/png' });

    // W2-QA-1: a twin's per-object uniform reaches the GPU on every frame, not only on the object's first draw. With the
    // game's loop stopped, the patch's own uniform is set and one frame drawn, and the value is read back from the drawn
    // object's uniform buffer (what is uploaded), twice over.
    const uploaded = await page.evaluate(async (u) => {
      const game = (window as unknown as { airsoft: { rafId: number; renderer: { render(): void; scene: Obj; renderer: { _nodes: { needsRefresh(ro: unknown, ...rest: unknown[]): unknown } } } } }).airsoft;
      cancelAnimationFrame(game.rafId);
      await new Promise((done) => setTimeout(done, 100));
      const r = game.renderer;
      let mesh: Obj | null = null;
      r.scene.traverse((o) => {
        if (o.name === u.mesh && o.isMesh) mesh = o;
      });
      if (!mesh) return { error: `no ${u.mesh}` };
      const plain = (mesh as Obj).material as unknown as { onBeforeCompile(shader: unknown): void };
      const shader = { uniforms: {} as Record<string, { value: number | { set(...v: number[]): void } }>, vertexShader: '', fragmentShader: '', defines: {} };
      plain.onBeforeCompile(shader);
      const patch = shader.uniforms[u.name];
      if (!patch) return { error: `no uniform ${u.name}` };
      // The drawn object's render object, caught as the renderer asks whether to refresh it.
      type Group = { uniforms?: { offset: number; nodeUniform?: { node?: { patchUniform?: string } } }[]; buffer: Float32Array };
      let ro: { getBindings(): { bindings: Group[] }[] } | null = null;
      const nodes = r.renderer._nodes;
      const ask = nodes.needsRefresh;
      nodes.needsRefresh = function (x: unknown, ...rest: unknown[]) {
        if ((x as { object: unknown }).object === mesh) ro = x as typeof ro;
        return ask.call(this, x, ...rest);
      };
      const gpu = (): number[] | null => {
        for (const b of ro?.getBindings() ?? []) {
          for (const g of b.bindings) {
            for (const un of g.uniforms ?? []) if (un.nodeUniform?.node?.patchUniform === u.name) return Array.from(g.buffer.slice(un.offset, un.offset + u.values[0].length));
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
    }, c.uniform);
    expect(uploaded).not.toHaveProperty('error');
    const read = (uploaded as { read: (number[] | null)[] }).read;
    c.uniform.values.forEach((want, i) => {
      expect(read[i], `${c.uniform.name} frame ${i}`).not.toBeNull();
      want.forEach((x, k) => expect(read[i]![k], `${c.uniform.name}[${k}] frame ${i}`).toBeCloseTo(x, 5));
    });
    expect(errors()).toEqual([]);
  });
}
