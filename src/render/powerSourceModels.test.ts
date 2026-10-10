import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POWER_SOURCE_FILE } from '../config/assets';
import { GAME_POOL } from '../pool/gamePool';
import { partSubject } from '../ui/menus/menuPictures';
import { ItemPictures, pictureKey, pictureSize, type PictureTarget } from './itemPictures';
import { type PowerSourceModel, powerSourceFileUrls, powerSourceLoader, preparePowerSource } from './powerSourceModels';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };

const mesh = (mat: THREE.Material): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);

describe('preparePowerSource (RM3)', () => {
  it('caps metalness, finds the Label material in any case, drops lights and cameras, applies the turn', () => {
    const scene = new THREE.Group();
    scene.add(mesh(new THREE.MeshStandardMaterial({ name: 'Steel', metalness: 1 })));
    const lab = new THREE.MeshStandardMaterial({ name: 'lAbEl', color: 0x123456, metalness: 0.1 });
    scene.add(mesh(lab), new THREE.PointLight(), new THREE.PerspectiveCamera());
    const { group, label } = preparePowerSource(scene, [0.3, 0.2, 0.1]);
    const mats: THREE.MeshStandardMaterial[] = [];
    let strays = 0;
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) mats.push(o.material as THREE.MeshStandardMaterial);
      if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera) strays++;
    });
    expect(mats[0]!.metalness).toBe(POWER_SOURCE_FILE.maxMetalness);
    expect(mats[1]!.metalness).toBeCloseTo(0.1);
    expect(label).toBe(mats[1]);
    expect(label!.color.getHex()).toBe(0x123456);
    expect(strays).toBe(0);
    expect([group.rotation.x, group.rotation.y, group.rotation.z]).toEqual([0.3, 0.2, 0.1]);
  });

  it('has no label when no material is called Label, and throws when the scene has no mesh', () => {
    const scene = new THREE.Group();
    scene.add(mesh(new THREE.MeshStandardMaterial({ name: 'Body' })));
    expect(preparePowerSource(scene).label).toBeNull();
    expect(() => preparePowerSource(new THREE.Group())).toThrow('no mesh');
  });
});

describe('powerSourceLoader (RM3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives null for an unknown file without fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await powerSourceLoader(new Map())('nothing')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches a file once however often it is asked, and warns once and gives null when it fails', async () => {
    const fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
    vi.stubGlobal('fetch', fetch);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = powerSourceLoader(new Map([['gasBottle', '/x.glb']]));
    const results = await Promise.all([load('gasBottle'), load('gasBottle')]);
    expect(await load('gasBottle')).toBeNull();
    expect(results).toEqual([null, null]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

/** The JSON chunk of a .glb on disk. */
function glbJson(file: string): { materials?: { name?: string }[] } {
  const b = readFileSync(new URL(`../assets/models/powerSources/${file}.glb`, import.meta.url));
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + length)));
}

describe('the power-source files and pool entries (RM3)', () => {
  const files = [...new Set(Object.values(POWER_SOURCE_FILE.pictures).map((p) => p.file))];

  it('ships each pictured file, under budget, and the build finds it', () => {
    const urls = [...powerSourceFileUrls().keys()];
    for (const file of files) {
      const bytes = readFileSync(new URL(`../assets/models/powerSources/${file}.glb`, import.meta.url)).byteLength;
      expect(bytes, file).toBeLessThan(POWER_SOURCE_FILE.warnBytes);
      expect(urls).toContain(file);
    }
  });

  it('gives the gas bottle a Label material', () => {
    const names = (glbJson('gasBottle').materials ?? []).map((m) => (m.name ?? '').toLowerCase());
    expect(names).toContain(POWER_SOURCE_FILE.labelMaterial.toLowerCase());
  });

  it('pictures every battery and gas pool power source', () => {
    const power = GAME_POOL.assets.filter((a) => a.power && (a.power.type === 'battery' || a.power.type === 'gas'));
    expect(power.length).toBeGreaterThanOrEqual(5);
    for (const a of power) expect(POWER_SOURCE_FILE.pictures[a.id], a.name).toBeDefined();
  });

  it('gives Red Gas a power subject with its label, and a spring power source none', () => {
    const red = GAME_POOL.assets.find((a) => a.name === 'Red Gas')!;
    expect(partSubject(red, false)).toEqual({ power: 'gasBottle', label: 0xc8382c });
    const battery = GAME_POOL.assets.find((a) => a.name === 'Standard Battery')!;
    expect(partSubject(battery, false)).toEqual({ power: 'standardBattery' });
  });
});

describe('ItemPictures with a power subject (RM3)', () => {
  function target(labelSeen: number[], label: () => THREE.MeshStandardMaterial): PictureTarget {
    return {
      draw: (_s, _c, w, h) => {
        labelSeen.push(label().color.getHex());
        return new Float32Array(w * h * 4).fill(0.2);
      },
      encode: (_r, w, h) => `p:${w}x${h}`,
      dispose() {},
    };
  }
  const model = (): PowerSourceModel => preparePowerSource(new THREE.Group().add(mesh(new THREE.MeshStandardMaterial({ name: 'Label', color: 0x111111 }))));

  it('waits for the model, draws once with the label colour set, restores it, and caches', async () => {
    const m = model();
    const seen: number[] = [];
    const load = vi.fn(() => Promise.resolve(m));
    const pics = new ItemPictures(target(seen, () => m.label!), (work) => queueMicrotask(work), undefined, load);
    const subject = { power: 'gasBottle', label: 0xc8382c };
    const [a, b] = await Promise.all([pics.picture(subject), pics.picture({ ...subject })]);
    expect(a).toBe(b);
    expect(seen).toEqual([0xc8382c]);
    expect(m.label!.color.getHex()).toBe(0x111111);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('rejects when the loader gives null', async () => {
    const pics = new ItemPictures(target([], () => model().label!), (work) => queueMicrotask(work), undefined, () => Promise.resolve(null));
    await expect(pics.picture({ power: 'gasBottle' })).rejects.toThrow();
  });

  it('keys by label and is wide by default', () => {
    expect(pictureKey({ power: 'gasBottle', label: 1 })).not.toBe(pictureKey({ power: 'gasBottle', label: 2 }));
    expect(pictureKey({ power: 'gasBottle' })).not.toBe(pictureKey({ power: 'lipoBattery' }));
    expect(pictureSize({ power: 'gasBottle' })).toEqual(pictureSize({ power: 'gasBottle', shape: 'wide' }));
    expect(pictureSize({ power: 'gasBottle' })).not.toEqual(pictureSize({ power: 'gasBottle', shape: 'square' }));
  });
});
