import { describe, expect, it } from 'vitest';
import { parseArgs } from './content-check.mjs';
import { firstPersonSettings, mapShotPictures } from './content-pictures.mjs';
import { balanceResults, balanceVerdict, censusRows, layoutRows, mapReportMarkdown, markdownToHtml, outcomeLine, perfResult, reportHtml, reportMarkdown, sheetRows, specTables, worst } from './contentReport.mjs';

/** A spec sheet as src/content/specSheet.ts writes it. */
const sheet = (onTarget) => ({
  name: 'x',
  chrono: [{ grams: 0.2, speed: 97.2, joules: 0.94 }, { grams: 0.25, speed: 88, joules: 0.97 }],
  onTarget,
  bestOnTarget: { dial: 0.65, metres: onTarget + 1 },
  drop: [{ metres: 20, cm: -10.2 }, { metres: 50, cm: 117 }, { metres: 60, cm: 0.2 }],
  group: [{ metres: 10, cm: 9 }],
  emptyMag: 4.6,
  fireRate: 13,
  magSize: 60,
  mags: 4,
  reload: 1.8,
  draw: 0.45,
  spreadDeg: 0.45,
  recoilDeg: 0.18,
});

const CONTENT = {
  items: [{ id: '000007', name: 'Red Dot', category: 'optic', tag: 'public', key: 'redDot' }],
  sheets: [
    { id: '000001', name: 'Gas Pistol', sheet: sheet(20) },
    { id: '000002', name: 'AEG Rifle', sheet: sheet(39) },
  ],
  census: [{ id: '000002', name: 'AEG Rifle', replica: 'aeg', fromFile: true, low: { triangles: 11286, meshes: 13 }, high: { triangles: 11574, meshes: 18 }, parts: [] }],
  sounds: [{ profile: 'electric', loudnessDb: -19.7, peakDb: -5.2, centroidHz: 503.4 }],
  withParts: [{ part: '000007', replica: 'AEG Rifle', without: sheet(39), with: sheet(40) }],
};
const RESULTS = [
  { level: 'rules', check: 'optic.name', item: '000007 Red Dot', verdict: 'pass', says: 'Its name is in Title Case.' },
  { level: 'compatibility', check: 'optic.kits', item: '000007 Red Dot', verdict: 'warn', says: 'Two kits run past | the normal ranges.' },
];
const META = { commit: 'abc1234', when: '2026-10-11 00:00 UTC', levels: ['rules', 'compatibility', 'spec'] };

