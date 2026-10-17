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
  /** Switches the weapon torch on the replica in hand on and off (M33h; T is free and the usual tactical-light key). */
  torch: ['KeyT'],
  /**
   * Turns the replica in hand over to look it over (RM2): the model's own inspect (the AEG's charging handle and hop
   * dial, the gas pistol's press check, the Cyber Pistol's battery check). Y as in Valorant: F (CS) is Follow me, and I
   * is kept for an inventory.
   */
  inspect: ['KeyY'],
  /** Hold beside a case to open it (M44, Extraction). G: E leans and F is Follow me; T is kept for a weapon torch. */
  use: ['KeyG'],
  /**
   * In Practice, opens the Loadout straight from play, and on it goes back to practice (M95). L for Loadout, free
   * until now; in a match it does nothing, as the loadout changes only between matches (owner, 2026-10-03).
   */
  loadout: ['KeyL'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  /** Puts the replica in hand away for a faster pace without sprinting (M92, the owner's note 3: 1 primary, 2 secondary, 3 holster). */
  holster: ['Digit3'],
  /**
   * Turn the hop-up of the replica in hand a notch down or up in play (Dev 6 playtest item 15): 4 and 5, the free keys
   * beside the replica keys, within reach of the movement hand; Page Down and Page Up as their second keys. The mouse
   * wheel binds here too (Settings › Key Bindings).
   */
  hopDown: ['Digit4', 'PageDown'],
  hopUp: ['Digit5', 'PageUp'],
  /** Hold to see the match so far: everyone's hits, BBs fired, accuracy and time alive (M19). */
  scoreboard: ['Tab'],
  /** Mouse buttons are codes too (`Mouse0` left … `Mouse4` the forward side button; see input/keyBindings.ts), so fire and aim rebind like any key (M18). */
  fire: ['Mouse0'],
  /** Aims down sights (the optic, or the iron sights with none fitted; M84); hold or toggle, see AIM_MODES. */
  aim: ['Mouse2'],
  /** Hold for the order wheel (M23, config/squad.ts ORDER_WHEEL): point at an order, then let go or click. */
  orderWheel: ['KeyZ'],
  /**
   * Squad orders straight from a key (M22, config/squad.ts); the same key again cancels. Follow me was on Z until the
   * wheel took it (MOVED_DEFAULTS).
   */
  orderFollow: ['KeyF'],
  orderHold: ['KeyX'],
  orderRegroup: ['KeyV'],
  /**
   * Marks where you look for your team (PG1, config/pings.ts): the middle mouse button, as in most team shooters, so you
   * ping without taking a hand off the keys. A mouse without one binds a key in Settings › Key Bindings.
   */
  ping: ['Mouse1'],
  /**
   * A magazine (MG1, config/magShare.ts): tosses one to a teammate asking you once they are in reach, else asks the
   * nearest with one to spare when you run low. H for hand-off, free until now; the order wheel has it too.
   */
  askMag: ['KeyH'],
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
  { action: 'aim', label: 'Aim down sights' },
  { action: 'forward', label: 'Move forward' },
  { action: 'back', label: 'Move back' },
  { action: 'left', label: 'Move left' },
  { action: 'right', label: 'Move right' },
  { action: 'walk', label: 'Walk (hold, quiet)' },
  { action: 'sprint', label: 'Sprint' },
  { action: 'crouch', label: 'Crouch' },
  { action: 'leanLeft', label: 'Lean left (hold)' },
  { action: 'leanRight', label: 'Lean right (hold)' },
  { action: 'jump', label: 'Jump / vault' },
  { action: 'reload', label: 'Reload' },
  { action: 'fireMode', label: 'Fire mode' },
  { action: 'torch', label: 'Weapon torch' },
  { action: 'inspect', label: 'Inspect replica' },
  { action: 'use', label: 'Use: open a case (hold)' },
  { action: 'loadout', label: 'Loadout (in Practice)' },
  { action: 'slot1', label: 'Rifle' },
  { action: 'slot2', label: 'Pistol' },
  { action: 'holster', label: 'Holster' },
  { action: 'hopDown', label: 'Hop-up: less lift' },
  { action: 'hopUp', label: 'Hop-up: more lift' },
  { action: 'scoreboard', label: 'Scoreboard (hold)' },
  { action: 'orderWheel', label: 'Squad: order wheel (hold)' },
  { action: 'orderFollow', label: 'Squad: follow me' },
  { action: 'orderHold', label: 'Squad: hold here' },
  { action: 'orderRegroup', label: 'Squad: regroup' },
  { action: 'ping', label: 'Squad: ping a spot' },
  { action: 'askMag', label: 'Squad: ask for a mag / toss one' },
  { action: 'fullscreen', label: 'Fullscreen' },
];

