# src/assets

Bundled files that are not code. Greybox and procedural art come first, so there is little here.

- Art is procedural for now: the CC0 sites are blocked by the cloud sessions' network policy.
- `fonts/`: Inter as `.woff2` (four weights) (SIL Open Font License, `fonts/OFL.txt`), used by the menus.
- `models/characters/`: where an optional `figure.glb` goes (see its `README.md`). Without one the built-in figures are
  drawn. `render/externalModels.ts` and `config/assets.ts` load and describe it.
- Every external asset is recorded in `docs/ASSETS.md`; the how-to, sources and size budget are in `docs/CC0_ASSETS.md`.
  Only CC0 or clearly permissive licences.
