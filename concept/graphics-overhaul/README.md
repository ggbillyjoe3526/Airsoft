# Graphics overhaul concept

A throwaway concept page for the planned 0.2 graphics overhaul. It is not part of the game build: it has its own Vite config and only reads the game's map data.

The plan and notes live in the project files at `plans/graphics-overhaul-0.2.md`.

```
npx vite --config concept/graphics-overhaul/vite.config.mjs
node concept/graphics-overhaul/capture.mjs <outDir> low,ultra ingame,map,overview,characters,replicas
node concept/graphics-overhaul/compose.mjs <outDir> <outDir> <today's screenshot>
```