/**
 * Default keys that moved when a later action took them: bindings saved before `added` existed, with `action` still on
 * its `old` keys, give `action` its new default instead, so `added` gets its default key rather than none (the
 * player never chose `old`; input/keyBindings.ts). Saved sets that have `added` are left as they are.
 */
export const MOVED_DEFAULTS: readonly { action: Action; old: readonly string[]; added: Action }[] = [
  // The order wheel took Z from Follow me (M23).
  { action: 'orderFollow', old: ['KeyZ'], added: 'orderWheel' },
];

/**
 * Keys that can't be bound: Escape pauses (the browser releases the mouse), Meta/OS keys, and keys the browser can't name
 * (`Unidentified`: unmapped media or Fn keys), which would never match again. An empty code is refused too (KeyBindings).
 */
export const UNBINDABLE_KEYS: ReadonlySet<string> = new Set(['Escape', 'MetaLeft', 'MetaRight', 'ContextMenu', 'Unidentified']);

/**
 * The browser's own keys, which can't be bound either (audit UI-07): F5 reloads the page on the pause screen (losing
 * the match), F11 and F12 (fullscreen, developer tools) are taken by the browser before the page sees them, and the
 * rest navigate or capture the screen.
 */
export const BROWSER_KEYS: ReadonlySet<string> = new Set(['F5', 'F11', 'F12', 'BrowserBack', 'BrowserForward', 'BrowserRefresh', 'PrintScreen', 'Pause']);

/**
 * The mouse wheel as two binding codes (audit UI-05): one notch (MOUSE.wheelStepPixels of travel) up or down is a press
 * and release of its code, so the wheel binds like a key (a tap; nothing holds it). A direction bound to an action no
 * longer switches replicas.
 */
export const WHEEL_CODES = { up: 'WheelUp', down: 'WheelDown' } as const;

/** How many keys each action can have in Settings → Key Bindings: a main key and a second one (audit UI-05). */
export const KEY_SLOTS = 2;

/**
 * Actions the game can't be played without: their last key can't be cleared, and another action can't take it from
 * them when they would be left with none (audit UI-05).
 */
export const ESSENTIAL_ACTIONS: ReadonlySet<Action> = new Set<Action>(['fire', 'forward', 'back', 'left', 'right']);

/** Settings → Key Bindings timings (ms). */
export const KEY_SETTINGS = {
  /** "Reset All" asks for a second click within this long before it resets (audit UI-17). */
  resetConfirmMs: 3000,
} as const;

/**
 * Esc on the pause menu resumes (audit UI-09), but not within this long (ms) of the pause menu showing: the Esc that
 * released the mouse (where a browser passes it on to the page) must not resume straight away.
 */
export const PAUSE_ESC_GUARD_MS = 400;

/** Fire-selector taps kept for later ticks at most: one full cycle of the longest selector (semi, burst, auto), so
 * taps made while no command is filled (Dev › Spectate any bot) can't replay as a long run of steps (KI1 QA). */
