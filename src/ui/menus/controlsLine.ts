import type { Action, CrouchMode } from '../../config/controls';
import { type KeyBindings, keyLabel } from '../../input/keyBindings';
import { el } from './menuParts';

/** The controls a new player needs before pressing Play, in order: the rebindable actions or a fixed key, and what it does. */
const CONTROLS: readonly { keys: readonly Action[] | string; does: string; showsCrouchMode?: true }[] = [
  { keys: ['forward', 'left', 'back', 'right'], does: 'move' },
  { keys: 'Mouse', does: 'aim' },
  { keys: 'Left click', does: 'fire' },
  { keys: 'Right click', does: 'aim down sights (with an optic)' },
  { keys: ['reload'], does: 'reload' },
  { keys: ['fireMode'], does: 'fire mode' },
  { keys: ['walk'], does: 'walk' },
  { keys: ['sprint'], does: 'sprint' },
  { keys: ['crouch'], does: 'crouch', showsCrouchMode: true },
  { keys: ['leanLeft', 'leanRight'], does: 'lean' },
  { keys: ['jump'], does: 'jump' },
  { keys: ['slot1', 'slot2'], does: 'rifle / pistol' },
  { keys: 'Esc', does: 'pause' },
];

/**
 * A short line of the main controls with the player's current keys (New game and the pause menu), so nobody presses
 * Play without knowing them. Every key can be changed under Settings, Key bindings.
 */
export class ControlsLine {
  readonly root: HTMLParagraphElement;

  constructor(
    private readonly bindings: KeyBindings,
    private crouchMode: CrouchMode,
  ) {
    this.root = el('p', 'menu-controls');
    bindings.onChange(() => this.render());
    this.render();
  }

  /** The crouch key's behaviour changed in Settings. */
  setCrouchMode(mode: CrouchMode): void {
    this.crouchMode = mode;
    this.render();
  }

  private render(): void {
    // One unbreakable chunk per control, so a line never wraps between a key and what it does.
    const items = CONTROLS.map(({ keys, does, showsCrouchMode }) => {
      const item = el('span', 'menu-controls-item');
      if (typeof keys === 'string') item.append(el('kbd', '', keys));
      else for (const action of keys) item.append(el('kbd', '', keyLabel(this.bindings.primary(action))));
      const text = showsCrouchMode ? `${does} (${this.crouchMode})` : does;
      item.append(` ${text}`);
      return item;
    });
    this.root.replaceChildren(...items, el('span', 'menu-controls-item', 'Change any key in Settings.'));
  }
}
