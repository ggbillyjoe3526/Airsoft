import { type Action, PREVENT_DEFAULT_KEYS } from '../config/controls';
import type { KeyBindings } from './keyBindings';

/**
 * Tracks held keys and per-frame press edges, mapped through the binding table. Mouse buttons come in as codes too
 * (`press` / `release`, fed by PointerLock while playing), so any action can sit on a key or a mouse button. Browser defaults
 * for game keys (Space scroll, F3 find, arrows) are only suppressed while `capturing`, so menus and
 * sliders keep working when the game is paused.
 */
export class Keyboard {
  capturing = false;
  private readonly held = new Set<string>();
  /** Presses since the last `endFrame()`, by code: two quick taps in one slow frame are two presses (KI1). */
  private readonly pressedThisFrame = new Map<string, number>();

  constructor(
    private readonly target: Window,
    private readonly bindings: KeyBindings,
  ) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  isDown(action: Action): boolean {
    for (const code of this.bindings.codes(action)) if (this.held.has(code)) return true;
    return false;
  }

  /** The readable name of the action's main key, for hints on screen ('' if unbound). */
  keyName(action: Action): string {
    return this.bindings.label(action);
  }

  /** True if the action was pressed since the last `endFrame()`. */
  wasPressed(action: Action): boolean {
    for (const code of this.bindings.codes(action)) if (this.pressedThisFrame.has(code)) return true;
    return false;
  }

  /** How many times the action was pressed since the last `endFrame()` (0 if not): for keys where every tap counts. */
  pressCount(action: Action): number {
    let n = 0;
    for (const code of this.bindings.codes(action)) n += this.pressedThisFrame.get(code) ?? 0;
    return n;
  }

  /** A button went down: a mouse button while playing (input/pointerLock.ts), by its binding code. */
  press(code: string): void {
    // Mouse buttons never auto-repeat, so every press is a new one.
    this.countPress(code);
    this.held.add(code);
  }

  release(code: string): void {
    this.held.delete(code);
  }

  /** Whether `code` (a key, a mouse button or a wheel direction) is bound to an action. */
  bound(code: string): boolean {
    return this.bindings.actionOf(code) !== undefined;
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
  }

  releaseAll(): void {
    this.held.clear();
    this.pressedThisFrame.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.suppress(e.code)) e.preventDefault();
    if (!e.repeat) this.countPress(e.code);
    this.held.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    // Also on key up: releasing Alt is what opens the menu bar in some browsers.
    if (this.suppress(e.code)) e.preventDefault();
    this.held.delete(e.code);
  };

  private countPress(code: string): void {
    this.pressedThisFrame.set(code, (this.pressedThisFrame.get(code) ?? 0) + 1);
  }

  /** While playing, game keys don't do their browser thing (scrolling, find bar, menu bar...). */
  private suppress(code: string): boolean {
    return this.capturing && (PREVENT_DEFAULT_KEYS.has(code) || this.bindings.actionOf(code) !== undefined);
  }

  private readonly onBlur = (): void => {
    this.releaseAll();
  };
}
