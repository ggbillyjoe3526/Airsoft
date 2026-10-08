import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assemblePacket, contractEntries, contractsForDiff, gateSummary, leftOutReason, parseNumstat, splitDiff, writePacket } from './packet.mjs';
import { taskBlockText } from './scope.mjs';

/** The review packet the critic and QA read first (pipeline/packet.mjs, TE3: token-efficiency plan, item 15). */

const ARCHITECTURE = `# Architecture

## Contracts

The interfaces a task may not change.

- **\`PlayerCommand\`** (\`sim/commands.ts\`). One command per character per tick.
  Pinned by \`sim/simulation.test.ts\`.
- **\`WorldQuery\` and \`CharacterMover\`** (\`sim/armament.ts\`, \`sim/movement.ts\`). How the sim asks the world.

  Pinned by \`sim/movement.test.ts\`.
- **\`pool.md\`'s format** (\`pool/poolFile.ts\`). The hand-edited asset register.

## Working notes

- **Not a contract** (\`sim/other.ts\`).
`;

describe('what the packet leaves out (leftOutReason)', () => {
  it('leaves out the change records and generated files', () => {
    for (const f of ['docs/records/TE3.md', 'CHANGELOG.md', 'docs/FEATURES.md', 'docs/patch-notes/0.1-dev.5.md', 'docs/archive/0.1-dev/ROADMAP.md', 'docs/TASKS.md', 'package-lock.json', 'pipeline/baseline/container.json', 'src/map/bakes/depot.probes.b64']) {
      expect(leftOutReason(f), f).not.toBeNull();
    }
  });

  it('keeps code, tests and the docs the critic\'s check 8 reads', () => {
    for (const f of ['src/sim/bbs.ts', 'src/sim/bbs.test.ts', 'pipeline/gate.mjs', 'docs/DECISIONS.md', 'docs/KNOWN_ISSUES.md', 'docs/ARCHITECTURE.md', 'src/sim/README.md', 'README.md', 'package.json']) {
      expect(leftOutReason(f), f).toBeNull();
    }
  });
});

describe('the diff\'s parts (parseNumstat, splitDiff)', () => {
  it('reads numstat -z, a renamed file under its new path and a binary file as such', () => {
    const text = '3\t2\tsrc/a.ts\0' + '5\t0\t\0docs/OLD.md\0docs/archive/OLD.md\0' + '-\t-\tpublic/x.png\0';
    expect(parseNumstat(text)).toEqual([
      { file: 'src/a.ts', added: 3, deleted: 2, binary: false },
      { file: 'docs/archive/OLD.md', added: 5, deleted: 0, binary: false },
      { file: 'public/x.png', added: 0, deleted: 0, binary: true },
    ]);
    expect(parseNumstat('')).toEqual([]);
  });

  it('splits a unified diff per file, under the new path', () => {
    const diff = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/docs/OLD.md b/docs/archive/OLD.md\nsimilarity index 90%\n';
    const parts = splitDiff(diff);
    expect([...parts.keys()]).toEqual(['src/a.ts', 'docs/archive/OLD.md']);
    expect(parts.get('src/a.ts')).toBe('diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n');
    expect(parts.get('docs/archive/OLD.md').endsWith('\n')).toBe(true);
  });
});

describe('the contracts the critic\'s check 2 reads (contractEntries, contractsForDiff)', () => {
  const entries = contractEntries(ARCHITECTURE);

  it('reads every entry of the Contracts section, with the source files it names but not its pinning tests', () => {
    expect(entries.map((e) => e.name)).toEqual(['`PlayerCommand`', '`WorldQuery` and `CharacterMover`', '`pool.md`\'s format']);
    expect(entries[0].files).toEqual(['sim/commands.ts']);
    expect(entries[1].files).toEqual(['sim/armament.ts', 'sim/movement.ts']);
    expect(entries[1].text).toContain('Pinned by `sim/movement.test.ts`.');
    expect(entries[2].files).toEqual(['pool.md', 'pool/poolFile.ts']);
    expect(contractEntries('# No contracts here\n')).toEqual([]);
  });

  it('picks the contracts whose files the diff touches, and those the task names', () => {
    const touched = contractsForDiff(entries, ['src/sim/movement.ts', 'src/sim/movement.test.ts', 'pool.md', 'src/ui/hud.ts'], 'none');
    expect(touched.map((c) => [c.entry.name, c.named, c.touched])).toEqual([
      ['`WorldQuery` and `CharacterMover`', false, ['src/sim/movement.ts']],
      ['`pool.md`\'s format', false, ['pool.md']],
    ]);
    const named = contractsForDiff(entries, ['src/ui/hud.ts'], 'CharacterMover (behaviour unchanged)');
    expect(named.map((c) => [c.entry.name, c.named, c.touched])).toEqual([['`WorldQuery` and `CharacterMover`', true, []]]);
  });

  it('picks none for a test-only diff or a task that names none', () => {
    expect(contractsForDiff(entries, ['src/sim/simulation.test.ts', 'src/sim/movement.test.ts'], 'none')).toEqual([]);
    expect(contractsForDiff(entries, [], '')).toEqual([]);
  });
});

