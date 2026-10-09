import { expect, test } from '@playwright/test';
import { boot, coverage, expectCoverage, VIEWPORT, watchErrors } from './webgpuWorldHarness';

/**
 * The world's materials on the node renderer (WebGPU overhaul W2), Depot by day on High: every patched material the
 * scene draws is a node twin (the surfaces' weathering and baked light, the junk, the puddles, the chimney smoke), Three's
 * own by design, or a sized Points drawn as its sprite twin, and the scene has the node renderer's prefiltered sky, with
 * zero console and page errors. Woodland and Neon Heights at night, with what moves and what the game changes mid-match,
 * are e2e/webgpuWorld.qa.spec.ts's (one boot per map, e2e/webgpuWorldHarness.ts). How close the pictures come to WebGL's
 * is measured by pipeline/webgpu-compare.mjs.
 */

test.use({ viewport: VIEWPORT });

test('a Depot day match on High: every patched material the scene draws is a twin, Three’s own by design, or a sprite twin’s Points', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await boot(page, 'depot', 'day');
  expectCoverage(await coverage(page), { keys: ['smoke-plumes'], points: [], surfaces: 2 });
  expect(errors()).toEqual([]);
});
