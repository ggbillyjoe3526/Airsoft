import { describe, expect, it } from 'vitest';
import { archivalDescribe, UNKNOWN_BUILD, versionLabel } from './buildVersion';

describe('the title screen version (owner, 2026-10-04)', () => {
  it('names a release as its tag', () => {
    expect(versionLabel('v0.1-alpha.3\n').label).toBe('v0.1-alpha.3');
    expect(versionLabel('v0.1-beta').label).toBe('v0.1-beta');
    expect(versionLabel('v0.1.2').label).toBe('v0.1.2');
  });

  it('marks a build after a release with the commits since and the commit', () => {
    expect(versionLabel('v0.1-alpha.3-12-g1dc698e')).toEqual({
      label: 'v0.1-alpha.3+12 · 1dc698e',
      title: '12 commits after v0.1-alpha.3 (commit 1dc698e)',
    });
    expect(versionLabel('v0.1-alpha.3-1-g1dc698e').title).toBe('1 commit after v0.1-alpha.3 (commit 1dc698e)');
  });

  it('falls back to the commit, then to a plain label', () => {
    expect(versionLabel('1dc698e').label).toBe('build 1dc698e');
    expect(versionLabel('').label).toBe(UNKNOWN_BUILD);
    expect(versionLabel('fatal: not a git repository').label).toBe(UNKNOWN_BUILD);
  });

  it('reads a release download only once GitHub has filled it in', () => {
    expect(archivalDescribe('commit: 1dc698e\ndescribe: v0.1-alpha.3\n')).toBe('v0.1-alpha.3');
    expect(archivalDescribe('describe: $Format:%(describe:tags=true)$\n')).toBe('');
    expect(archivalDescribe('')).toBe('');
  });
});
