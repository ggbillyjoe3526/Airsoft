# Graphics overhaul concept

A throwaway concept page for the planned 0.2 graphics overhaul. It is not part of the game build: it has its own Vite config and only reads the game's map data.

The plan, William's feedback log and the notes live in the project files at `plans/graphics-overhaul-0.2.md`.

```
npx vite --config concept/graphics-overhaul/vite.config.mjs
node concept/graphics-overhaul/capture.mjs <outDir> low,ultra ingame,map,overview,characters,robots,heads,arms,arms-inspect,arms-robot,pistol,replicas
EXTRA='&robots=1' node concept/graphics-overhaul/capture.mjs <robotsDir> low,ultra ingame
node concept/graphics-overhaul/compose.mjs <outDir> <outDir> <today's screenshot or -> [version 1 dir]
```

`ULTRA_W=1600 ULTRA_H=900` gives quick Ultra test renders. Add `&no=ao,ssr,bloom` to the page address to switch Ultra effects off one by one.
