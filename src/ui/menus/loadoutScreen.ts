import { GRIP_CHOICES, handlingOf, type ReplicaParts } from '../../config/attachments';
import { LOADOUT_FIXED, LOADOUT_LATER, POWER_LABELS } from '../../config/menus';
import { OPTIC_CHOICES, type OpticChoice } from '../../config/optics';
import { BB_WEIGHT_CHOICES, type FireMode, HOP_UP, type LoadoutSlot, type ReplicaConfig } from '../../config/replicas';
import {
  bbWeightField,
  bbWeightReadout,
  gripField,
  gripReadout,
  hopUpField,
  hopUpLabel,
  hopUpReadout,
  magazineChoices,
  magazineField,
  magazineReadout,
  slotField,
} from '../loadoutChoice';
import { OptionPicker } from '../optionPicker';
import { backButton, el, laterRow, laterTag, menuPage, menuRow, rangeControl } from './menuParts';

const FIRE_MODE_WORDS: Readonly<Record<FireMode, string>> = { semi: 'semi', burst: 'burst', auto: 'auto' };

/**
 * The line under a replica's name: power, fire modes and the fitted magazine, e.g.
 * "Electric · semi, burst, auto · 60 BBs a magazine".
 */
export function replicaSummary(r: ReplicaConfig, parts: ReplicaParts): string {
  return `${POWER_LABELS[r.power].tag} · ${r.fireModes.map((m) => FIRE_MODE_WORDS[m]).join(', ')} · ${handlingOf(r, parts).magSize} BBs a magazine`;
}

export interface LoadoutOptions {
  slots: readonly LoadoutSlot[];
  /** The replica picked for each slot (by slot index). */
  picked: { initial: readonly ReplicaConfig[]; onChange: (slot: number, replica: ReplicaConfig) => void };
  optic: { initial: OpticChoice; onChange: (o: OpticChoice) => void };
  /** Each replica's hop-up dial and BB weight (grams), whichever slot it is in. */
  hopUp: { initial: (r: ReplicaConfig) => number; onChange: (r: ReplicaConfig, dial: number) => void };
  bbWeight: { initial: (r: ReplicaConfig) => number; onChange: (r: ReplicaConfig, grams: number) => void };
  /** Each replica's grip and magazine (M17b). */
  parts: { initial: (r: ReplicaConfig) => ReplicaParts; onChange: (r: ReplicaConfig, parts: ReplicaParts) => void };
  onBack: () => void;
}

/** A greyed row for something this replica can't take (no rail for it): its value, no LATER tag. */
function fixedRow(label: string, value: string): HTMLDivElement {
  const control = el('div', 'menu-row-control');
  control.append(el('span', 'menu-later-value', value));
  return menuRow(label, '', control, true);
}

/** One slot's button on the left and the replica picker on the right. */
interface SlotParts {
  button: HTMLButtonElement;
  name: HTMLSpanElement;
  tag: HTMLSpanElement;
  picker: HTMLDivElement;
}

/**
 * The Loadout screen (M15, M17a): the slots (primary, secondary) on the left with the replica in each, and on the
 * right the picked slot's replica picker, then what can be set on that replica: the optic (on a replica with a rail),
 * the BB weight and the hop-up dial set for it, the grip and the magazine (M17b), with power or gas and skins listed as
 * coming later. Choices save as they
 * are made; the next Play fits them (the screen is reached only through New game, never mid-match).
 */
export class LoadoutScreen {
  readonly root: HTMLDivElement;
  private readonly slots: SlotParts[] = [];
  /** One settings panel per replica, whichever slot it fits. */
  private readonly panels = new Map<string, HTMLDivElement>();
  private readonly picked: ReplicaConfig[];
  /** The panel's heading and summary line: the replica being customised. */
  private readonly headTitle: HTMLHeadingElement;
  private readonly headSummary: HTMLSpanElement;
  private slot = 0;
  /** Each replica's fitted parts, for the summary line. */
  private readonly partsOf: (r: ReplicaConfig) => ReplicaParts;

  constructor(opts: LoadoutOptions) {
    this.partsOf = opts.parts.initial;
    const page = menuPage('menu-loadout', 'Loadout');
    this.root = page.root;
    this.picked = [...opts.picked.initial];
    const slotList = el('div', 'loadout-slots');
    const panelBox = el('div', 'menu-panel loadout-panel');
    const head = el('div', 'loadout-replica-head');
    this.headTitle = el('h2', 'menu-panel-title');
    this.headSummary = el('span', 'loadout-replica-summary');
    head.append(this.headTitle, this.headSummary);
    panelBox.append(head);
    opts.slots.forEach((slot, i) => {
      slotList.append(el('p', 'menu-kicker', slot.title));
      const button = el('button', 'loadout-slot');
      button.type = 'button';
      const name = el('span', 'loadout-slot-name');
      const tag = el('span', 'loadout-slot-tag');
      button.append(name, tag);
      button.addEventListener('click', () => this.pick(i));
      if (i === 0) button.dataset.autofocus = '';
      const more = el('div', 'loadout-slot-more', 'More replicas later');
      more.append(laterTag());
      slotList.append(button, more);

      // The summary is in the heading above, so the picker needs no line of its own.
      const choices = slot.fits.map((r) => ({ id: r.id, label: r.name, blurb: '' }));
      const picker = menuRow(
        'Replica',
        '',
        new OptionPicker(`${slot.title} replica`, choices, this.picked[i]!.id, slotField(slot), (id) => {
          const replica = slot.fits.find((r) => r.id === id)!;
          this.picked[i] = replica;
          opts.picked.onChange(i, replica);
          this.pick(i);
        }).root,
      );
      panelBox.append(picker);
      this.slots.push({ button, name, tag, picker });
      for (const replica of slot.fits) {
        const panel = this.replicaPanel(replica, opts);
        panelBox.append(panel);
        this.panels.set(replica.id, panel);
      }
    });
    const columns = el('div', 'loadout-columns');
    columns.append(slotList, panelBox);
    page.body.append(columns);
    page.footer.append(backButton(opts.onBack), el('p', 'menu-footer-note', 'Changes save as you make them.'));
    this.pick(0);
  }

