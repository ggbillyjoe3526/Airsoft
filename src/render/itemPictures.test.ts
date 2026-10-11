import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ITEM_PICTURE } from '../config/itemPictures';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { finishPixels, fitParts, frameItem, ItemPictures, pictureKey, pictureSize, type PictureSubject, type PictureTarget, showOnly, toneMap, toSrgb8, unpackPicturePixels, visibleBox, nodePictureTarget, type PictureRenderer } from './itemPictures';
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
      return Promise.resolve(new Float32Array(width * height * 4).fill(0.2));
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

/**
 * A scheduler the test runs by hand: each `frame()` runs the work queued for the next frame, then lets the picture's
 * read come back (the node renderer reads pixels asynchronously, W6).
 */
function manualFrames(): { schedule: (work: () => void) => void; frame: () => Promise<void>; pending: () => number } {
  let queued: (() => void)[] = [];
  return {
    schedule: (work) => queued.push(work),
    frame: async () => {
      const now = queued;
      queued = [];
      for (const work of now) work();
      await new Promise((done) => setTimeout(done, 0));
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
    await frames.frame();
    expect(target.draws).toHaveLength(1);
    expect(pictures.waiting).toBe(1);
    await frames.frame();
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

  it("waits for a match's warm-up compile before drawing, and draws nothing if freed meanwhile (W6a)", async () => {
    const target = fakeTarget();
    const frames = manualFrames();
    let compiled = (): void => undefined;
    let compiling: Promise<void> = new Promise((done) => (compiled = done));
    const pictures = new ItemPictures(target, frames.schedule, undefined, undefined, () => compiling);
    const a = pictures.picture(rifle);
    await frames.frame();
    expect(target.draws).toHaveLength(0); // the frame came, the compile is still under way
    compiled();
    await new Promise((done) => setTimeout(done, 0));
    expect(target.draws).toHaveLength(1);
    await expect(a).resolves.toMatch(/^picture:1:/);
    compiling = new Promise((done) => (compiled = done));
    void pictures.picture({ ...rifle, scheme: 'acid' });
    await frames.frame();
    pictures.dispose();
    compiled();
    await new Promise((done) => setTimeout(done, 0));
    expect(target.draws).toHaveLength(1);
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
    const failed = expect(first).rejects.toThrow('context lost');
    await frames.frame();
    await failed;
    fail = false;
    const again = pictures.picture(rifle);
    expect(again).not.toBe(first);
    await frames.frame();
    await expect(again).resolves.toMatch(/^picture:/);
    // The failed draw's model left the scene: the retry draws what a clean first draw does.
    const clean = fakeTarget();
    const cleanFrames = manualFrames();
    const fresh = new ItemPictures(clean, cleanFrames.schedule);
    const once = fresh.picture(rifle);
    await cleanFrames.frame();
    await once;
    expect(target.draws.at(-1)!.meshes).toBe(clean.draws[0]!.meshes);
    fresh.dispose();
  });

  it('moves the muzzle device out to a fitted long barrel\'s end, as the viewmodel does', () => {
    const box = (o: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(o);
    for (const muzzle of ['none', 'silencer'] as const) {
      const models = buildReplicaModels([AEG], 0, false, HIGH, null, 'bare');
      const model = models.models.get(AEG.id)!;
      model.group.updateMatrixWorld(true);
      fitParts(model, { barrel: 'long', muzzle });
      model.group.updateMatrixWorld(true);
      const barrelFront = box(model.group.getObjectByName('barrel:long')!).min.z;
      const device = box(model.group.getObjectByName(`muzzle:${muzzle}`)!);
      // The device starts at the long barrel's front and runs on past it (forward is -z).
      expect(device.max.z, muzzle).toBeGreaterThanOrEqual(barrelFront - 0.002);
      expect(device.max.z, muzzle).toBeLessThanOrEqual(barrelFront + 0.02);
      expect(device.min.z, muzzle).toBeLessThan(barrelFront);
      models.dispose();
    }
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
    const model = models.models.get(AEG.id)!;
    const { group } = model;
    const shown = (name: string): boolean => group.getObjectByName(name)!.visible;
    fitParts(model, {});
    expect([shown('magazine:standard'), shown('muzzle:none'), shown('sightsUp'), shown('optic:redDot'), shown('sightsDown')]).toEqual([true, true, true, false, false]);
    fitParts(model, { optic: 'redDot', magazine: 'hiCap', muzzle: 'silencer' });
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

describe('the node renderer’s picture target (W6)', () => {
  /** A renderer that records where it drew and hands back `read` for each picture. */
  function fakeRenderer(read: () => Promise<ArrayBufferView>, webgl = false): PictureRenderer & { into: (THREE.RenderTarget | null)[] } {
    const into: (THREE.RenderTarget | null)[] = [];
    return {
      into,
      backend: webgl ? { isWebGLBackend: true } : {},
      getRenderTarget: () => null,
      getClearColor: (c: THREE.Color) => c,
      getClearAlpha: () => 1,
      setRenderTarget: (t: THREE.RenderTarget | null) => void into.push(t),
      setClearColor: () => undefined,
      clear: () => undefined,
      render: () => undefined,
      readRenderTargetPixelsAsync: () => read(),
    };
  }

  it('draws into a multisampled half-float target, puts the canvas back, and reads the pixels back', async () => {
    vi.stubGlobal('document', { createElement: () => ({}) });
    const halves = new Uint16Array(4 * 2 * 4).fill(THREE.DataUtils.toHalfFloat(0.5));
    const gl = fakeRenderer(() => Promise.resolve(halves), true);
    const target = nodePictureTarget(gl);
    const pixels = await target.draw(new THREE.Scene(), new THREE.PerspectiveCamera(), 4, 2);
    expect(pixels).toHaveLength(4 * 2 * 4);
    expect(pixels[0]).toBeCloseTo(0.5, 3);
    const drawn = gl.into[0]!;
    expect(drawn.texture.type).toBe(THREE.HalfFloatType);
    expect(drawn.samples).toBe(ITEM_PICTURE.samples);
    expect(gl.into.at(-1)).toBeNull();
    target.dispose();
    vi.unstubAllGlobals();
  });

  it('fails the picture when the read fails (a lost device), so it is asked for again, with the canvas put back (BP2)', async () => {
    vi.stubGlobal('document', { createElement: () => ({}) });
    const gl = fakeRenderer(() => Promise.reject(new Error('device lost')));
    const target = nodePictureTarget(gl);
    await expect(target.draw(new THREE.Scene(), new THREE.PerspectiveCamera(), 4, 2)).rejects.toThrow('device lost');
    expect(gl.into.at(-1)).toBeNull();
    target.dispose();
    vi.unstubAllGlobals();
  });

  it('unpacks WebGPU’s padded, top-first rows and WebGL2’s tight, bottom-first ones to the same bottom-first floats', () => {
    // 3 × 2 half-float RGBA: 24 bytes a row, padded to 256 on WebGPU (128 values a row).
    const width = 3;
    const height = 2;
    const value = (row: number, x: number) => THREE.DataUtils.toHalfFloat(row + x / 100);
    const tight = new Uint16Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width * 4; x++) tight[y * width * 4 + x] = value(y, x);
    const padded = new Uint16Array(128 * (height - 1) + width * 4);
    // WebGPU: the bottom row (row 0) comes last.
    for (let y = 0; y < height; y++) for (let x = 0; x < width * 4; x++) padded[(height - 1 - y) * 128 + x] = value(y, x);
    const gl2 = unpackPicturePixels(tight, width, height, false);
    const gpu = unpackPicturePixels(padded, width, height, true);
    expect(Array.from(gpu)).toEqual(Array.from(gl2));
    expect(gl2[width * 4]).toBeCloseTo(1, 2);
    // Floats as they are.
    expect(Array.from(unpackPicturePixels(new Float32Array([1, 2, 3, 4]), 1, 1, true))).toEqual([1, 2, 3, 4]);
  });
});

describe('item pictures after dispose (G2)', () => {
  /** True when the promise has neither resolved nor rejected after the queued microtasks have run. */
  async function stillPending(p: Promise<string>): Promise<boolean> {
    const none = Symbol('pending');
    const settled = await Promise.race([p.then(() => 'resolved', () => 'rejected'), new Promise((r) => setTimeout(() => r(none), 0))]);
    return settled === none;
  }

  it('stops pending work: pictures queued before dispose are never drawn, nor is a frame kept waiting for them', async () => {
    const target = fakeTarget();
    const frames = manualFrames();
    const pictures = new ItemPictures(target, frames.schedule);
    const first = pictures.picture(rifle);
    const second = pictures.picture({ ...rifle, scheme: 'acid' });
    await frames.frame(); // one drawn, the next is asked for
    expect(target.draws).toHaveLength(1);
    expect(frames.pending()).toBe(1);
    pictures.dispose();
    expect(pictures.waiting).toBe(0);
    await frames.frame(); // the frame that was already asked for finds nothing to do
    expect(target.draws).toHaveLength(1);
    expect(frames.pending()).toBe(0);
    await expect(first).resolves.toMatch(/^picture:1:/);
    expect(await stillPending(second)).toBe(true);
    expect(target.disposed).toBe(true);
  });

  it('never draws a picture asked for after dispose, and asks for no frame for it', async () => {
    const target = fakeTarget();
    const frames = manualFrames();
    const pictures = new ItemPictures(target, frames.schedule);
    pictures.dispose();
    const late = pictures.picture(rifle);
    expect(frames.pending()).toBe(0);
    await frames.frame();
    await frames.frame();
    expect(target.draws).toHaveLength(0);
    expect(await stillPending(late)).toBe(true);
  });
});

describe('forgetting pictures (RM4)', () => {
  it('draws a subject again after forget, and counts the change in generation', async () => {
    const target = fakeTarget();
    const frames = manualFrames();
    const pictures = new ItemPictures(target, frames.schedule);
    const a = pictures.picture(rifle);
    frames.frame();
    await a;
    expect(pictures.picture(rifle)).toBe(a);
    expect(target.draws).toHaveLength(1);
    const before = pictures.generation;
    pictures.forget();
    expect(pictures.generation).toBe(before + 1);
    const b = pictures.picture(rifle);
    expect(b).not.toBe(a);
    frames.frame();
    await b;
    expect(target.draws).toHaveLength(2);
  });
});
