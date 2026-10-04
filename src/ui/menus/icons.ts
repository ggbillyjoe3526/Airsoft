import type { SettingsTab } from '../../config/menus';

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
