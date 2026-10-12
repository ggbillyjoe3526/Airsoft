import type { HtmlTagDescriptor, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { archivalDescribe, readmeRelease, versionLabel } from './src/config/buildVersion.ts';
import { CHUNK_BUDGET, chunkVerdict, RAPIER_WASM_BUDGET } from './src/config/chunkBudget.ts';
import { LOADING } from './src/config/loading.ts';
import { CONTENT_SECURITY_POLICY } from './src/config/page.ts';
import { PRECOMPRESS, precompressedCopies, precompressWanted } from './src/config/precompress.ts';
import { plainWasmBundle, RAPIER_WASM } from './src/config/rapierWasm.ts';


/** The headless bot-match guards (src/ai/depotMatchSupport.ts): most of the unit suite's time, project `slow`; the
 * Pro guards on every map (M40), the Extraction runs on every map (M46, M48) and every mode's short matches (CT3) with
 * them. */
const SLOW_TESTS = ['src/ai/depotMatch*.test.ts', 'src/ai/*Match.pro*.test.ts', 'src/ai/proBalance.test.ts', 'src/ai/*Match.extraction*.test.ts', 'src/ai/*Match.levels*.test.ts', 'src/content/modePlays*.test.ts'];
/**
 * The bot balance figures (src/ai/balance/, token plan item 22): who wins, who lands the first hit, how often the squad
 * gets out. Project `balance`, which exists only when AIRSOFT_BALANCE is set: `node pipeline/balance.mjs` sets it and
 * writes the balance report. `vitest run`, the gate and CI never measure them, so a figure never fails a build.
 */
const BALANCE_MEASURES = ['src/ai/balance/*.balance.ts'];

/**
 * The content toolkit's report runners (CT1, src/content/report/): one item's rules, compatibility, spec test and balance
 * run. Project `content`, which exists only when AIRSOFT_CONTENT is set: `node pipeline/content-check.mjs <item>` sets it
 * and builds the report. The gate, CI and `vitest run` never run them; the checks themselves run in `fast`.
 */
const CONTENT_REPORTS = ['src/content/report/*.report.ts'];

/** The build's environment variables, read without Node's types, which the project doesn't load. */
const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
/** True on a CI runner (the workflow's runner sets CI). */
const ON_CI = Boolean(ENV.CI);
/** True when pipeline/balance.mjs runs the balance figures. */
const MEASURE_BALANCE = Boolean(ENV.AIRSOFT_BALANCE);
/** True when pipeline/content-check.mjs runs a content report. */
const CONTENT_REPORT = Boolean(ENV.AIRSOFT_CONTENT);

/**
 * Checks every output chunk, and Rapier's WebAssembly, against its budget (config/chunkBudget.ts), so the game, three.js
 * and Rapier can't grow unnoticed: over budget fails the build on CI and warns locally (audit L-12); within 10 % of it
 * warns (CORE-01).
 */
function chunkBudget(): Plugin {
  return {
    name: 'airsoft-chunk-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        const verdict =
          file.type === 'chunk'
            ? chunkVerdict(file.name, file.fileName, new TextEncoder().encode(file.code).length)
            : isRapierWasm(file)
              ? chunkVerdict(RAPIER_WASM_BUDGET, file.fileName, file.source.length)
              : null;
        if (verdict?.level === 'over' && ON_CI) this.error(verdict.message);
        else if (verdict && verdict.level !== 'ok') this.warn(verdict.message);
      }
    },
  };
}

/** Whether a build output is Rapier's WebAssembly, the asset the rewritten bundle fetches (rapierWasm()). */
function isRapierWasm(file: { type: string; names?: readonly string[] }): boolean {
  return file.type === 'asset' && (file.names ?? []).includes(RAPIER_WASM.file);
}

/**
 * Rapier's WebAssembly as a plain file in every build (config/rapierWasm.ts, IM3): the compat bundle's `init()` fetches
 * the package's `.wasm` instead of decoding its base64 copy. Not on the dev server, whose prebundled copy keeps the
 * inlined one (a download size there doesn't matter).
 */
function rapierWasm(): Plugin {
  return {
    name: 'airsoft-rapier-wasm',
    apply: 'build',
    transform: {
      filter: { id: RAPIER_WASM.module },
      handler(code) {
        // Nothing of the bundle moves (plainWasmBundle pads the swap and appends the import), so its map still holds.
        return { code: plainWasmBundle(code), map: null };
      },
    },
  };
}

/**
 * Release extras for the built page (audit CORE-10, CORE-19): the CSP <meta> first in <head>, and a <meta> naming
 * Rapier's WebAssembly and its size (IM3: the physics download, most of the game's bytes), so the loading screen can
 * show its download as it arrives (ui/loadingProgress.ts).
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
        const wasm = Object.values(ctx.bundle ?? {}).find(isRapierWasm);
        if (wasm?.type === 'asset') {
          tags.push({ tag: 'meta', attrs: { name: LOADING.physicsMeta, content: `${base}${wasm.fileName}`, 'data-bytes': String(wasm.source.length) }, injectTo: 'head' });
        }
        // Rapier's code (225 kB, 32 kB Brotli) downloads beside the game's own, so starting physics after the WebAssembly's
        // download doesn't wait a round trip for it (IM3); the bar counts the WebAssembly, nearly all of the bytes.
        const rapier = Object.values(ctx.bundle ?? {}).find((file) => file.type === 'chunk' && file.name === 'rapier');
        if (rapier) tags.push({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${rapier.fileName}` }, injectTo: 'head' });
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
 * serves precompressed files (README › Hosting). Not in the e2e build, which only the tests load, nor with
 * AIRSOFT_PRECOMPRESS=0 (the gate's --quick build, audit CORE-11). Written once the bundle is on disk, so the page
 * itself (emitted last) is among them.
 */
