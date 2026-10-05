// Renders the menu concept's item pictures (weapons, attachments, colour schemes) as small JPEG-ready PNGs:
// node concept/graphics-overhaul/thumbs.mjs   (needs the concept server on 5199)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = 'concept/graphics-overhaul/ui/thumbs';
mkdirSync(out, { recursive: true });
const W = 640, H = 400;
const items = [
  ['aeg', 'item=aeg&scheme=cobalt'],
  ['aeg-kit', 'item=aeg&scheme=cobalt&parts=redDot,vertical,torch'],
  ['pistol', 'item=pistol&scheme=ghost'],
  ['cyber', 'item=cyber'],
  ...['redDot', 'scope2x', 'silencer', 'torch', 'vertical', 'angled', 'laser', 'hiCap', 'longBarrel'].map((a) => [`att-${a}`, `item=${a}&scheme=onyx`]),
  ...['cobalt', 'signal', 'acid', 'teal', 'hazard', 'coral', 'onyx', 'ghost'].map((s) => [`scheme-${s}`, `item=aeg&scheme=${s}`]),
  ...[['black', 'cobalt'], ['grey', 'ghost'], ['tan', 'signal'], ['ranger', 'acid']].map(([n, s]) => [`real-${n}`, `item=aeg&scheme=${s}&real=1`]),
  ...['cobalt', 'hazard', 'onyx', 'ghost'].map((s) => [`pscheme-${s}`, `item=pistol&scheme=${s}`]),
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, qs] of items) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export const createHotContext = () => ({ accept(){}, dispose(){}, on(){}, prune(){}, invalidate(){}, decline(){}, send(){}, data: {} }); export const updateStyle = () => {}; export const removeStyle = () => {}; export const injectQuery = (u) => u;' }));
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  await page.goto(`${process.env.CONCEPT_URL ?? 'http://localhost:5199/'}?preset=ultra&shot=thumb&${qs}&w=${W}&h=${H}&tag=0`, { waitUntil: 'commit', timeout: 0 });
  await page.waitForFunction(() => window.__done, null, { timeout: 600000, polling: 500 });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name);
  await page.close();
}
await browser.close();
