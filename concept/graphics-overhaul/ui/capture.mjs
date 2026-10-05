// Screenshots of the menu concept: node concept/graphics-overhaul/ui/capture.mjs <outDir> [screens]
// Serves this folder itself (python3 -m http.server) so fonts and modules load.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? 'ui-out';
const list = (process.argv[3] ?? 'title,play,loadout,customise,colour,settings,look,hud,results,armory').split(',');
mkdirSync(out, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '5210', '--bind', '127.0.0.1'], { cwd: here, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  for (const s of list) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', (e) => console.log(s, 'pageerror', e.message));
    await page.goto(`http://127.0.0.1:5210/index.html?screen=${s}`);
    await page.waitForFunction(() => window.__done, null, { timeout: 30000 });
    await page.screenshot({ path: `${out}/${s}.jpg`, type: 'jpeg', quality: 88 });
    console.log(s);
    await page.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
