import type { SchemeId } from '../../config/schemes';
import type { KitSlot } from '../../pool/kit';
import { type Asset, REPLICA_KEYS, replicaOf } from '../../pool/pool';
import { partHost, pictureKey, type PictureFit, type PictureShape, type PictureSubject } from '../../render/itemPictures';
import { el } from './menuParts';

/**
 * Pictures on the menus (graphics overhaul G3): replicas, parts and colour schemes, drawn by the game's ItemPictures
 * (render/itemPictures.ts) and shown as they arrive. A slot shows a placeholder (the item's line drawing) until its
 * picture is ready, and never waits for one: a screen opens at once and its pictures fill in over the next frames.
 */

/** What draws the pictures: the game's ItemPictures, or nothing (the unit tests; the placeholders stay). */
export interface PictureSource {
  picture(subject: PictureSubject): Promise<string>;
}

/** The parts a kit slot has fitted, as a picture fits them. */
export function pictureFit(kit: KitSlot): PictureFit {
  const p = kit.parts;
  const fit: { -readonly [K in keyof PictureFit]: string } = { grip: p.grip, magazine: p.magazine };
  if (kit.optic) fit.optic = kit.optic;
  if (p.laser) fit.laser = p.laser;
  if (p.barrel) fit.barrel = p.barrel;
  if (p.muzzle) fit.muzzle = p.muzzle;
  if (p.light) fit.light = p.light;
  return fit;
}

/** A replica asset's picture: in `scheme`, with `kit`'s parts fitted when given. */
export function replicaSubject(asset: Asset, scheme: SchemeId, realistic: boolean, kit?: KitSlot, shape?: PictureShape): PictureSubject {
  const subject: PictureSubject = { replica: replicaOf(asset), scheme, realistic };
  if (kit) subject.fit = pictureFit(kit);
  if (shape) subject.shape = shape;
  return subject;
}

/**
 * A part asset's own picture, drawn off a replica whose model has it (render/itemPictures.ts partHost); null for an item
 * with no model of its own (a power source, a grenade), which keeps its line drawing.
 */
export function partSubject(asset: Asset, realistic: boolean): PictureSubject | null {
  if (asset.category === 'replica' || asset.category === 'power' || asset.category === 'grenade') return null;
  const part = `${asset.category}:${asset.key}`;
  const host = partHost(part);
  if (!host) return null;
  const replica = REPLICA_KEYS[host]!;
  return { replica, scheme: replica.look.model === 'pistol' ? 'onyx' : 'cobalt', realistic, part };
}

/**
 * A picture's place: the placeholder drawing until the picture comes, then the picture. Asked again for the same
 * subject it does nothing, so a screen that redraws one tile leaves the others' pictures alone.
 */
export class PictureSlot {
  readonly root: HTMLSpanElement;
  private readonly img: HTMLImageElement;
  private readonly placeholder: HTMLSpanElement;
  private key = '';

  constructor(className = '') {
    this.root = el('span', `pic-slot${className ? ` ${className}` : ''}`);
    // Decoration: the tile's words name the item, and the empty slot's dash must not join a tab's or button's name.
    this.root.setAttribute('aria-hidden', 'true');
    this.placeholder = el('span', 'pic-placeholder');
    this.img = el('img');
    this.img.alt = '';
    this.img.decoding = 'async';
    this.img.hidden = true;
    this.root.append(this.placeholder, this.img);
  }

  /** Shows `subject`'s picture once it is drawn (the drawing `icon` till then, and for good with no subject or source). */
  show(source: PictureSource | null, subject: PictureSubject | null, icon: string): void {
    const key = subject ? pictureKey(subject) : `icon:${icon}`;
    if (key === this.key) return;
    this.key = key;
    if (this.placeholder.innerHTML !== icon) this.placeholder.innerHTML = icon;
    this.img.hidden = true;
    this.root.classList.remove('has-picture');
    // Nothing to show at all (no part fitted): the stylesheet draws the slot as empty.
    this.root.classList.toggle('is-empty', !subject && icon === '');
    if (!source || !subject) return;
    source.picture(subject).then(
      (url) => {
        // A later ask (another scheme picked, say) has taken the slot over meanwhile.
        if (this.key !== key) return;
        this.img.src = url;
        this.img.hidden = false;
        this.root.classList.add('has-picture');
      },
      // A picture that can't be drawn (a lost context) leaves the drawing; the next visit asks again.
      () => undefined,
    );
  }
}
