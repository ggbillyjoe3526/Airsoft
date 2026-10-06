import * as THREE from 'three';
import { ITEM_PICTURE } from '../config/itemPictures';
import type { ReplicaConfig } from '../config/replicas';
import type { SchemeId } from '../config/schemes';
import { buildReplicaModels, fitMuzzle, type ReplicaDetail, type ReplicaModel } from './replicaModels';

/**
 * Item pictures (graphics overhaul G2): small images of a replica, a part or a colour scheme for the menus, drawn by the
 * game's own renderer from the models the hands hold, so a picture always matches what you carry and nothing extra is
 * downloaded. Each is drawn off screen into a render target, read back and kept as a PNG data URL for the visit;
 * requests queue and at most one is drawn per frame, so opening a screen full of pictures never stalls it.
 */

/** The parts fitted for a picture, by kind ('optic', 'grip', 'magazine', 'laser', 'barrel', 'muzzle', 'light'): the part's id. */
export type PictureFit = Readonly<Partial<Record<PartKind, string>>>;
type PartKind = 'optic' | 'grip' | 'magazine' | 'laser' | 'barrel' | 'muzzle' | 'light';
const PART_KINDS: readonly string[] = ['optic', 'grip', 'magazine', 'laser', 'barrel', 'muzzle', 'light'];

/**
 * What a picture shows: a replica in a scheme with `fit` fitted, or (`part`, as 'kind:id') one of its parts on its own;
 * `shape` its picture's (by default wide for a replica, square for a part).
 */
export interface PictureSubject {
  replica: ReplicaConfig;
  scheme: SchemeId;
  realistic: boolean;
  fit?: PictureFit;
  part?: string;
  shape?: PictureShape;
}
export type PictureShape = keyof typeof ITEM_PICTURE.sizes;

/** A subject's picture size in pixels (width, height). */
export function pictureSize(s: PictureSubject): readonly [number, number] {
  return ITEM_PICTURE.sizes[s.shape ?? (s.part ? 'square' : 'wide')];
}

/** The cache key of a subject: every field that changes the picture. */
export function pictureKey(s: PictureSubject): string {
  const fit = s.fit ? PART_KINDS.filter((k) => s.fit![k as PartKind]).map((k) => `${k}:${s.fit![k as PartKind]}`).join(',') : '';
  return [s.replica.id, s.scheme, s.realistic ? 'real' : 'bold', s.part ?? '', fit, pictureSize(s).join('x')].join('|');
}

/** Draws a scene with a camera into an RGBA image `width` by `height`: linear floats, alpha premultiplied, bottom row first. */
export interface PictureTarget {
  draw(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): Float32Array;
  /** Turns finished 8-bit RGBA rows (top row first) into an image URL. */
  encode(rgba: Uint8ClampedArray, width: number, height: number): string;
  dispose(): void;
}

/** Runs `work` on the next frame (the browser's animation frame). */
export type FrameScheduler = (work: () => void) => void;
const nextFrame: FrameScheduler = (work) => {
  requestAnimationFrame(() => work());
};

/** Pictures are drawn at the replicas' high detail (the bevels, speckle and small parts): a few draws, once each. */
const PICTURE_DETAIL: ReplicaDetail = { replica: 'high', hands: 'high' };

/** The queue, the cache and the studio the pictures are drawn in. */
export class ItemPictures {
  private readonly cache = new Map<string, Promise<string>>();
  private readonly queue: { subject: PictureSubject; done: (url: string) => void; failed: (error: unknown) => void }[] = [];
  private scheduled = false;
  private disposed = false;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(ITEM_PICTURE.fov, 1, 0.01, 10);

  constructor(
    private readonly target: PictureTarget,
    private readonly schedule: FrameScheduler = nextFrame,
  ) {
    const L = ITEM_PICTURE.light;
    const key = new THREE.DirectionalLight(L.key.colour, L.key.intensity);
    key.position.set(...L.key.at);
    const rim = new THREE.DirectionalLight(L.rim.colour, L.rim.intensity);
    rim.position.set(...L.rim.at);
    this.scene.add(new THREE.HemisphereLight(L.sky, L.ground, L.fill), key, rim);
  }

  /** The picture of `subject` as an image URL: drawn on a coming frame the first time, the same promise after. */
  picture(subject: PictureSubject): Promise<string> {
    const key = pictureKey(subject);
    let found = this.cache.get(key);
    if (!found) {
      found = new Promise<string>((done, failed) => this.queue.push({ subject, done, failed }));
      this.cache.set(key, found);
      this.wake();
    }
    return found;
  }

  /** Pictures waiting to be drawn. */
  get waiting(): number {
    return this.queue.length;
  }

  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.target.dispose();
  }

  private wake(): void {
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    this.schedule(() => this.drawNext());
  }

  /** Draws the oldest waiting picture, then asks for another frame if more wait. */
  private drawNext(): void {
    this.scheduled = false;
    const next = this.queue.shift();
    if (!next || this.disposed) return;
    try {
      next.done(this.draw(next.subject));
    } catch (error) {
      // A picture that can't be drawn (a lost context) is dropped from the cache, so a later visit asks again.
      this.cache.delete(pictureKey(next.subject));
      next.failed(error);
    }
    if (this.queue.length > 0) this.wake();
  }

  private draw(subject: PictureSubject): string {
    const [width, height] = pictureSize(subject);
    const models = buildReplicaModels([subject.replica], 0, false, PICTURE_DETAIL, { schemes: [subject.scheme], realistic: subject.realistic }, 'bare');
    const model = models.models.get(subject.replica.id)!;
    try {
      if (subject.part) showOnly(model.group, subject.part);
      else fitParts(model, subject.fit ?? {});
      this.scene.add(model.group);
      frameItem(this.camera, visibleBox(model.group), width / height);
      const pixels = this.target.draw(this.scene, this.camera, width, height);
      return this.target.encode(finishPixels(pixels, width, height), width, height);
    } finally {
      // Taken out even when the draw fails, so a later picture never draws this one's model too.
      this.scene.remove(model.group);
      models.dispose();
    }
  }
}

