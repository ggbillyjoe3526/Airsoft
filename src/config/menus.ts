/**
 * The menus (M15, owner's design, 2026-10-03): a title screen, then New game (Mode, Difficulty, Loadout, Settings),
 * a Loadout screen and a Settings screen of their own, a pause menu and the match result. Items not built yet are
 * listed greyed out and marked "Later" so the layout already has their place.
 */

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
  /** Under a row with nothing owned to fit yet. */
  armoryHint: 'Unlock more in the Armory.',
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
  /** Skins come with customisation (v0.5): the row keeps their place (M17b). */
  skinsLater: 'Replicas and outfit',
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

/** The Armory's words (M26c): completely free, beta. Numbers come from pool.md. */
export const ARMORY_TEXT = {
  beta: 'Beta',
  freeTag: 'Free',
  free: 'Completely free: Field Credits are earned by playing matches (more for a win, less for a loss), and nothing here is ever sold.',
  fc: 'Field Credits',
  tokens: 'Tokens',
  exchange: 'Exchange',
  rate: (fcPerToken: number) => `${fcPerToken} FC buys one Token.`,
  buy: 'Buy',
  shots: 'Shots',
  oneShot: '1 Shot',
  tenShots: '10 Shots',
  perShot: (n: number) => `Each Shot dispenses ${n} random ${n === 1 ? 'asset' : 'assets'}.`,
  guarantee: (tier: string) => `Ten Shots always hold a ${tier} or rarer.`,
  /** The Shot buttons' note when Tokens pay some of it (audit POOL-13: the FC price is on the button itself). */
  paidWith: (parts: string) => `Paid with ${parts}`,
  paidInFc: 'Paid in FC',
  /** Pity (audit POOL-01), one line per rule: "Legendary or rarer within 63 more Shots". */
  pity: (tier: string, shots: number) => `${tier} or rarer within ${shots} more ${shots === 1 ? 'Shot' : 'Shots'}`,
  pityKicker: 'Guaranteed',
  /** Shown once when another tab saved first and this change was not kept (M70, audit POOL-05). */
  reloaded: 'Another tab saved your collection first, so it was reloaded from that save. What you just did here was not kept.',
  odds: 'Rarity odds (each item drawn, before pity)',
  /** The odds' section head and its note (G3); `odds` stays the table's caption. */
  oddsTitle: 'Rarity odds',
  oddsNote: 'Each item drawn, before pity',
  /** How it works, three steps under the odds (G3). */
  stepsLabel: 'How the Armory works',
  steps: {
    play: { title: 'Play matches', text: 'Earn Field Credits, more for a win.' },
    swap: { title: 'Swap for Tokens', text: (fcPerToken: number) => `${fcPerToken} FC buys one Token.` },
    shot: { title: 'Take a Shot', text: (n: number) => `${n} random ${n === 1 ? 'asset' : 'assets'} each time.` },
  },
  /** Under the odds (audit POOL-04, POOL-05, POOL-26): how an asset is picked once its tier is drawn. */
  /** A chase item's own line under the odds (M32), e.g. the Cyber Pistol's. */
  chase: (name: string, tiers: string, percent: string, oneIn: number) =>
    `Chase item: the ${name}, ${tiers} only. Each item drawn has its own ${percent}% chance of being it (about 1 in ${oneIn.toLocaleString('en-GB')}), before the rest are drawn.`,
  chaseKicker: 'Chase',
  /** A catalogue pip for a tier the asset doesn't come in (M32). */
  notInTier: 'Does not come in this tier',
  perAsset: (n: number, weight: number, rarest: string, oneIn: number) =>
    `Then one of ${n} assets is picked${weight > 1 ? `, one you don't own at that tier ${weight === 2 ? 'twice' : `${weight} times`} as likely as one you do` : ', each equally likely'}. A given asset at ${rarest} is about 1 in ${oneIn.toLocaleString('en-GB')} draws.`,
  scrap: 'Scrap',
  scrapOne: 'Scrap 1',
  /** Under the collection heading (M100): the scrap buttons left the cards for a right-click menu. */
  scrapHint: 'Right-click an item to scrap its spares.',
  /** A card's name for a screen reader: how to reach its menu from the keyboard. */
  rowMenuHint: (name: string, spares: number) => `${name}, ${spares} ${spares === 1 ? 'spare' : 'spares'}. Press the Menu key or Shift and F10 to scrap.`,
  scrapAll: 'Scrap all spares',
  keepOne: 'Scrapping keeps your best copy of every asset, so nothing equipped is ever lost: a part fitted at a lower tier moves to the best one.',
  dispensed: 'Last Shot',
  collection: 'Your collection',
  /** The catalogue's completion: items owned of every asset at every tier. */
  completion: (owned: number, total: number) => `${owned} / ${total} items`,
  notOwned: 'Not owned yet',
  /** The confirmation pop-ups (audit POOL-03). */
  confirmTenTitle: 'Take 10 Shots?',
  confirmTen: (price: string) => `Take 10 Shots for ${price}?`,
  confirmTenYes: 'Take 10 Shots',
  confirmScrapTitle: 'Scrap all spares?',
  confirmScrap: (n: number, fc: string) => `Scrap ${n} spare ${n === 1 ? 'copy' : 'copies'} for ${fc}? Your best copy of every asset stays. This can't be undone.`,
  confirmScrapYes: 'Scrap all spares',
  new: 'New',
  spare: 'Spare',
  /** A rarer copy of a replica you never picked goes straight into its Loadout slot. */
  nowEquipped: 'Now equipped',
  /** Dev settings → Disable Armory (M26d). */
  off: 'The Armory is switched off in the Dev settings.',
  /** The match summary's line. */
  earned: 'Field Credits earned',
  /** The summary's line for a match that paid nothing (audit POOL-22). */
  unpaidDev: 'No Field Credits: Dev settings changed how this match played.',
  unpaidOff: 'No Field Credits: the Armory is switched off in the Dev settings.',
  unpaidDevContent: 'No Field Credits: this match used content still being built.',
} as const;

