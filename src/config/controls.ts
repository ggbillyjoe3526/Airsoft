/**
 * Default key bindings (players can rebind them; see input/keyBindings.ts). They use
 * KeyboardEvent.code, so they follow physical key positions on any layout. The first key of each
 * action is the one shown and rebound in the settings.
 */
export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  // Walk on Shift like CS/Valorant. Ctrl is deliberately not a default: Ctrl+W would close the tab
  // and can't be blocked outside fullscreen.
  walk: ['ShiftLeft', 'ShiftRight'],
  sprint: ['AltLeft'],
  crouch: ['KeyC'],
  jump: ['Space'],
  reload: ['KeyR'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  swap: ['KeyQ'],
  debugOverlay: ['Backquote', 'F3'],
  /** Debug: draw the recent flight paths of BBs. */
  debugBbPaths: ['BracketRight'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof DEFAULT_BINDINGS;

/** Actions players can rebind, in the order the settings list them, with their labels. */
export const REBINDABLE: readonly { action: Action; label: string }[] = [
  { action: 'forward', label: 'Move forward' },
  { action: 'back', label: 'Move back' },
  { action: 'left', label: 'Move left' },
  { action: 'right', label: 'Move right' },
  { action: 'walk', label: 'Walk (hold, slow)' },
  { action: 'sprint', label: 'Sprint (hold)' },
  { action: 'crouch', label: 'Crouch (hold)' },
  { action: 'jump', label: 'Jump' },
  { action: 'reload', label: 'Reload' },
  { action: 'slot1', label: 'Rifle' },
  { action: 'slot2', label: 'Pistol' },
  { action: 'swap', label: 'Switch replica' },
];

/** Keys that can't be bound: Escape pauses (the browser releases the mouse), and Meta/OS keys. */
export const UNBINDABLE_KEYS: ReadonlySet<string> = new Set(['Escape', 'MetaLeft', 'MetaRight', 'ContextMenu']);

/**
 * Keys whose browser default (page scroll, find bar, Alt opening the menu bar) is suppressed while
 * playing, on key down and up. Any bound key is suppressed too.
 */
export const PREVENT_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  'Space',
  'F3',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'AltLeft',
  'AltRight',
  // Tab would move keyboard focus off the game to the page's buttons.
  'Tab',
]);

export const MOUSE = {
  /**
   * Radians of view rotation per mouse count at sensitivity 1. ~0.00096 is the Counter-Strike
   * default (2.5 × 0.022°), a familiar baseline. Firefox ignores raw input so it may feel different.
   */
  radiansPerCount: 0.001,
  defaultSensitivity: 1,
  minSensitivity: 0.2,
  maxSensitivity: 4,
  sensitivityStep: 0.05,
  /** Wheel travel (pixels) that counts as one replica switch; stops trackpad swipes flipping replicas every frame. */
  wheelStepPixels: 100,
  /** Pixels per wheel delta when the browser reports lines / pages instead of pixels. */
  wheelLinePixels: 40,
  wheelPagePixels: 800,
} as const;
