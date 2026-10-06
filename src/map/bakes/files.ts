/**
 * The maps' baked light files (G6): written by `node pipeline/bake-light.mjs`, one per map that opts in
 * (MapData.bakedLight), base64 text in this folder. Each is imported only through its loader here, so the bundler gives
 * it a chunk of its own, fetched as the game starts (render/bakedLight.ts loadBakedLight).
 */

/** A baked light file, by the name MapData.bakedLight gives. */
export type BakeFileId = 'depot';

/** The command that writes the files (named by the pin test when a map changes without a re-bake). */
export const BAKE_COMMAND = 'node pipeline/bake-light.mjs';

/** Where each file is, from the repository's root (the bake script writes it there). */
export function bakeFilePath(id: BakeFileId): string {
  return `src/map/bakes/${id}.probes.b64`;
}

/** Each file's loader: its base64 text. */
export const BAKE_FILES: Record<BakeFileId, () => Promise<string>> = {
  depot: () => import('./depot.probes.b64?raw').then((m) => m.default),
};
