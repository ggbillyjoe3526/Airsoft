import { describe, expect, it } from 'vitest';
import playwrightConfig from '../../playwright.config.ts?raw';
import readme from '../../README.md?raw';
import workflow from '../../.github/workflows/pages.yml?raw';
import { releaseName } from './buildVersion';

// The play link's workflow (IM2) must agree with the title screen on what a release tag is, and keep its publish
// path on the default branch.

/** The text of one top-level job. */
function job(name: string): string {
  const m = new RegExp(`^ {2}${name}:\\n((?:    .*\\n|\\n)*)`, 'm').exec(workflow);
  if (!m) throw new Error(`no job ${name}`);
  return m[1] ?? '';
}

const pattern = /release='([^']+)'/.exec(workflow)?.[1] ?? '';
// The shell pattern is plain ERE (grep -E), which JS reads the same way.
const workflowAccepts = (tag: string): boolean => new RegExp(pattern).test(tag);

describe('the Check out the release pattern', () => {
  it('is found in the workflow', () => {
    expect(pattern).not.toBe('');
  });

  const tags = [
    '0.1-dev.5', '0.1-beta.1', '0.1.0', '0.1-dev.12', 'v0.1-alpha.3', '0.1', '0.1-dev', '1.2.3-beta.10',
    'latest', '0.1-rc.1', '0.1-dev.', 'main', '1', 'x', 'x;rm', '0.1-dev.5 ', '0.1.0.1', '0.1-dev.5-3-gabc1234', 'vv0.1', '',
  ];
  it.each(tags)('agrees with releaseName on %j', (tag) => {
    expect(workflowAccepts(tag)).toBe(releaseName(tag) !== '');
  });
});

describe('who publishes', () => {
  it('deploys only from a workflow_dispatch run, after the build', () => {
    expect(job('deploy')).toMatch(/if: github\.event_name == 'workflow_dispatch'/);
    expect(job('deploy')).toMatch(/needs: build/);
    expect(job('deploy')).toMatch(/actions\/deploy-pages@/);
  });

  it('never deploys or builds in the tag-triggered hand-over job', () => {
    const handOver = job('hand-over');
    expect(handOver).toMatch(/if: github\.event_name == 'push'/);
    expect(handOver).toMatch(/gh workflow run pages\.yml/);
    expect(handOver).not.toMatch(/deploy-pages|upload-pages-artifact|npm (ci|run build)/);
  });

  it('builds on dispatch and pull requests, not on a tag push', () => {
    expect(job('build')).toMatch(/if: github\.event_name != 'push'/);
  });

  it('starts on tag pushes only', () => {
    expect(workflow).toMatch(/on:\n {2}push:\n {4}tags:/);
    expect(workflow).not.toMatch(/branches:/);
  });
});

describe('the play link path', () => {
  it('is the same /Airsoft/ in the README and the release browser project', () => {
    const link = /https:\/\/[\w.-]+\.github\.io(\/[\w.-]+\/)/.exec(readme)?.[1];
    expect(link).toBe('/Airsoft/');
    expect(/RELEASE_PATH = '([^']+)'/.exec(playwrightConfig)?.[1]).toBe(link);
  });
});
