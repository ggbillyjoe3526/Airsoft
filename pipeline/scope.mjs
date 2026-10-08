/**
 * The scope gate's rules (pipeline/gate.mjs, pipeline/README.md), kept apart from the gate script so they can be tested
 * (scope.test.mjs): which files a task may change, how a task block in docs/TASKS.md reads, and which task ids a pull
 * request's title names (CI judges scope and changelog from it).
 */

/**
 * What any task may touch besides its `touches` list: tests, the browser tests, docs, CHANGELOG, README and the folder
 * READMEs under `src/` (a task that adds, renames or moves a file keeps its folder's README current, TE2).
 * `pool.md` (game data the game reads at start) and `CLAUDE.md` (the rules every agent works under) are not on it
 * (audit CORE-07): a task that changes them lists them in `touches`.
 */
export const ALWAYS_ALLOWED = [/\.test\.ts$/, /^e2e\//, /^docs\//, /^CHANGELOG\.md$/, /^README\.md$/, /^src\/(.+\/)?README\.md$/];

/** What a QA commit (trailer `Agent: qa`) may touch: tests and their support only. */
export const QA_ALLOWED = [/\.test\.ts$/, /^e2e\//, /^src\/.*\/testSupport\.ts$/, /^src\/ai\/depotMatchSupport\.ts$/, /^src\/pool\/testStorage\.ts$/];

/** A task id as the pipeline writes them: M27, M29a, FA11a, BP1. */
const TASK_ID = /[A-Z]{1,3}\d+[a-z]?/;

/** Whether `file` may change in a task whose block lists `touches` (files, or folders with a trailing slash). */
export function allowedFile(file, touches) {
  if (file.startsWith('pipeline/out/')) return true;
  if (ALWAYS_ALLOWED.some((re) => re.test(file))) return true;
  return touches.some((t) => (t.endsWith('/') ? file.startsWith(t) : file === t));
}

/** Whether `file` may change in a commit with the `Agent: qa` trailer. */
export function qaAllowedFile(file) {
  return QA_ALLOWED.some((re) => re.test(file));
}

/** The block `## <id> · …` of a docs/TASKS.md text: its touches, tier and perf; null when the text has no such block. */
export function parseTaskBlock(text, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`^## ${escaped}\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  if (!m) return null;
  const field = (key) => m[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  return { touches: field('touches').split(',').map((s) => s.trim()).filter(Boolean), tier: field('tier'), perf: field('perf') };
}

/**
 * The first of `versions` (docs/TASKS.md texts, newest first, each `{ where, text }`) that has the task's block, with
 * where it was found; null when none has it. A branch clears its block before the pull request merges (the pipeline's
 * records step), so CI also looks back through the branch's history.
 */
export function findTaskBlock(versions, id) {
  for (const { where, text } of versions) {
    const block = text === null ? null : parseTaskBlock(text, id);
    if (block) return { ...block, where };
  }
  return null;
}

/**
 * docs/TASKS.md as `workingTree` holds it, then as every commit in `base..HEAD` left it (newest first, each distinct
 * version once), then at `base`; `git(...args)` runs git and returns its output, throwing on failure. Every commit is
 * read, not only those git's path filter keeps: once a branch has cleared its block and merged main in, its file
 * equals main's, and history simplification would skip the side where the block was (CI's merge ref, audit CORE-08).
 */
export function* tasksVersions(git, base, workingTree) {
  yield { where: 'working tree', text: workingTree };
  const seen = new Set();
  const show = (rev) => {
    let blob;
    try {
      blob = git('rev-parse', '--verify', '--quiet', `${rev}:docs/TASKS.md`);
    } catch {
      return null;
    }
    if (!blob || seen.has(blob)) return null;
    seen.add(blob);
    return git('cat-file', 'blob', blob);
  };
  for (const sha of git('rev-list', `${base}..HEAD`).split('\n').filter(Boolean)) {
    const text = show(sha);
    if (text !== null) yield { where: sha.slice(0, 7), text };
  }
  const text = show(base);
  if (text !== null) yield { where: `base ${base.slice(0, 7)}`, text };
}

/**
 * The task ids a pull request's title starts with: "FA12: faster BB collision" → ['FA12'], "FA5 + FA9: key bindings"
 * → ['FA5', 'FA9'], "M30 · BB flight" → ['M30']; [] when it doesn't start with one (scope and changelog are then
 * skipped).
 */
export function taskIdsFromTitle(title) {
  const lead = new RegExp(`^\\s*(${TASK_ID.source}(?:\\s*(?:\\+|,|&|and)\\s*${TASK_ID.source})*)(?!\\w)`).exec(title ?? '');
  return lead ? lead[1].match(new RegExp(TASK_ID.source, 'g')) : [];
}

/** The `--task` value: one id or several joined with commas ("FA5,FA9"). */
export function parseTaskList(value) {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