describe('the gate summary (gateSummary)', () => {
  const report = {
    head: 'abcdef1234567',
    mode: 'full',
    env: 'container',
    base: 'origin/main@1234567',
    when: '2026-10-08T07:00:00.000Z',
    pass: true,
    gates: {
      build: { pass: true, ms: 33000 },
      tests: { pass: true, ms: 1277000, total: 3383, failed: 0, projects: 'all' },
      smoke: { pass: true, ms: 455000, expected: 41, unexpected: 0 },
      perf: { pass: true, ms: 90000, runs: [{ run: 'Depot Elimination Low', pass: true, metrics: { drawCalls: 112, drawCallsMax: 130, triangles: 120000.4, gpuMemoryMB: 85, heapGrowthMB: 1.5, p95Ms: 40 } }], warnings: ['container.json is 25 commits old'] },
      scope: { pass: true, touches: ['pipeline/', '.claude/'] },
      changelog: { pass: true, lines: ['- **TE3** · a line'] },
    },
  };

  it('says where the report is from and gives a line per gate, a perf run\'s numbers under it', () => {
    const lines = gateSummary(report, 'abcdef1234567');
    expect(lines[0]).toContain('head abcdef1 (this head)');
    expect(lines).toContain('- tests ✓ 1277 s · 3383 tests (all)');
    expect(lines).toContain('- smoke ✓ 455 s · 41 passed');
    expect(lines).toContain('  - Depot Elimination Low ✓ · 112 draw calls (max 130), 120000 triangles, 85 MB GPU, heap +1.5 MB, p95 40 ms');
    expect(lines).toContain('  - warning: container.json is 25 commits old');
    expect(lines).toContain('- scope ✓ · touches pipeline/, .claude/');
    expect(lines).toContain('- changelog ✓ · - **TE3** · a line');
  });

  it('warns when the report is from another head, and says when there is none', () => {
    expect(gateSummary(report, '9999999aaaa')[0]).toContain('not this head (9999999): run the gate again before the critic');
    expect(gateSummary(null, 'abc')).toEqual(['No gate report yet: `node pipeline/gate.mjs --task <id>` writes one.']);
  });
});

describe('the packet\'s layout (assemblePacket)', () => {
  const files = [
    { file: 'CHANGELOG.md', added: 1, deleted: 0, binary: false, diff: null, leftOut: 'change records' },
    { file: 'src/a.ts', added: 1, deleted: 1, binary: false, diff: 'diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n', leftOut: null },
    { file: 'src/b.ts', added: 2, deleted: 0, binary: false, diff: 'diff --git a/src/b.ts b/src/b.ts\n@@ -0,0 +1,2 @@\n+p\n+q\n', leftOut: null },
  ];
  const parts = { ids: ['M1'], head: 'abcdef1234', base: 'origin/main@1234567', blocks: ['## M1 · A task\ntier: ui\ncontract: none'], report: null, contracts: [], contractCount: 12, qa: null, files, diffCommand: '`git diff 1234567 -- <file>`' };

  it('gives each carried file the packet\'s own line range of its diff, and says why a file is left out', () => {
    const text = assemblePacket(parts);
    const lines = text.split('\n');
    const range = (file) => lines.find((l) => l.startsWith(`- \`${file}\``)).match(/lines (\d+)–(\d+)$/).slice(1).map(Number);
    const [aFrom, aTo] = range('src/a.ts');
    expect(lines[aFrom - 1]).toBe('diff --git a/src/a.ts b/src/a.ts');
    expect(lines[aTo - 1]).toBe('+y');
    const [bFrom, bTo] = range('src/b.ts');
    expect(bFrom).toBe(aTo + 1);
    expect(lines[bTo - 1]).toBe('+q');
    expect(lines.find((l) => l.startsWith('- `CHANGELOG.md`'))).toBe('- `CHANGELOG.md` +1 −0 · left out (change records)');
  });

  it('says on line 2 where the summary ends and the diff runs, and quotes the block, the contracts and QA\'s report', () => {
    const text = assemblePacket({ ...parts, qa: 'Task: M1 · QA\nTests added: 3' });
    const lines = text.split('\n');
    const [, summaryEnd, diffFrom, diffTo] = lines[1].match(/lines 1–(\d+) first.*from line (\d+) to (\d+)/).map(Number);
    expect(lines[summaryEnd - 1]).toMatch(/^- `src\/b\.ts`/);
    expect(lines[diffFrom - 1]).toBe('diff --git a/src/a.ts b/src/a.ts');
    expect(diffTo).toBe(lines.length - 1);
    expect(lines[0]).toBe('# Review packet · M1 · head abcdef1');
    expect(text).toContain('## M1 · A task\ntier: ui\ncontract: none');
    expect(text).toContain('(12 contracts), and the task names none.');
    expect(text).toContain('## QA report\n\nTask: M1 · QA\nTests added: 3');
    expect(text).not.toContain('Over 40 KB');
  });

  it('tells the reader to go by range once the packet is over the read guard\'s 40 KB', () => {
    const big = { file: 'src/big.ts', added: 3000, deleted: 0, binary: false, diff: `diff --git a/src/big.ts b/src/big.ts\n${'+const x = 1; // padding the packet past forty kilobytes\n'.repeat(1000)}`, leftOut: null };
    expect(assemblePacket({ ...parts, files: [...files, big] }).split('\n')[1]).toContain('Over 40 KB: read the diff by range');
  });

  it('carries the failures when the report failed, and names a missing block', () => {
    const report = { head: 'abcdef1234', mode: 'quick', env: 'container', base: 'origin/main@1234567', when: 'now', pass: false, gates: { tests: { pass: false, total: 2, failed: 1, failures: [{ test: 'a b', file: 'src/a.test.ts', message: 'boom' }] } } };
    const text = assemblePacket({ ...parts, blocks: [null], report });
    expect(text).toContain('No block "## M1" in docs/TASKS.md or its history');
    expect(text).toContain('## Failures\n\nFailed: tests.');
    expect(text).toContain('✗ src/a.test.ts › a b');
  });
});

