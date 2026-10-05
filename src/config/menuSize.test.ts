import { describe, expect, it } from 'vitest';
import { HUD_SIZE, hudScale, MENU_SIZE, menuScale } from './matchInfo';

/** The audit's own step (UI-12), for when the owner turns the menus' scaling on in Beta. */
const AUDIT_STEP = { referenceHeight: 1080, maxAuto: 1.4 };

describe("the menus' size step (M68, audit UI-12)", () => {
  const SMALL_WINDOWS = [360, 480, 600, 720, 768, 900, 1000, 1080];

  it('changes nothing at 1080 px high or below, with the data as shipped and with a raised cap', () => {
    for (const h of SMALL_WINDOWS) {
      expect(menuScale(h), `${h}`).toBe(1);
      expect(menuScale(h, AUDIT_STEP), `${h}`).toBe(1);
    }
  });

  it('reads the HUD size rule: the same reference height, growing from the window height and never below 1', () => {
    expect(MENU_SIZE.referenceHeight).toBe(HUD_SIZE.referenceHeight);
    const hudData = { referenceHeight: HUD_SIZE.referenceHeight, maxAuto: HUD_SIZE.maxAuto };
    for (const h of [...SMALL_WINDOWS, 1200, 1440, 1800, 2160, 4320]) expect(menuScale(h, hudData), `${h}`).toBe(hudScale(1, h));
  });

  it('grows a taller window up to the cap once the cap is above 1, and no further', () => {
    expect(menuScale(1440, AUDIT_STEP)).toBeCloseTo(1.333, 3);
    expect(menuScale(2160, AUDIT_STEP)).toBe(1.4);
    expect(menuScale(4320, AUDIT_STEP)).toBe(1.4);
  });

  it('is off for now (owner, 2026-10-05: nothing until Beta): a 4K window is still 1', () => {
    expect(MENU_SIZE.maxAuto).toBe(1);
    expect(menuScale(2160)).toBe(1);
  });
});
