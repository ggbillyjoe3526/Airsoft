import { defineConfig, devices } from '@playwright/test';

/** Port for the smoke test's own server; not Vite's default 4173, so a running `npm run preview` is never reused. */
const PORT = 4180;

/**
 * A Chromium other than Playwright's own, for containers where the browser is preinstalled (the cloud sessions keep
 * it at /opt/pw-browsers/chromium and block the download). Unset, Playwright uses the browser it installed.
 */
const CHROMIUM = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PLAYWRIGHT_CHROMIUM;

/**
 * Browser smoke test of the production build (`npm run test:browser`). Chromium only. The web server builds the
 * game in `e2e` mode into `dist-e2e/` (the only build where `?nolock` works outside the dev server; `dist/` is
 * left alone) and serves it. SwiftShader renders without a GPU, so this runs on CI too.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // The HTML report (playwright-report/) keeps the in-match screenshot; CI uploads it. The JSON report is what the
  // pipeline's gate script reads (pipeline/gate.mjs).
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'pipeline/out/qa-artifacts/playwright.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    command: `npm run build:e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
