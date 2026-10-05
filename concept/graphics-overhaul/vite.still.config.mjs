import { defineConfig } from 'vite';
// A second server for long capture runs: no live reload, so files edited mid-run never blank a page being captured.
// Restart it to pick up changes. Use with CONCEPT_URL=http://localhost:5200/ node concept/graphics-overhaul/capture.mjs ...
export default defineConfig({ root: 'concept/graphics-overhaul', server: { port: 5200, strictPort: true, hmr: false, watch: { ignored: ['**/*'] }, fs: { allow: ['../..'] } } });