/**
 * Shows the parts in `fit` (and the standard magazine, the bare muzzle's own device and the iron sights up when no optic
 * is fitted), and moves the muzzle device out to the fitted barrel's end, as the viewmodel does.
 */
export function fitParts(model: ReplicaModel, fit: PictureFit): void {
  model.group.traverse((o) => {
    const [kind, id] = o.name.split(':');
    if (!id || !kind || !PART_KINDS.includes(kind)) return;
    const wanted = fit[kind as PartKind] ?? (kind === 'magazine' ? 'standard' : kind === 'muzzle' ? 'none' : undefined);
    o.visible = id === wanted;
  });
  const optic = fit.optic != null;
  const up = model.group.getObjectByName('sightsUp');
  const down = model.group.getObjectByName('sightsDown');
  if (up) up.visible = !optic;
  if (down) down.visible = optic;
  fitMuzzle(model.mount, fit.barrel ?? null, fit.muzzle ?? null);
}

/** Hides everything but the part named `name` ('kind:id'): an attachment's own picture. */
export function showOnly(model: THREE.Object3D, name: string): void {
  const part = model.getObjectByName(name);
  if (!part) throw new Error(`No part ${name} on ${model.name || 'this replica'}`);
  model.traverse((o) => {
    if (o !== model) o.visible = false;
  });
  // The part and everything on the way up to it show; so does everything inside it.
  for (let o: THREE.Object3D | null = part; o && o !== model; o = o.parent) o.visible = true;
  part.traverse((o) => (o.visible = true));
}

/** The box round the meshes that show (Box3.setFromObject counts hidden ones too). */
export function visibleBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const visit = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    if (o instanceof THREE.Mesh) {
      o.geometry.computeBoundingBox();
      box.union(part.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld));
    }
    for (const child of o.children) visit(child);
  };
  visit(root);
  return box;
}

/**
 * Points the camera (`aspect` wide) at `box` from the item's right side, turned towards its front (the muzzle, -Z) and a
 * little above, just far enough back that every corner of the box fits with ITEM_PICTURE.margin to spare.
 */
export function frameItem(camera: THREE.PerspectiveCamera, box: THREE.Box3, aspect: number): void {
  const P = ITEM_PICTURE;
  const centre = box.getCenter(new THREE.Vector3());
  const back = new THREE.Vector3(Math.cos(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.sin(P.yaw) * Math.cos(P.pitch));
  // The camera's own axes: right and up across the picture, `back` out of it towards the camera.
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const tanY = Math.tan(THREE.MathUtils.degToRad(P.fov) / 2);
  const tanX = tanY * aspect;
  let distance = 0;
  let depth = 0;
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
    const toward = corner.dot(back);
    depth = Math.max(depth, Math.abs(toward));
    // How far back the camera must stand for this corner to sit inside the frame (with the margin), from the centre.
    distance = Math.max(distance, (Math.abs(corner.dot(right)) * P.margin) / tanX + toward, (Math.abs(corner.dot(up)) * P.margin) / tanY + toward);
  }
  camera.aspect = aspect;
  camera.position.copy(centre).addScaledVector(back, distance);
  camera.near = Math.max(0.001, distance - depth * 2);
  camera.far = distance + depth * 2;
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** A filmic curve (Narkowicz's ACES fit): bright parts roll off instead of clipping, as in the game's own view. */
export function toneMap(x: number): number {
  const v = x * ITEM_PICTURE.exposure;
  return Math.min(1, Math.max(0, (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)));
}

/** A linear colour value to the screen's sRGB, 0 to 255. */
export function toSrgb8(linear: number): number {
  const v = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

/** Linear, premultiplied, bottom-up floats to straight sRGB bytes, top row first, the background clear. */
export function finishPixels(pixels: Float32Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * width * 4;
    const to = y * width * 4;
    for (let x = 0; x < width * 4; x += 4) {
      const a = Math.min(1, Math.max(0, pixels[from + x + 3]!));
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) out[to + x + c] = toSrgb8(toneMap(pixels[from + x + c]! / a));
      out[to + x + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/**
 * The real target: the game's WebGL renderer drawing into a multisampled float render target, read back and encoded by
 * a 2D canvas. The renderer's own state (its target, clear colour and alpha) is put back after each picture.
 */
export function webglPictureTarget(gl: THREE.WebGLRenderer): PictureTarget {
  let rt: THREE.WebGLRenderTarget | null = null;
  const clear = new THREE.Color();
  const canvas = document.createElement('canvas');
  return {
    draw(scene, camera, width, height) {
      if (!rt || rt.width !== width || rt.height !== height) {
        rt?.dispose();
        rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, samples: ITEM_PICTURE.samples });
      }
      const before = gl.getRenderTarget();
      gl.getClearColor(clear);
      const alpha = gl.getClearAlpha();
      try {
        gl.setRenderTarget(rt);
        gl.setClearColor(0x000000, 0);
        gl.clear();
        gl.render(scene, camera);
        const pixels = new Float32Array(width * height * 4);
        gl.readRenderTargetPixels(rt, 0, 0, width, height, pixels);
        return pixels;
      } finally {
        gl.setRenderTarget(before);
        gl.setClearColor(clear, alpha);
      }
    },
    encode(rgba, width, height) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
      return canvas.toDataURL('image/png');
    },
    dispose() {
      rt?.dispose();
      rt = null;
    },
  };
}