/** Extraction's haul on the match summary (M44): what the run found, and whether it went into your collection. */
/** The match's end (G3): the summary's and the result's own words. */
export const SUMMARY_TEXT = {
  kicker: 'Match summary',
  over: 'Match over',
  players: 'Players',
  next: 'Continue',
} as const;

export const HAUL_TEXT = {
  title: 'The haul',
  /** Kept (M47: its FC comes with the run's pay, times the difficulty; its parts go straight into the collection). */
  kept: (what: string, parts: boolean, fc: boolean): string =>
    `You got out with ${what}.${parts ? ' The parts are in your collection.' : ''}${fc ? ' The FC is in your pay below.' : ''}`,
  notKept: (what: string): string => `${what}. Not kept: nothing from this run goes into your collection.`,
  lost: (what: string): string => `Lost: ${what}. Only what you get out with is yours.`,
  leftBehind: 'You got out, but what you dropped stayed where you fell.',
  emptyOut: 'You got out with nothing.',
  nothing: 'You found nothing on this run.',
  /** Tile notes. */
  new: 'New',
  spare: 'Spare',
  notKeptTile: 'Not kept',
  lostTile: 'Lost',
} as const;

/**
 * The Settings screen's groups, top to bottom (graphics overhaul G3: William's seven, then the save and the hidden Dev
 * group), each with the line under its name. `hidden`: shown only once the "Dev settings" box under them is ticked
 * (M24). Every earlier tab's rows live on in one of them: Key Bindings under Controls, Crosshair and HUD under Gameplay,
 * the screen rows (fullscreen, field of view, tone mapping, the FPS readout) under Display.
 */
export type SettingsTab = 'graphics' | 'display' | 'audio' | 'controls' | 'gameplay' | 'accessibility' | 'look' | 'save' | 'dev';

export const SETTINGS_TABS: readonly { id: SettingsTab; label: string; blurb: string; hidden?: boolean }[] = [
  { id: 'graphics', label: 'Graphics', blurb: 'Quality, effects, frame rate' },
  { id: 'display', label: 'Display', blurb: 'Screen, field of view, tone' },
  { id: 'audio', label: 'Audio', blurb: 'Volume and voices' },
  { id: 'controls', label: 'Controls', blurb: 'Mouse, keys, aim and sprint' },
  { id: 'gameplay', label: 'Gameplay', blurb: 'Crosshair, HUD, hit feed' },
  { id: 'accessibility', label: 'Accessibility', blurb: 'Colours, motion, sound cues' },
  /** Robots and Realistic colours (graphics overhaul G1). */
  { id: 'look', label: 'Look', blurb: 'Robots, realistic colours' },
  /** The save: download, load, restore points (M31). */
  { id: 'save', label: 'Save file', blurb: 'Download, load, restore' },
  { id: 'dev', label: 'Dev', blurb: 'Switches for testing', hidden: true },
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
  /** Under the Key Bindings: the mouse and the fixed keys. */
  fixedKeys: 'Wheel switches replica (a direction bound above does that instead) · Esc pauses and resumes · ` or F3 shows the debug info',
} as const;

