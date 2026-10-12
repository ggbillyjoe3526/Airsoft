import { describe, expect, it } from 'vitest';
import { FIGURE_RIG, FIGURE_RIG_KINDS } from '../config/figureRig';
import type { FigureSidecar } from './figureRig';
import { modelScene, readFile } from './testSupport';

/**
 * IM5: the shipped figure files are the output of tools/blender/bot-figure/pack.mjs (meshopt-compressed, animation
 * tracks at their bone's rest removed). A Blender re-export that skips the pack step, or a bad pack, fails here.
 */

const file = (kind: string, ext: string) => new URL(`../assets/models/characters/${kind}.${ext}`, import.meta.url);

/** The glTF JSON chunk of a .glb. */
async function gltfJson(kind: string): Promise<{ extensionsUsed?: string[]; extensionsRequired?: string[] }> {
  const bytes = await readFile(file(kind, 'glb'));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

describe.each(FIGURE_RIG_KINDS)('packed figure file: %s', (kind) => {
  it('declares and requires EXT_meshopt_compression', async () => {
    const json = await gltfJson(kind);
    expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
  });

  it('stays well under the size the loader warns at', async () => {
    const bytes = await readFile(file(kind, 'glb'));
    // Measured 2.2 to 2.4 MB packed; an unpacked export is far larger. 3.5 MB leaves room for a re-export.
    expect(bytes.byteLength).toBeLessThan(3_500_000);
    expect(bytes.byteLength).toBeLessThan(FIGURE_RIG.warnBytes);
  });

  it('keeps no animation track that holds its bone at rest', async () => {
    const scene = await modelScene(`characters/${kind}.glb`);
    let tracks = 0;
    const still: string[] = [];
    for (const clip of scene.animations) {
      for (const track of clip.tracks) {
        tracks++;
        const dot = track.name.lastIndexOf('.');
        const bone = scene.getObjectByName(track.name.slice(0, dot));
        const property = track.name.slice(dot + 1);
        if (!bone) continue;
        const rest = property === 'quaternion' ? bone.quaternion.toArray() : property === 'position' ? bone.position.toArray() : bone.scale.toArray();
        const v = track.values;
        const n = rest.length;
        let allRest = true;
        for (let k = 0; k < v.length && allRest; k += n) {
          const same = rest.every((r, j) => Math.abs(v[k + j]! - r) <= 1e-5);
          const flipped = n === 4 && rest.every((r, j) => Math.abs(-v[k + j]! - r) <= 1e-5);
          if (!same && !flipped) allRest = false;
        }
        if (allRest) still.push(`${clip.name}/${track.name}`);
      }
    }
    expect(tracks).toBeGreaterThan(0);
    // One still track per clip is kept so a clip keeps its length; nothing more.
    expect(still.length).toBeLessThanOrEqual(scene.animations.length);
    expect(tracks).toBeLessThan(2000);
  });

  it('has the sidecar clips, by name and length', async () => {
    const sidecar = JSON.parse(new TextDecoder().decode(await readFile(file(kind, 'json')))) as FigureSidecar;
    const scene = await modelScene(`characters/${kind}.glb`);
    expect(scene.animations.map((c) => c.name).sort()).toEqual(sidecar.clips.map((c) => c.name).sort());
    for (const info of sidecar.clips) {
      const clip = scene.animations.find((c) => c.name === info.name)!;
      // The sidecar rounds seconds to the millisecond.
      expect(Math.abs(clip.duration - info.seconds)).toBeLessThan(0.0015);
    }
  });
});
