import { LOADOUT_LATER, LOADOUT_SLOTS, POWER_LABELS } from '../../config/menus';
import { OPTIC_CHOICES, type OpticChoice } from '../../config/optics';
import { type FireMode, HOP_UP, type ReplicaConfig } from '../../config/replicas';
import { hopUpField, hopUpLabel, hopUpReadout } from '../loadoutChoice';
import { OptionPicker } from '../optionPicker';
import { backButton, el, laterRow, laterTag, menuPage, menuRow, rangeControl } from './menuParts';

const FIRE_MODE_WORDS: Readonly<Record<FireMode, string>> = { semi: 'semi', burst: 'burst', auto: 'auto' };

/** The line under a replica's name: power, fire modes and magazine, e.g. "Electric · semi, burst, auto · 60-round magazine". */
export function replicaSummary(r: ReplicaConfig): string {
  return `${POWER_LABELS[r.power].tag} · ${r.fireModes.map((m) => FIRE_MODE_WORDS[m]).join(', ')} · ${r.magSize}-round magazine`;
}

export interface LoadoutOptions {
  loadout: readonly ReplicaConfig[];
  optic: { initial: OpticChoice; onChange: (o: OpticChoice) => void };
  hopUp: { initial: readonly number[]; onChange: (slot: number, dial: number) => void };
  onBack: () => void;
}

/**
 * The Loadout screen: the replica in each slot (primary, secondary) on the left, and what can be changed on the
 * picked one on the right. Built today: the optic (on a replica with a rail) and the hop-up dial; BB weight, grip,
 * magazine and power or gas are listed as coming later. Choices save as they are made and are fitted at once,
 * since the screen is reached only between matches.
 */
export class LoadoutScreen {
  readonly root: HTMLDivElement;
  private opticPicker: OptionPicker<OpticChoice> | null = null;
  private readonly slotButtons: HTMLButtonElement[] = [];
  private readonly panels: HTMLDivElement[] = [];

  constructor(opts: LoadoutOptions) {
    const page = menuPage('menu-loadout', 'Loadout');
    this.root = page.root;
    const slots = el('div', 'loadout-slots');
    const panelBox = el('div', 'menu-panel loadout-panel');
    opts.loadout.forEach((replica, slot) => {
      slots.append(el('p', 'menu-kicker', LOADOUT_SLOTS[slot]?.title ?? `Slot ${slot + 1}`));
      const button = el('button', 'loadout-slot');
      button.type = 'button';
      button.append(el('span', 'loadout-slot-name', replica.name), el('span', 'loadout-slot-tag', POWER_LABELS[replica.power].tag));
      button.addEventListener('click', () => this.pick(slot));
      if (slot === 0) button.dataset.autofocus = '';
      const more = el('div', 'loadout-slot-more', 'More replicas later');
      more.append(laterTag());
      slots.append(button, more);
      this.slotButtons.push(button);

      const panel = el('div', 'loadout-replica');
      const head = el('div', 'loadout-replica-head');
      head.append(el('h2', 'menu-panel-title', `Customise: ${replica.name}`), el('span', 'loadout-replica-summary', replicaSummary(replica)));
      panel.append(head);
      if (replica.opticMount) {
        const picker = new OptionPicker('Optic', OPTIC_CHOICES, opts.optic.initial, 'optic', opts.optic.onChange);
        this.opticPicker = picker;
        panel.append(menuRow('Optic', '', picker.root));
      } else {
        panel.append(laterRow('Optic', '', LOADOUT_LATER.noOptic));
      }
      panel.append(this.hopUpRow(replica, opts.hopUp.initial[slot] ?? replica.hopUpDial, (dial) => opts.hopUp.onChange(slot, dial)));
      panel.append(
        laterRow('BB weight', '', `${replica.bbWeight.toFixed(2)} g`),
        laterRow('Grip', '', LOADOUT_LATER.grip),
        laterRow('Magazine', '', `${replica.magSize} BBs`),
        laterRow(POWER_LABELS[replica.power].row, '', POWER_LABELS[replica.power].value),
      );
      panelBox.append(panel);
      this.panels.push(panel);
    });
    const columns = el('div', 'loadout-columns');
    columns.append(slots, panelBox);
    page.body.append(columns);
    page.footer.append(backButton(opts.onBack), el('p', 'menu-footer-note', 'Changes save as you make them.'));
    this.pick(0);
  }

  /** A note with the optic, e.g. that a change waits for the next round (empty to clear). */
  setOpticNote(text: string): void {
    this.opticPicker?.setNote(text);
  }

  /** Shows the replica in `slot` for customising. */
  pick(slot: number): void {
    this.slotButtons.forEach((b, i) => {
      b.classList.toggle('selected', i === slot);
      b.setAttribute('aria-pressed', String(i === slot));
    });
    this.panels.forEach((p, i) => (p.hidden = i !== slot));
  }

  /** The hop-up dial, with a line under it saying how far the BB stays on target. */
  private hopUpRow(replica: ReplicaConfig, initial: number, onChange: (dial: number) => void): HTMLDivElement {
    const readout = el('p', 'menu-readout', hopUpReadout(replica, initial));
    const control = rangeControl(
      `${replica.name} hop-up`,
      { min: HOP_UP.minDial, max: HOP_UP.maxDial, step: HOP_UP.dialStep },
      initial,
      hopUpLabel,
      hopUpField(replica),
      (dial) => {
        readout.textContent = hopUpReadout(replica, dial);
        onChange(dial);
      },
    );
    control.classList.add('loadout-hopup');
    control.append(readout);
    return menuRow('Hop-up', '', control);
  }
}
