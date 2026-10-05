import { defineConfig } from 'vite';
// The concept's own server: none of the game's build plugins, the repo root readable for the map data.
export default defineConfig({ root: 'concept/graphics-overhaul', server: { port: 5199, strictPort: true, fs: { allow: ['../..'] } } });
