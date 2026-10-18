/**
 * The menus (M15, owner's design, 2026-10-03): a title screen, then New game (Mode, Difficulty, Loadout, Settings),
 * a Loadout screen and a Settings screen of their own, a pause menu and the match result. Items not built yet are
 * listed greyed out and marked "Later" so the layout already has their place.
 */

/**
 * The menus' size (UX1, audit UI-12): the whole menus, type and controls alike, are drawn for a window 1080 CSS px high
 * and grow with a taller one as the HUD does (`hudScale`, config/matchInfo.ts), up to `max` (4K at 100 % OS scaling
 * draws them 1.5×). Never below 1: 1280×720 keeps the sizes it was made at. The growth is held back so the layout stays
 * at least `minLayoutWidth` wide, the narrowest window that keeps the three columns (ui/menus/css/narrow.css), so a tall,
 * narrow window doesn't stack them while the window-size rules still read it as wide.
 */
export const MENU_SCALE = {
  /** The window height (CSS px) the menus are drawn for at 1×. */
  referenceHeight: 1080,
  /** The most a tall window grows them. */
  max: 1.5,
  /** The layout's narrowest width (CSS px) once grown: narrow.css's widest step. */
  minLayoutWidth: 1500,
} as const;

/** The menus' scale on a `width` × `height` CSS px window (1 = as drawn; applied as CSS `zoom` on `.menus`). */
export function menuScale(width: number, height: number): number {
  const grown = Math.min(MENU_SCALE.max, height / MENU_SCALE.referenceHeight, width / MENU_SCALE.minLayoutWidth);
  // `!(grown > 1)` also keeps 1 for a window not measured yet (0 or NaN).
  return !(grown > 1) ? 1 : Math.round(grown * 1000) / 1000;
}

/** Browser basics (M18b): what the game says when the browser gets in the way. */
export const BROWSER_NOTES = {
  /** On the title screen when the browser draws without hardware acceleration (render/gpuCheck.ts). */
  noHardwareAcceleration:
    'Your browser is drawing without hardware acceleration, so the game will run slowly. Turn on "Use graphics acceleration when available" (Chrome, Edge) or "Use recommended performance settings" (Firefox) in its settings, then restart the browser.',
  /** Added to that warning when the game picked Low for the visit itself (nothing saved; config/render.ts startingQuality). */
  qualitySetLow: 'Graphics quality is set to Low for this visit (Settings, Graphics).',
  /** Over everything while the graphics context is lost. */
  graphicsLost: 'Graphics reset. The graphics card dropped the game for a moment; waiting for it to come back…',
  /** On the pause menu once it's back. */
  graphicsBack: 'Graphics are back. Resume when you’re ready.',
  /** Under the menus' buttons when the browser won't let the game's sound start (audit CORE-21). */
  audioBlocked: 'Sound is blocked by the browser. Allow audio (autoplay) for this site in its settings to hear the game.',
  /** Under the menus' buttons when Dev content is on but the dev maps' file didn't download (M50, BP2). */
  devMapsFailed: 'The dev maps didn’t download, so Dev content is off for now. Check the connection, then change a setting or reload to try again.',
} as const;

/** The Loadout screen's words (M26b). */
export const LOADOUT_TEXT = {
  slots: { primary: 'Primary', secondary: 'Secondary', grenades: 'Grenades' },
  empty: 'Empty',
  equipped: 'Equipped',
  customise: 'Customise',
  backToGear: 'Back To Gear',
  rightClickHint: 'Right-click an equipped replica to customise it.',
  /** Under a part's options while some are still to unlock (LV1). */
  lockedHint: 'Level up to unlock more: the Armory shows what each level gives.',
  /** A locked option's note: the level that unlocks it. */
  lockedAt: (level: number) => `Level ${level}`,
  /** A part the replica has no rail or mount for. */
  noMount: 'No rail for one',
  /** A replica whose barrel can't be swapped, or whose muzzle isn't threaded (M29b). */
  fixedBarrel: 'Fixed barrel',
  noThread: 'No thread for one',
  /** A replica with nothing but its own magazine, and one with its battery built in (the Cyber Pistol, M32). */
  ownMagazine: (bbs: number): string => `Its own, ${bbs} BBs`,
  builtInBattery: 'Built-in battery',
  /** The Barrel and Muzzle rows as it comes (M29b). */
  standardBarrel: 'The standard barrel, as it comes.',
  noMuzzle: 'Nothing on the muzzle: your shots carry as usual.',
  /** The Light row as it comes (M33h). */
  noLight: 'No light: at night you see by the moon and the fires, and nobody sees your torch.',
  /** Under the power sources, by the fitted one's type. */
  powerBlurb: {
    battery: 'A higher-voltage battery cycles faster: more BBs a second. The energy is the replica\'s own.',
    gas: 'A stronger gas (red, then black) shoots harder, and kicks harder.',
    spring: 'A stiffer spring shoots harder.',
  },
  grenadesLater: 'Grenades, smoke and flash bombs come in a later version.',
} as const;

