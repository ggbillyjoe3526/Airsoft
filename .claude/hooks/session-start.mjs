// SessionStart hook (token-efficiency plan, item 23): in a cloud session, install the dependencies and point Playwright
// at the container's Chromium, so a thread spends no turns on setup. Does nothing on a local machine.
import { appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CHROMIUM = '/opt/pw-browsers/chromium';
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

if (process.env.CLAUDE_CODE_REMOTE === 'true') {
  if (!existsSync(`${root}/node_modules`)) {
    const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: root, stdio: 'ignore' });
    console.log(r.status === 0 ? 'Session setup: dependencies installed.' : 'Session setup: npm ci failed; run it by hand.');
  }
  if (process.env.CLAUDE_ENV_FILE && existsSync(CHROMIUM)) {
    appendFileSync(process.env.CLAUDE_ENV_FILE, `export PLAYWRIGHT_CHROMIUM=${CHROMIUM}\n`);
  }
}
