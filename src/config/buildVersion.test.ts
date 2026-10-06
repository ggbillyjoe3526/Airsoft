import { describe, expect, it } from 'vitest';
import readme from '../../README.md?raw';
import { archivalDescribe, readmeRelease, releaseName, UNKNOWN_BUILD, versionLabel } from './buildVersion';

describe('the title screen version (owner, 2026-10-04)', () => {
  it('names a release in the owner\'s style (owner, 2026-10-05)', () => {
    expect(versionLabel('0.1-dev.3\n')).toEqual({ label: '0.1 Dev 3', title: 'Release 0.1 Dev 3' });
    expect(versionLabel('0.1-beta.1').label).toBe('0.1 Beta 1');
    expect(versionLabel('0.1.0').label).toBe('0.1.0');
  });

  it('reads the old v0.1-alpha tags as the Dev builds they were renamed to', () => {
    expect(releaseName('v0.1-alpha')).toBe('0.1 Dev 1');
    expect(releaseName('v0.1-alpha.2')).toBe('0.1 Dev 2');
    expect(versionLabel('v0.1-alpha.3\n').label).toBe('0.1 Dev 3');
    expect(releaseName('v0.1-beta')).toBe('0.1 Beta 1');
    expect(releaseName('v0.1.2')).toBe('0.1.2');
  });

  it('marks a build after a release with the commits since and the commit', () => {
    expect(versionLabel('0.1-dev.3-12-g1dc698e')).toEqual({
      label: '0.1 Dev 3+12 · 1dc698e',
      title: '12 commits after 0.1 Dev 3 (commit 1dc698e)',
    });
    expect(versionLabel('0.1-beta.2-1-g1dc698e').title).toBe('1 commit after 0.1 Beta 2 (commit 1dc698e)');
    expect(versionLabel('v0.1-alpha.3-40-gabc1234').label).toBe('0.1 Dev 3+40 · abc1234');
  });

  it('calls a tag that is not a release a plain build', () => {
    for (const tag of ['latest', 'v0.1-alpha.2a', '0.1-gamma.1', 'v1', 'release-0.1']) expect(releaseName(tag)).toBe('');
    expect(versionLabel('latest').label).toBe(UNKNOWN_BUILD);
    expect(versionLabel('latest-3-g1dc698e').label).toBe(UNKNOWN_BUILD);
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

  it('names the release a tag-less clone came after, from README\'s download link (audit CORE-10)', () => {
    expect(versionLabel('1dc698e\n', '0.1-dev.3')).toEqual({
      label: '0.1 Dev 3+? · 1dc698e',
      title: 'Commit 1dc698e, after 0.1 Dev 3 (built without the git tags, so the commits since it aren\'t counted)',
    });
    expect(versionLabel('1dc698e', '0.1-beta.2').label).toBe('0.1 Beta 2+? · 1dc698e');
    // No release named, or not a release: the plain commit, as before.
    expect(versionLabel('1dc698e', '').label).toBe('build 1dc698e');
    expect(versionLabel('1dc698e', 'main').label).toBe('build 1dc698e');
    // A describe that reaches a tag is never overridden by README.
    expect(versionLabel('0.1-dev.3-12-g1dc698e', '0.1-dev.2').label).toBe('0.1 Dev 3+12 · 1dc698e');
    expect(versionLabel('0.1-dev.4', '0.1-dev.3').label).toBe('0.1 Dev 4');
    expect(versionLabel('', '0.1-dev.3').label).toBe(UNKNOWN_BUILD);
  });

  it('reads the release README.md links to, and only a release', () => {
    expect(readmeRelease('**https://github.com/owner/Airsoft/archive/refs/tags/0.1-dev.3.zip**')).toBe('0.1-dev.3');
    expect(readmeRelease('[zip](https://github.com/o/r/archive/refs/tags/0.1-beta.1.zip)')).toBe('0.1-beta.1');
    expect(readmeRelease('https://github.com/o/r/archive/refs/heads/main.zip')).toBe('');
    expect(readmeRelease('https://github.com/o/r/archive/refs/tags/latest.zip')).toBe('');
    expect(readmeRelease('')).toBe('');
    // The repository's own README names one (the release checklist, CLAUDE.md §7, keeps it current).
    expect(releaseName(readmeRelease(readme))).not.toBe('');
  });
});
