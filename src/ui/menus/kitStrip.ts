import { GEAR_SLOTS, type LoadoutModel } from '../../pool/loadoutModel';
import { LOADOUT_TEXT } from '../../config/menus';
import { itemIcon } from './icons';
import { PictureSlot, type PictureSource, replicaSubject } from './menuPictures';
import { el } from './menuParts';

/** Where the menus' pictures come from, and whether replicas show in their realistic colours (Settings › Look). */
export interface PictureContext {
  pictures: PictureSource | null;
  realistic: () => boolean;
}

/**
 * The replicas you carry, as pictures with their names (G3): on the title's "Your kit" and the Play screen's "Your
 * match". Each shows in its scheme with its parts fitted, edged in its tier's colour.
 */
export class KitStrip {
  readonly root: HTMLDivElement;
  private readonly cards = GEAR_SLOTS.map(() => {
    const root = el('div', 'kit-card');
    const pic = new PictureSlot('kit-pic');
    const name = el('span', 'kit-name');
    root.append(pic.root, name, el('span', 'tier-bar'));
    return { root, pic, name };
  });

  constructor(
    private readonly model: LoadoutModel,
    private readonly context: PictureContext,
  ) {
    this.root = el('div', 'kit-strip');
    this.root.append(...this.cards.map((c) => c.root));
  }

  /** Shows what is carried now; a picture already showing stays as it is. */
  update(): void {
    const m = this.model;
    const equipped = m.equipped();
    this.cards.forEach((card, i) => {
      const ref = equipped[i] ?? null;
      card.root.hidden = ref === null;
      if (!ref) return;
      const asset = m.pool.byId.get(ref.asset)!;
      card.name.textContent = asset.name;
      card.root.dataset.tier = ref.tier;
      card.root.title = `${LOADOUT_TEXT.slots[GEAR_SLOTS[i]!]}: ${asset.name}`;
      card.pic.show(this.context.pictures, replicaSubject(asset, m.scheme(asset.id), this.context.realistic(), m.slotKit(ref)), itemIcon(asset));
    });
  }
}
