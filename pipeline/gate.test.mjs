import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** The gate's flags are checked before it builds anything (M51), so a bad CI job fails at once with the reason. */
const gate = (...args) => spawnSync(process.execPath, ['pipeline/gate.mjs', ...args], { encoding: 'utf8' });

describe('the gate\'s flags (pipeline/gate.mjs, M51)', () => {
  it.each([
    [['--tests', 'bogus'], '--tests takes'],
    [['--shard', 'x'], '--shard takes'],
    [['--shard', '1of3'], '--shard takes'],
    [['--shard', '0/3'], '--shard takes'],
    [['--shard', '4/3'], '--shard takes'],
    [['--shard', '1/0'], '--shard takes'],
    [['--only', 'build'], '--only takes'],
  ])('refuses %j', (args, message) => {
    const r = gate(...args);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`gate: ${message}`);
  });
});
