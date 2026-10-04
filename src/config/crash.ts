/**
 * The crash pane's words and the report's limits (audit CORE-04, CORE-28, UI-02): what a player sees when the game
 * stops on an error, at start-up or in play, and what the copied report holds (core/crashReport.ts).
 */
export const CRASH_TEXT = {
  /** In play: the game stopped on an error. */
  heading: 'Something went wrong',
  body: 'The game hit an error and stopped. Copy the report below and send it with what you were doing (the seed in it replays the match), then reload to play again.',
  /** At start-up: the game never got going. */
  bootHeading: "The game couldn't start",
  bootBody: 'Something stopped the game before it could start. Copy the report below if you report it, then reload to try again.',
  /** Added at start-up when the browser couldn't give the game a graphics (WebGL) context. */
  bootWebGl:
    'Your browser could not start 3D graphics (WebGL). Update your graphics driver, turn on "Use graphics acceleration when available" (Chrome, Edge) or "Use recommended performance settings" (Firefox) in the browser\'s settings, or try another browser.',
  copy: 'Copy Report',
  copied: 'Copied',
  /** When the clipboard refuses: the report is selected instead. */
  copyFailed: 'Selected: press Ctrl+C (Cmd+C) to copy',
  reload: 'Reload',
  /** The report box's accessible name. */
  reportLabel: 'Error report',
} as const;

/** A start-up error is the graphics context's when its message says so (three.js and the browsers word it so). */
export const WEBGL_ERROR = /webgl|graphics context/i;

/** The report keeps the error's first lines of stack: enough to place it, short enough to paste anywhere. */
export const CRASH_REPORT = { stackLines: 15 } as const;

/** Settings → Dev → Diagnostics (audit CORE-32): the crash report's fields, copied on demand in any build. */
export const DIAGNOSTICS_TEXT = {
  label: 'Diagnostics',
  help: 'Copies the build, browser, graphics card, seed, match and settings, to paste into a bug report.',
  copy: 'Copy',
  failed: "Couldn't copy",
  /** Milliseconds the button says Copied (or Couldn't copy) before it reads Copy again. */
  noteTime: 2000,
} as const;
