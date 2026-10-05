import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ITEM_PICTURE } from '../config/itemPictures';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { finishPixels, fitParts, frameItem, ItemPictures, pictureKey, pictureSize, type PictureSubject, type PictureTarget, showOnly, toneMap, toSrgb8, visibleBox } from './itemPictures';
import { buildReplicaModels } from './replicaModels';

const HIGH = { replica: 'high', hands: 'high' } as const;

/** A target that records what it was asked to draw and returns a picture of one opaque grey pixel per call. */
function fakeTarget(): PictureTarget & { draws: { meshes: number; lights: number; aspect: number; width: number; height: number }[]; disposed: boolean } {
  const t = {
    draws: [] as { meshes: number; lights: number; aspect: number; width: number; height: number }[],
    disposed: false,
    draw(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
      let meshes = 0;
      scene.traverseVisible((o) => o instanceof THREE.Mesh && meshes++);
      const lights = scene.children.filter((o) => o instanceof THREE.Light).length;
      t.draws.push({ meshes, lights, aspect: (camera as THREE.PerspectiveCamera).aspect, width, height });
      return new Float32Array(width * height * 4).fill(0.2);
    },
    encode(_rgba: Uint8ClampedArray, width: number, height: number) {
      return `picture:${t.draws.length}:${width}x${height}`;
    },
    dispose() {
      t.disposed = true;
    },
  };
  return t;
}

/** A scheduler the test runs by hand: each `frame()` runs the work queued for the next frame. */
function manualFrames(): { schedule: (work: () => void) => void; frame: () => void; pending: () => number } {
  let queued: (() => void)[] = [];
  return {
    schedule: (work) => queued.push(work),
    frame: () => {
      const now = queued;
      queued = [];
      for (const work of now) work();
    },
    pending: () => queued.length,
  };
}

const rifle: PictureSubject = { replica: AEG, scheme: 'cobalt', realistic: false };

