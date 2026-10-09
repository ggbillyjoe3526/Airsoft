import { expect, test } from '@playwright/test';
import { type Any, boot, coverage, expectCoverage, qa, VIEWPORT, WEBGPU_LAUNCH, watchErrors } from './webgpuWorldHarness';

/**
 * The night on a real WebGPU device (WebGPU overhaul W3), Neon Heights at night on High, one boot: the node renderer
 * shades the world's point and spot lights in clusters (render/webgpu/nightLights.ts), every lamp near the eye has its
 * own light beside WebGL's fixed pool, and those lights reach the picture. The figures'
 * finish is a twin here too. Headless Chromium gets its WebGPU device from SwiftShader's Vulkan (WEBGPU_LAUNCH); a
 * browser that gives none skips this (the WebGL2 back end's checks are e2e/webgpuWorld*.spec.ts). How close the
 * pictures come to WebGL's is measured by pipeline/webgpu-compare.mjs.
 */

// The project's own launch (its Chromium and SwiftShader flags) with the WebGPU ones added: a browser of this file's own.
test.use({ viewport: VIEWPORT, launchOptions: async ({ launchOptions }, use) => use({ ...launchOptions, args: [...(launchOptions.args ?? []), ...WEBGPU_LAUNCH] }) });

test('Neon Heights at night on WebGPU: clustered lights hold every lamp’s own light and the fixed pool, and they reach the picture', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const backend = await boot(page, 'neonHeights', 'night', true);
  test.skip(backend === null, 'this browser gives no WebGPU device');

  const lights = await qa(page, (_q, game) => {
    const r = game.renderer;
    const named = (name: string) => {
      const out: Any[] = [];
      r.scene.traverse((o: Any) => {
        if (o.isLight && o.name === name) out.push(o);
      });
      return out;
    };
    const node = r.renderer.lighting.made;
    let shadowless = 0;
    r.scene.traverse((o: Any) => {
      if ((o.isPointLight || o.isSpotLight) && !o.castShadow) shadowless++;
    });
    return {
      clustered: r.clusteredLights,
      pools: game.session.combat.field.lights.length,
      own: named('pool-light-own').length,
      lit: named('pool-light-own').filter((l: Any) => l.intensity > 0).length,
      inClusters: node?.clusteredLights.length ?? -1,
      shadowless,
      ownShadowed: node?.materialLights.some((l: Any) => l.isDirectionalLight && l.castShadow) === true,
    };
  });
  expect(lights.clustered).toBe(true);
  expect(lights.own).toBe(lights.pools);
  // Beside the fixed pool, more lamps lit by their own lights (those near the eye at the start).
  expect(lights.lit).toBeGreaterThan(0);
  // Every point and spot light without a shadow is in the clusters; the moon (with its shadow) stays Three's own.
  expect(lights.inClusters).toBe(lights.shadowless);
  expect(lights.ownShadowed).toBe(true);

  // The clustered lights reach the picture: a lamp's street with them on, then off (the fixed pool's lights are
  // clustered too on WebGPU, so the lamp is lit either way while they are on).
  const changed = await qa(page, async (q, game) => {
    cancelAnimationFrame(game.rafId);
    const r = game.renderer;
    const s = game.session;
    q.hideFigures();
    const lamps: Any[] = [];
    r.scene.traverse((o: Any) => {
      if ((o.isPointLight || o.isSpotLight) && !o.castShadow) lamps.push(o);
    });
    const lamp = lamps.find((l) => l.name === 'pool-light-own');
    const cam = r.camera;
    cam.position.set(lamp.position.x + 5, lamp.position.y, lamp.position.z + 5);
    cam.lookAt(lamp.position.x, lamp.position.y - 4, lamp.position.z);
    cam.updateMatrixWorld();
    for (let i = 0; i < 4; i++) s.daylight.follow(cam, 1);
    // A WebGPU canvas is read as an image in the task that drew it (a 2D copy of it comes back empty here).
    const shot = async (): Promise<Uint8ClampedArray> => {
      // A few frames (the clusters are filled before each draw, the light data with it), then the one read.
      for (let i = 0; i < 4; i++) {
        await new Promise((done) => requestAnimationFrame(done));
        r.render();
      }
      const url = r.renderer.domElement.toDataURL('image/png');
      const img = new Image();
      await new Promise((done) => {
        img.onload = done;
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const on = await shot();
    const kept = lamps.map((l) => l.intensity);
    for (const l of lamps) l.intensity = 0;
    const off = await shot();
    lamps.forEach((l, i) => (l.intensity = kept[i]));
    let lit = 0;
    for (let i = 0; i < on.length; i += 4) if (on[i]! + on[i + 1]! + on[i + 2]! > 0) lit++;
    return { changed: q.over(on, off, 4), lit };
  });
  // The frame was read back at all (the canvas's pixels, not an empty copy: all but a few hundred of 230,400 are lit),
  // and the lights changed a good part of it (about 5,400 pixels when written).
  expect(changed.lit).toBeGreaterThan(200_000);
  expect(changed.changed).toBeGreaterThan(2000);

  expectCoverage(await coverage(page), { keys: ['fa8-vertex-finish'], points: ['night-stars'], surfaces: 2 });
  expect(errors()).toEqual([]);
});
