import type { SettingsTab } from '../../config/menus';
import { type Asset, type AssetCategory, type PowerType, REPLICA_KEYS } from '../../pool/pool';

/**
 * Small line icons for the menus and the hit feed (audit section 6, item 19): static SVG drawn on a 24-unit grid with
 * the stroke in the text's colour (style.css sizes them). Each is decoration only (`aria-hidden`): the label beside it
 * stays the accessible name. Static strings, so inserting them as HTML is safe (as menuParts.ts does its arrows).
 */
function icon(paths: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/** A shape filled in the text's colour (no outline): the play arrow, the rifle, the star. */
const solid = (d: string): string => `<path d="${d}" fill="currentColor" stroke="none"/>`;

const SLIDERS = icon('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>');
const RIFLE = icon(solid('M1.5 9.5h13l1.6-1.6h5.4v3.2h-3.6l-1.2 1.6h-4.5l-2.4 5.6H6.6l1.2-5.6H1.5z'));
const CRATE = icon('<path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>');
const TARGET = icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>');
const PLAY = icon(solid('M7 4.5l12.5 7.5L7 19.5z'));
const INFO = icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>');

/** The top bar's places (G3), by the place, and the title screen's buttons beside them. */
export const NAV_ICONS = {
  setup: PLAY,
  loadout: RIFLE,
  armory: CRATE,
  range: TARGET,
  settings: SLIDERS,
  tutorial: INFO,
} as const;

/** The menus' small signs (G3): a tick on what is picked, a lock, the search box, Day and Night, an arrow on the way on. */
export const MENU_ICONS = {
  check: icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  lock: icon('<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  search: icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: icon('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  arrowRight: icon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  hand: icon(
    '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V3.5a1.5 1.5 0 0 1 3 0V11M14 11V4.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-6.2-3.8L3.5 13.5a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
  ),
  info: INFO,
  star: icon(solid('M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z')),
  trophy: icon('<path d="M7 3.5h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H3.5v1.5A3.5 3.5 0 0 0 7 10M17 5h3.5v1.5A3.5 3.5 0 0 1 17 10M12 13.5V18M8 21h8M9 18h6"/>'),
  dice: icon('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>'),
  crate: CRATE,
  coin: icon('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>'),
} as const;

/** The mode cards (G3), by the mode. */
export const MODE_ICONS = {
  elimination: icon('<circle cx="12" cy="12" r="8"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/><circle cx="12" cy="12" r="2" fill="currentColor"/>'),
  attackDefend: icon('<path d="M5 22V2.5M5 3h13.5l-3 4.5 3 4.5H5"/>'),
  extraction: icon('<path d="M14 3.5H5v17h9"/><path d="M10 12h11M17 8l4 4-4 4"/>'),
} as const;

/** The Settings groups, by the group. */
export const SETTINGS_TAB_ICONS: Record<SettingsTab, string> = {
  graphics: icon('<path d="M3 17l5-6 4 4 3-3 6 5"/><rect x="2.5" y="3.5" width="19" height="17" rx="1.5"/><circle cx="16" cy="8" r="1.6"/>'),
  display: icon('<rect x="2.5" y="4" width="19" height="12.5" rx="1.5"/><path d="M8 20.5h8M12 16.5v4"/>'),
  audio: icon('<path d="M4 9.5h3.5L12.5 5v14l-5-4.5H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  controls: icon('<rect x="6.5" y="2.5" width="11" height="19" rx="5.5"/><path d="M12 6.5v4"/>'),
  gameplay: icon('<path d="M5 21V3.5M5 4h12l-2.5 4L17 12H5"/>'),
  accessibility: icon('<circle cx="12" cy="4.5" r="2"/><path d="M4 8.5l8 1.5 8-1.5M12 10v4.5l-3.5 7M12 14.5l3.5 7"/>'),
  // A palette: the Look group (G1).
  look: icon(
    '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.4-1.4-1.8-1.4-3.1 0-1 .8-1.8 1.8-1.8h2.4A4.4 4.4 0 0 0 21 9.9C21 6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.3" fill="currentColor"/><circle cx="10" cy="7" r="1.3" fill="currentColor"/><circle cx="15" cy="7" r="1.3" fill="currentColor"/>',
  ),
  // A floppy disk: the save (M31).
  save: icon('<path d="M5 3.5h11l3.5 3.5v13.5h-15z"/><path d="M8 3.5v5h7v-5M8 20.5v-6h8v6"/>'),
  dev: icon('<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5"/>'),
};

/** The pause menu's buttons. */
export const PAUSE_ICONS = {
  resume: PLAY,
  loadout: RIFLE,
  settings: SLIDERS,
  quit: icon('<path d="M14 4.5H6.5v15H14M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5"/>'),
} as const;

/** The title screen's warning (no hardware acceleration). */
export const WARNING_ICON = icon('<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2h.01"/>');

/** The hit feed's tags: a hit on a teammate, a BB that bounced first. */
export const FEED_ICONS = {
  friendly: icon('<circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19.5a5.5 5.5 0 0 1 11 0M14 14.5a4.5 4.5 0 0 1 7 4"/>'),
  ricochet: icon('<path d="M3 6l7 12 4-8 7 6"/><path d="M17.5 16h3.5v-3.5"/>'),
} as const;

/**
 * The Loadout's and the Armory's item tiles (FA13): a line drawing of what the item is, at the top of the tile where a
 * picture belongs (there are no item images). Replicas by their model, power sources by their type, parts by category.
 */
export const ITEM_ICONS = {
  // Side views, muzzle to the right.
  aeg: icon('<path d="M1.5 9H6.5L7.5 10H8.5V8.5H17.5V9.5H22.5V11H17.5V12H15.5L16.5 16.5H14L13 12H9.5L8.3 15.5H6.3L7.3 12H6.5L1.5 13.5Z"/>'),
  pistol: icon('<path d="M4.5 7.5H20V11H12L10.5 17H7L8 11H4.5Z"/><path d="M12 11v1.5a1.5 1.5 0 0 1-1.5 1.5h-.9"/>'),
  battery: icon('<rect x="2.5" y="8.5" width="16" height="7" rx="1.5"/><path d="M18.5 10.5h2.5v3h-2.5M7 12h4M9 10v4"/>'),
  gas: icon('<path d="M8 7.5h8v12a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 19.5z"/><path d="M10.5 7.5v-3h3v3M13.5 5.5h3M8 11.5h8"/>'),
  spring: icon('<path d="M3 12l1.5-4 2 8 2-8 2 8 2-8 2 8 2-8 2 8 1.5-4"/>'),
  optic: icon('<path d="M3.5 9h3l1.5 1.5h8L17.5 9h3v6h-3L16 13.5H8L6.5 15h-3z"/><path d="M10 13.5v3h4v-3"/>'),
  grip: icon('<path d="M6 6.5h12M9 6.5l.5 13a1.5 1.5 0 0 0 1.5 1.5h2a1.5 1.5 0 0 0 1.5-1.5l.5-13"/><path d="M10 11h4M10 14.5h4"/>'),
  laser: icon('<rect x="3" y="9" width="9" height="6" rx="1"/><path d="M12 12h9M17.5 9.5l1.5-1.5M17.5 14.5l1.5 1.5"/>'),
  magazine: icon('<path d="M8.5 3.5h6.5l.5 7 2.5 9.5-6 1.5L9.5 12z"/><path d="M9 7.5h6.2"/>'),
  barrel: icon('<path d="M2.5 10.5h19v3h-19z"/><path d="M6 10.5v3M18 10.5v3"/>'),
  muzzle: icon('<rect x="6" y="8.5" width="13" height="7" rx="2"/><path d="M2.5 12h3.5M19 12h2.5M10 8.5v7M15 8.5v7"/>'),
  // A torch body widening to its head, its beam to the right (M33h).
  light: icon('<path d="M2.5 10.5h7l3-2v7l-3-2h-7z"/><path d="M15 9.5l5.5-2.5M15 12h6.5M15 14.5l5.5 2.5"/>'),
  grenade: icon('<circle cx="12" cy="14.5" r="6"/><path d="M10 8.5V6h4v2.5M14 6.5l3.5-2"/>'),
} as const;

const CATEGORY_ICONS: Readonly<Record<Exclude<AssetCategory, 'replica' | 'power'>, string>> = {
  optic: ITEM_ICONS.optic,
  grip: ITEM_ICONS.grip,
  laser: ITEM_ICONS.laser,
  magazine: ITEM_ICONS.magazine,
  barrel: ITEM_ICONS.barrel,
  muzzle: ITEM_ICONS.muzzle,
  light: ITEM_ICONS.light,
  grenade: ITEM_ICONS.grenade,
};
const POWER_ICONS: Readonly<Record<PowerType, string>> = { battery: ITEM_ICONS.battery, gas: ITEM_ICONS.gas, spring: ITEM_ICONS.spring };

/** The drawing for an item tile: a replica's model (the pistol's, or a rifle), a power source's type, a part's category. */
export function itemIcon(asset: Pick<Asset, 'category' | 'key' | 'power'>): string {
  if (asset.category === 'replica') return REPLICA_KEYS[asset.key]?.look.model === 'pistol' ? ITEM_ICONS.pistol : ITEM_ICONS.aeg;
  if (asset.category === 'power') return POWER_ICONS[asset.power?.type ?? 'battery'];
  return CATEGORY_ICONS[asset.category];
}
