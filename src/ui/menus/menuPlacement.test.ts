import { describe, expect, it } from 'vitest';
import { type Box, placeMenu } from './menuPlacement';

/** Where a pop-up menu goes (M100): at the pointer, flipped to stay in the window, never over what it is about. */
const W = 1280;
const H = 720;
const MENU = { w: 220, h: 130 };
const at = (x: number, y: number, avoid: readonly Box[] = []): { left: number; top: number } => placeMenu(x, y, MENU.w, MENU.h, W, H, avoid);
const overlaps = (p: { left: number; top: number }, a: Box): boolean => p.left < a.right && p.left + MENU.w > a.left && p.top < a.bottom && p.top + MENU.h > a.top;

describe('placeMenu', () => {
  it('puts the corner at the pointer, below and to the right of it, when there is room', () => {
    expect(at(300, 200)).toEqual({ left: 300, top: 200 });
  });

  it('flips to the left of the pointer at the right edge, and above it at the bottom, instead of sliding over it', () => {
    expect(at(1200, 200)).toEqual({ left: 980, top: 200 });
    expect(at(300, 650)).toEqual({ left: 300, top: 520 });
    expect(at(1270, 715)).toEqual({ left: 1052, top: 582 });
  });

  it('stays at least 8 px inside the window even where no flip fits', () => {
    expect(at(-50, 2)).toEqual({ left: 8, top: 8 });
    expect(placeMenu(5, 5, 300, 300, 200, 200)).toEqual({ left: 8, top: 8 });
  });

  it('drops under a box it must not cover (the card\'s name) when the pointer is on it', () => {
    const name: Box = { left: 84, top: 440, right: 190, bottom: 456 };
    const p = at(100, 448, [name]);
    expect(overlaps(p, name)).toBe(false);
    expect(p).toEqual({ left: 100, top: 460 });
  });

  it('drops under every box at once, the spare count with the name', () => {
    const boxes: Box[] = [{ left: 84, top: 440, right: 190, bottom: 456 }, { left: 200, top: 300, right: 260, bottom: 330 }];
    const p = at(100, 320, boxes);
    expect(boxes.some((b) => overlaps(p, b))).toBe(false);
  });

  it('flips left and under the box at the right edge, so it is in the window and off the name', () => {
    const name: Box = { left: 1647, top: 440, right: 1730, bottom: 456 };
    const p = placeMenu(1732, 452, MENU.w, MENU.h, 1920, 1080, [name]);
    expect(overlaps(p, name)).toBe(false);
    expect(p.left + MENU.w).toBeLessThanOrEqual(1920 - 8);
    expect(p.top).toBeGreaterThanOrEqual(456);
  });

  it('goes above the box when there is no room under it', () => {
    const name: Box = { left: 84, top: 600, right: 190, bottom: 616 };
    const p = at(100, 608, [name]);
    expect(overlaps(p, name)).toBe(false);
    expect(p.top + MENU.h).toBeLessThanOrEqual(600);
  });

  it('keeps inside the window when a box leaves no free place at all', () => {
    const all: Box = { left: 0, top: 0, right: W, bottom: H };
    const p = at(500, 300, [all]);
    expect([p.left, p.top]).toEqual([500, 300]);
  });
});
