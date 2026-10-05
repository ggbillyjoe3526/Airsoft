// Side-by-side comparisons: node concept/graphics-overhaul/compose.mjs <shotsDir> <outDir> [todayScreenshot|-] [v1ShotsDir]
import { chromium } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// v2 = the previous concept's folder (for version 2 against version 3 pairs).
const [dir, out, today, v1, v2] = process.argv.slice(2);
const url = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const pairs = [
  ['compare-ingame', [`${dir}/low-ingame.png`, 'LOW', 'modern laptop, built-in graphics, 1080p, 60 fps target'], [`${dir}/ultra-ingame.png`, 'ULTRA', 'RTX 5090 class, 4K, up to 240 fps']],
  ['compare-map', [`${dir}/low-map.png`, 'LOW', 'the Depot re-dressed'], [`${dir}/ultra-map.png`, 'ULTRA', 'the Depot re-dressed']],
  ['compare-characters', [`${dir}/low-characters.png`, 'LOW', 'cut-down figures'], [`${dir}/ultra-characters.png`, 'ULTRA', 'full-detail figures']],
  ['compare-replicas', [`${dir}/low-replicas.png`, 'LOW', 'cut-down replicas'], [`${dir}/ultra-replicas.png`, 'ULTRA', 'full-detail replicas']],
  ['compare-arms', [`${dir}/low-arms.png`, 'LOW', 'first-person arms, cut-down'], [`${dir}/ultra-arms.png`, 'ULTRA', 'first-person arms, full detail']],
  ['compare-ingame-robots', [`${dir}/ultra-ingame.png`, 'HUMANS', 'Ultra, Robots setting off'], [`${dir}/ultra-ingame-robots.png`, 'ROBOTS', 'Ultra, Robots setting on']],
  ['compare-colours', [`${dir}/ultra-schemes.png`, 'BOLD COLOURS', 'the default two-tone schemes'], [`${dir}/ultra-schemes-real.png`, 'REALISTIC COLOURS', 'the same replicas with the setting on']],
  ['compare-woodland', [`${dir}/low-woodland-ingame.png`, 'LOW', 'Woodland at night'], [`${dir}/ultra-woodland-ingame.png`, 'ULTRA', 'Woodland at night']],
  ['compare-neon', [`${dir}/low-neon-ingame.png`, 'LOW', 'Neon Heights at night'], [`${dir}/ultra-neon-ingame.png`, 'ULTRA', 'Neon Heights at night']],
  ['compare-today-vs-ultra', [today, 'TODAY', 'the current game (screenshot from 4 October)'], [`${dir}/ultra-ingame.png`, 'ULTRA', 'after the overhaul (concept)']],
  ['compare-today-vs-low', [today, 'TODAY', 'the current game (screenshot from 4 October)'], [`${dir}/low-ingame.png`, 'LOW', 'after the overhaul (concept)']],
];
if (v1 && v1 !== '-') for (const s of ['ingame', 'map', 'characters', 'replicas']) pairs.push([`compare-v1-vs-v2-${s}`, [`${v1}/ultra-${s}.png`, 'V1', 'first concept, Ultra'], [`${dir}/ultra-${s}.png`, 'V2', 'after your feedback, Ultra']]);
if (v2) for (const s of ['ingame', 'map', 'characters', 'replicas', 'heads']) pairs.push([`compare-v2-vs-v3-${s}`, [`${v2}/ultra-${s}.png`, 'V2', 'second concept, Ultra'], [`${dir}/ultra-${s}.png`, 'V3', 'after your second round, Ultra']]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
for (const [name, a, b] of pairs) {
  if (!existsSync(a[0] ?? '') || !existsSync(b[0] ?? '')) continue;
  const data = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a[0]), load(b[0])]);
    const W = 1920, H = 1080, head = 96, gap = 12;
    const c = document.createElement('canvas');
    c.width = W * 2 + gap;
    c.height = H + head;
    const g = c.getContext('2d');
    g.fillStyle = '#15181d';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high';
    [[ia, a], [ib, b]].forEach(([img, meta], k) => {
      const x = k * (W + gap);
      g.drawImage(img, x, head, W, H);
      g.fillStyle = k === 0 ? '#9aa4b2' : '#ffcf4a';
      g.font = '800 40px Arial, sans-serif';
      g.fillText(meta[1], x + 28, 62);
      const w = g.measureText(meta[1]).width;
      g.fillStyle = '#d7dce3';
      g.font = '500 30px Arial, sans-serif';
      g.fillText(meta[2], x + 50 + w, 60);
    });
    return c.toDataURL('image/png');
  }, [[url(a[0]), a[1], a[2]], [url(b[0]), b[1], b[2]]]);
  writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(name);
}
await browser.close();
