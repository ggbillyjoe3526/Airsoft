/**
 * Precompressed copies of the release build's files (audit CORE-29; owner, 2026-10-04: serve Brotli now, a separate
 * `.wasm` later). vite.config.ts writes `<file>.br` and `<file>.gz` next to every compressible file of the production
 * build, at the strongest settings, so a static host that serves precompressed files (README › Hosting) sends the Rapier
 * chunk as about 1.2 MB of Brotli or 1.6 MB of gzip instead of 4.3 MB, with no compression work per request. Build-time
 * only: the game never imports this.
 */

/** Which files are worth compressing: text (code, styles, the page, the icon, the manifest) and the glTF model. */
export const PRECOMPRESS = {
  pattern: /\.(js|mjs|css|html|svg|json|webmanifest|txt|glb)$/,
  /** Smaller files gain too little to be worth the extra request headers and files. */
  minBytes: 1024,
  /** Brotli's strongest level (11) and largest window (24): about 8 s for the Rapier chunk, once per release build. */
  brotliQuality: 11,
  brotliWindowBits: 24,
  /** gzip's strongest level. */
  gzipLevel: 9,
} as const;

/** One output file. */
export interface BuildFile {
  fileName: string;
  source: Uint8Array;
}

/** The two compressors (node:zlib's, promisified, in the build; anything with the same shape in a test). */
export interface Compressors {
  brotli(source: Uint8Array): Promise<Uint8Array>;
  gzip(source: Uint8Array): Promise<Uint8Array>;
}

/** Whether a build file gets precompressed copies: compressible by its name, big enough, and not a source map. */
export function shouldPrecompress(file: BuildFile): boolean {
  return PRECOMPRESS.pattern.test(file.fileName) && file.source.byteLength >= PRECOMPRESS.minBytes;
}

/**
 * The `.br` and `.gz` copies of the files worth compressing, each only when it comes out smaller than the file itself
 * (a host then serves the original).
 */
export async function precompressedCopies(files: readonly BuildFile[], compress: Compressors): Promise<BuildFile[]> {
  const jobs = files.filter(shouldPrecompress).flatMap((file) => [
    compress.brotli(file.source).then((source) => ({ fileName: `${file.fileName}.br`, source, original: file.source.byteLength })),
    compress.gzip(file.source).then((source) => ({ fileName: `${file.fileName}.gz`, source, original: file.source.byteLength })),
  ]);
  const done = await Promise.all(jobs);
  return done.filter((c) => c.source.byteLength < c.original).map(({ fileName, source }) => ({ fileName, source }));
}
