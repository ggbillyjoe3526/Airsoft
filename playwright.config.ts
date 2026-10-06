import { defineConfig, devices } from '@playwright/test';

/** Port for the smoke test's own server; not Vite's default 4173, so a running `npm run preview` is never reused. */
const PORT = 4180;
/** Port for the release build's server (the `release` project); the perf harness has 4181. */
const RELEASE_PORT = 4182;

/**
 * A Chromium other than Playwright's own, for containers where the browser is preinstalled (the cloud sessions keep
 * it at /opt/pw-browsers/chromium and block the download). Unset, Playwright uses the browser it installed.
 */
const CHROMIUM = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PLAYWRIGHT_CHROMIUM;

/** Chromium drawing in software (SwiftShader), so the tests run without a GPU. */
const SWIFTSHADER = {
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

/**
 * Browser smoke test (`npm run test:browser`). Chromium only, no Firefox project yet (KNOWN_ISSUES). Two servers: the `chromium` project's builds the game in `e2e` mode into `dist-e2e/` (the only build
 * where `?nolock` works outside the dev server) and serves it; the `release` project's serves `dist/`, the build players
 * get (audit CORE-22). Each build is made once per source and reused (pipeline/build-cached.mjs): after the gate's build
 * step, `dist/` is already there. SwiftShader renders without a GPU, so this runs on CI too.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // The HTML report (playwright-report/) keeps the in-match screenshot; CI uploads it. The JSON report is what the
  // pipeline's gate script reads (pipeline/gate.mjs). Locally the console gets dots, not a line per test, because a model
  // reads it (token-efficiency plan, item 20); CI keeps the list.
  reporter: [[process.env.CI ? 'list' : 'dot'], ['html', { open: 'never' }], ['json', { outputFile: 'pipeline/out/qa-artifacts/playwright.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /release\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], launchOptions: SWIFTSHADER },
    },
    {
      name: 'release',
      testMatch: /release\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${RELEASE_PORT}`, launchOptions: SWIFTSHADER },
    },
  ],
  webServer: [
    {
      command: `node pipeline/build-cached.mjs --mode e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node pipeline/build-cached.mjs --mode production && npx vite preview --outDir dist --port ${RELEASE_PORT} --strictPort`,
      url: `http://localhost:${RELEASE_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