  /** Shows the slot `slot` and its replica for customising. */
  pick(slot: number): void {
    this.slot = slot;
    this.slots.forEach((s, i) => {
      const replica = this.picked[i]!;
      s.name.textContent = replica.name;
      s.tag.textContent = POWER_LABELS[replica.power].tag;
      s.button.classList.toggle('selected', i === slot);
      s.button.setAttribute('aria-pressed', String(i === slot));
      s.picker.hidden = i !== slot;
    });
    const shown = this.picked[this.slot]!;
    this.headTitle.textContent = `Customise: ${shown.name}`;
    this.showSummary();
    for (const [id, panel] of this.panels) panel.hidden = id !== shown.id;
  }

  private showSummary(): void {
    const shown = this.picked[this.slot]!;
    this.headSummary.textContent = replicaSummary(shown, this.partsOf(shown));
  }

  /** What can be set on `replica`: optic, BB weight, hop-up, grip and magazine, and the parts still to come. */
  private replicaPanel(replica: ReplicaConfig, opts: LoadoutOptions): HTMLDivElement {
    const panel = el('div', 'loadout-replica');
    if (replica.opticMount) {
      panel.append(menuRow('Optic', '', new OptionPicker('Optic', OPTIC_CHOICES, opts.optic.initial, 'optic', opts.optic.onChange).root));
    } else {
      panel.append(fixedRow('Optic', LOADOUT_FIXED.noOptic));
    }
    // The hop-up readout depends on the BB weight too, so both rows share the current values.
    let dial = opts.hopUp.initial(replica);
    let grams = opts.bbWeight.initial(replica);
    const hopReadout = el('p', 'menu-readout', hopUpReadout(replica, dial, grams));
    const hopControl = rangeControl(
      `${replica.name} hop-up`,
      { min: HOP_UP.minDial, max: HOP_UP.maxDial, step: HOP_UP.dialStep },
      dial,
      hopUpLabel,
      hopUpField(replica),
      (v) => {
        dial = v;
        hopReadout.textContent = hopUpReadout(replica, dial, grams);
        opts.hopUp.onChange(replica, v);
      },
    );
    hopControl.classList.add('loadout-hopup');
    hopControl.append(hopReadout);
    const weightReadout = el('p', 'menu-readout', bbWeightReadout(replica, grams));
    const weightPicker = new OptionPicker(`${replica.name} BB weight`, BB_WEIGHT_CHOICES, String(grams), bbWeightField(replica), (id) => {
      grams = Number(id);
      weightReadout.textContent = bbWeightReadout(replica, grams);
      hopReadout.textContent = hopUpReadout(replica, dial, grams);
      opts.bbWeight.onChange(replica, grams);
    });
    weightPicker.root.append(weightReadout);
    // The weight first: it decides where the hop-up wants to be, as when you set a replica up at a site.
    panel.append(menuRow('BB weight', '', weightPicker.root), menuRow('Hop-up', '', hopControl));

    // Grip and magazine (M17b), each with its numbers under it.
    let parts = opts.parts.initial(replica);
    if (replica.gripMount) {
      const gripLine = el('p', 'menu-readout', gripReadout(replica, parts.grip));
      const grip = new OptionPicker(`${replica.name} grip`, GRIP_CHOICES, parts.grip, gripField(replica), (id) => {
        parts = { ...parts, grip: id };
        gripLine.textContent = gripReadout(replica, id);
        opts.parts.onChange(replica, parts);
      });
      grip.root.append(gripLine);
      panel.append(menuRow('Grip', '', grip.root));
    } else {
      panel.append(fixedRow('Grip', LOADOUT_FIXED.noGrip));
    }
    const magLine = el('p', 'menu-readout', magazineReadout(replica, parts.magazine));
    const magazine = new OptionPicker(`${replica.name} magazine`, magazineChoices(replica), parts.magazine, magazineField(replica), (id) => {
      parts = { ...parts, magazine: id };
      magLine.textContent = magazineReadout(replica, id);
      opts.parts.onChange(replica, parts);
      this.showSummary();
    });
    magazine.root.append(magLine);
    panel.append(
      menuRow('Magazine', '', magazine.root),
      laterRow(POWER_LABELS[replica.power].row, '', POWER_LABELS[replica.power].value),
      laterRow('Skins', '', LOADOUT_LATER.skins),
    );
    return panel;
  }
}
