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
  },
  /** Read out on a change, for a screen reader and for anyone who can't tell the colours apart. */
  better: 'better than as it comes',
  worse: 'worse than as it comes',
} as const;

/** The Armory's words (M26c): completely free, beta. Numbers come from pool.md. */
export const ARMORY_TEXT = {
  beta: 'Beta',
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
  odds: 'Odds per asset',
  scrap: 'Scrap',
  scrapAll: 'Scrap all spares',
  keepOne: 'Scrapping keeps one copy of everything, so nothing equipped is ever lost.',
  dispensed: 'Last Shot',
  collection: 'Your collection',
  new: 'New',
  spare: 'Spare',
  /** A rarer copy of a replica you never picked goes straight into its Loadout slot. */
  nowEquipped: 'Now equipped',
  /** The setup tile's line under the balance. */
  tileDetail: 'Free gear for playing.',
  /** Dev settings → Disable Armory (M26d). */
  off: 'The Armory is switched off in the Dev settings.',
  /** The match summary's line. */
  earned: 'Field Credits earned',
} as const;

export type SettingsTab = 'controls' | 'keys' | 'graphics' | 'crosshair' | 'hud' | 'audio' | 'accessibility' | 'dev';

/**
 * The Settings screen's tabs, top to bottom. `later`: nothing on it is built yet. `hidden`: shown only once the
 * "Dev settings" box under the tabs is ticked (M24).
 */
export const SETTINGS_TABS: readonly { id: SettingsTab; label: string; later: boolean; hidden?: boolean }[] = [
  { id: 'controls', label: 'Controls', later: false },
  { id: 'keys', label: 'Key Bindings', later: false },
  { id: 'graphics', label: 'Graphics', later: false },
  { id: 'crosshair', label: 'Crosshair', later: false },
  { id: 'hud', label: 'HUD', later: false },
  { id: 'audio', label: 'Audio', later: false },
  { id: 'accessibility', label: 'Accessibility', later: false },
  { id: 'dev', label: 'Dev', later: false, hidden: true },
];

/** The box under the Settings tabs that shows the Dev tab (M24). */
export const DEV_TOGGLE_LABEL = 'Dev settings';

/** Settings not built yet, listed greyed out on their tab (label and a short line on what it will do). */
export const SETTINGS_LATER: Readonly<Record<SettingsTab, readonly { label: string; help: string }[]>> = {
  controls: [],
  keys: [],
  graphics: [],
  crosshair: [],
  hud: [],
  audio: [{ label: 'Voices (hit calls)', help: '' }],
  accessibility: [],
  dev: [],
};
