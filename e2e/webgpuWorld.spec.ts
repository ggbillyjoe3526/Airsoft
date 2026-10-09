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
  { map: 'woodland', label: 'Woodland', keys: ['light-fixtures-flames'], points: ['night-stars', 'fire-embers', 'fireflies'] },
  { map: 'neonHeights', label: 'Neon Heights', keys: ['smoke-plumes', 'without-environment:sky-host'], points: ['night-stars'] },
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
    expect(errors()).toEqual([]);
  });
}
