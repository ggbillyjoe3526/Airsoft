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

const GEAR = icon(
  '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>',
);
const BACKPACK = icon('<path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><rect x="5" y="6" width="14" height="15" rx="3"/><path d="M9 13h6M9 13v3"/>');

/** New game's tiles, by the tile. */
export const SETUP_ICONS = {
  map: icon('<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>'),
  mode: icon('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  match: icon('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M10 2.5h4M12 2.5V6"/>'),
  difficulty: icon('<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.2"/>'),
  loadout: BACKPACK,
  armory: icon('<path d="M3.5 8L12 3.5 20.5 8v8L12 20.5 3.5 16z"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5v8"/>'),
  settings: GEAR,
} as const;

/** The Settings tabs, by the tab. */
export const SETTINGS_TAB_ICONS: Record<SettingsTab, string> = {
  controls: icon('<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 3v6.5M6.5 9.5h11"/>'),
  keys: icon('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>'),
  graphics: icon('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>'),
  crosshair: icon('<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>'),
  hud: icon('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M6.5 7.5h3M14.5 16.5h3M10 7.5h4"/>'),
  audio: icon('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  accessibility: icon('<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M12 14.5l-3.5 6M12 14.5l3.5 6"/>'),
  // A paint swatch fan: the Look tab (G1).
  look: icon('<path d="M5 20.5l9-15.5 3.5 2-9 15.5z"/><path d="M8.5 22.5h12v-4h-9.7M7 17.5h.01"/>'),
  // A floppy disk: the save (M31).
  save: icon('<path d="M4.5 3.5h12l3 3v13a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M7.5 3.5v5h8v-5M7.5 20.5v-6h9v6"/>'),
  dev: icon('<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5"/>'),
};

/** The pause menu's buttons. */
export const PAUSE_ICONS = {
  resume: icon('<path d="M7 4.5v15l12-7.5z"/>'),
  loadout: BACKPACK,
  settings: GEAR,
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
