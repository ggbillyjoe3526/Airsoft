/**
 * The Content-Security-Policy of a built page (audit CORE-19), added to index.html as a <meta> by the build
 * (vite.config.ts): the game's own files only; `'wasm-unsafe-eval'` lets Rapier and the meshopt decoder compile their
 * WebAssembly; inline styles (the loading screen in index.html, the style attributes the game sets) and data: / blob:
 * images, workers and media are allowed. Nothing a <meta> can't carry (`frame-ancestors`, `report-uri`, `sandbox`):
 * the browser would log an error for it. The dev server gets none, so Vite's client, its injected styles and its HMR
 * socket work as they always have.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');