function precompress(): Plugin {
  return {
    name: 'airsoft-precompress',
    apply: (_config, env) => env.command === 'build' && precompressWanted(env.mode, ENV[PRECOMPRESS.envFlag]),
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
 * `.git_archival.txt` GitHub fills in when it zips a release, else nothing. With it, the release README.md's download
 * link names: a clone without its tags (a pipeline worktree, a shallow CI checkout) describes itself as a bare commit,
 * and is then labelled as some commits after that release rather than "build <sha>" (audit CORE-10).
 */
async function buildDescribe(): Promise<{ describe: string; latestRelease: string }> {
  const node = { ...(await import('node:child_process' as string)), ...(await import('node:fs' as string)) } as NodeCalls;
  const read = (path: string): string => {
    try {
      return node.readFileSync(new URL(path, import.meta.url), 'utf8');
    } catch {
      return '';
    }
  };
  const latestRelease = readmeRelease(read('./README.md'));
  try {
    return { describe: node.execFileSync('git', ['describe', '--tags', '--always'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }), latestRelease };
  } catch {
    return { describe: archivalDescribe(read('./.git_archival.txt')), latestRelease };
  }
}

/** The title screen's version for this build (config/buildVersion.ts › versionLabel). */
async function buildVersion(): Promise<ReturnType<typeof versionLabel>> {
  const { describe, latestRelease } = await buildDescribe();
  return versionLabel(describe, latestRelease);
}

export default defineConfig(async () => ({
  base: './',
  define: {
    __BUILD_VERSION__: JSON.stringify(await buildVersion()),
  },
  plugins: [rapierWasm(), chunkBudget(), pageMeta(), precompress()],
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
            // The glTF loader and its helpers stay out: only a build with a figure model loads them (M25a). So do the
            // node renderer's builds (three.webgpu.js, three.tsl.js) and the TSL add-ons built on them (examples/jsm/tsl,
            // W3's clustered lights): only the WebGPU path's dynamic import loads them (WebGPU overhaul W1,
            // render/rendererStart.ts), in a chunk of their own.
            { name: 'three', test: /node_modules[\\/]three[\\/](?!examples[\\/]jsm[\\/](loaders|libs|tsl|utils[\\/]SkeletonUtils)|build[\\/]three\.(webgpu|tsl))/ },
            { name: 'three-webgpu', test: /node_modules[\\/]three[\\/](build[\\/]three\.(webgpu|tsl)|examples[\\/]jsm[\\/]tsl[\\/])/ },
            // pool.md and stats.md (read at start, M26a) in their own small chunk (M50, audit CORE-01): the owner's
            // table edits re-download it alone, and the game chunk's budget counts code.
            { name: 'tables', test: /\.md(\?raw)?$/ },
          ],
        },
      },
    },
    // Vite's single global limit is the default budget, the largest any chunk has since Rapier's WebAssembly became a
    // file of its own (IM3); per-chunk budgets are enforced by chunkBudget().
    chunkSizeWarningLimit: CHUNK_BUDGET.defaultKb,
  },
  test: {
    environment: 'node',
    // Test files share a worker's module cache (audit CORE-15): three.js, Rapier's WASM and the configs load once per
    // worker rather than once per file, about a sixth of the suite's CPU time (measured 2026-10-04, DECISIONS). A test
    // that stubs a global or spies on a shared object restores it (vi.unstubAllGlobals, mockRestore); a file that
    // resets the module registry resets it again when it ends (save/startGuardedStorage.test.ts).
    isolate: false,
    // Every map's data before each file (M50): the game loads the dev maps' on demand, the tests read them all.
    setupFiles: ['src/testSetup.ts'],
    // Two projects (audit CORE-15): `npx vitest run` (the gate, CI, `npm test`) runs both; `npx vitest run --project
    // fast` leaves out the headless bot-match guards for quick feedback while working. Every seed stays in `slow`.
    projects: [
      // The pipeline's own rules (pipeline/scope.mjs, pipeline/smokeReport.mjs) are tested here too.
      { extends: true, test: { name: 'fast', include: ['src/**/*.test.ts', 'pipeline/**/*.test.mjs'], exclude: SLOW_TESTS } },
      { extends: true, test: { name: 'slow', include: SLOW_TESTS } },
      ...(MEASURE_BALANCE ? [{ extends: true, test: { name: 'balance', include: BALANCE_MEASURES } }] : []),
      ...(CONTENT_REPORT ? [{ extends: true, test: { name: 'content', include: CONTENT_REPORTS } }] : []),
    ],
  },
}));