/**
 * The Loadout's Performance sheet (M29, ui/performanceSheet.ts): each stat of the replica as carried, against the same
 * replica as it comes.
 */
export const PERFORMANCE_SHEET = {
  title: 'Performance',
  /** Under the title. */
  against: (chronoGrams: number) => `Changes are against the replica as it comes. Feet per second (fps) as a site's chrono reads it, on ${chronoGrams.toFixed(2)} g BBs.`,
  /** The BB weight a speed in feet per second is quoted on, as a site's chrono reads it. */
  chronoGrams: 0.2,
  /** A change smaller than this (percent) shows as none. */
  minChangePercent: 0.5,
  labels: {
    energy: 'Energy',
    siteLimit: 'site limit',
    speed: 'Muzzle speed',
    bbWeight: 'BB weight',
    fireRate: 'Rate of fire',
    upTo: 'up to',
    onTarget: 'On target to',
    timeTo: (m: number) => `Time to ${m} m`,
    neverGets: 'never gets there',
    spread: 'Spread',
    recoil: 'Recoil',
    magazines: 'Magazines',
    reload: 'Reload',
    draw: 'Draw',
    raise: 'Aim raise',
    noOptic: 'no optic',
    heardFrom: 'Shots heard from',
  },
  /** Read out on a change, for a screen reader and for anyone who can't tell the colours apart. */
  better: 'better than as it comes',
  worse: 'worse than as it comes',
} as const;

/** "1,200": XP as the Armory and the summary write it. */
const xpNumber = (n: number): string => n.toLocaleString('en-GB');

/** The Armory's words (LV1): your level, what it unlocked and what is to come. The numbers come from levels.md. */
export const ARMORY_TEXT = {
  heading: 'Armory',
  level: (n: number) => `Level ${n}`,
  /** Under the level: "of 10", the cap. */
  ofCap: (cap: number) => `of ${cap}`,
  /** The bar's words: XP into this level against what the next one takes. */
  xpInto: (into: number, next: number) => `${xpNumber(into)} / ${xpNumber(next)} XP`,
  toNext: (left: number, level: number) => `${xpNumber(left)} XP to level ${level}`,
  totalXp: (xp: number) => `${xpNumber(xp)} XP earned in all`,
  atCap: 'Top level reached. XP counts again when the level cap goes up.',
  off: 'Levelling is off in the Dev settings: everything is unlocked. Turn it back on to see your own level.',
  /** How much of what there is the player has: "12 / 19 unlocked". */
  unlocked: (n: number, total: number) => `${n} / ${total} unlocked`,
  next: 'Next unlock',
  nextAt: (level: number) => `Level ${level}`,
  allUnlocked: 'You have everything there is for now. More comes as the level cap goes up.',
  levels: 'Levels',
  /** A level's row head: "Level 3 · 800 XP" (level 0: the starting kit). */
  start: 'Starting kit',
  levelXp: (total: number) => `${xpNumber(total)} XP`,
  /** A level with nothing offered in it (what it unlocks is still being built). */
  nothingYet: 'Nothing yet',
  state: { unlocked: 'Unlocked', next: 'Next', locked: 'Locked' },
  earn: 'How XP is earned',
  earnLines: (e: { matchPlayed: number; matchWon: number; roundWon: number; hit: number }) => [
    `Every match: ${xpNumber(e.matchPlayed)} XP`,
    `A win: ${xpNumber(e.matchWon)} more`,
    `Each round won: ${xpNumber(e.roundWon)}`,
    `Each hit on an opponent: ${xpNumber(e.hit)}`,
  ],
  /** "Easy ×0.5 · Normal ×1 · Hard ×1.5 · Pro ×2". */
  difficulty: (parts: readonly string[]) => `Then times the difficulty: ${parts.join(' · ')}.`,
  noXp: 'The practice range and the tutorial give no XP.',
  /** The match summary's lines. */
  earned: 'XP earned',
  /** The summary's level line: "Level 3: 120 / 400 XP". */
  levelLine: (level: number, bar: string) => `Level ${level}: ${bar}`,
  levelUp: (level: number) => `Level ${level}!`,
  unlockedNow: 'Unlocked',
  /** The summary's line for a match that gave nothing (audit POOL-22). */
  noXpDev: 'No XP: Dev settings changed how this match played.',
  noXpDevContent: 'No XP: this match used content still being built.',
} as const;

