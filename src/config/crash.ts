/**
 * The crash pane's words and the report's limits (audit CORE-04, CORE-28, UI-02): what a player sees when the game
 * stops on an error, at start-up or in play, and what the copied report holds (core/crashReport.ts).
 */
export const CRASH_TEXT = {
  /** In play: the game stopped on an error. */
  heading: 'Something went wrong',
  body: 'The game hit an error and stopped. Say what you were doing in the box below, then Report a Bug or Copy the report to send it (its seed replays the match). Reload to play again.',
  /** At start-up: the game never got going. */
  bootHeading: "The game couldn't start",
  bootBody: 'Something stopped the game before it could start. Report a Bug or Copy the report below to tell us, then reload to try again.',
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
  help: 'The build, browser, graphics card, seed, match, recent errors and events and settings: copy them, or open a GitHub issue with them filled in.',
  copy: 'Copy',
  failed: "Couldn't copy",
  /** Milliseconds the button says Copied (or Couldn't copy) before it reads Copy again. */
  noteTime: 2000,
} as const;

/**
 * What a report keeps of the moments before it (IM7): the last console errors and warnings, the last game events, and
 * the frame times of the last seconds of play. Small rings, filled as things happen and read only when a report is made.
 */
export const REPORT_LOG = {
  /** Console errors and warnings kept (a repeat of the newest only counts up). */
  errors: 20,
  /** Stack lines kept per error or warning. */
  errorStackLines: 3,
  /** Characters kept of an error or warning's message. */
  messageChars: 300,
  /** Game events kept (shots, hits, the player's reloads and draws, bot mode changes, rounds). */
  events: 30,
  /** A shot within this many ticks of the same character's last, with the same replica, counts up that line. */
  burstTicks: 60,
  /** A bot's mode change within this many ticks of its last updates that line (a bot flapping between two modes). */
  flapTicks: 60,
  /** How many lines back a shot or a mode change looks for its character's line to count up (past other shots and changes only). */
  lookBack: 8,
  /** Seconds of play whose frame times a report sums up. */
  frameSeconds: 10,
  /** A drawn frame slower than this (ms) counts as a hitch. */
  hitchMs: 50,
  /** The player reads as crouched past this much of a crouch (Character.crouchAmount, 0 to 1). */
  crouchedAt: 0.5,
} as const;

/**
 * Report a Bug (IM7): a new GitHub issue on the game's repository, its title and body filled in from the report through
 * the address (no token, no server). GitHub refuses very long addresses, so the body is cut to fit: the oldest events and
 * errors first, then the settings, and the full report goes on the clipboard to paste in.
 */
export const BUG_REPORT = {
  issueUrl: 'https://github.com/ggbillyjoe3526/Airsoft/issues/new',
  /** The longest address sent (GitHub answers 414 a little above 8,000 characters). */
  maxUrlChars: 8000,
  /** Entries kept per list as the body is cut to fit, newest first. */
  keepSteps: [10, 3, 0],
  /** Fields left out next, when the lists alone don't make it fit. */
  dropFields: ['Settings', 'Dev settings'],
  /** The note box's length limit, and how much of its first line makes the issue's title. */
  noteChars: 500,
  titleChars: 70,
} as const;

export const BUG_REPORT_TEXT = {
  button: 'Report a Bug',
  noteLabel: 'What went wrong',
  notePlaceholder: 'What went wrong, and what were you doing? (optional)',
  /** The issue's title without a note. */
  title: (build: string) => `Bug report (${build})`,
  titleWithNote: (note: string) => `Bug: ${note}`,
  /** The issue body's first line when the player typed no note. */
  askWhat: '**What happened?** Describe what went wrong and what you were doing just before.',
  /** In the issue body above a cut report. */
  cutNote: 'Part of the report did not fit in the link. The full report is on your clipboard: paste it below.',
  opened: 'Opened GitHub in a new tab.',
  openedCopied: 'Opened GitHub. The full report is copied: paste it into the issue.',
  openedNotCopied: 'Opened GitHub. Part of the report did not fit: Copy it and paste it into the issue.',
} as const;
