/** Key bindings use KeyboardEvent.code, so they follow physical key positions on any layout. */
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  // Ctrl is deliberately not bound: Ctrl+W would close the tab and can't be blocked outside fullscreen.
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

export type Action = keyof typeof BINDINGS;

/** Keys whose browser default (page scroll, find bar) must be suppressed while playing. */
export const PREVENT_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  'Space',
  'F3',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
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
} as const;
