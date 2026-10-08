#!/usr/bin/env node
/**
 * The baked bounce light (G6): bakes the light probes of every map that opts in (MapData.bakedLight) and writes each
 * map's probe file, src/map/bakes/<file>.probes.b64, which the game ships and loads with the map. Node only, no browser:
 * the map data and the bake (src/render/lightBake.ts) are loaded through Vite's module runner, as the game builds them.
 *
 *   node pipeline/bake-light.mjs [depot …]
 *
 * With no names it bakes every map that opts in. Run it after any change to a baked map's blocks, its tints or the day
 * lighting: src/map/bakes/bakes.test.ts fails until the file matches the map again. The same map always gives the same
 * bytes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { runnerImport } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = async (id) => (await runnerImport(id, { configFile: false, root: ROOT, logLevel: 'error' })).module;

const [{ MAPS, mapData, registerMaps }, { DEV_MAP_DATA }, bake, probes, files] = await Promise.all([
  load('/src/map/maps.ts'),
  load('/src/map/devMaps.ts'),
  load('/src/render/lightBake.ts'),
  load('/src/render/probeGrid.ts'),
  load('/src/map/bakes/files.ts'),
]);
registerMaps(DEV_MAP_DATA);

const wanted = process.argv.slice(2);
const targets = MAPS.map((m) => ({ id: m.id, map: mapData(m.id) })).filter(({ id, map }) => map.bakedLight && (wanted.length === 0 || wanted.includes(id) || wanted.includes(map.bakedLight.file)));
if (targets.length === 0) {
  console.error(wanted.length ? `No map that opts in to baked light is called ${wanted.join(', ')}.` : 'No map opts in to baked light.');
  process.exit(1);
}

for (const { id, map } of targets) {
  const started = performance.now();
  const inputs = bake.bakeInputs(map);
  const grid = bake.bakeProbes(inputs, bake.bakeHash(inputs));
  const bytes = probes.encodeProbeFile(grid);
  const path = join(ROOT, files.bakeFilePath(map.bakedLight.file));
  mkdirSync(dirname(path), { recursive: true });
  const text = probes.toBase64(bytes);
  writeFileSync(path, text);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`${id}: ${grid.nx} × ${grid.ny} × ${grid.nz} probes every ${grid.spacing.toFixed(2)} m, ${inputs.solids.length} solids, ${seconds} s; ${kb(bytes.length)}, its text ${kb(gzipSync(text, { level: 9 }).length)} gzipped → ${files.bakeFilePath(map.bakedLight.file)}`);
}