/** The match's end (G3): the summary's and the result's own words. */
export const SUMMARY_TEXT = {
  kicker: 'Match summary',
  over: 'Match over',
  players: 'Players',
  next: 'Continue',
} as const;

/** Extraction's haul on the match summary (M44): what the run found, and whether its XP counted (LV1). */
export const HAUL_TEXT = {
  title: 'The haul',
  /** Kept (M47, LV1: its XP comes with the run's, times the difficulty). */
  kept: (what: string): string => `You got out with ${what}. It is in your XP below.`,
  /** Got out, but the run gives no XP (Dev settings, dev content; the XP line says which). */
  notKept: (what: string): string => `You got out with ${what}, but this run gives no XP.`,
  lost: (what: string): string => `Lost: ${what}. Only what you get out with counts.`,
  leftBehind: 'You got out, but what you dropped stayed where you fell.',
  emptyOut: 'You got out with nothing.',
  nothing: 'You found nothing on this run.',
  /** "85 XP", what the cases held. */
  xp: (xp: number): string => `${xpNumber(xp)} XP`,
} as const;

/**
 * The Settings screen's groups, top to bottom (graphics overhaul G3: William's seven, then the save and the hidden Dev
 * group), each with the line under its name. `hidden`: shown only once the "Dev settings" box under them is ticked
 * (M24). Every earlier tab's rows live on in one of them: Key Bindings under Controls, Crosshair and HUD under Gameplay,
 * the screen rows (fullscreen, field of view, the FPS readout) under Display; Tone mapping under Dev (RV2).
 */
export type SettingsTab = 'graphics' | 'display' | 'audio' | 'controls' | 'gameplay' | 'accessibility' | 'look' | 'save' | 'dev';

export const SETTINGS_TABS: readonly { id: SettingsTab; label: string; blurb: string; hidden?: boolean }[] = [
  // William's order (Dev 6 playtest, 2026-10-16); the first is the group Settings opens on.
  { id: 'display', label: 'Display', blurb: 'Screen, field of view, FPS' },
  { id: 'graphics', label: 'Graphics', blurb: 'Quality, effects, frame rate' },
  { id: 'gameplay', label: 'Gameplay', blurb: 'Crosshair, HUD, hit feed' },
  /** Robots (graphics overhaul G1). */
  { id: 'look', label: 'Looks', blurb: 'Humans and robots' },
  { id: 'audio', label: 'Audio', blurb: 'Volume for each part' },
  { id: 'controls', label: 'Controls', blurb: 'Mouse, keys, aim and sprint' },
  { id: 'accessibility', label: 'Accessibility', blurb: 'Colours, motion, sound cues' },
  /** The save: download, load, restore points (M31). */
  { id: 'save', label: 'Save file', blurb: 'Download, load, restore' },
  { id: 'dev', label: 'Dev', blurb: 'Switches for testing, Retro look', hidden: true },
];

/** The box under the Settings groups that shows the Dev group (M24). */
export const DEV_TOGGLE_LABEL = 'Dev settings';

/** The Settings screen's other words (G3): the search box, the side panel and the headings inside a group. */
export const SETTINGS_TEXT = {
  search: 'Search settings',
  /** Under the search box when nothing matches. */
  noMatch: (query: string) => `Nothing matches "${query}".`,
  /** Over the rows of every group while a search is on. */
  results: (n: number) => `${n} ${n === 1 ? 'setting' : 'settings'} found`,
  about: 'About this setting',
  /** The side panel before a row is pointed at. */
  aboutHint: 'Point at a setting, or move to it with Tab, to read about it here.',
  cost: 'Cost',
  /** The tip under Graphics' side panel. */
  stutters: 'Stutters?',
  stuttersTip: 'Pick a lower Quality first: it helps the most. Then turn down Shadows.',
  /** Inside groups that gather several old tabs. */
  keysHeading: 'Keys',
  crosshairHeading: 'Crosshair',
  hudHeading: 'HUD',
  /** Gameplay › Tutorial (M97): play the tutorial again from its first step, finished or not. */
  tutorialHeading: 'Tutorial',
  replayTutorial: 'Replay tutorial',
  replayTutorialHelp: 'Plays the tutorial on the practice range again from its first step, whether or not you finished it.',
  /** Asked first when Settings was opened from the pause menu: starting it leaves what is being played. */
  replayTutorialTitle: 'Replay the tutorial?',
  replayTutorialLeave: 'This leaves what you are playing now. A match left before its end goes into no records.',
  replayTutorialYes: 'Start tutorial',
  /** Under the Key Bindings: the mouse and the fixed keys. */
  fixedKeys: 'Wheel switches replica (a direction bound above does that instead) · Esc pauses and resumes · ` or F3 shows the debug info',
} as const;

