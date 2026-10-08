import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// The project's Claude Code hooks (.claude/settings.json; token-efficiency plan, items 23 and 24).
const ROOT = join(import.meta.dirname, '..');
const READ_GUARD = join(ROOT, '.claude/hooks/read-guard.mjs');
const SESSION_START = join(ROOT, '.claude/hooks/session-start.mjs');
const dir = mkdtempSync(join(tmpdir(), 'hooks-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const file = (name, bytes) => {
  const path = join(dir, name);
  writeFileSync(path, 'x'.repeat(bytes));
  return path;
};
const guard = (input) => spawnSync('node', [READ_GUARD], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' });

describe('read guard', () => {
  const big = file('big.md', 41 * 1024);

  it('stops a whole-file read of a text file over 40 KB and says to grep first', () => {
    const r = guard({ tool_input: { file_path: big } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Grep');
    expect(r.stderr).toContain('41 KB');
  });

  it('lets a ranged read of the same file through', () => {
    expect(guard({ tool_input: { file_path: big, offset: 10, limit: 40 } }).status).toBe(0);
    expect(guard({ tool_input: { file_path: big, limit: 40 } }).status).toBe(0);
  });

  it('lets small files, non-text files, missing files and bad input through', () => {
    expect(guard({ tool_input: { file_path: file('small.ts', 39 * 1024) } }).status).toBe(0);
    expect(guard({ tool_input: { file_path: file('shot.png', 200 * 1024) } }).status).toBe(0);
    expect(guard({ tool_input: { file_path: join(dir, 'missing.md') } }).status).toBe(0);
    expect(guard('not json').status).toBe(0);
  });
});

describe('session start', () => {
  const run = (env) => spawnSync('node', [SESSION_START], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env } });

  it('does nothing outside a cloud session', () => {
    const envFile = file('local.env', 0);
    const r = run({ CLAUDE_CODE_REMOTE: '', CLAUDE_ENV_FILE: envFile });
    expect(r.status).toBe(0);
    expect(readFileSync(envFile, 'utf8')).toBe('');
  });

  it('in a cloud session with dependencies installed, only sets the Chromium path when the container has it', () => {
    const envFile = file('remote.env', 0);
    const r = run({ CLAUDE_CODE_REMOTE: 'true', CLAUDE_ENV_FILE: envFile });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    const hasChromium = spawnSync('test', ['-e', '/opt/pw-browsers/chromium']).status === 0;
    expect(readFileSync(envFile, 'utf8')).toBe(hasChromium ? 'export PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium\n' : '');
  });
});
