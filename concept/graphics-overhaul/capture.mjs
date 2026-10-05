// Captures the concept shots: node concept/graphics-overhaul/capture.mjs [outDir] [preset,...] [shot,...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'concept-out';
const presets = (process.argv[3] ?? 'low,ultra').split(',');
const shots = (process.argv[4] ?? 'ingame,map,characters,replicas').split(',');
const base = process.env.CONCEPT_URL ?? 'http://localhost:5199/';
const size = { low: [1920, 1080], ultra: [Number(process.env.ULTRA_W ?? 3840), Number(process.env.ULTRA_H ?? 2160)] };
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const p of presets) {
  for (const s of shots) {
    const [w, h] = size[p];
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('done')) console.log(`[${p}/${s}]`, m.text().slice(0, 300)); });
    page.on('pageerror', (e) => console.log(`[${p}/${s}] pageerror`, e.message));
    const t0 = Date.now();
    await page.goto(`${base}?preset=${p}&shot=${s}&w=${w}&h=${h}${process.env.EXTRA ?? ''}`, { waitUntil: 'commit', timeout: 0 });
    await page.waitForFunction(() => window.__done, null, { timeout: 900000, polling: 1000 });
    const file = `${out}/${p}-${s}.png`;
    await page.screenshot({ path: file, timeout: 0 });
    console.log(file, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.close();
  }
}
await browser.close();
