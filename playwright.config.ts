import { defineConfig, devices } from '@playwright/test';

/** Port for the smoke test's own server; not Vite's default 4173, so a running `npm run preview` is never reused. */
const PORT = 4180;
/** Port for the release build's server (the `release` project); the perf harness has 4181. */
const RELEASE_PORT = 4182;
/**
 * Where the release project serves `dist/`: the path GitHub Pages plays it from (README › Play in your browser, IM2), so
 * a file the page asks for by an absolute path fails here as it would on the play link. The zip's `npm run preview` serves
 * it from `/`, which relative paths reach just the same.
 */
const RELEASE_PATH = '/Airsoft/';

/**
 * A Chromium other than Playwright's own, for containers where the browser is preinstalled (the cloud sessions keep
 * it at /opt/pw-browsers/chromium and block the download). Unset, Playwright uses the browser it installed.
 */
const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const CHROMIUM = ENV?.PLAYWRIGHT_CHROMIUM;

/**
 * The Firefox run (IN1): `E2E_FIREFOX=1` swaps the projects for one Firefox project of the boot and save specs, with the
 * e2e build's server only. CI's `firefox` job runs it; the cloud containers can't download Playwright's Firefox.
 */
const FIREFOX = ENV?.E2E_FIREFOX === '1';

/** Chromium drawing in software (SwiftShader), so the tests run without a GPU. */
const SWIFTSHADER = {
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

/** The e2e build's server (the `chromium` and `firefox` projects). */
const E2E_SERVER = {
  command: `node pipeline/build-cached.mjs --mode e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
  url: `http://localhost:${PORT}`,
  reuseExistingServer: false,
  timeout: 120_000,
};

/** The release build's server (the `release` project). */
const RELEASE_SERVER = {
  command: `node pipeline/build-cached.mjs --mode production && npx vite preview --outDir dist --base ${RELEASE_PATH} --port ${RELEASE_PORT} --strictPort`,
  url: `http://localhost:${RELEASE_PORT}${RELEASE_PATH}`,
  reuseExistingServer: false,
  timeout: 180_000,
};

/** The Chromium runs: the e2e build, and the release build (release.spec.ts) with the real pointer lock. */
const CHROMIUM_PROJECTS = [
  {
    name: 'chromium',
    testIgnore: /release\.spec\.ts$/,
    use: { ...devices['Desktop Chrome'], launchOptions: SWIFTSHADER },
  },
  {
    name: 'release',
    testMatch: /release\.spec\.ts$/,
    use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${RELEASE_PORT}${RELEASE_PATH}`, launchOptions: SWIFTSHADER },
  },
];

/**
 * The Firefox run of the boot and save specs (IN1). Headed under xvfb-run (CI's `firefox` job), as headless Firefox
 * gets no WebGL 2 on a machine without a GPU, with WebGL forced on, as Firefox blocks it on software drivers. Each
 * action, wait and navigation times out on its own, so a step that hangs names itself in the gate's failures summary
 * rather than the whole test timing out (a save spec run hung once on CI with only the test's line to show).
 */
const FIREFOX_PROJECTS = [
  {
    name: 'firefox',
    testMatch: /(boot|save)\.spec\.ts$/,
    use: { ...devices['Desktop Firefox'], headless: false, actionTimeout: 30_000, navigationTimeout: 30_000, launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true } } },
  },
];

/**
 * Browser smoke test (`npm run test:browser`). Chromium, plus Firefox for the boot and save specs under `E2E_FIREFOX`
 * (CI's `firefox` job). Two servers: the `chromium` project's builds the game in `e2e` mode into `dist-e2e/` (the only build
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
  reporter: [[ENV?.CI ? 'list' : 'dot'], ['html', { open: 'never' }], ['json', { outputFile: 'pipeline/out/qa-artifacts/playwright.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
  },
  // One Firefox at a time: two headed windows share xvfb-run's one display, and Firefox slows the one without focus to
  // about a frame a second, so a click (which waits for steady frames) can time out (measured on CI, IN1, 2026-10-17).
  ...(FIREFOX ? { workers: 1 } : {}),
  projects: FIREFOX ? FIREFOX_PROJECTS : CHROMIUM_PROJECTS,
  webServer: FIREFOX ? E2E_SERVER : [E2E_SERVER, RELEASE_SERVER],
});