describe('the block the packet quotes (scope.mjs › taskBlockText)', () => {
  it('ends at the first blank line, so the prose between blocks stays out', () => {
    const tasks = '# Tasks\n\n## M1 · One\ntier: ui\nacceptance:\n  1. a\nstatus: open\n\n**Prose** between blocks.\n\n## M12 · Twelve\ntier: core\n';
    expect(taskBlockText(tasks, 'M1')).toBe('## M1 · One\ntier: ui\nacceptance:\n  1. a\nstatus: open');
    expect(taskBlockText(tasks, 'M12')).toBe('## M12 · Twelve\ntier: core');
    expect(taskBlockText(tasks, 'M2')).toBeNull();
  });
});

describe('the packet from a repository (writePacket)', () => {
  it('quotes the block from the branch\'s history, carries code and new files, leaves records out and picks the touched contract', () => {
    const dir = mkdtempSync(join(tmpdir(), 'packet-git-'));
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const write = (path, text) => {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    try {
      git('init', '-q', '-b', 'main');
      write('docs/TASKS.md', '# Tasks\n');
      write('docs/ARCHITECTURE.md', ARCHITECTURE);
      write('src/sim/movement.ts', 'export const speed = 1;\n');
      write('CHANGELOG.md', '# Changelog\n\n## Unreleased\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'base');
      git('checkout', '-q', '-b', 'task');
      write('docs/TASKS.md', '# Tasks\n\n## M99 · Faster walk\ntier: core\nperf: required\ntouches: src/sim/\ncontract: none\nstatus: open\n');
      git('commit', '-q', '-am', 'M99: block');
      write('src/sim/movement.ts', 'export const speed = 2;\n');
      write('CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- **M99** · You walk faster\n');
      write('docs/TASKS.md', '# Tasks\n');
      git('commit', '-q', '-am', 'M99: work and records');
      write('src/sim/walk.test.ts', 'it("walks", () => {});\n');
      write('pipeline/out/qa-artifacts/qa-report.md', 'Task: M99 · QA\nOne test added.\n');
      execFileSync('git', ['-C', dir, 'config', 'core.excludesFile', '/dev/null']);
      write('.gitignore', 'pipeline/out/\n');

      expect(writePacket({ ids: ['M99'], base: 'main', root: dir })).toBe('pipeline/out/review-packet.md');
      const text = readFileSync(join(dir, 'pipeline/out/review-packet.md'), 'utf8');
      expect(text).toContain('## M99 · Faster walk\ntier: core');
      expect(text).toMatch(/- `src\/sim\/movement\.ts` \+1 −1 · lines \d+–\d+/);
      expect(text).toMatch(/- `src\/sim\/walk\.test\.ts` \+1 −0 · lines \d+–\d+/);
      expect(text).toContain('- `CHANGELOG.md` +2 −0 · left out (change records)');
      expect(text).toContain('+export const speed = 2;');
      expect(text).not.toContain('You walk faster');
      expect(text).toContain('touched: src/sim/movement.ts');
      expect(text).toContain('## QA report\n\nTask: M99 · QA\nOne test added.');
      expect(text).toContain('No gate report yet');

      // QA's report for another task is not quoted.
      write('pipeline/out/qa-artifacts/qa-report.md', 'Task: M98 · QA\n');
      writePacket({ ids: ['M99'], base: 'main', root: dir });
      expect(readFileSync(join(dir, 'pipeline/out/review-packet.md'), 'utf8')).toContain('None for M99 yet');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