/** Settings not built yet, listed greyed out in their group (label and a short line on what it will do). */
export const SETTINGS_LATER: Readonly<Record<SettingsTab, readonly { label: string; help: string }[]>> = {
  graphics: [],
  display: [],
  audio: [],
  controls: [],
  gameplay: [],
  accessibility: [],
  look: [],
  save: [],
  dev: [],
};

/**
 * A slider's change is written to the browser's storage this long (ms) after the last step, not on every step (audit
 * UI-11 / CORE-12): a drag writes the settings once. It applies at once either way.
 */
export const SETTINGS_WRITE_DELAY_MS = 400;

/**
 * The menus' frame (graphics overhaul G3, M100): the bar across the top of the screens you move between, the keys the
 * screens answer to and the words they share.
 */
export const MENU_TEXT = {
  /** The top bar's places, in order (M100: Match, Loadout, Armory, Settings; the Range is a mode on the Match screen). */
  nav: [
    { id: 'setup', label: 'Match' },
    { id: 'loadout', label: 'Loadout' },
    { id: 'armory', label: 'Armory' },
    { id: 'settings', label: 'Settings' },
  ],
  navLabel: 'Menu',
  wordmark: 'Airsoft',
  /** The top bar's wordmark is a button back to the title; opened from the pause menu it is Back. */
  toTitle: 'Back to the title screen',
  back: 'Back',
  /** The level badge on the top bar (LV1), and what it says to a screen reader. */
  level: (n: number) => `LVL ${n}`,
  levelLabel: (n: number, toNext: string) => `Level ${n}${toNext ? `, ${toNext}` : ''}. Open the Armory`,
  /** The top bar's button on the Loadout opened from Practice (M95): straight back to practice, the kit as picked. */
  backToPractice: 'Back to practice',
  /** The title's fullscreen button (MR1). */
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  dev: 'Dev',
  /** By the play buttons when a screen's or the range's code, fetched on first use (IM1), didn't download. */
  screenFailed: 'That screen didn’t download. Check the connection and try again.',
  rangeFailed: 'Practice didn’t download. Check the connection and try again.',
  /**
   * The pause menu when the browser wouldn't give the mouse back (IN1): Esc is no click, so Chrome refuses it, and it
   * refuses a click too for about a second after Esc. Any click on the screen then resumes; `again`, after a refused click;
   * `fullscreen`, after the Fullscreen key in Firefox, which allows fullscreen from a click but not from a function key.
   */
  clickToResume: {
    first: 'Click anywhere to resume',
    again: 'The browser needs a moment after Esc. Click again to resume',
    fullscreen: 'Click anywhere to go fullscreen',
  },
  /** Elsewhere (Play, the Fullscreen key), the browser refused the mouse: a click takes it. */
  lockRefused: 'The browser needs a moment before re-capturing the mouse. Click again.',
  /** The buttons and keys the screens name (no key prompts are drawn along the bottom since M100). */
  hints: {
    back: 'Back',
    start: 'START',
    startMatch: 'Start match',
    startPractice: 'Start practice',
    tutorial: 'Tutorial',
    settings: 'Settings',
    customise: 'Customise',
    resume: 'Resume',
    search: 'Search',
  },
} as const;

/** The title screen's words (M100: a plain title). */
export const TITLE_TEXT = {
  tagline: 'Call your hit. Go again.',
  /** The link to the third-party licences file, over the version (LC1). */
  licences: 'Licences',
} as const;