describe('the content report', () => {
  it('judges balance figures: in band passes, outside fails, within noise asks for a look, unbanded is a figure', () => {
    expect(balanceVerdict({ verdict: 'in band', band: { min: 0.4, max: 0.6 } })).toBe('pass');
    expect(balanceVerdict({ verdict: 'near an edge', band: { min: 0.4 } })).toBe('pass');
    expect(balanceVerdict({ verdict: 'outside', band: { min: 0.4, max: 0.6 } })).toBe('fail');
    expect(balanceVerdict({ verdict: 'outside, within noise', band: { max: 0.6 } })).toBe('warn');
    expect(balanceVerdict({ verdict: 'did not run', band: { max: 0.6 } })).toBe('warn');
    expect(balanceVerdict({ verdict: 'in band', band: {} })).toBe('info');
    const rows = balanceResults([
      { label: 'Depot: share', value: 0.9, of: 400, band: { min: 0.4, max: 0.6 }, detail: '360 of 400 decided' },
      { label: 'Depot, Pro: share', value: 0.9, of: 400, band: {} },
    ]);
    expect(rows.map((r) => r.verdict)).toEqual(['fail', 'info']);
    expect(rows[0].says).toMatch(/^90\.0 % ±1\.5 \(target 40–60 %\); 360 of 400 decided\.$/);
  });

  it('sums up in one line, the worst first', () => {
    expect(worst([])).toBe('pass');
    expect(worst(RESULTS)).toBe('warn');
    expect(worst([...RESULTS, { verdict: 'fail' }, { verdict: 'info' }])).toBe('fail');
    expect(outcomeLine(RESULTS, META)).toBe('Passes, with 1 thing for you to look at (Rules, Compatibility, Spec test).');
    expect(outcomeLine([{ verdict: 'fail' }, { verdict: 'fail' }, { verdict: 'warn' }], META)).toMatch(/^Fails 2 checks and has 1 thing to look at .*can't go public/);
    expect(outcomeLine([{ verdict: 'pass' }], { ...META, publicGate: true })).toMatch(/Ready to go public once you have played it\.$/);
  });

  it('lays the spec sheets side by side, heights above or below the aim line', () => {
    const rows = sheetRows([{ name: 'A', sheet: sheet(39) }, { name: 'B', sheet: sheet(20) }]);
    expect(rows[0]).toEqual(['Speed and energy, 0.2 g BBs', '97 m/s, 0.94 J', '97 m/s, 0.94 J']);
    expect(rows.find((r) => r[0] === 'On target to (factory hop-up)')).toEqual(['On target to (factory hop-up)', '39 m', '20 m']);
    expect(rows.find((r) => r[0] === 'Against the aim line at 20 m')[1]).toBe('10 cm above');
    expect(rows.find((r) => r[0] === 'Against the aim line at 50 m')[1]).toBe('117 cm below');
    expect(rows.find((r) => r[0] === 'Against the aim line at 60 m')[1]).toBe('on the aim line');
  });

  it('shows a part on each replica without and with it, a replica beside the others, and every replica for "all"', () => {
    expect(specTables(CONTENT, CONTENT.items[0]).map((t) => [t.title, t.sheets.map((s) => s.name)])).toEqual([['On the AEG Rifle', ['Without it', 'With the Red Dot']]]);
    expect(specTables(CONTENT, { id: '000002', name: 'AEG Rifle', category: 'replica' })[0].sheets.map((s) => s.name)).toEqual(['AEG Rifle', 'Gas Pistol']);
    expect(specTables(CONTENT, { id: 'all' })[0].sheets).toHaveLength(2);
    expect(censusRows(CONTENT)).toEqual([['AEG Rifle', '11286 in 13 meshes', '11574 in 18 meshes', 'its model file']]);
  });

  it('writes the page: the outcome, what needs the owner, each level and the pictures', () => {
    const md = reportMarkdown({ content: CONTENT, item: CONTENT.items[0], results: RESULTS, pictures: [{ file: 'a.png', title: 'On the AEG Rifle', ok: true }, { file: 'b.jpg', title: 'In a match', ok: false, error: 'no browser' }], meta: META });
    expect(md).toMatch(/^# Content report: Red Dot \(000007\)\n/);
    expect(md).toContain('Part (optic), tagged public. Checked 2026-10-11 00:00 UTC on `abc1234`.');
    expect(md).toContain('## What needs you\n\n1. **Look at this** (Compatibility, 000007 Red Dot): Two kits run past | the normal ranges.');
    expect(md).toContain('| optic.kits · 000007 Red Dot | Look at this | Two kits run past \\| the normal ranges. |');
    expect(md).toContain('### On the AEG Rifle');
    expect(md).toContain('![On the AEG Rifle](pictures/a.png)');
    expect(md).toContain('- In a match: not drawn (no browser).');
    expect(md).not.toContain('## Balance run');
  });

  it('turns the page into HTML with its pictures inside', () => {
    const md = '# Title <x>\n\n**Bold** and `code`\n\n1. one\n2. two\n\n- a\n\n| A | B \\| C |\n|---|---|\n| 1 | 2 |\n\n![pic](pictures/a.png)\n![gone](pictures/b.png)\n';
    const html = markdownToHtml(md, { 'pictures/a.png': 'data:image/png;base64,AAAA' });
    expect(html).toContain('<h1>Title &lt;x&gt;</h1>');
    expect(html).toContain('<p><strong>Bold</strong> and <code>code</code></p>');
    expect(html).toContain('<ol>\n<li>one</li>\n<li>two</li>\n</ol>');
    expect(html).toContain('<ul>\n<li>a</li>\n</ul>');
    expect(html).toContain('<tr><th>A</th><th>B | C</th></tr>');
    expect(html).toContain('<tr><td>1</td><td>2</td></tr>');
    expect(html).toContain('<img alt="pic" src="data:image/png;base64,AAAA">');
    expect(html).not.toContain('gone');
    const page = reportHtml(md, 'Content report: Red Dot');
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain('<title>Content report: Red Dot</title>');
    expect(page).toContain('prefers-color-scheme: dark');
  });
});

/** Two maps' layouts as src/content/report/map.report.ts writes them. */
const LAYOUTS = [
  { id: 'depot', label: 'Depot', tag: 'public', teamSize: { standard: 3, max: 3 }, size: { x: 40.2, z: 38.4 }, lanes: 3, sightline: 33.46, middleWalk: [31.2, 30.3], middleSeconds: [7.43, 7.21], flagWalk: [39.4, 20.7], flagSeconds: [9.38, 4.93], modes: ['Elimination', 'Attack and Defend'], lightings: ['Day'] },
  { id: 'yard', label: 'Yard', tag: 'dev', teamSize: { standard: 4, max: 5 }, size: { x: 60, z: 50 }, lanes: 2, sightline: null, middleWalk: [20, Number.POSITIVE_INFINITY], middleSeconds: [4.8, Number.POSITIVE_INFINITY], flagWalk: null, flagSeconds: null, modes: ['Elimination'], lightings: ['Day', 'Night'] },
];
const MAP_CONTENT = { kind: 'map', items: [{ id: 'map-yard', name: 'Yard', category: 'map', tag: 'dev', key: 'yard' }], layouts: LAYOUTS };
const MAP_RESULTS = [
  { level: 'rules', check: 'map.onFloor', item: 'Yard (yard)', verdict: 'pass', says: 'All 12 points stand on walkable floor.' },
  { level: 'compatibility', check: 'map.middle', item: 'Yard (yard)', verdict: 'fail', says: 'End 1 cannot walk to the middle.' },
  { level: 'balance', check: 'balance.share', item: 'Yard, Elimination, Pro: rounds end 0 won', verdict: 'info', says: '52 %' },
];

describe('the map report', () => {
  it('lays every map’s layout side by side, with no way and no flag said in words', () => {
    const rows = layoutRows(LAYOUTS);
    expect(rows.map((r) => r[0])).toEqual(['Walkable ground', 'Players a side', 'Lanes', 'Longest clear sightline', 'Walk to the middle, end 0', 'Walk to the middle, end 1', 'Walk to the flag, attackers', 'Walk to the flag, defenders', 'Modes', 'Lighting', 'Tag']);
    expect(rows[0]).toEqual(['Walkable ground', '40 × 38 m', '60 × 50 m']);
    expect(rows[1]).toEqual(['Players a side', '3', '4 (up to 5)']);
    expect(rows[3]).toEqual(['Longest clear sightline', '33.5 m', '–']);
    expect(rows[5]).toEqual(['Walk to the middle, end 1', '30 m (7.2 s)', 'no way']);
    expect(rows[6]).toEqual(['Walk to the flag, attackers', '39 m (9.4 s)', 'no flag']);
  });

  it('judges a perf run: page errors and over budget fail, worse than its last measure asks for a look', () => {
    const run = { preset: 'low', metrics: { drawCalls: 51.4, triangles: 41526, gpuMemoryMB: 8.8, heapGrowthMB: 0.25 }, errors: [] };
    const clean = { over: [], worse: [], note: 'no baseline pipeline/baseline/container-yard.json; relative check skipped' };
    expect(perfResult('Yard', run, clean)).toEqual({ level: 'spec', check: 'map.perf', item: 'Yard, low', verdict: 'pass', says: '51 draw calls, 42k triangles, 9 MB of GPU memory, heap +0.3 MB; within budget (no baseline pipeline/baseline/container-yard.json; relative check skipped).' });
    expect(perfResult('Yard', run, { over: [], worse: [{ metric: 'triangles', pct: 14 }] })).toMatchObject({ verdict: 'warn', says: expect.stringContaining('worse than its last measure: triangles +14 %') });
    expect(perfResult('Yard', run, { over: [{ metric: 'drawCalls', now: 51.4, limit: 45 }], worse: [] })).toMatchObject({ verdict: 'fail', says: expect.stringContaining('over budget: drawCalls 51.4 (budget 45)') });
    expect(perfResult('Yard', { ...run, errors: ['pageerror: boom'] }, clean)).toMatchObject({ verdict: 'fail', says: expect.stringContaining('the page had 1 error (pageerror: boom)') });
  });

  it('writes the page: level 2 is the layout, with this map first beside the others, and balance rows by sweep', () => {
    const meta = { ...META, levels: ['rules', 'compatibility', 'spec', 'balance'] };
    const md = mapReportMarkdown({ content: MAP_CONTENT, item: MAP_CONTENT.items[0], results: MAP_RESULTS, pictures: [{ file: 'yard-day-overhead.jpg', title: 'Yard by day: from above', ok: true }], meta });
    expect(md).toMatch(/^# Content report: Yard \(map\)\n/);
    expect(md).toContain('Map `yard`, tagged dev.');
    expect(md).toContain('1. **Fail** (Layout, Yard (yard)): End 1 cannot walk to the middle.');
    expect(md).toContain('## Layout');
    expect(md).not.toContain('## Compatibility');
    expect(md).toContain('|  | Yard | Depot |');
    expect(md).toContain('| Yard, Elimination, Pro: rounds end 0 won | Figure | 52 % |');
    expect(md).toContain('![Yard by day: from above](pictures/yard-day-overhead.jpg)');
    const every = mapReportMarkdown({ content: { ...MAP_CONTENT, items: [MAP_CONTENT.items[0], { id: 'map-depot' }] }, item: { id: 'maps', name: 'Every map', key: '' }, results: [], meta: META });
    expect(every).toContain('Every map (2).');
    expect(every).toContain('|  | Depot | Yard |');
  });

  it('draws four pictures per map and lighting', () => {
    expect(mapShotPictures({ file: 'yard-night', title: 'Yard by night' }).map((p) => p.file)).toEqual(['yard-night-overhead.jpg', 'yard-night-minimap.png', 'yard-night-end-0.jpg', 'yard-night-end-1.jpg']);
  });
});

describe('the content check command', () => {
  it('runs levels 1 to 3 by default, adds the balance run on asking, and all four for the public gate', () => {
    expect(parseArgs(['000007'])).toMatchObject({ item: '000007', levels: ['rules', 'compatibility', 'spec'], pictures: true, publicGate: false });
    expect(parseArgs(['Red', 'Dot', '--balance', '--maps', 'depot,neon', '--seeds', '4']).levels).toEqual(['rules', 'compatibility', 'spec', 'balance']);
    expect(parseArgs(['Red', 'Dot', '--balance', '--maps', 'depot,neon', '--seeds', '4'])).toMatchObject({ item: 'Red Dot', maps: ['depot', 'neon'], seeds: 4 });
    expect(parseArgs(['000007', '--public']).levels).toEqual(['rules', 'compatibility', 'spec', 'balance']);
    expect(parseArgs(['000007', '--levels', 'rules', '--no-pictures'])).toMatchObject({ levels: ['rules'], pictures: false });
    expect(parseArgs(['all']).pictures).toBe(false);
  });

  it('refuses a mistake with a reason', () => {
    expect(() => parseArgs([])).toThrow(/name an item/);
    expect(() => parseArgs(['000007', '--levels', 'looks'])).toThrow(/unknown level looks/);
    expect(() => parseArgs(['000007', '--seeds', '0'])).toThrow(/whole number/);
    expect(() => parseArgs(['000007', '--fast'])).toThrow(/unknown option --fast/);
    expect(() => parseArgs(['all', '--balance'])).toThrow(/one item/);
    expect(() => parseArgs(['map:all', '--balance'])).toThrow(/one item, not "map:all"/);
    expect(() => parseArgs(['000007', '--no-perf'])).toThrow(/for a map/);
    expect(() => parseArgs(['map:depot', '--maps', 'neon'])).toThrow(/plays on itself/);
  });

  it('checks a map by "map:<id>": perf runs and pictures for one map, neither for every map', () => {
    expect(parseArgs(['map:depot'])).toMatchObject({ item: 'map:depot', isMap: true, perf: true, pictures: true, env: 'container' });
    expect(parseArgs(['map:depot', '--no-perf', '--env', 'laptop', '--balance'])).toMatchObject({ perf: false, env: 'laptop', levels: ['rules', 'compatibility', 'spec', 'balance'] });
    expect(parseArgs(['map:depot', '--levels', 'rules,compatibility'])).toMatchObject({ perf: false });
    expect(parseArgs(['map:all'])).toMatchObject({ isMap: true, perf: false, pictures: false });
    expect(parseArgs(['000007'])).toMatchObject({ isMap: false });
  });

  it('starts a first-person picture with Dev content on and the item fitted', () => {
    expect(firstPersonSettings({ replica: '000002', tier: 'common', fit: { optic: '000007@common' } })).toEqual({
      version: 1,
      'dev.enabled': true,
      'dev.devContent': 'on',
      'dev.unlockAllGear': 'on',
      'equip.dev.primary': '000002@common',
      'fit.dev.000002.optic': '000007@common',
    });
  });
});
