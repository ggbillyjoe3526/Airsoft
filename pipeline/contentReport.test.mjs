import { describe, expect, it } from 'vitest';
import { parseArgs } from './content-check.mjs';
import { firstPersonSettings, mapShotPictures } from './content-pictures.mjs';
import { balanceResults, balanceVerdict, censusRows, layoutRows, mapReportMarkdown, markdownToHtml, modeReportMarkdown, modeRows, outcomeLine, payResults, perfResult, reportHtml, reportMarkdown, runOrderResults, sheetRows, paletteRows, skinReportMarkdown, skinRows, specTables, worst } from './contentReport.mjs';

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
    { id: '000001', name: 'GBB Pistol', sheet: sheet(20) },
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
    expect(specTables(CONTENT, { id: '000002', name: 'AEG Rifle', category: 'replica' })[0].sheets.map((s) => s.name)).toEqual(['AEG Rifle', 'GBB Pistol']);
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
    expect(firstPersonSettings({ replica: '000002', fit: { optic: '000007' } })).toEqual({
      version: 1,
      'dev.enabled': true,
      'dev.devContent': 'on',
      'dev.unlockAllGear': 'on',
      'equip.dev.primary': '000002',
      'fit.dev.000002.optic': '000007',
    });
  });
});

/** A balance sweep's pay meta as mapBalance.report.ts writes it (CT3; LV1: XP a minute). */
const pay = (mode, xpPerMinute, extra = {}) => ({ map: 'depot', lighting: 'day', mode, level: 'normal', judged: true, label: `Depot, ${mode}, Normal`, xpPerMinute, noise: 0.05, band: { min: 0.75, max: 1.25 }, ...extra });
/** An Extraction sweep's run meta: the share of runs got out of, at `level`, with the pairs of levels to keep in order. */
const run = (level, extract, extra = {}) => ({ map: 'depot', lighting: 'day', mode: 'extraction', where: 'Depot by day', level, extract, se: 0.03, judged: true, harder: [['easy', 'normal'], ['normal', 'hard']], ...extra });

const MODES = [
  { id: 'elimination', label: 'Elimination', tag: 'public', play: 'rounds', needs: null, maps: ['Depot', 'Woodland'], rulesets: ['Skirmish', 'Custom'], hides: [] },
  { id: 'extraction', label: 'Extraction', tag: 'dev', play: 'run', needs: 'extraction', maps: [], rulesets: ['Skirmish'], hides: ['Rounds to win', 'Round time'] },
];
const MODE_CONTENT = { items: [{ id: 'mode-extraction', name: 'Extraction', category: 'mode', tag: 'dev', key: 'extraction' }], modes: MODES, places: ['the briefing (ui/menus/rulesText.ts describeRules)', 'the round rules (sim/round.ts)'] };
const MODE_RESULTS = [
  { level: 'rules', check: 'mode.wiring', item: 'Extraction (extraction)', verdict: 'pass', says: '5 places answer for it.' },
  { level: 'compatibility', check: 'mode.plays', item: 'Extraction (extraction)', verdict: 'fail', says: 'On Depot, 1 of 9 pairings went wrong.' },
  { level: 'spec', check: 'mode.perf', item: 'Extraction on Depot, low', verdict: 'pass', says: 'within budget.' },
];