/** The Match screen's words (G3: New game in the new look; M100: the screen is Match, Practice its last mode). */
export const PLAY_TEXT = {
  heading: 'Match',
  map: 'Map',
  mode: 'Mode',
  match: 'Match rules',
  /** The rules' two columns' groups (MR1). */
  groups: { match: 'Match', teams: 'Teams', house: 'House rules' },
  /** A rule the ruleset sets, in place of its buttons (MR1): "Off · set by Skirmish". */
  setBy: (value: string, ruleset: string) => `${value} · set by ${ruleset}`,
  bots: 'Bots',
  yourMatch: 'Your match',
  modeRow: 'Mode',
  rulesRow: 'Rules',
  teamsRow: 'Teams',
  loadout: 'Loadout',
  change: 'Change',
  night: 'Night',
  light: 'Light',
  /** Practice, the last mode card: the range, with no bots and no score. */
  practice: {
    label: 'Practice',
    blurb: 'The range or any map: targets to shoot at, no bots, no score.',
    /** "Your match" while Practice is picked, before the place's own line is worked out (M94). */
    mapLine: 'Range',
    rules: 'No score, no clock',
    teams: 'On your own',
  },
  /** "Normal bots", "Hard / Normal bots". */
  botsLine: (levels: string) => `${levels} bots`,
  pays: 'Gives XP towards your next level as you play.',
  paysCapped: (cap: number) => `Gives XP towards your next level, at no more than ×${cap}.`,
} as const;

/** The Loadout and Customise screens' layout words (G3), beside LOADOUT_TEXT's. */
export const GEAR_TEXT = {
  carried: 'Carried',
  replicas: 'Your replicas',
  selected: 'Selected',
  asCarried: 'as carried',
  unlockMore: 'Level up to unlock more: the Armory shows what each level gives.',
  /** Under the replicas when the Loadout was opened from Practice (M95). */
  practice: 'Practice: take any replica you have unlocked and customise it. What you carry here is your loadout for matches too.',
  /** Under the replicas while Dev settings › Disable levelling lends everything (M26d, M95; LV1). */
  lent: 'Disable levelling is on (Dev settings): every replica and part is yours to try. Your own loadout comes back when you turn it off.',
  /** The parts fitted, after the colour. */
  partsFitted: (n: number) => (n === 0 ? 'nothing fitted' : `${n} ${n === 1 ? 'part' : 'parts'} fitted`),
  breadcrumb: 'Loadout',
  /** The part list's own label (a tab list) and the options' count. */
  parts: 'Parts',
  options: (n: number) => `${n} ${n === 1 ? 'option' : 'options'}`,
  none: 'None',
  /** The Colour row (G3, William: picked per replica, first in the list). */
  colour: 'Colour',
  /** The Colour tab's two rows (MR1): the bold two-tone schemes, then the realistic plain colours. */
  bold: 'Bold',
  boldNote: 'Two-tone schemes',
  realistic: 'Realistic',
  realisticNote: 'One plain colour, as a real replica comes',
  fixedColours: 'The Cyber Pistol keeps its own colours: no other scheme fits it.',
  /** Under the colour's name in the Colour side panel, and the other replica's line when it keeps its own colours. */
  ownColourNote: 'Each replica keeps its own colour. Colour changes how a replica looks, never how it shoots.',
  ownColours: 'Its own colours',
  /** A scheme tile's line under the Realistic colours setting. */
  showsAs: (family: string) => `Shows as ${family}`,
  /** The BB rows' own heading in the part list. */
  ammo: 'BBs',
} as const;

/**
 * The Performance bars (G3): how full each stat's bar is drawn, from `from` (empty) to `to` (full); a stat where lower is
 * better runs from a high `from` to a low `to`. Rough spans of what the pool's replicas reach, for reading at a glance.
 */
export const PERFORMANCE_BARS = {
  energy: { from: 0, to: 1.6 },
  speed: { from: 0, to: 140 },
  bbWeight: { from: 0.12, to: 0.4 },
  fireRate: { from: 0, to: 20 },
  onTarget: { from: 0, to: 60 },
  timeTo: { from: 0.5, to: 0.1 },
  spread: { from: 1.2, to: 0 },
  recoil: { from: 0.8, to: 0 },
  magazines: { from: 0, to: 600 },
  reload: { from: 3, to: 0.5 },
  draw: { from: 0.8, to: 0.1 },
  raise: { from: 0.4, to: 0.05 },
  heardFrom: { from: 30, to: 5 },
  /** The least a bar shows, so an empty one still reads as a bar. */
  min: 0.04,
} as const;
