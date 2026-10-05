import type { HtmlTagDescriptor, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { archivalDescribe, versionLabel } from './src/config/buildVersion.ts';
import { LOADING } from './src/config/loading.ts';
import { CONTENT_SECURITY_POLICY } from './src/config/page.ts';
import { PRECOMPRESS, precompressedCopies } from './src/config/precompress.ts';

/**
 * Size budgets in kB (minified, before gzip). Rapier inlines its WASM, so it gets its own budget: 4,333 kB measured at
 * @dimforge/rapier3d-compat 0.21.0 plus about 5 % (DECISIONS 2026-10-04), so an upgrade that grows it is a deliberate bump.
 */
const CHUNK_BUDGET_KB = { rapier: 4550, default: 800 };

/** The headless bot-match guards (src/ai/depotMatchSupport.ts): most of the unit suite's time, project `slow`; the
 * Pro guards on every map (M40) and the Extraction balance runs on every map (M46, M48) with them. */
const SLOW_TESTS = ['src/ai/depotMatch*.test.ts', 'src/ai/*Match.pro*.test.ts', 'src/ai/proBalance.test.ts', 'src/ai/*Match.extraction*.test.ts'];

/** True on a CI runner (the workflow's runner sets CI); read without Node's types, which the project doesn't load. */
const ON_CI = Boolean((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI);

/**
 * Checks every output chunk against its budget, so the game, three.js and Rapier chunks can't grow unnoticed: over
 * budget fails the build on CI and warns locally (audit L-12).
 */
function chunkBudget(): Plugin {
  return {
    name: 'airsoft-chunk-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        const kb = new TextEncoder().encode(file.code).length / 1000;
        const budget = file.name === 'rapier' ? CHUNK_BUDGET_KB.rapier : CHUNK_BUDGET_KB.default;
        if (kb <= budget) continue;
        const message = `${file.fileName} is ${kb.toFixed(0)} kB, over its ${budget} kB budget (vite.config.ts)`;
        if (ON_CI) this.error(message);
        else this.warn(message);
      }
    },
  };
}

/**
 * Release extras for the built page (audit CORE-10, CORE-19): the CSP <meta> first in <head>, and a <meta> naming the
 * Rapier chunk and its size, so the loading screen can show its download as it arrives (ui/loadingProgress.ts).
 */
function pageMeta(): Plugin {
  let base = './';
  return {
    name: 'airsoft-page-meta',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const tags: HtmlTagDescriptor[] = [
          { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
        ];
        const rapier = Object.values(ctx.bundle ?? {}).find((file) => file.type === 'chunk' && file.name === 'rapier');
        if (rapier?.type === 'chunk') {
          const bytes = new TextEncoder().encode(rapier.code).length;
          tags.push({ tag: 'meta', attrs: { name: LOADING.chunkMeta, content: `${base}${rapier.fileName}`, 'data-bytes': String(bytes) }, injectTo: 'head' });
        }
        return tags;
      },
    },
  };
}

/** The node:zlib and node:fs/promises calls precompress() needs, typed here: the project doesn't load Node's types. */
interface ZlibCalls {
  brotliCompress(source: Uint8Array, options: { params: Record<number, number> }, done: (error: Error | null, out: Uint8Array) => void): void;
  gzip(source: Uint8Array, options: { level: number }, done: (error: Error | null, out: Uint8Array) => void): void;
  constants: { BROTLI_PARAM_QUALITY: number; BROTLI_PARAM_LGWIN: number; BROTLI_PARAM_SIZE_HINT: number };
}
interface FsCalls {
  writeFile(path: string, data: Uint8Array): Promise<void>;
}

/**
 * Brotli and gzip copies of the release build's files (audit CORE-29, config/precompress.ts), for a static host that
 * serves precompressed files (README › Hosting). Not in the e2e build, which only the tests load. Written once the
 * bundle is on disk, so the page itself (emitted last) is among them.
 */
