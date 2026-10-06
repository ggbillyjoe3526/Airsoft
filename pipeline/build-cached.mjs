#!/usr/bin/env node
/**
 * Builds the game once per source (audit CORE-22, CORE-14): the production build (`npm run build`: tsc, Vite, the chunk
 * budgets, into dist/) or the e2e build (`vite build --mode e2e` into dist-e2e/, the only build with `?nolock`,
 * `?script=perf` and `window.airsoft`), and skips the build when the output is already that of the same source.
 *
 *   node pipeline/build-cached.mjs [--mode production|e2e] [--force]
 *
 * "The same source" is a hash of everything the bundle is made from (src/ without its tests, public/, index.html,
 * pool.md, stats.md, the Vite, TypeScript and npm files), the mode, `git describe` (the title screen's version) and, for
 * the production build, whether it writes the .br/.gz copies (AIRSOFT_PRECOMPRESS=0 leaves them out: the gate's --quick
 * build, audit CORE-11), so a build without them is never reused where the release smoke test needs them; kept in
 * pipeline/out/build-<mode>.json with the output's index.html time, so a build made by hand in between is
 * never mistaken for it. The gate's build step forces a build (it is the type check) and leaves the stamp; the smoke
 * test's servers and the perf harness then reuse what is there.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'production';
const force = args.includes('--force');
/** Whether this production build writes the precompressed copies (src/config/precompress.ts › precompressWanted). */
const precompressed = mode !== 'e2e' && process.env.AIRSOFT_PRECOMPRESS?.trim() !== '0';
const BUILDS = {
  production: { outDir: 'dist', cmd: 'npm', args: ['run', 'build'] },
  e2e: { outDir: 'dist-e2e', cmd: 'npx', args: ['vite', 'build', '--mode', 'e2e', '--outDir', 'dist-e2e', '--emptyOutDir'] },
};
const build = BUILDS[mode];
if (!build) {
  console.error(`build-cached: unknown --mode ${mode} (production or e2e)`);
  process.exit(2);
}

/** Files the bundle is made from, as git sees them (tracked and new, not ignored). */
const ROOT_FILES = new Set(['index.html', 'pool.md', 'stats.md', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json']);
const isInput = (f) => ROOT_FILES.has(f) || f.startsWith('public/') || (f.startsWith('src/') && !f.endsWith('.test.ts'));

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

function sourceHash() {
  const hash = createHash('sha256');
  hash.update(`mode ${mode}\ndescribe ${git('describe', '--tags', '--always')}\nprecompressed ${precompressed}\n`);
  const files = git('ls-files', '-co', '--exclude-standard').split('\n').filter(isInput).sort();
  for (const f of files) {
    const path = join(ROOT, f);
    if (!existsSync(path)) continue; // deleted in the working tree, not yet in the index
    hash.update(`${f}\0`);
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const stampPath = join(ROOT, 'pipeline', 'out', `build-${mode}.json`);
const indexPath = join(ROOT, build.outDir, 'index.html');
const hash = sourceHash();
const indexTime = () => (existsSync(indexPath) ? statSync(indexPath).mtimeMs : null);

if (!force && existsSync(stampPath)) {
  try {
    const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
    if (stamp.hash === hash && stamp.indexMtimeMs === indexTime()) {
      console.log(`build-cached: ${build.outDir}/ is already the ${mode} build of this source; not rebuilding`);
      process.exit(0);
    }
  } catch {
    // An unreadable stamp: build.
  }
}

console.log(`build-cached: building ${mode} into ${build.outDir}/${mode === 'e2e' ? '' : precompressed ? ' with the .br/.gz copies' : ' without the .br/.gz copies (AIRSOFT_PRECOMPRESS=0)'}`);
try {
  execFileSync(build.cmd, build.args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
} catch (e) {
  process.exit(typeof e.status === 'number' ? e.status : 1);
}
mkdirSync(dirname(stampPath), { recursive: true });
writeFileSync(stampPath, `${JSON.stringify({ mode, precompressed, hash, indexMtimeMs: indexTime(), when: new Date().toISOString() }, null, 2)}\n`);
