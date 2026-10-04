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
  // Hold to lean (peek) around cover.
  leanLeft: ['KeyQ'],
  leanRight: ['KeyE'],
  jump: ['Space'],
  reload: ['KeyR'],
  /** Steps the replica's fire selector (semi / burst / auto, as far as the replica has them). */
  fireMode: ['KeyB'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  /** Hold to see the match so far: everyone's hits, BBs fired, accuracy and time alive (M19). */
  scoreboard: ['Tab'],
  /** Mouse buttons are codes too (`Mouse0` left … `Mouse4` the forward side button; see input/keyBindings.ts), so fire and aim rebind like any key (M18). */
  fire: ['Mouse0'],
  /** Aims down sights (needs an optic); hold or toggle, see AIM_MODES. */
  aim: ['Mouse2'],
  /** Fullscreen on and off while playing (M18b). F11 is the browser's own and would leave the page's fullscreen; F10 is free once the game takes it. */
  fullscreen: ['F10'],
  debugOverlay: ['Backquote', 'F3'],
  /** Debug: draw the recent flight paths of BBs. */
  debugBbPaths: ['BracketRight'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof DEFAULT_BINDINGS;

/** Actions players can rebind, in the order the settings list them, with their labels. */
export const REBINDABLE: readonly { action: Action; label: string }[] = [
  { action: 'fire', label: 'Fire' },
  { action: 'aim', label: 'Aim (needs an optic)' },
  { action: 'forward', label: 'Move forward' },
  { action: 'back', label: 'Move back' },
  { action: 'left', label: 'Move left' },
  { action: 'right', label: 'Move right' },
  { action: 'walk', label: 'Walk (hold, quiet)' },
  { action: 'sprint', label: 'Sprint' },
  { action: 'crouch', label: 'Crouch' },
  { action: 'leanLeft', label: 'Lean left (hold)' },
  { action: 'leanRight', label: 'Lean right (hold)' },
  { action: 'jump', label: 'Jump' },
  { action: 'reload', label: 'Reload' },
  { action: 'fireMode', label: 'Fire mode' },
  { action: 'slot1', label: 'Rifle' },
  { action: 'slot2', label: 'Pistol' },
  { action: 'scoreboard', label: 'Scoreboard (hold)' },
  { action: 'fullscreen', label: 'Fullscreen' },
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

/**
 * How a stance key works: press once to turn it on and again to turn it off (toggle), or only while held.
 * Crouch, aim and sprint each have their own (M18; crouch since the owner's v0.1-alpha.3 playtest).
 */
export type HoldMode = 'toggle' | 'hold';

/**
 * The crouch key: toggle by default (owner's v0.1-alpha.3 playtest). In toggle mode, sprinting or jumping stands you up.
 */
export type CrouchMode = HoldMode;

export const CROUCH_MODES: readonly { id: CrouchMode; label: string; blurb: string }[] = [
  { id: 'toggle', label: 'Toggle', blurb: 'Press crouch to go down, press again to stand. Sprint or jump also stands you up.' },
  { id: 'hold', label: 'Hold', blurb: 'Crouch while the key is held.' },
];

export const DEFAULT_CROUCH_MODE: CrouchMode = 'toggle';

/** The aim button: hold by default, as before M18. In toggle mode, sprinting or switching replicas lowers the sight. */
export const AIM_MODES: readonly { id: HoldMode; label: string; blurb: string }[] = [
  { id: 'hold', label: 'Hold', blurb: 'Aim while the button is held.' },
  { id: 'toggle', label: 'Toggle', blurb: 'Press aim to raise the sight, press again to lower it. Sprinting or switching replicas lowers it too.' },
];

export const DEFAULT_AIM_MODE: HoldMode = 'hold';

/** The sprint key: hold by default, as before M18. A toggled sprint stops when you let go of forward, or crouch, aim, walk or fire. */
export const SPRINT_MODES: readonly { id: HoldMode; label: string; blurb: string }[] = [
  { id: 'hold', label: 'Hold', blurb: 'Sprint while the key is held.' },
  { id: 'toggle', label: 'Toggle', blurb: 'Press sprint to run flat out (at once, or as soon as you push forward) until you let go of forward, or crouch, aim, walk or fire.' },
];

export const DEFAULT_SPRINT_MODE: HoldMode = 'hold';

/** An on / off setting on a picker (invert mouse, reduced motion). Stored as the id. */
export type Switch = 'off' | 'on';

export const INVERT_MOUSE: readonly { id: Switch; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'Mouse forward looks up.' },
  { id: 'on', label: 'On', blurb: 'Mouse forward looks down, like a flight stick.' },
];

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

/**
 * Sensitivity as cm/360 (M18): how far the mouse travels for one full turn, worked out from the mouse's DPI (counts per
 * inch, entered by the player), so a sensitivity can be matched with another shooter. The two shooters' turn per count
 * at sensitivity 1 give the "same as" figures, which need no DPI.
 */
export const MOUSE_DPI = {
  default: 800,
  min: 100,
  max: 32000,
  step: 50,
} as const;

/** The cm/360 a player can type (centimetres of mouse travel per full turn). */
export const TURN_CM = { min: 1, max: 1000 } as const;

/** Degrees of view turn per mouse count at sensitivity 1 in other shooters, for the "same as" line. */
export const OTHER_SHOOTERS: readonly { name: string; degreesPerCount: number }[] = [
  { name: 'CS2', degreesPerCount: 0.022 },
  { name: 'Valorant', degreesPerCount: 0.07 },
];
