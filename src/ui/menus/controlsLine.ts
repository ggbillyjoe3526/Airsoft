import type { Action } from '../../config/controls';
import { type KeyBindings, keyLabel } from '../../input/keyBindings';
import { el } from './menuParts';

/** The controls a new player needs before pressing Play, in order: the rebindable actions or a fixed key, and what it does. */
const CONTROLS: readonly { keys: readonly Action[] | string; does: string }[] = [
  { keys: ['forward', 'left', 'back', 'right'], does: 'move' },
  { keys: 'Mouse', does: 'aim' },
  { keys: 'Left click', does: 'fire' },
  { keys: 'Right click', does: 'aim down sights (with an optic)' },
  { keys: ['reload'], does: 'reload' },
  { keys: ['fireMode'], does: 'fire mode' },
  { keys: ['walk'], does: 'walk' },
  { keys: ['sprint'], does: 'sprint' },
  { keys: ['crouch'], does: 'crouch' },
  { keys: ['leanLeft', 'leanRight'], does: 'lean' },
  { keys: ['jump'], does: 'jump' },
  { keys: ['slot1', 'slot2'], does: 'switch' },
  { keys: 'Esc', does: 'pause' },
];

/**
 * A short line of the main controls with the player's current keys (New game and the pause menu), so nobody presses
 * Play without knowing them. Every key can be changed under Settings, Key bindings.
 */
export class ControlsLine {
  readonly root: HTMLParagraphElement;

  constructor(private readonly bindings: KeyBindings) {
    this.root = el('p', 'menu-controls');
    bindings.onChange(() => this.render());
    this.render();
  }

  private render(): void {
    const parts: Node[] = [];
    for (const { keys, does } of CONTROLS) {
      if (parts.length > 0) parts.push(document.createTextNode(' · '));
      if (typeof keys === 'string') parts.push(el('kbd', '', keys));
      else for (const action of keys) parts.push(el('kbd', '', keyLabel(this.bindings.primary(action))));
      parts.push(document.createTextNode(` ${does}`));
    }
    parts.push(document.createTextNode('. Change any key in Settings.'));
    this.root.replaceChildren(...parts);
  }
}
