/**
 * The loading screen (audit UI-12, CORE-10): index.html draws it before any script; main.ts then fills its bar with
 * the real download of the physics engine's WebAssembly (Rapier, IM3: most of the game's bytes), then the steps after it.
 */
export const LOADING = {
  /** Share of the bar the physics download fills; the steps after it take the rest. */
  downloadShare: 0.85,
  /** Where the bar stands as each later step starts. */
  physicsAt: 0.9,
  gameAt: 0.96,
  /** What the line under the bar says at each step. */
  text: {
    download: 'Loading physics…',
    physics: 'Starting physics…',
    game: 'Starting the game…',
    failed: 'Failed to start',
  },
  /**
   * The code fetched on first use (IM1, core/onDemand.ts: the Loadout, Armory and Settings screens, the practice range)
   * is preloaded once the title is up and the page idle, or this long after at the latest, so opening it rarely waits.
   */
  preloadWithinMs: 2000,
  /** The <meta> the build adds to index.html (vite.config.ts): Rapier's `.wasm` URL, its size in bytes in `data-bytes`. */
  physicsMeta: 'airsoft-physics-wasm',
} as const;
