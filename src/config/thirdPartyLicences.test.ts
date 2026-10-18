import { describe, expect, it } from 'vitest';
import { MIT_TERMS, noticeText, THIRD_PARTY_LICENCES, VENDORED_NOTICES, withVendoredNotices } from './thirdPartyLicences';

const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL, encoding: 'utf8'): string };

const root = new URL('../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');

describe('the third-party licences file (LC1)', () => {
  it('is a .txt file beside the page, which every browser shows as text', () => {
    expect(THIRD_PARTY_LICENCES.fileName).toMatch(/^[a-z-]+\.txt$/);
  });

  it("takes meshoptimizer's copyright line from the decoder three ships, followed by the MIT terms", () => {
    const meshopt = VENDORED_NOTICES.find((n) => n.name === 'meshoptimizer')!;
    const text = noticeText(meshopt, read(meshopt.source));
    expect(text.split('\n')[0]).toMatch(/^Copyright \(C\) 2016-\d{4}, by Arseny Kapoulkine/);
    expect(text.endsWith(MIT_TERMS)).toBe(true);
  });

  it('reads the header with Windows line endings too', () => {
    const meshopt = VENDORED_NOTICES.find((n) => n.name === 'meshoptimizer')!;
    const text = noticeText(meshopt, '// MIT License.\r\n// Copyright (C) 2016, by Someone\r\nvar x = 1;\r\n');
    expect(text.split('\n')[0]).toBe('Copyright (C) 2016, by Someone');
  });

  it('fails loudly when the header loses its copyright line, instead of shipping the decoder without its notice', () => {
    const meshopt = VENDORED_NOTICES.find((n) => n.name === 'meshoptimizer')!;
    expect(() => noticeText(meshopt, '// Some other header\nvar x = 1; // Copyright later in the code\n')).toThrow(/no copyright line/);
  });

  it("carries Inter's whole OFL file, the licence the fonts are served under", () => {
    const inter = VENDORED_NOTICES.find((n) => n.name === 'Inter')!;
    const text = noticeText(inter, read(inter.source));
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(text).toContain('Copyright 2016 The Inter Project Authors');
  });

  it("appends each notice after Vite's packages under a heading in Vite's form, keeping Vite's text as it was", () => {
    const vite = '# Licenses\n\nThe app bundles dependencies which contain the following licenses:\n\n## three - 0.186.1 (MIT)\n\nMIT text\n';
    const out = withVendoredNotices(vite, VENDORED_NOTICES.map((notice) => ({ notice, text: `${notice.name} text` })));
    expect(out.startsWith(vite.trimEnd())).toBe(true);
    expect(out.match(/^## .*$/gm)).toEqual(['## three - 0.186.1 (MIT)', '## meshoptimizer (MIT)', '## Inter (OFL-1.1)']);
    expect(out).toContain('meshoptimizer text');
    expect(out.endsWith('Inter text\n')).toBe(true);
  });
});
