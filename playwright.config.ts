import { defineConfig, devices } from '@playwright/test';

/** Port for the smoke test's own server; not Vite's default 4173, so a running `npm run preview` is never reused. */
const PORT = 4180;

/**
 * Browser smoke test of the production build (`npm run test:browser`). Chromium only. The web server builds the
 * game in `e2e` mode into `dist-e2e/` (the only build where `?nolock` works outside the dev server; `dist/` is
 * left alone) and serves it. SwiftShader renders without a GPU, so this runs on CI too.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // The HTML report (playwright-report/) keeps the in-match screenshot; CI uploads it.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
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
