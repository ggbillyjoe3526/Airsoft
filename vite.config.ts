import type { HtmlTagDescriptor, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { archivalDescribe, versionLabel } from './src/config/buildVersion.ts';
import { LOADING } from './src/config/loading.ts';
import { CONTENT_SECURITY_POLICY } from './src/config/page.ts';

/**
 * Size budgets in kB (minified, before gzip). Rapier inlines its WASM, so it gets its own budget: 4,333 kB measured at
 * @dimforge/rapier3d-compat 0.21.0 plus about 5 % (DECISIONS 2026-10-04), so an upgrade that grows it is a deliberate bump.
 */
const CHUNK_BUDGET_KB = { rapier: 4550, default: 800 };

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
  plugins: [chunkBudget(), pageMeta()],
  build: {
    target: 'es2022',
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
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
