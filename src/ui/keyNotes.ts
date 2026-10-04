/**
 * The lines under Settings → Key Bindings (audit UI-05, UI-17, UI-01): what a change did to another action, why a key
 * was refused, and what the waiting box takes. Pure text, so the wording is tested without a page.
 */

/** Under the list while a box waits for a key. */
export const LISTENING_NOTE = 'Press the new key, click this box with a mouse button, or turn the wheel. Backspace or Delete clears it. Esc cancels.';

/** Shown when a quick second click on a waiting key box cancelled instead of binding Left mouse. */
export const DOUBLE_CLICK_NOTE = 'Two quick clicks cancel. To bind Left mouse, click the box, wait a moment, then click it again.';

export const CTRL_WARNING = "Heads up: some Ctrl combinations (like Ctrl+W, close tab) can't be blocked by the browser.";

/** Where the browser can't tell the keyboard layout (Firefox): names follow a US keyboard (audit UI-01). */
export const US_LAYOUT_NOTE = 'Key names follow a US keyboard in this browser: on another layout, the game uses the key in the same place.';

/** "Reset All" after its first click: a second click within a few seconds resets (audit UI-17). */
export const RESET_CONFIRM_LABEL = 'Click Again To Reset';

/**
 * A key taken from another action (audit UI-05): "F5 was Reload: Reload is now Space", or "… Reload has no key now"
 * when it had nothing left. `key`: the key's name; `other`: that action's label; `otherKeys`: its keys now ('' none).
 */
export function swapNote(key: string, other: string, otherKeys: string): string {
  return otherKeys ? `${key} was ${other}: ${other} is now ${otherKeys}.` : `${key} was ${other}: ${other} has no key now.`;
}

/** A take refused because it would leave an essential action with no key. */
export function strandNote(key: string, other: string): string {
  return `${key} is ${other}'s only key, and ${other} needs one. Give ${other} another key first.`;
}

/** Backspace / Delete on the last key of an essential action. */
export function essentialNote(action: string): string {
  return `${action} needs a key.`;
}

/** Why a key can't be bound: it shows debug info, it is the browser's own (F5, F11 …), or no reason worth giving. */
export type RefusedWhy = 'debug' | 'browser' | '';

/** A key that can't be bound (Esc, the browser's own keys, a debug key, a key the browser can't name). */
export function refusedNote(key: string, why: RefusedWhy): string {
  const reason = why === 'debug' ? ' (it shows debug info)' : why === 'browser' ? ' (the browser uses it)' : '';
  return `${key} can't be bound${reason}.`;
}
