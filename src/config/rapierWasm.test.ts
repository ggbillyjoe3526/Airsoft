import { afterAll, describe, expect, it } from 'vitest';
import { plainWasmBundle, RAPIER_WASM } from './rapierWasm';

// Node's fs and os, without their types (the project compiles for the browser).
const [nodeFs, nodeOs] = ['node:fs', 'node:os'];
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  mkdtempSync(prefix: string): string;
  readFileSync(path: URL): Uint8Array;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  writeFileSync(path: URL, data: string): void;
};
const { tmpdir } = (await import(/* @vite-ignore */ nodeOs)) as { tmpdir(): string };

const DIST = new URL('../../node_modules/@dimforge/rapier3d-compat/dist/', import.meta.url);
const bundle = new TextDecoder().decode(readFileSync(new URL('rapier.mjs', DIST)));
const wasm = readFileSync(new URL(RAPIER_WASM.file, DIST));
const importLine = `import ${RAPIER_WASM.urlName} from './${RAPIER_WASM.file}?url';`;
const scratch = mkdtempSync(`${tmpdir()}/airsoft-rapier-wasm-`);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// Compiling Rapier's WebAssembly takes a while on a loaded machine (as physics/levelRay.rapier.test.ts allows).
describe("Rapier's plain WebAssembly (IM3)", { timeout: 15_000 }, () => {
  it('names the bundle and the file the installed package ships', () => {
    expect(RAPIER_WASM.module.test(`/repo/node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs`)).toBe(true);
    expect(RAPIER_WASM.module.test(`C:\\repo\\node_modules\\@dimforge\\rapier3d-compat\\dist\\rapier.mjs`)).toBe(true);
    expect(RAPIER_WASM.module.test(`/repo/node_modules/@dimforge/rapier3d-compat/dist/rapier.cjs`)).toBe(false);
    expect([...wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]); // `\0asm`, the WebAssembly magic number
    expect(bundle).not.toContain(RAPIER_WASM.urlName);
  });

  it('drops the base64 copy and imports the file by URL, moving nothing of the bundle', () => {
    const plain = plainWasmBundle(bundle);
    expect(plain).not.toContain('"AGFzbQ');
    expect(plain).toMatch(new RegExp(`module_or_path:${RAPIER_WASM.urlName} +\\}`));
    // Every line and column of the bundle keeps its place, so the source map that says nothing moved is right: the swap
    // is padded to the length it replaces, and the import is a line of its own after the last of the bundle's.
    const [before, after] = [bundle.split('\n'), plain.split('\n')];
    expect(after.slice(0, before.length).map((line) => line.length)).toEqual(before.map((line) => line.length));
    const swapEnd = after[0]!.indexOf(RAPIER_WASM.urlName) + RAPIER_WASM.urlName.length;
    const tail = after[0]!.slice(swapEnd).trimStart();
    expect(before[0]!.endsWith(tail)).toBe(true);
    expect(after.indexOf(importLine)).toBe(before.length);
    expect(plain.trimEnd().endsWith(importLine)).toBe(true);
  });

  it('refuses a bundle without exactly one inlined module, so an upgrade that changes it fails the build', () => {
    expect(() => plainWasmBundle('export function init() {}')).toThrow(/0 inlined WebAssembly modules/);
    const call = /module_or_path:[\w$]+\.toByteArray\("AGFzbQ[^"]*"\)\.buffer/.exec(bundle)![0];
    expect(() => plainWasmBundle(`${bundle}\n({${call}})`)).toThrow(/2 inlined WebAssembly modules/);
    // Anything more done to the decoded bytes than `.buffer` would act on the URL instead: not rewritten.
    expect(() => plainWasmBundle(bundle.replace(`${call}}`, `${call}.slice(0)}`))).toThrow(/0 inlined WebAssembly modules/);
  });

  it("starts Rapier from the plain file through the bundle's own init(), compiling as it streams", async () => {
    // In a browser wasm-bindgen fetches the URL and hands the Response to WebAssembly.instantiateStreaming. Here the import
    // is swapped for the Response that fetch would give, the file's bytes served as application/wasm.
    const response = `new Response(globalThis.airsoftRapierWasmBytes, { headers: { 'Content-Type': 'application/wasm' } })`;
    // The swap's padding (4 MB of spaces) and the map comment are dropped, as the build's minifier does, so the module loads
    // quickly here.
    const runnable = plainWasmBundle(bundle)
      .replace(importLine, `const ${RAPIER_WASM.urlName} = ${response};`)
      .replace(new RegExp(`(module_or_path:${RAPIER_WASM.urlName}) +`), '$1')
      .replace(/^\/\/# sourceMappingURL=.*$/m, '');
    const file = new URL(`file://${scratch}/rapier.mjs`);
    writeFileSync(file, runnable);
    (globalThis as { airsoftRapierWasmBytes?: Uint8Array }).airsoftRapierWasmBytes = wasm;
    try {
      const rapier = ((await import(/* @vite-ignore */ file.href)) as { default: typeof import('@dimforge/rapier3d-compat') }).default;
      await rapier.init();
      const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
      world.createCollider(rapier.ColliderDesc.cuboid(5, 0.5, 5));
      world.step();
      const hit = world.castRay(new rapier.Ray({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }), 10, true);
      expect(hit?.timeOfImpact).toBeCloseTo(4.5, 5);
      world.free();
    } finally {
      delete (globalThis as { airsoftRapierWasmBytes?: Uint8Array }).airsoftRapierWasmBytes;
    }
  });
});
