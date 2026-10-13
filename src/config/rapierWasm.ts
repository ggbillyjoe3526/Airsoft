/**
 * Rapier's WebAssembly as a plain `.wasm` file (owner, 2026-10-12, IM3; DECISIONS). The compat package's bundle carries
 * its WebAssembly as a base64 string that `init()` decodes: 4,335 kB of chunk, about 1,196 kB Brotli. The release build
 * (vite.config.ts) rewrites that one call so `init()` fetches the package's own `rapier_wasm3d_bg.wasm` instead, which
 * the build emits as an asset: 3,082 kB, about 852 kB Brotli, and the browser compiles it while it downloads. The rest
 * of the package (its classes, its wasm-bindgen glue, `init()` itself) is unchanged, so the game's code and every test
 * use the same API. The dev server and Vitest keep the inlined copy. Build-time only: the game never imports this.
 */
export const RAPIER_WASM = {
  /** The module the build rewrites: the compat package's ES bundle. */
  module: /@dimforge[\\/]rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/,
  /** The plain WebAssembly file beside it, which the rewritten bundle imports by URL; also the asset's name in the build. */
  file: 'rapier_wasm3d_bg.wasm',
  /** The name the rewritten bundle gives that URL (nothing in the minified bundle is called this). */
  urlName: 'airsoftRapierWasmUrl',
} as const;

/**
 * Where `init()` hands the inlined WebAssembly to wasm-bindgen: `module_or_path:` then a base64 decoder's call on a
 * string starting with the WebAssembly magic number (`\0asm` is `AGFzbQ` in base64), and its bytes' `.buffer`, ending the
 * option object (so nothing else of the inlined value is left behind to act on the URL).
 */
const INLINED_WASM = /(module_or_path:)[A-Za-z_$][\w$]*\.toByteArray\("AGFzbQ[A-Za-z0-9+/]*={0,2}"\)(?:\.buffer)?(?=\})/g;

/**
 * Rapier's bundle `code` with its inlined WebAssembly swapped for the plain file's URL, imported with Vite's `?url` (a
 * string, which wasm-bindgen fetches and compiles as it streams in). Throws unless the bundle has exactly one inlined
 * module, so a Rapier upgrade that changes the bundle's shape fails the build instead of shipping the base64 copy
 * again. Nothing of the bundle moves, so the build's source map needs no change: the URL's name is padded with spaces
 * to the length of what it replaces (the minifier drops them), and the import goes on a line of its own after the
 * bundle (imports are hoisted). Pure.
 */
export function plainWasmBundle(code: string): string {
  const found = code.match(INLINED_WASM)?.length ?? 0;
  if (found !== 1) {
    throw new Error(`Rapier's bundle has ${found} inlined WebAssembly modules where 1 was expected (src/config/rapierWasm.ts): update the pattern for this Rapier version`);
  }
  const plain = code.replace(INLINED_WASM, (inlined, key: string) => `${key}${RAPIER_WASM.urlName}`.padEnd(inlined.length));
  return `${plain}\nimport ${RAPIER_WASM.urlName} from './${RAPIER_WASM.file}?url';\n`;
}
