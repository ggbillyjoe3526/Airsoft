import { type Action, BINDINGS, PREVENT_DEFAULT_KEYS } from '../config/controls';

/**
 * Tracks held keys and per-frame press edges, mapped through the binding table. Browser defaults
 * for game keys (Space scroll, F3 find, arrows) are only suppressed while `capturing`, so menus and
 * sliders keep working when the game is paused.
 */
export class Keyboard {
  capturing = false;
  private readonly held = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();

  constructor(private readonly target: Window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  isDown(action: Action): boolean {
    for (const code of BINDINGS[action]) if (this.held.has(code)) return true;
    return false;
  }

  /** True if the action was pressed since the last `endFrame()`. */
  wasPressed(action: Action): boolean {
    for (const code of BINDINGS[action]) if (this.pressedThisFrame.has(code)) return true;
    return false;
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
    if (this.capturing && PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) this.pressedThisFrame.add(e.code);
    this.held.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.releaseAll();
  };
}