/** Settings not built yet, listed greyed out in their group (label and a short line on what it will do). */
export const SETTINGS_LATER: Readonly<Record<SettingsTab, readonly { label: string; help: string }[]>> = {
  graphics: [],
  display: [],
  audio: [{ label: 'Voices (hit calls)', help: 'Players calling their hits out loud, in a later version.' }],
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
  /** The wallet on the top bar. */
  fc: (fc: number) => `${fc.toLocaleString('en-GB')} FC`,
  tokens: (n: number) => `${n} ${n === 1 ? 'Token' : 'Tokens'}`,
  dev: 'Dev',
  /** The buttons and keys the screens name (no key prompts are drawn along the bottom since M100). */
  hints: {
    back: 'Back',
    start: 'START',
    startMatch: 'Start match',
    startPractice: 'Start practice',
    tutorial: 'Tutorial',
    settings: 'Settings',
    customise: 'Customise',
    shot: '1 Shot',
    resume: 'Resume',
    search: 'Search',
  },
} as const;

/** The title screen's words (M100: a plain title). */
export const TITLE_TEXT = {
  tagline: 'Call your hit. Go again.',
} as const;

/** The Match screen's words (G3: New game in the new look; M100: the screen is Match, Practice its last mode). */
export const PLAY_TEXT = {
  heading: 'Match',
  map: 'Map',
  mode: 'Mode',
  match: 'Match rules',
  matchNote: 'Pick a set of rules; the rows they leave open are yours to change',
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
    blurb: 'The range: targets to shoot at, no bots, no score.',
    mapLine: 'Practice range',
    rules: 'No score, no clock',
    teams: 'On your own',
  },
  /** "Normal bots", "Hard / Normal bots". */
  botsLine: (levels: string) => `${levels} bots`,
  pays: 'Pays Field Credits for the Armory as you play.',
  paysCapped: (cap: number) => `Pays Field Credits for the Armory, at no more than ×${cap}.`,
} as const;

/** The Loadout and Customise screens' layout words (G3), beside LOADOUT_TEXT's. */
export const GEAR_TEXT = {
  carried: 'Carried',
  replicas: 'Your replicas',
  selected: 'Selected',
  asCarried: 'as carried',
  unlockMore: 'Each copy has a rarity tier. Unlock more in the Armory, free for playing.',
  /** The parts fitted, after the tier and the colour. */
  partsFitted: (n: number) => (n === 0 ? 'nothing fitted' : `${n} ${n === 1 ? 'part' : 'parts'} fitted`),
  breadcrumb: 'Loadout',
  /** The part list's own label (a tab list) and the options' count. */
  parts: 'Parts',
  options: (n: number) => `${n} ${n === 1 ? 'option' : 'options'}`,
  none: 'None',
  /** The Colour row (G3, William: picked per replica, first in the list). */
  colour: 'Colour',
  schemes: (n: number) => `${n} schemes`,
  colourNote: 'Two-tone schemes, kept for this replica',
  fixedColours: 'The Cyber Pistol keeps its own colours: no other scheme fits it.',
  appliesTo: 'Applies to',
  ownColour: (other: string, scheme: string) => `Each replica keeps its own colour. Your ${other} is ${scheme}.`,
  realistic: 'Realistic colours',
  realisticOff: (scheme: string, family: string) =>
    `Off. Turn it on in Settings › Look and every replica shows in one real colour instead: ${scheme} shows as ${family}.`,
  realisticOn: (scheme: string, family: string) =>
    `On (Settings › Look): every replica shows in one real colour, so ${scheme} shows as ${family}. Turn it off there to see the schemes.`,
  /** A scheme tile's line under Realistic colours. */
  showsAs: (family: string) => `Shows as ${family}`,
  skinsLater: 'Skins come in a later version.',
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
