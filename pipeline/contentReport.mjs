/**
 * The content report (CT1, the content toolkit): one page, in plain words, for a replica or part being added. Pure
 * functions over what the report's runners found (src/content/report/: every check's result, the spec sheets, the model
 * and sound census, the balance figures) and the pictures, so contentReport.test.mjs tests them;
 * pipeline/content-check.mjs runs the runners and writes the page as Markdown and as one HTML file with its pictures in it.
 */
import { formatBand, formatValue, judgeAll } from './balanceReport.mjs';

export const LEVELS = ['rules', 'compatibility', 'spec', 'balance'];
export const LEVEL_WORDS = { rules: 'Rules', compatibility: 'Compatibility', spec: 'Spec test', balance: 'Balance run' };
/** A map's level 2 is its layout (CT2): measured against Depot's, not a fit with other items. */
export const MAP_LEVEL_WORDS = { ...LEVEL_WORDS, compatibility: 'Layout' };
const VERDICT_WORDS = { fail: 'Fail', warn: 'Look at this', pass: 'Pass', info: 'Figure' };
const ORDER = ['fail', 'warn', 'pass', 'info'];

/**
 * A balance figure's verdict for the content report: in its band (or near an edge) passes; outside but within noise asks
 * for a look (re-run on more seeds); outside fails; a figure with no band (dev content, an item allowed stronger) is
 * information; one that could not be measured asks for a look.
 */
export function balanceVerdict(row) {
  const banded = row.band && (row.band.min !== undefined || row.band.max !== undefined);
  if (row.verdict === 'did not run') return banded ? 'warn' : 'info';
  if (!banded) return 'info';
  if (row.verdict === 'outside') return 'fail';
  if (row.verdict === 'outside, within noise') return 'warn';
  return 'pass';
}

/** The balance figures (vitest's meta.balance measures) as check results, judged. */
export function balanceResults(measures) {
  return judgeAll(measures).map((row) => {
    const se = row.se !== null && row.se !== undefined && Number.isFinite(row.value) ? ` ±${row.of !== undefined ? (100 * row.se).toFixed(1) : Number(row.se.toPrecision(2))}` : '';
    const band = formatBand(row);
    const noise = row.verdict === 'outside, within noise' ? ' Outside, but within noise: re-run on more seeds before acting.' : '';
    return {
      level: 'balance',
      check: 'balance.figure',
      item: row.label,
      verdict: balanceVerdict(row),
      says: `${formatValue(row)}${se}${band !== '–' ? ` (target ${band})` : ''}${row.detail ? `; ${row.detail}` : ''}.${noise}`,
    };
  });
}

/** The worst verdict among `results` (pass for none). */
export function worst(results) {
  let w = 'pass';
  for (const r of results) if (ORDER.indexOf(r.verdict) < ORDER.indexOf(w)) w = r.verdict;
  return w;
}

/** The one-line outcome: what it means for the item. */
export function outcomeLine(results, { levels, publicGate = false } = {}, words = LEVEL_WORDS) {
  const fails = results.filter((r) => r.verdict === 'fail').length;
  const warns = results.filter((r) => r.verdict === 'warn').length;
  const ran = levels.map((l) => words[l]).join(', ');
  if (fails > 0) return `Fails ${fails} check${fails > 1 ? 's' : ''}${warns ? ` and has ${warns} thing${warns > 1 ? 's' : ''} to look at` : ''} (${ran}). It can't go public until the fails are fixed.`;
  if (warns > 0) return `Passes, with ${warns} thing${warns > 1 ? 's' : ''} for you to look at (${ran}).${publicGate ? ' Each needs your OK before it goes public.' : ''}`;
  return `Passes every check (${ran}).${publicGate ? ' Ready to go public once you have played it.' : ''}`;
}

