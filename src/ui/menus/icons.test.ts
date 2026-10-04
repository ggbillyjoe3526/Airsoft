import { describe, expect, it } from 'vitest';
import { SETTINGS_TABS } from '../../config/menus';
import { FEED_ICONS, PAUSE_ICONS, SETTINGS_TAB_ICONS, SETUP_ICONS, WARNING_ICON } from './icons';

const ALL = [...Object.values(SETUP_ICONS), ...Object.values(SETTINGS_TAB_ICONS), ...Object.values(PAUSE_ICONS), ...Object.values(FEED_ICONS), WARNING_ICON];

describe('menu icons (audit section 6, item 19)', () => {
  it('gives every Settings tab an icon', () => {
    for (const tab of SETTINGS_TABS) expect(SETTINGS_TAB_ICONS[tab.id]).toMatch(/^<svg /);
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
