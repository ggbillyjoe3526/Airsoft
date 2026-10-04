import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowedFile, findTaskBlock, parseTaskBlock, parseTaskList, qaAllowedFile, taskIdsFromTitle, tasksVersions } from './scope.mjs';

const TASKS = `# Tasks

## M27 · probeGround without a per-tick allocation
tier: core
perf: required
touches: src/physics/physicsWorld.ts, src/sim/
contract: CharacterMover
status: open

## M28 · Something else
tier: ui
perf: skip
touches: src/ui/hud.ts
status: open
`;

describe('the scope gate (pipeline/gate.mjs)', () => {
  const touches = ['src/physics/physicsWorld.ts', 'src/sim/'];

  it('allows the task\'s files and folders, tests, docs, CHANGELOG and README', () => {
    for (const f of ['src/physics/physicsWorld.ts', 'src/sim/bbs.ts', 'src/ui/hud.test.ts', 'e2e/boot.spec.ts', 'docs/TASKS.md', 'CHANGELOG.md', 'README.md', 'pipeline/out/gate-report.json']) {
      expect(allowedFile(f, touches), f).toBe(true);
    }
  });

  it('keeps pool.md and CLAUDE.md out unless the task lists them (audit CORE-07)', () => {
    expect(allowedFile('pool.md', touches)).toBe(false);
    expect(allowedFile('CLAUDE.md', touches)).toBe(false);
    expect(allowedFile('pool.md', [...touches, 'pool.md'])).toBe(true);
    expect(allowedFile('CLAUDE.md', [...touches, 'CLAUDE.md'])).toBe(true);
  });

  it('rejects other files, and a folder entry needs its trailing slash', () => {
    expect(allowedFile('src/ui/hud.ts', touches)).toBe(false);
    expect(allowedFile('src/physics/physicsWorld.tsx', touches)).toBe(false);
    expect(allowedFile('src/simulation.ts', touches)).toBe(false);
    expect(allowedFile('src/physics/other.ts', ['src/physics'])).toBe(false);
    // The pipeline's own tests are not tests any task may change: a task lists them.
    expect(allowedFile('pipeline/scope.test.mjs', touches)).toBe(false);
    expect(allowedFile('pipeline/scope.test.mjs', [...touches, 'pipeline/scope.test.mjs'])).toBe(true);
  });

  it('lets QA commits touch only tests and their support files', () => {
    expect(qaAllowedFile('src/sim/bbs.test.ts')).toBe(true);
    expect(qaAllowedFile('src/ai/depotMatchSupport.ts')).toBe(true);
    expect(qaAllowedFile('src/sim/bbs.ts')).toBe(false);
    expect(qaAllowedFile('pool.md')).toBe(false);
    expect(qaAllowedFile('pipeline/scope.test.mjs')).toBe(false);
  });

  it('reads a task block\'s touches, tier and perf, and only that block\'s', () => {
    expect(parseTaskBlock(TASKS, 'M27')).toEqual({ touches: touches, tier: 'core', perf: 'required' });
    expect(parseTaskBlock(TASKS, 'M28')).toEqual({ touches: ['src/ui/hud.ts'], tier: 'ui', perf: 'skip' });
    expect(parseTaskBlock(TASKS, 'M2')).toBeNull();
    expect(parseTaskBlock(TASKS, 'M29')).toBeNull();
  });

  it('finds a block a branch has already cleared in an older version of TASKS.md (audit CORE-08)', () => {
    const versions = [
      { where: 'working tree', text: '# Tasks\n' },
      { where: 'abc1234', text: null },
      { where: 'def5678', text: TASKS },
    ];
    expect(findTaskBlock(versions, 'M28')).toMatchObject({ touches: ['src/ui/hud.ts'], where: 'def5678' });
    expect(findTaskBlock(versions.slice(0, 2), 'M28')).toBeNull();
  });
});

describe("the task block in the branch's history, from CI's merge ref (audit CORE-08)", () => {
  it('finds a block the branch added and cleared, after main was merged into the branch and the PR merged with --no-ff', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scope-git-'));
    const git = (...a) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const write = (path, text) => {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    const commit = (message) => {
      git('add', '-A');
      git('commit', '-q', '-m', message);
    };
    try {
      git('init', '-q', '-b', 'main');
      write('docs/TASKS.md', '# Tasks\n');
      write('src/a.ts', 'a\n');
      commit('base');
      git('checkout', '-q', '-b', 'task');
      write('docs/TASKS.md', '# Tasks\n\n## M99 · A task\ntier: ui\nperf: skip\ntouches: src/b.ts\nstatus: open\n');
      commit('M99: block');
      write('src/b.ts', 'b\n');
      commit('M99: work');
      write('docs/TASKS.md', '# Tasks\n');
      commit('M99: records (TASKS cleared)');
      git('checkout', '-q', 'main');
      write('src/c.ts', 'c\n');
      commit('another PR');
      git('checkout', '-q', 'task');
      git('merge', '-q', '--no-edit', 'main');
      // CI's merge ref: main as the first parent, the branch as the second.
      git('checkout', '-q', 'main');
      git('merge', '-q', '--no-ff', '--no-edit', 'task');
      const base = git('rev-parse', 'HEAD^1');
      // Git's path-filtered history skips the branch's side here: TASKS.md equals the first parent's.
      expect(git('rev-list', `${base}..HEAD`, '--', 'docs/TASKS.md')).toBe('');
      const found = findTaskBlock(tasksVersions(git, base, '# Tasks\n'), 'M99');
      expect(found).toMatchObject({ touches: ['src/b.ts'], tier: 'ui' });
      expect(findTaskBlock(tasksVersions(git, base, '# Tasks\n'), 'M98')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('task ids from a pull request title (CI, audit CORE-08)', () => {
  it('reads the ids a title starts with', () => {
    expect(taskIdsFromTitle('FA12: faster BB collision and own ricochets')).toEqual(['FA12']);
    expect(taskIdsFromTitle('FA5 + FA9: key bindings, HUD fixes and a cleaner UI')).toEqual(['FA5', 'FA9']);
    expect(taskIdsFromTitle('M30 · BB flight model')).toEqual(['M30']);
    expect(taskIdsFromTitle('M29a: weapon performance data')).toEqual(['M29a']);
    expect(taskIdsFromTitle('FA11a')).toEqual(['FA11a']);
    expect(taskIdsFromTitle('BP1, FA2 and FA3: bug pass')).toEqual(['BP1', 'FA2', 'FA3']);
  });

  it('reads nothing from a title that does not start with an id', () => {
    expect(taskIdsFromTitle('Bump Vite')).toEqual([]);
    expect(taskIdsFromTitle('Fix M27 again')).toEqual([]);
    expect(taskIdsFromTitle('M27abc: not an id')).toEqual([]);
    expect(taskIdsFromTitle('')).toEqual([]);
    expect(taskIdsFromTitle(undefined)).toEqual([]);
  });

  it('splits a --task list', () => {
    expect(parseTaskList('FA5,FA9')).toEqual(['FA5', 'FA9']);
    expect(parseTaskList(' FA11a ')).toEqual(['FA11a']);
    expect(parseTaskList(null)).toEqual([]);
  });
});