export const FIRE_MODE_QUEUE_MAX = 3;

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
 * Crouch, aim and sprint each have their own (M18; crouch since the owner's 0.1 Dev 3 playtest).
 */
export type HoldMode = 'toggle' | 'hold';

/**
 * The crouch key: hold by default (William, Dev 6 playtest, 2026-10-16; toggle from the 0.1 Dev 3 playtest until then).
 * In toggle mode, sprinting or jumping stands you up. The default is listed first.
 */
export type CrouchMode = HoldMode;

export const CROUCH_MODES: readonly { id: CrouchMode; label: string; blurb: string }[] = [
  { id: 'hold', label: 'Hold', blurb: 'Crouch while the key is held.' },
  { id: 'toggle', label: 'Toggle', blurb: 'Press crouch to go down, press again to stand. Sprint or jump also stands you up.' },
];

export const DEFAULT_CROUCH_MODE: CrouchMode = 'hold';

/**
 * The aim button: toggle by default (William, Dev 6 playtest, 2026-10-16; hold until then). In toggle mode, sprinting,
 * switching replicas or holstering lowers the sight. The default is listed first.
 */
export const AIM_MODES: readonly { id: HoldMode; label: string; blurb: string }[] = [
  { id: 'toggle', label: 'Toggle', blurb: 'Press aim to raise the sight, press again to lower it. Sprinting, switching replicas or holstering lowers it too.' },
  { id: 'hold', label: 'Hold', blurb: 'Aim while the button is held.' },
];

export const DEFAULT_AIM_MODE: HoldMode = 'toggle';

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
  /** Fine steps (audit UI-24): 0.20 → 0.25 was a 25 % jump at the low end. A typed cm/360 is kept exactly. */
  sensitivityStep: 0.01,
  /** Wheel travel (pixels) that counts as one replica switch; stops trackpad swipes flipping replicas every frame. */
  wheelStepPixels: 100,
  /** Pixels per wheel delta when the browser reports lines / pages instead of pixels. */
  wheelLinePixels: 40,
  wheelPagePixels: 800,
  /**
   * A single mouse move larger than this (counts, either axis) is dropped as a glitch (audit UI-10): some drivers and
   * browsers report a huge jump on the first move after the lock or a fullscreen change. No hand moves this far in one
   * 1–8 ms event.
   */
  maxEventCounts: 1000,
} as const;

/**
 * Raw mouse input (audit UI-20): ask the browser for unaccelerated movement (`unadjustedMovement`), or use the system's
 * pointer speed and acceleration. Chrome and Edge honour it; Firefox ignores the request.
 */
export const RAW_INPUT: readonly { id: Switch; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'The system’s pointer speed and acceleration, as on the desktop.' },
  { id: 'on', label: 'On', blurb: 'The mouse as it moves, without the system’s acceleration (Chrome, Edge).' },
];

export const DEFAULT_RAW_INPUT: Switch = 'on';

/**
 * How the last mouse lock went for raw input (input/pointerLock.ts): `active` (unaccelerated movement granted),
 * `unavailable` (refused, or ignored as Firefox does: the system's acceleration applies), `off` (turned off), or
 * `unknown` before the first lock.
 */
export type RawInputStatus = 'active' | 'unavailable' | 'off' | 'unknown';

/** The line under Settings → Controls → Raw mouse input saying which the player has (audit UI-20). */
export const RAW_INPUT_STATUS: Readonly<Record<RawInputStatus, string>> = {
  active: 'Raw input is active.',
  // Firefox never gives it (a known limit, IN1): the line says so as soon as Settings opens there.
  unavailable: 'This browser gives no raw input (Firefox never does): your system’s pointer acceleration applies.',
  off: 'Off: the system’s pointer speed and acceleration apply.',
  unknown: 'Takes effect the next time the game takes the mouse; this line then says whether the browser gave it.',
};

/**
 * The Fullscreen key pressed in play: if the browser drops the mouse lock as the page enters or leaves fullscreen
 * within this long (ms), the game takes it again at once (audit UI-19), instead of stopping on the pause menu.
 */
export const FULLSCREEN_RELOCK_MS = 1500;

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