describe('the mode report', () => {
  it('holds a mode’s pay a minute to its band beside Elimination’s', () => {
    const elimination = pay('elimination', 100);
    const verdict = (xp, extra) => payResults([elimination, pay('attackDefend', xp, extra)]).map((r) => r.verdict);
    expect(verdict(110)).toEqual(['pass']);
    // × 1.3, two standard errors of ± 0.09: outside, but within noise.
    expect(verdict(130)).toEqual(['warn']);
    expect(payResults([elimination, pay('attackDefend', 130)])[0].says).toContain('within noise');
    expect(verdict(70)).toEqual(['warn']);
    expect(verdict(200)).toEqual(['fail']);
    expect(verdict(40)).toEqual(['fail']);
    // Noiseless: just outside is a fault.
    expect(payResults([{ ...elimination, noise: 0 }, pay('attackDefend', 130, { noise: 0 })]).map((r) => r.verdict)).toEqual(['fail']);
    expect(verdict(200, { judged: false })).toEqual(['info']);
    expect(payResults([elimination, pay('attackDefend', 200, { judged: false })])[0].says).toContain('not judged');
  });

  it('sets pay beside Elimination’s on the same map, lighting and level only, and adds nothing for Elimination alone', () => {
    expect(payResults([pay('elimination', 100)])).toEqual([]);
    expect(payResults([pay('elimination', 100), pay('attackDefend', 300, { lighting: 'night' })])).toEqual([]);
    expect(payResults([pay('elimination', 100), pay('attackDefend', 300, { level: 'hard' })])).toEqual([]);
    const r = payResults([pay('elimination', 100), pay('attackDefend', 110)])[0];
    expect(r).toMatchObject({ level: 'balance', check: 'mode.pay', item: "Depot, attackDefend, Normal: pay against Elimination's" });
    expect(r.says).toContain("110 XP a minute against Elimination's 100 (× 1.1; target × 0.75 to × 1.25)");
    // A sweep that still carries the old Field Credits figure has no XP to compare: no ratio, not a pass.
    const old = payResults([{ ...pay('elimination', 100), xpPerMinute: undefined, fcPerMinute: 100 }, pay('attackDefend', 110)])[0];
    expect(old.says).toContain('no ratio');
    expect(old.verdict).toBe('fail');
  });

  it('keeps a run mode’s levels in order: easier gets out at least as often', () => {
    const verdicts = (runs) => runOrderResults(runs).map((r) => r.verdict);
    expect(verdicts([run('easy', 0.6), run('normal', 0.5), run('hard', 0.4)])).toEqual(['pass', 'pass']);
    expect(verdicts([run('easy', 0.5), run('normal', 0.5)])).toEqual(['pass']);
    // The wrong way round by less than two standard errors (± 0.04 each side): a look.
    expect(verdicts([run('easy', 0.5), run('normal', 0.55)])).toEqual(['warn']);
    expect(runOrderResults([run('easy', 0.5), run('normal', 0.55)])[0].says).toContain('within noise');
    expect(verdicts([run('easy', 0.3), run('normal', 0.6)])).toEqual(['fail']);
    expect(verdicts([run('easy', 0.3, { judged: false }), run('normal', 0.6)])).toEqual(['info']);
    expect(runOrderResults([run('easy', 0.6), run('normal', 0.5)])[0]).toMatchObject({ check: 'mode.levels', item: 'Depot by day, extraction: Easy easier to get out from than Normal', says: 'Easy 60 % against Normal 50 %.' });
  });

  it('pairs only runs on the same map and lighting', () => {
    expect(runOrderResults([run('easy', 0.3), run('normal', 0.6, { lighting: 'night' })])).toEqual([]);
    expect(runOrderResults([run('easy', 0.3), run('normal', 0.6, { map: 'woodland' })])).toEqual([]);
  });

  it('lays every mode side by side', () => {
    expect(modeRows(MODES)).toEqual([
      ['Played as', 'rounds', 'one run'],
      ['Needs from a map', 'nothing', 'Extraction data'],
      ['Maps that host it', 'Depot, Woodland', 'none'],
      ['Rulesets', 'Skirmish, Custom', 'Skirmish'],
      ['Match rows it hides', 'none', 'Rounds to win, Round time'],
      ['Tag', 'public', 'dev'],
    ]);
    expect(modeRows([{ ...MODES[0], needs: 'flag' }])[1]).toEqual(['Needs from a map', 'a flagpole']);
  });

  it('writes the page: Rules with the modes table and the places, Fit, Spec test', () => {
    const md = modeReportMarkdown({ content: MODE_CONTENT, item: MODE_CONTENT.items[0], results: MODE_RESULTS, meta: META });
    expect(md).toMatch(/^# Content report: Extraction \(mode\)\n/);
    expect(md).toContain('Mode `extraction`, tagged dev.');
    expect(md).toContain('1. **Fail** (Fit, Extraction (extraction)): On Depot, 1 of 9 pairings went wrong.');
    for (const h of ['## Rules', '## Fit', '## Spec test', '### Beside the other modes', '### Where a mode is answered for']) expect(md).toContain(h);
    expect(md).not.toContain('## Compatibility');
    expect(md.indexOf('## Rules')).toBeLessThan(md.indexOf('## Fit'));
    expect(md.indexOf('## Fit')).toBeLessThan(md.indexOf('## Spec test'));
    // This mode first beside the others.
    expect(md).toContain('|  | Extraction | Elimination |');
    expect(md).toContain('| Played as | one run | rounds |');
    expect(md).toContain('- the briefing (ui/menus/rulesText.ts describeRules)');
    expect(md).toContain('| mode.perf · Extraction on Depot, low | Pass | within budget. |');
    const every = modeReportMarkdown({ content: { ...MODE_CONTENT, items: [MODE_CONTENT.items[0], { id: 'mode-elimination' }] }, item: { id: 'modes', name: 'Every mode', key: '' }, results: [], meta: META });
    expect(every).toContain('Every mode (2).');
    expect(every).toContain('### Beside the other modes');
    expect(every).not.toContain('## Fit');
  });

  it('judges a mode’s perf run under its own check name', () => {
    const r = { preset: 'low', metrics: { drawCalls: 51.4, triangles: 41526, gpuMemoryMB: 8.8, heapGrowthMB: 0.25 }, errors: [] };
    expect(perfResult('Extraction on Depot', r, { over: [], worse: [] }, 'mode.perf')).toMatchObject({ level: 'spec', check: 'mode.perf', item: 'Extraction on Depot, low', verdict: 'pass' });
    expect(perfResult('Extraction on Depot', { ...r, errors: ['pageerror: boom'] }, { over: [], worse: [] }, 'mode.perf')).toMatchObject({ check: 'mode.perf', verdict: 'fail' });
  });
});

describe('the content check command for a mode', () => {
  it('checks a mode by "mode:<id>": a browser match and perf runs for one mode, neither for every mode', () => {
    expect(parseArgs(['mode:attackDefend'])).toMatchObject({ item: 'mode:attackDefend', isMode: true, isMap: false, perf: true, browser: true, levels: ['rules', 'compatibility', 'spec'] });
    expect(parseArgs(['mode:attackDefend', '--no-browser'])).toMatchObject({ browser: false, perf: true });
    expect(parseArgs(['mode:attackDefend', '--no-perf', '--balance'])).toMatchObject({ perf: false, browser: true, levels: ['rules', 'compatibility', 'spec', 'balance'] });
    expect(parseArgs(['mode:attackDefend', '--levels', 'rules,compatibility'])).toMatchObject({ perf: false, browser: false });
    expect(parseArgs(['mode:all'])).toMatchObject({ isMode: true, perf: false, browser: false, pictures: false });
    expect(parseArgs(['000007'])).toMatchObject({ isMode: false });
  });

  it('refuses a mistake for a mode with a reason', () => {
    expect(() => parseArgs(['000007', '--no-browser'])).toThrow(/--no-browser is for a mode/);
    expect(() => parseArgs(['map:depot', '--no-browser'])).toThrow(/--no-browser is for a mode/);
    expect(() => parseArgs(['mode:all', '--balance'])).toThrow(/one item, not "mode:all"/);
    expect(() => parseArgs(['mode:extraction', '--maps', 'depot'])).toThrow(/plays on every map that hosts it/);
  });
});

/** Every skin as src/content/report/skin.report.ts lists it. */
const SKINS = [
  { id: 'cobalt', name: 'Cobalt', tag: 'public', family: 'Black', colours: { body: 0x24282f, furniture: 0x2f6fd6, detail: 0x30343b, accent: 0xf2f0ea, steel: 0x484d56 }, shows: [{ colour: 0x2f6fd6, share: 0.52 }, { colour: 0x24282f, share: 0.3 }, { colour: 0xf2f0ea, share: 0.04 }], bots: ['Alpha'] },
  { id: 'acid', name: 'Acid', tag: 'public', family: 'Ranger green', colours: { body: 0x2a2e33, furniture: 0xb8e636, detail: 0x1e2125, accent: 0xb8e636, steel: 0x40454c }, shows: [{ colour: 0xb8e636, share: 0.6 }], bots: [] },
];
const SKIN_CONTENT = { items: [{ id: 'skin-acid', name: 'Acid', category: 'skin', tag: 'public', key: 'acid' }], skins: SKINS, readableShare: 0.1, pictures: [], maps: [] };
const SKIN_RESULTS = [
  { level: 'rules', check: 'skin.access', item: 'Acid (acid)', verdict: 'pass', says: 'Public (before the toolkit).' },
  { level: 'compatibility', check: 'skin.orangeTip', item: 'Acid (acid)', verdict: 'warn', says: 'The tip hardly shows.' },
  { level: 'spec', check: 'skin.map', item: 'Acid (acid) on Depot', verdict: 'pass', says: 'Stands out.' },
];

describe('the skin report', () => {
  it('lays every skin side by side: what shows at a distance, and who carries it', () => {
    expect(skinRows(SKINS, 0.1)[0]).toEqual(['Cobalt (`cobalt`)', 'public', 'Black', 'body #24282f, furniture #2f6fd6, detail #30343b, accent #f2f0ea, steel #484d56', '#2f6fd6 52 %, #24282f 30 %', "Alpha's bots"]);
    expect(skinRows(SKINS, 0.1)[1].at(-1)).toBe('players only');
  });

  it('lists each map’s common colours, or why it was not measured', () => {
    expect(paletteRows([{ label: 'Depot', buckets: [{ colour: 0x8a8a84, share: 0.41 }] }, { label: 'Woodland', buckets: [], error: 'timed out' }])).toEqual([['Depot', '#8a8a84 41 %'], ['Woodland', 'not measured (timed out)']]);
  });

  it('writes the page: Rules with the skins table, Fit, Spec test with the maps’ colours, and the pictures', () => {
    const palettes = [{ map: 'depot', label: 'Depot', buckets: [{ colour: 0x8a8a84, share: 0.41 }] }];
    const pictures = [{ file: 'acid-on-000002.png', title: 'On the AEG Rifle', ok: true }];
    const md = skinReportMarkdown({ content: SKIN_CONTENT, item: SKIN_CONTENT.items[0], results: SKIN_RESULTS, pictures, palettes, meta: META });
    expect(md).toMatch(/^# Content report: Acid \(skin\)\n/);
    expect(md).toContain('Skin `acid`, tagged public.');
    expect(md).toContain('1. **Look at this** (Fit, Acid (acid)): The tip hardly shows.');
    for (const h of ['## Rules', '## Fit', '## Spec test', '### Beside the other skins', "### The maps' colours", '## Pictures']) expect(md).toContain(h);
    // This skin first beside the others.
    expect(md.indexOf('| Acid (`acid`)')).toBeLessThan(md.indexOf('| Cobalt (`cobalt`)'));
    expect(md).toContain('| Depot | #8a8a84 41 % |');
    expect(md).toContain('![On the AEG Rifle](pictures/acid-on-000002.png)');
    const every = skinReportMarkdown({ content: { ...SKIN_CONTENT, items: [SKIN_CONTENT.items[0], { id: 'skin-cobalt' }] }, item: { id: 'skins', name: 'Every skin', key: '' }, results: [], meta: META });
    expect(every).toContain('Every skin (2).');
    expect(every).not.toContain("### The maps' colours");
  });
});

describe('the content check command for a skin', () => {
  it('checks a skin by "skin:<id>": pictures and the maps\' colours for one skin, neither for every skin', () => {
    expect(parseArgs(['skin:cobalt'])).toMatchObject({ item: 'skin:cobalt', isSkin: true, isMode: false, isMap: false, browser: true, pictures: true, levels: ['rules', 'compatibility', 'spec'] });
    expect(parseArgs(['skin:cobalt', '--no-browser', '--maps', 'depot'])).toMatchObject({ browser: false, maps: ['depot'] });
    expect(parseArgs(['skin:all'])).toMatchObject({ isSkin: true, browser: false, pictures: false });
    expect(() => parseArgs(['skin:all', '--balance'])).toThrow(/one item, not "skin:all"/);
    expect(() => parseArgs(['skin:cobalt', '--no-perf'])).toThrow(/for a map or mode/);
  });
});