const cell = (v) => String(v ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const n = (x, digits = 2) => (Number.isFinite(x) ? String(Number(x.toFixed(digits))) : '–');

/** The spec sheet rows, a column per sheet: `[label, ...values]`. */
export function sheetRows(sheets) {
  const rows = [];
  const first = sheets[0]?.sheet;
  if (!first) return rows;
  for (let i = 0; i < first.chrono.length; i++) {
    rows.push([`Speed and energy, ${first.chrono[i].grams} g BBs`, ...sheets.map((s) => `${n(s.sheet.chrono[i].speed, 0)} m/s, ${n(s.sheet.chrono[i].joules)} J`)]);
  }
  rows.push(['On target to (factory hop-up)', ...sheets.map((s) => `${n(s.sheet.onTarget, 0)} m`)]);
  rows.push(['On target to (best hop-up)', ...sheets.map((s) => `${n(s.sheet.bestOnTarget.metres, 0)} m at ${Math.round(s.sheet.bestOnTarget.dial * 100)} %`)]);
  const height = (cm) => (Math.round(cm) === 0 ? 'on the aim line' : cm < 0 ? `${n(-cm, 0)} cm above` : `${n(cm, 0)} cm below`);
  for (let i = 0; i < first.drop.length; i++) rows.push([`Against the aim line at ${first.drop[i].metres} m`, ...sheets.map((s) => height(s.sheet.drop[i].cm))]);
  for (let i = 0; i < first.group.length; i++) rows.push([`Half the BBs within, at ${first.group[i].metres} m`, ...sheets.map((s) => `${n(s.sheet.group[i].cm, 0)} cm`)]);
  rows.push(['Fire rate', ...sheets.map((s) => `${n(s.sheet.fireRate, 1)} BBs/s`)]);
  rows.push(['Magazine', ...sheets.map((s) => `${s.sheet.magSize} BBs × ${s.sheet.mags}`)]);
  rows.push(['Empties a magazine in', ...sheets.map((s) => `${n(s.sheet.emptyMag, 1)} s`)]);
  rows.push(['Reload', ...sheets.map((s) => `${n(s.sheet.reload)} s`)]);
  rows.push(['Draw', ...sheets.map((s) => `${n(s.sheet.draw)} s`)]);
  rows.push(['Spread', ...sheets.map((s) => `${n(s.sheet.spreadDeg, 3)}°`)]);
  rows.push(['Kick', ...sheets.map((s) => `${n(s.sheet.recoilDeg, 3)}°`)]);
  return rows;
}

/** The spec sheets the page shows: for a replica, it beside every other replica; for a part, each replica without and with it. */
export function specTables(content, item) {
  if (item.id === 'all') return [{ title: 'Every replica as it comes', sheets: content.sheets.map((s) => ({ name: s.name, sheet: s.sheet })) }];
  if (item.category === 'replica') {
    const own = content.sheets.find((s) => s.id === item.id);
    const others = content.sheets.filter((s) => s.id !== item.id);
    return own ? [{ title: 'Its numbers beside the other replicas (each as it comes)', sheets: [own, ...others].map((s) => ({ name: s.name, sheet: s.sheet })) }] : [];
  }
  return content.withParts
    .filter((w) => w.part === item.id)
    .map((w) => ({ title: `On the ${w.replica}`, sheets: [{ name: 'Without it', sheet: w.without }, { name: `With the ${item.name}`, sheet: w.with }] }));
}

function mdTable(header, rows) {
  return [`| ${header.map(cell).join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)];
}

/** The census rows: a replica's draw cost as it comes, and each of its parts'. */
export function censusRows(content) {
  return content.census.map((c) => [c.name ?? c.replica, `${c.low.triangles} in ${c.low.meshes} meshes`, `${c.high.triangles} in ${c.high.meshes} meshes`, c.fromFile ? 'its model file' : 'built in']);
}

/**
 * The report as Markdown. `results` are every check (the runners' and the balance figures as results), `pictures` the
 * drawn pictures (`{ file, title, ok, error? }`), `meta` the commit, when and the levels run.
 */
export function reportMarkdown({ content, item, results, pictures = [], meta }) {
  const lines = [`# Content report: ${item.name} (${item.id})`, ''];
  const what = item.id === 'all' ? `Every item in the pool (${content.items.length})` : `${item.category === 'replica' ? 'Replica' : `Part (${item.category})`}, tagged ${item.tag}`;
  lines.push(`${what}. Checked ${meta.when} on \`${meta.commit}\`.`, '');
  lines.push(`**${outcomeLine(results, meta)}**`, '');
  const attention = results.filter((r) => r.verdict === 'fail' || r.verdict === 'warn');
  if (attention.length > 0) {
    lines.push('## What needs you', '');
    attention.forEach((r, i) => lines.push(`${i + 1}. **${VERDICT_WORDS[r.verdict]}** (${LEVEL_WORDS[r.level]}, ${r.item}): ${r.says}`));
    lines.push('');
  }
  for (const level of meta.levels) {
    const own = results.filter((r) => r.level === level);
    if (own.length === 0 && level !== 'spec') continue;
    lines.push(`## ${LEVEL_WORDS[level]}`, '');
    if (own.length > 0) lines.push(...mdTable(['Check', 'Result', 'What was found'], own.map((r) => [level === 'balance' ? r.item : `${r.check} · ${r.item}`, VERDICT_WORDS[r.verdict], r.says])), '');
    if (level === 'spec') {
      for (const t of specTables(content, item)) lines.push(`### ${t.title}`, '', ...mdTable(['', ...t.sheets.map((s) => s.name)], sheetRows(t.sheets)), '');
      lines.push('### What each replica costs to draw', '', ...mdTable(['Replica', 'Low', 'High', 'Drawn from'], censusRows(content)), '');
      lines.push('### Shot sounds', '', ...mdTable(['Sound', 'Loudness', 'Peak', 'Centre'], content.sounds.map((s) => [s.profile, `${n(s.loudnessDb, 1)} dB`, `${n(s.peakDb, 1)} dB`, `${Math.round(s.centroidHz)} Hz`])), '');
    }
  }
  if (pictures.length > 0) {
    lines.push('## Pictures', '');
    for (const p of pictures) lines.push(p.ok ? `**${p.title}**\n\n![${p.title}](pictures/${p.file})\n` : `- ${p.title}: not drawn (${p.error}).`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A tiny Markdown-to-HTML for the report's own Markdown: headings, bold, code, numbered lists, tables and pictures. */
export function markdownToHtml(md, images = {}) {
  const out = [];
  const lines = md.split('\n');
  const inline = (t) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
    } else if (/^!\[/.test(line)) {
      const [, alt, src] = line.match(/^!\[(.*)\]\((.*)\)$/) ?? [];
      const data = images[src];
      if (data) out.push(`<img alt="${esc(alt)}" src="${data}">`);
    } else if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.slice(1, -1).split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, '|')));
      const [head, , ...body] = rows;
      out.push('<div class="scroll"><table>', `<tr>${cells(head).map((c) => `<th>${c}</th>`).join('')}</tr>`, ...body.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`), '</table></div>');
    } else if (/^\d+\. /.test(line)) {
      out.push('<ol>');
      while (i < lines.length && /^\d+\. /.test(lines[i])) out.push(`<li>${inline(lines[i++].replace(/^\d+\. /, ''))}</li>`);
      i--;
      out.push('</ol>');
    } else if (line.startsWith('- ')) {
      out.push('<ul>');
      while (i < lines.length && lines[i].startsWith('- ')) out.push(`<li>${inline(lines[i++].slice(2))}</li>`);
      i--;
      out.push('</ul>');
    } else if (line.trim() !== '') out.push(`<p>${inline(line)}</p>`);
  }
  return out.join('\n');
}

/** The report as one HTML page with its pictures inside it (`images`: picture path → data URL). */
export function reportHtml(md, title, images = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg: #f6f7f9; --text: #1d2026; --muted: #5b6270; --line: #d9dde3; --panel: #ffffff; --accent: #2f6fd6; }
@media (prefers-color-scheme: dark) { :root { --bg: #15171b; --text: #e7e9ec; --muted: #9aa1ad; --line: #30343b; --panel: #1d2026; --accent: #6ea0f0; } }
body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--text); font: 15px/1.5 Inter, system-ui, sans-serif; }
main { max-width: 980px; margin: 0 auto; }
h1 { font-size: 24px; margin: 0 0 8px; } h2 { font-size: 18px; margin: 28px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; } h3 { font-size: 15px; margin: 18px 0 6px; }
p, li { color: var(--text); } code { font-size: 13px; color: var(--muted); }
.scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; background: var(--panel); font-size: 13px; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; } th { color: var(--muted); font-weight: 600; }
img { max-width: 100%; height: auto; display: block; margin: 4px 0 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); }
</style>
</head>
<body><main>
${markdownToHtml(md, images)}
</main></body>
</html>
`;
}

// ---- Maps (CT2) ---------------------------------------------------------------------------------------------------

const metres = (x) => (Number.isFinite(x) ? `${n(x, 1)} m` : '–');
const walk = (m, s) => (Number.isFinite(m) ? `${n(m, 0)} m (${n(s, 1)} s)` : 'no way');

/** Every map's layout side by side (the map report's table): `[label, ...one value per map]`. */
export function layoutRows(layouts) {
  return [
    ['Walkable ground', ...layouts.map((l) => `${n(l.size.x, 0)} × ${n(l.size.z, 0)} m`)],
    ['Players a side', ...layouts.map((l) => (l.teamSize.standard === l.teamSize.max ? `${l.teamSize.standard}` : `${l.teamSize.standard} (up to ${l.teamSize.max})`))],
    ['Lanes', ...layouts.map((l) => String(l.lanes))],
    ['Longest clear sightline', ...layouts.map((l) => metres(l.sightline))],
    ['Walk to the middle, end 0', ...layouts.map((l) => walk(l.middleWalk[0], l.middleSeconds[0]))],
    ['Walk to the middle, end 1', ...layouts.map((l) => walk(l.middleWalk[1], l.middleSeconds[1]))],
    ['Walk to the flag, attackers', ...layouts.map((l) => (l.flagWalk ? walk(l.flagWalk[0], l.flagSeconds[0]) : 'no flag'))],
    ['Walk to the flag, defenders', ...layouts.map((l) => (l.flagWalk ? walk(l.flagWalk[1], l.flagSeconds[1]) : 'no flag'))],
    ['Modes', ...layouts.map((l) => l.modes.join(', '))],
    ['Lighting', ...layouts.map((l) => l.lightings.join(', '))],
    ['Tag', ...layouts.map((l) => l.tag)],
  ];
}

/**
 * A perf run's result (perf-run.mjs's file) as the spec test's check: over its budget fails, more than the gate's
 * tolerance worse than its baseline asks for a look, page errors fail. `judged` is perfMatrix.mjs judgeRun's verdict.
 */
export function perfResult(label, run, judged, check = 'map.perf') {
  const m = run.metrics;
  const numbers = `${n(m.drawCalls, 0)} draw calls, ${n(m.triangles / 1000, 0)}k triangles, ${n(m.gpuMemoryMB, 0)} MB of GPU memory, heap ${m.heapGrowthMB >= 0 ? '+' : ''}${n(m.heapGrowthMB, 1)} MB`;
  const item = `${label}, ${run.preset}`;
  if (run.errors?.length) return { level: 'spec', check, item, verdict: 'fail', says: `${numbers}; the page had ${run.errors.length} error${run.errors.length > 1 ? 's' : ''} (${run.errors[0]}).` };
  if (judged.over.length) return { level: 'spec', check, item, verdict: 'fail', says: `${numbers}; over budget: ${judged.over.map((o) => `${o.metric} ${n(o.now)} (budget ${o.limit})`).join(', ')}.` };
  if (judged.worse.length) return { level: 'spec', check, item, verdict: 'warn', says: `${numbers}; worse than its last measure: ${judged.worse.map((w) => `${w.metric} +${w.pct} %`).join(', ')}.` };
  return { level: 'spec', check, item, verdict: 'pass', says: `${numbers}; within budget${judged.note ? ` (${judged.note})` : ''}.` };
}

/** The map report as Markdown: as reportMarkdown, with every map's layout beside this one's and the perf runs. */
export function mapReportMarkdown({ content, item, results, pictures = [], meta }) {
  const lines = [`# Content report: ${item.name} (map)`, ''];
  const what = item.id === 'maps' ? `Every map (${content.items.length})` : `Map \`${item.key}\`, tagged ${item.tag}`;
  lines.push(`${what}. Checked ${meta.when} on \`${meta.commit}\`. The standard is Depot's measured layout.`, '');
  lines.push(`**${outcomeLine(results, meta, MAP_LEVEL_WORDS)}**`, '');
  const attention = results.filter((r) => r.verdict === 'fail' || r.verdict === 'warn');
  if (attention.length > 0) {
    lines.push('## What needs you', '');
    attention.forEach((r, i) => lines.push(`${i + 1}. **${VERDICT_WORDS[r.verdict]}** (${MAP_LEVEL_WORDS[r.level]}, ${r.item}): ${r.says}`));
    lines.push('');
  }
  for (const level of meta.levels) {
    const own = results.filter((r) => r.level === level);
    if (own.length === 0 && level !== 'compatibility') continue;
    lines.push(`## ${MAP_LEVEL_WORDS[level]}`, '');
    if (own.length > 0) lines.push(...mdTable(['Check', 'Result', 'What was found'], own.map((r) => [level === 'balance' ? r.item : `${r.check} · ${r.item}`, VERDICT_WORDS[r.verdict], r.says])), '');
    if (level === 'compatibility') {
      const order = [...content.layouts].sort((a, b) => (a.id === item.key ? -1 : b.id === item.key ? 1 : 0));
      lines.push('### Its layout beside the other maps', '', ...mdTable(['', ...order.map((l) => l.label)], layoutRows(order)), '');
    }
  }
  if (pictures.length > 0) {
    lines.push('## Pictures', '');
    for (const p of pictures) lines.push(p.ok ? `**${p.title}**\n\n![${p.title}](pictures/${p.file})\n` : `- ${p.title}: not drawn (${p.error}).`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

// ---- Modes (CT3) --------------------------------------------------------------------------------------------------

/** A mode's level 2 is its fit with the rulesets, the match rows and the levels, and its short matches (CT3). */
export const MODE_LEVEL_WORDS = { ...LEVEL_WORDS, compatibility: 'Fit' };

const LEVEL_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard', pro: 'Pro' };
const pct = (x) => `${n(100 * x, 0)} %`;

/**
 * Pay in line (CT3): each sweep's XP a minute (the balance runner's `pay` meta) beside Elimination's on the
 * same map, lighting and level, as a ratio held to its band (`band`, config/contentRules.ts MODE_BALANCE_BANDS.pay). A
 * sweep with no Elimination beside it, or Elimination's own, adds nothing; one not judged (dev content) is a figure. Outside
 * the band by less than two standard errors (each side's `noise`, modePay.ts roundsPayNoise) asks for a look.
 */
export function payResults(pays) {
  const out = [];
  for (const p of pays.filter((x) => x.mode !== 'elimination')) {
    const ref = pays.find((x) => x.mode === 'elimination' && x.map === p.map && x.lighting === p.lighting && x.level === p.level);
    if (!ref) continue;
    const ratio = ref.xpPerMinute > 0 ? p.xpPerMinute / ref.xpPerMinute : Number.NaN;
    const figures = `${n(p.xpPerMinute, 0)} XP a minute against Elimination's ${n(ref.xpPerMinute, 0)} (${Number.isFinite(ratio) ? `× ${n(ratio)}` : 'no ratio'}; target × ${n(p.band.min)} to × ${n(p.band.max)})`;
    const inBand = Number.isFinite(ratio) && ratio >= p.band.min && ratio <= p.band.max;
    // Two standard errors of the ratio, from each side's own (a share of its pay): outside by less asks for more seeds.
    const se = Number.isFinite(ratio) ? ratio * Math.hypot(p.noise || 0, ref.noise || 0) : 0;
    const near = Number.isFinite(ratio) && ratio >= p.band.min - 2 * se && ratio <= p.band.max + 2 * se;
    const verdict = !p.judged ? 'info' : inBand ? 'pass' : near ? 'warn' : 'fail';
    const noise = verdict === 'warn' ? ` Outside, but within noise (± ${n(se)}): re-run on more seeds before acting.` : '';
    out.push({ level: 'balance', check: 'mode.pay', item: `${p.label}: pay against Elimination's`, verdict, says: `${figures}${p.judged ? '' : '; dev content: shown, not judged'}.${noise}` });
  }
  return out;
}

/**
 * A run mode's levels in order (CT3): for each map and lighting, each pair [easier, harder] (the runner's `runs` meta
 * carries the pairs): the squad gets out of the easier level's runs at least as often. Within noise (two standard errors)
 * asks for a look; a figure not judged is shown.
 */
export function runOrderResults(runs) {
  const out = [];
  const groups = new Map();
  for (const r of runs) {
    const key = `${r.map}|${r.lighting}|${r.mode}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const group of groups.values()) {
    const pairs = group[0].harder ?? [];
    for (const [easier, harder] of pairs) {
      const e = group.find((r) => r.level === easier);
      const h = group.find((r) => r.level === harder);
      if (!e || !h) continue;
      const diff = e.extract - h.extract;
      const se = Math.hypot(e.se || 0, h.se || 0);
      const judged = e.judged && h.judged;
      const verdict = !judged ? 'info' : diff >= 0 ? 'pass' : diff > -2 * se ? 'warn' : 'fail';
      const words = `${LEVEL_NAMES[easier] ?? easier} ${pct(e.extract)} against ${LEVEL_NAMES[harder] ?? harder} ${pct(h.extract)}`;
      out.push({ level: 'balance', check: 'mode.levels', item: `${e.where}, ${e.mode}: ${LEVEL_NAMES[easier] ?? easier} easier to get out from than ${LEVEL_NAMES[harder] ?? harder}`, verdict, says: `${words}${verdict === 'warn' ? ', the wrong way round but within noise: re-run on more seeds' : ''}${judged ? '' : '; dev content: shown, not judged'}.` });
    }
  }
  return out;
}

/** Every mode side by side (the mode report's table): `[label, ...one value per mode]`. */
export function modeRows(modes) {
  const needs = { flag: 'a flagpole', extraction: 'Extraction data' };
  return [
    ['Played as', ...modes.map((m) => (m.play === 'run' ? 'one run' : 'rounds'))],
    ['Needs from a map', ...modes.map((m) => (m.needs ? needs[m.needs] ?? m.needs : 'nothing'))],
    ['Maps that host it', ...modes.map((m) => m.maps.join(', ') || 'none')],
    ['Rulesets', ...modes.map((m) => m.rulesets.join(', '))],
    ['Match rows it hides', ...modes.map((m) => m.hides.join(', ') || 'none')],
    ['Tag', ...modes.map((m) => m.tag)],
  ];
}

/** The mode report as Markdown: as reportMarkdown, with every mode beside this one and the places that answer for a mode. */
export function modeReportMarkdown({ content, item, results, pictures = [], meta }) {
  const lines = [`# Content report: ${item.name} (mode)`, ''];
  const what = item.id === 'modes' ? `Every mode (${content.items.length})` : `Mode \`${item.key}\`, tagged ${item.tag}`;
  lines.push(`${what}. Checked ${meta.when} on \`${meta.commit}\`.`, '');
  lines.push(`**${outcomeLine(results, meta, MODE_LEVEL_WORDS)}**`, '');
  const attention = results.filter((r) => r.verdict === 'fail' || r.verdict === 'warn');
  if (attention.length > 0) {
    lines.push('## What needs you', '');
    attention.forEach((r, i) => lines.push(`${i + 1}. **${VERDICT_WORDS[r.verdict]}** (${MODE_LEVEL_WORDS[r.level]}, ${r.item}): ${r.says}`));
    lines.push('');
  }
  for (const level of meta.levels) {
    const own = results.filter((r) => r.level === level);
    if (own.length === 0 && level !== 'rules') continue;
    lines.push(`## ${MODE_LEVEL_WORDS[level]}`, '');
    if (own.length > 0) lines.push(...mdTable(['Check', 'Result', 'What was found'], own.map((r) => [level === 'balance' && r.check === 'balance.figure' ? r.item : `${r.check} · ${r.item}`, VERDICT_WORDS[r.verdict], r.says])), '');
    if (level === 'rules') {
      const order = [...content.modes].sort((a, b) => (a.id === item.key ? -1 : b.id === item.key ? 1 : 0));
      lines.push('### Beside the other modes', '', ...mdTable(['', ...order.map((m) => m.label)], modeRows(order)), '');
      lines.push('### Where a mode is answered for', '', ...content.places.map((p) => `- ${p}`), '');
    }
  }
  if (pictures.length > 0) {
    lines.push('## Pictures', '');
    for (const p of pictures) lines.push(p.ok ? `**${p.title}**\n\n![${p.title}](pictures/${p.file})\n` : `- ${p.title}: not drawn (${p.error}).`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

// ---- Skins (CT4) ---------------------------------------------------------------------------------------------------

/** A skin's report calls its levels by what they check: level 2 is how it fits the replicas. */
export const SKIN_LEVEL_WORDS = { ...LEVEL_WORDS, compatibility: 'Fit' };

/** A colour as text ("#2f6fd6"). */
const hexColour = (c) => `#${Number(c).toString(16).padStart(6, '0')}`;

/** The skins side by side: one row per skin, its tag, family, colours, what shows at a distance and who carries it. */
export function skinRows(skins, readableShare) {
  return skins.map((s) => [
    `${s.name} (\`${s.id}\`)`,
    s.tag,
    s.family,
    ['body', 'furniture', 'detail', 'accent', 'steel'].map((r) => `${r} ${hexColour(s.colours[r])}`).join(', '),
    s.shows.filter((c) => c.share >= readableShare).map((c) => `${hexColour(c.colour)} ${pct(c.share)}`).join(', '),
    s.bots.length > 0 ? `${s.bots.join(' and ')}'s bots` : 'players only',
  ]);
}

/** The maps' measured colours: one row per map, its common colours (as the skin checks judged them: merged, the rare ones left out; largest first). */
export function paletteRows(palettes) {
  return palettes.map((p) => [p.label, p.error ? `not measured (${p.error})` : p.buckets.slice(0, 6).map((b) => `${hexColour(b.colour)} ${pct(b.share)}`).join(', ')]);
}

/** A skin's report (CT4): the outcome, what needs the owner, each level, every skin side by side, the maps' colours and the pictures. */
export function skinReportMarkdown({ content, item, results, pictures = [], palettes = [], meta }) {
  const lines = [`# Content report: ${item.name} (skin)`, ''];
  const what = item.id === 'skins' ? `Every skin (${content.items.length})` : `Skin \`${item.key}\`, tagged ${item.tag}`;
  lines.push(`${what}. Checked ${meta.when} on \`${meta.commit}\`.`, '');
  lines.push(`**${outcomeLine(results, meta, SKIN_LEVEL_WORDS)}**`, '');
  const attention = results.filter((r) => r.verdict === 'fail' || r.verdict === 'warn');
  if (attention.length > 0) {
    lines.push('## What needs you', '');
    attention.forEach((r, i) => lines.push(`${i + 1}. **${VERDICT_WORDS[r.verdict]}** (${SKIN_LEVEL_WORDS[r.level]}, ${r.item}): ${r.says}`));
    lines.push('');
  }
  for (const level of meta.levels) {
    const own = results.filter((r) => r.level === level);
    if (own.length === 0 && level !== 'rules') continue;
    lines.push(`## ${SKIN_LEVEL_WORDS[level]}`, '');
    if (own.length > 0) lines.push(...mdTable(['Check', 'Result', 'What was found'], own.map((r) => [`${r.check} · ${r.item}`, VERDICT_WORDS[r.verdict], r.says])), '');
    if (level === 'rules') {
      const order = [...content.skins].sort((a, b) => (a.id === item.key ? -1 : b.id === item.key ? 1 : 0));
      lines.push('### Beside the other skins', '', ...mdTable(['Skin', 'Access', 'Realistic colours', 'Colours', 'Shows at a distance', 'Carried by'], skinRows(order, content.readableShare)), '');
    }
    if (level === 'spec' && palettes.length > 0) lines.push("### The maps' colours", '', 'As painted, before light, by share of the surface (measured in the browser).', '', ...mdTable(['Map', 'Common colours'], paletteRows(palettes)), '');
  }
  if (pictures.length > 0) {
    lines.push('## Pictures', '');
    for (const p of pictures) lines.push(p.ok ? `**${p.title}**\n\n![${p.title}](pictures/${p.file})\n` : `- ${p.title}: not drawn (${p.error}).`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