describe('item pictures (G2)', () => {
  it('keys each picture by everything that changes it', () => {
    const keys = new Set(
      [
        rifle,
        { ...rifle, scheme: 'signal' },
        { ...rifle, realistic: true },
        { ...rifle, fit: { optic: 'redDot' } },
        { ...rifle, fit: { optic: 'scope2x' } },
        { ...rifle, part: 'optic:redDot' },
        { ...rifle, shape: 'square' },
        { ...rifle, replica: GAS_PISTOL },
      ].map((s) => pictureKey(s as PictureSubject)),
    );
    expect(keys.size).toBe(8);
    expect(pictureKey({ ...rifle, fit: { grip: 'vertical', optic: 'redDot' } })).toBe(pictureKey({ ...rifle, fit: { optic: 'redDot', grip: 'vertical' } }));
    // A replica's picture is wide, a part's square.
    expect(pictureSize(rifle)).toEqual(ITEM_PICTURE.sizes.wide);
    expect(pictureSize({ ...rifle, part: 'optic:redDot' })).toEqual(ITEM_PICTURE.sizes.square);
  });

  it('draws at most one picture a frame, each once, and hands the same promise to every ask', async () => {
    const target = fakeTarget();
    const frames = manualFrames();
    const pictures = new ItemPictures(target, frames.schedule);
    const a = pictures.picture(rifle);
    const b = pictures.picture({ ...rifle, scheme: 'acid' });
    expect(pictures.picture(rifle)).toBe(a);
    expect(target.draws).toHaveLength(0); // nothing drawn until a frame comes
    expect(frames.pending()).toBe(1);
    frames.frame();
    expect(target.draws).toHaveLength(1);
    expect(pictures.waiting).toBe(1);
    frames.frame();
    expect(target.draws).toHaveLength(2);
    expect(frames.pending()).toBe(0); // nothing left: no frame asked for
    await expect(a).resolves.toBe(`picture:1:${ITEM_PICTURE.sizes.wide.join('x')}`);
    await expect(b).resolves.toBe(`picture:2:${ITEM_PICTURE.sizes.wide.join('x')}`);
    // Asked again later: the kept picture, not a new draw.
    await expect(pictures.picture(rifle)).resolves.toBe(`picture:1:${ITEM_PICTURE.sizes.wide.join('x')}`);
    expect(frames.pending()).toBe(0);
    // Each draw had the studio's three lights, the replica and the camera shaped to the picture.
    for (const d of target.draws) {
      expect(d.lights).toBe(3);
      expect(d.meshes).toBeGreaterThan(5);
      expect(d.aspect).toBeCloseTo(d.width / d.height, 6);
    }
    pictures.dispose();
    expect(target.disposed).toBe(true);
  });

  it('drops a picture that fails to draw, so a later ask tries again', async () => {
    const target = fakeTarget();
    let fail = true;
    const draw = target.draw.bind(target);
    target.draw = (...args) => {
      if (fail) throw new Error('context lost');
      return draw(...args);
    };
    const frames = manualFrames();
    const pictures = new ItemPictures(target, frames.schedule);
    const first = pictures.picture(rifle);
    frames.frame();
    await expect(first).rejects.toThrow('context lost');
    fail = false;
    const again = pictures.picture(rifle);
    expect(again).not.toBe(first);
    frames.frame();
    await expect(again).resolves.toMatch(/^picture:/);
  });

  it('builds the replicas bare for a picture: the same replica, no hands or sleeves', () => {
    const held = buildReplicaModels([AEG, GAS_PISTOL, CYBER_PISTOL], 0x3a7bd5, false, HIGH);
    const bare = buildReplicaModels([AEG, GAS_PISTOL, CYBER_PISTOL], 0x3a7bd5, false, HIGH, null, 'bare');
    const names = (root: THREE.Object3D): Set<string> => {
      const out = new Set<string>();
      root.traverse((o) => o instanceof THREE.Mesh && out.add(o.name));
      return out;
    };
    for (const id of [AEG.id, GAS_PISTOL.id, CYBER_PISTOL.id]) {
      const withHands = names(held.models.get(id)!.group);
      const without = names(bare.models.get(id)!.group);
      for (const hand of ['glove', 'sleeve', 'armband']) {
        expect(withHands.has(hand), `${id} ${hand}`).toBe(true);
        expect(without.has(hand), `${id} ${hand}`).toBe(false);
      }
      for (const name of without) expect(withHands.has(name), `${id} ${name}`).toBe(true);
    }
    held.dispose();
    bare.dispose();
  });

  it('shows the fitted parts (and the standard magazine, the bare muzzle and the iron sights with no optic)', () => {
    const models = buildReplicaModels([AEG], 0, false, undefined, null, 'bare');
    const { group } = models.models.get(AEG.id)!;
    const shown = (name: string): boolean => group.getObjectByName(name)!.visible;
    fitParts(group, {});
    expect([shown('magazine:standard'), shown('muzzle:none'), shown('sightsUp'), shown('optic:redDot'), shown('sightsDown')]).toEqual([true, true, true, false, false]);
    fitParts(group, { optic: 'redDot', magazine: 'hiCap', muzzle: 'silencer' });
    expect([shown('optic:redDot'), shown('magazine:hiCap'), shown('magazine:standard'), shown('muzzle:silencer'), shown('muzzle:none'), shown('sightsUp'), shown('sightsDown')]).toEqual([
      true,
      true,
      false,
      true,
      false,
      false,
      true,
    ]);
    models.dispose();
  });

  it('shows only the asked part for its own picture', () => {
    const models = buildReplicaModels([AEG], 0, false, undefined, null, 'bare');
    const { group } = models.models.get(AEG.id)!;
    showOnly(group, 'optic:redDot');
    const part = group.getObjectByName('optic:redDot')!;
    expect(visibleBox(group).equals(new THREE.Box3().setFromObject(part))).toBe(true);
    expect(() => showOnly(group, 'optic:none')).toThrow();
    models.dispose();
  });

  it('frames the item tightly: every corner in the picture, with the margin to spare and no more', () => {
    for (const aspect of [2, 1]) {
      const box = new THREE.Box3(new THREE.Vector3(-0.03, -0.25, -0.62), new THREE.Vector3(0.03, 0.13, 0.36));
      const camera = new THREE.PerspectiveCamera(ITEM_PICTURE.fov, 1, 0.01, 10);
      frameItem(camera, box, aspect);
      let edge = 0;
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / ITEM_PICTURE.margin + 1e-6);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / ITEM_PICTURE.margin + 1e-6);
        expect(p.z).toBeGreaterThan(-1);
        expect(p.z).toBeLessThan(1);
        edge = Math.max(edge, Math.abs(p.x), Math.abs(p.y));
      }
      expect(edge).toBeCloseTo(1 / ITEM_PICTURE.margin, 6);
    }
  });

  it('finishes the pixels: rows flipped top first, colour unpremultiplied, tone mapped and in sRGB, the background clear', () => {
    // Two by two: the bottom row (first in) is half-covered grey, the top row empty.
    const px = new Float32Array([0.1, 0.1, 0.1, 0.5, 0.2, 0.2, 0.2, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const out = finishPixels(px, 2, 2);
    expect([...out.slice(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const grey = toSrgb8(toneMap(0.2));
    expect([...out.slice(8, 16)]).toEqual([grey, grey, grey, 128, grey, grey, grey, 255]);
    expect(toSrgb8(0)).toBe(0);
    expect(toSrgb8(1)).toBe(255);
    expect(toneMap(0)).toBe(0);
    expect(toneMap(0.5)).toBeGreaterThan(toneMap(0.2));
    expect(toneMap(100)).toBeLessThanOrEqual(1);
  });
});
