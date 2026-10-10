import { expect, test } from '@playwright/test';
import { boot, coverage, expectCoverage, qa, VIEWPORT, watchErrors } from './webgpuWorldHarness';

/**
 * The world's materials on the node renderer (WebGPU overhaul W2; the figures and the replica sheen W3), Depot by day on High: every patched material the
 * scene draws is a node twin (the surfaces' weathering and baked light, the junk, the puddles, the chimney smoke), Three's
 * own by design, or a sized Points drawn as its sprite twin, and the scene has the node renderer's prefiltered sky, with
 * zero console and page errors. Woodland and Neon Heights at night, with what moves and what the game changes mid-match,
 * are e2e/webgpuWorld.qa.spec.ts's (one boot per map, e2e/webgpuWorldHarness.ts). The same boot checks W4's frame: the
 * post stack with the held replica laid on, and the retro filter. How close the pictures come to WebGL's is measured by
 * pipeline/webgpu-compare.mjs.
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
  // W4: the frame goes through the node renderer's post stack (High's passes), the held replica drawn into a target of
  // its own and laid on by the last pass; the retro filter draws in its few colours, a flat colour per retro pixel, and
  // the stack comes back after it. How close each comes to WebGL's is pipeline/webgpu-compare.mjs's (its post views).
  const post = await qa(page, (q, game) => {
    const r = game.renderer;
    const draw = (): Uint8ClampedArray => {
      game.session.draw(0, false);
      return q.grab();
    };
    const stats = (px: Uint8ClampedArray) => {
      let sum = 0;
      let sat = 0;
      const colours = new Set<number>();
      for (let i = 0; i < px.length; i += 4) {
        sum += px[i]! + px[i + 1]! + px[i + 2]!;
        sat += Math.max(px[i]!, px[i + 1]!, px[i + 2]!) - Math.min(px[i]!, px[i + 1]!, px[i + 2]!);
        colours.add((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!);
      }
      const n = px.length / 4;
      return { mean: sum / n / 3, saturation: sat / n, colours: colours.size };
    };
    for (let i = 0; i < 4; i++) draw();
    const stacked = stats(draw());
    const stack = r.post.current;
    const held = stack?.overlayBuffer?.isRenderTarget === true;
    r.setRetro({ pixelSize: 4, levels: 6 });
    for (let i = 0; i < 2; i++) draw();
    const px = draw();
    const w = r.renderer.domElement.width;
    const h = r.renderer.domElement.height;
    let flat = 0;
    let blocks = 0;
    // Retro pixels count from the bottom left, as WebGL's gl_FragCoord does.
    for (let by = h % 4; by + 4 <= h; by += 4) {
      for (let bx = 0; bx + 4 <= w; bx += 4) {
        const at = (x: number, y: number) => ((by + y) * w + bx + x) * 4;
        let same = true;
        for (let y = 0; y < 4 && same; y++) for (let x = 0; x < 4 && same; x++) for (let c = 0; c < 3; c++) if (px[at(x, y) + c] !== px[at(0, 0) + c]) same = false;
        blocks++;
        if (same) flat++;
      }
    }
    const retro = { colours: stats(px).colours, flat: flat / blocks, stackWhileRetro: r.post.current !== null };
    r.setRetro(null);
    draw();
    return { passes: r.postPasses, held, stacked, retro, back: r.post.current !== null };
  });
  expect(post.passes).toEqual(['ao', 'lightShafts', 'taa', 'bloom', 'output']);
  expect(post.held).toBe(true);
  expect(post.stacked.mean).toBeGreaterThan(40);
  expect(post.stacked.saturation).toBeGreaterThan(8);
  expect(post.stacked.colours).toBeGreaterThan(2000);
  expect(post.retro.colours).toBeLessThanOrEqual(6 ** 3);
  expect(post.retro.colours).toBeGreaterThan(8);
  expect(post.retro.flat).toBeGreaterThan(0.99);
  expect(post.retro.stackWhileRetro).toBe(false);
  expect(post.back).toBe(true);
  expect(errors()).toEqual([]);
});
