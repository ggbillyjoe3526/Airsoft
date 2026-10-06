import { describe, expect, it } from 'vitest';
import { MENU_TEXT, SETTINGS_TABS } from '../../config/menus';
import { MATCH_MODES } from '../../config/modes';
import { GAME_POOL } from '../../pool/gamePool';
import { FEED_ICONS, ITEM_ICONS, itemIcon, MENU_ICONS, MODE_ICONS, NAV_ICONS, PAUSE_ICONS, SETTINGS_TAB_ICONS, WARNING_ICON } from './icons';

const ALL: string[] = [
  ...Object.values(NAV_ICONS),
  ...Object.values(MENU_ICONS),
  ...Object.values(MODE_ICONS),
  ...Object.values(SETTINGS_TAB_ICONS),
  ...Object.values(PAUSE_ICONS),
  ...Object.values(FEED_ICONS),
  ...Object.values(ITEM_ICONS),
  WARNING_ICON,
];

describe('menu icons (audit section 6, item 19)', () => {
  it('gives every Settings group and every place on the top bar an icon (G3)', () => {
    for (const tab of SETTINGS_TABS) expect(SETTINGS_TAB_ICONS[tab.id]).toMatch(/^<svg /);
    for (const place of MENU_TEXT.nav) expect(NAV_ICONS[place.id]).toMatch(/^<svg /);
    for (const mode of MATCH_MODES) expect(MODE_ICONS[mode.id]).toMatch(/^<svg /);
  });

  it('are decoration only: hidden from screen readers and out of the tab order, so the label stays the name', () => {
    for (const svg of ALL) {
      expect(svg).toMatch(/^<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">/);
      expect(svg.endsWith('</svg>')).toBe(true);
    }
  });

  it('are plain shapes, safe to insert as HTML (no script, handlers or links)', () => {
    for (const svg of ALL) expect(svg).not.toMatch(/<script|\son\w+=|href|<text|<foreignObject/i);
  });
});

describe('item tiles draw what they hold (FA13: the top of each Loadout and Armory tile was empty)', () => {
  const named = (name: string) => GAME_POOL.assets.find((a) => a.name === name)!;

  it('gives every asset in pool.md a drawing', () => {
    for (const asset of GAME_POOL.assets) expect(Object.values(ITEM_ICONS)).toContain(itemIcon(asset));
  });

  it('draws a replica by its model, a power source by its type and a part by its category', () => {
    expect(itemIcon(named('AEG Rifle'))).toBe(ITEM_ICONS.aeg);
    expect(itemIcon(named('Gas Pistol'))).toBe(ITEM_ICONS.pistol);
    expect(itemIcon(named('Standard Battery'))).toBe(ITEM_ICONS.battery);
    expect(itemIcon(named('Green Gas'))).toBe(ITEM_ICONS.gas);
    expect(itemIcon(named('Red Dot'))).toBe(ITEM_ICONS.optic);
    expect(itemIcon(named('Silencer'))).toBe(ITEM_ICONS.muzzle);
    expect(itemIcon({ category: 'power', key: '', power: { type: 'spring' } })).toBe(ITEM_ICONS.spring);
    expect(itemIcon({ category: 'grenade', key: '' })).toBe(ITEM_ICONS.grenade);
    expect(new Set(Object.values(ITEM_ICONS)).size).toBe(Object.keys(ITEM_ICONS).length);
  });
});