function precompress(): Plugin {
  return {
    name: 'airsoft-precompress',
    apply: (_config, env) => env.command === 'build' && env.mode !== 'e2e',
    enforce: 'post',
    writeBundle: {
      order: 'post',
      async handler(options, bundle) {
        const zlib = (await import('node:zlib' as string)) as ZlibCalls;
        const fs = (await import('node:fs/promises' as string)) as FsCalls;
        const call = (fn: (done: (error: Error | null, out: Uint8Array) => void) => void) =>
          new Promise<Uint8Array>((resolve, reject) => fn((error, out) => (error ? reject(error) : resolve(out))));
        const files = Object.values(bundle).map((file) => ({
          fileName: file.fileName,
          source: file.type === 'chunk' ? new TextEncoder().encode(file.code) : typeof file.source === 'string' ? new TextEncoder().encode(file.source) : file.source,
        }));
        const copies = await precompressedCopies(files, {
          brotli: (source) => call((done) => zlib.brotliCompress(source, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: PRECOMPRESS.brotliQuality, [zlib.constants.BROTLI_PARAM_LGWIN]: PRECOMPRESS.brotliWindowBits, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.byteLength } }, done)),
          gzip: (source) => call((done) => zlib.gzip(source, { level: PRECOMPRESS.gzipLevel }, done)),
        });
        await Promise.all(copies.map((copy) => fs.writeFile(`${options.dir ?? 'dist'}/${copy.fileName}`, copy.source)));
      },
    },
  };
}

/** The two Node calls the version needs, typed here: the project doesn't load Node's types. */
interface NodeCalls {
  execFileSync(file: string, args: string[], options: { encoding: 'utf8'; stdio: string[] }): string;
  readFileSync(path: URL, encoding: 'utf8'): string;
}

/**
 * Which build this is, for the title screen (config/buildVersion.ts): `git describe` in a checkout, else the
 * `.git_archival.txt` GitHub fills in when it zips a release, else nothing.
 */
async function buildDescribe(): Promise<string> {
  const node = { ...(await import('node:child_process' as string)), ...(await import('node:fs' as string)) } as NodeCalls;
  try {
    return node.execFileSync('git', ['describe', '--tags', '--always'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    try {
      return archivalDescribe(node.readFileSync(new URL('./.git_archival.txt', import.meta.url), 'utf8'));
    } catch {
      return '';
    }
  }
}

export default defineConfig(async () => ({
  base: './',
  define: {
    __BUILD_VERSION__: JSON.stringify(versionLabel(await buildDescribe())),
  },
  plugins: [chunkBudget(), pageMeta(), precompress()],
  build: {
    target: 'es2022',
    // Source maps next to the chunks but not linked from them (audit CORE-11): players never download them, and a
    // crash report's stack (index-abc.js:1:48213) can be read against dist/assets/*.map in DevTools or with a
    // source-map tool. The chunk budgets count the code only.
    sourcemap: 'hidden' as const,
    rolldownOptions: {
      output: {
        // Vendor code in its own chunks so it caches across game updates and each size stays visible.
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\\/]@dimforge/ },
            // The glTF loader and its helpers stay out: only a build with a figure model loads them (M25a).
            { name: 'three', test: /node_modules[\\/]three[\\/](?!examples[\\/]jsm[\\/](loaders|libs|utils[\\/]SkeletonUtils))/ },
          ],
        },
      },
    },
    // Vite's single global limit is set just above the Rapier chunk; per-chunk budgets are enforced by chunkBudget().
    chunkSizeWarningLimit: CHUNK_BUDGET_KB.rapier,
  },
  test: {
    environment: 'node',
    // Test files share a worker's module cache (audit CORE-15): three.js, Rapier's WASM and the configs load once per
    // worker rather than once per file, about a sixth of the suite's CPU time (measured 2026-10-04, DECISIONS). A test
    // that stubs a global or spies on a shared object restores it (vi.unstubAllGlobals, mockRestore); a file that
    // resets the module registry resets it again when it ends (save/startGuardedStorage.test.ts).
    isolate: false,
    // Two projects (audit CORE-15): `npx vitest run` (the gate, CI, `npm test`) runs both; `npx vitest run --project
    // fast` leaves out the headless bot-match guards for quick feedback while working. Every seed stays in `slow`.
    projects: [
      // The pipeline's own rules (pipeline/scope.mjs, pipeline/smokeReport.mjs) are tested here too.
      { extends: true, test: { name: 'fast', include: ['src/**/*.test.ts', 'pipeline/**/*.test.mjs'], exclude: SLOW_TESTS } },
      { extends: true, test: { name: 'slow', include: SLOW_TESTS } },
    ],
  },
}));
