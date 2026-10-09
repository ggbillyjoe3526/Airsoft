import { expect, test } from '@playwright/test';
import { boot, coverage, expectCoverage, qa, VIEWPORT, watchErrors } from './webgpuWorldHarness';

/**
 * The world's materials on the node renderer (WebGPU overhaul W2; the figures and the replica sheen W3), Depot by day on High: every patched material the
 * scene draws is a node twin (the surfaces' weathering and baked light, the junk, the puddles, the chimney smoke), Three's
 * own by design, or a sized Points drawn as its sprite twin, and the scene has the node renderer's prefiltered sky, with
 * zero console and page errors. Woodland and Neon Heights at night, with what moves and what the game changes mid-match,
 * are e2e/webgpuWorld.qa.spec.ts's (one boot per map, e2e/webgpuWorldHarness.ts). How close the pictures come to WebGL's
 * is measured by pipeline/webgpu-compare.mjs.
 */

test.use({ viewport: VIEWPORT });

test('a Depot day match on High: every patched material the scene draws is a twin, Three’s own by design, or a sprite twin’s Points; the figures’ finish is a twin and the held replica reflects the prefiltered sky', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await boot(page, 'depot', 'day');
  // W3: the figures' per-vertex finish is a twin (no longer Three's own), and the replica sheen is the node renderer's
  // prefiltered sky, the same texture as the scene's environment.
  expectCoverage(await coverage(page), { keys: ['smoke-plumes', 'fa8-vertex-finish'], points: [], surfaces: 2 });
  const sheen = await qa(page, (_q, game) => {
    const held = game.session.combat.viewmodel.scene.environment;
    return { held: held?.isTexture === true, same: held === game.renderer.scene.environment, clustered: game.renderer.clusteredLights };
  });
  // The WebGL2 back end has no storage buffers in a pixel shader: no clustered lights there.
  expect(sheen).toEqual({ held: true, same: true, clustered: false });
  expect(errors()).toEqual([]);
});
