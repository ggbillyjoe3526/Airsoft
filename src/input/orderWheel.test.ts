import { describe, expect, it } from 'vitest';
import { ORDER_WHEEL } from '../config/squad';
import { WheelPointer, wheelSlice } from './orderWheel';

describe('wheelSlice (M23)', () => {
  it('numbers the slices clockwise from the top', () => {
    expect(wheelSlice(0, -50, 4, 10)).toBe(0); // up
    expect(wheelSlice(50, 0, 4, 10)).toBe(1); // right
    expect(wheelSlice(0, 50, 4, 10)).toBe(2); // down
    expect(wheelSlice(-50, 0, 4, 10)).toBe(3); // left
  });

  it('gives each order an equal slice round its own direction', () => {
    expect(wheelSlice(30, -50, 4, 10)).toBe(0); // up and a little right: still the top
    expect(wheelSlice(50, -49, 4, 10)).toBe(1); // just past the diagonal: the right
    expect(wheelSlice(-50, -51, 4, 10)).toBe(0);
  });

  it('is on nothing within the dead zone', () => {
    expect(wheelSlice(0, 0, 4, 10)).toBe(-1);
    expect(wheelSlice(6, -6, 4, 10)).toBe(-1);
  });
});

describe('WheelPointer (M23)', () => {
  it('starts in the middle, on nothing', () => {
    const w = new WheelPointer();
    expect(w.pick).toBe(-1);
    w.start();
    expect(w.open).toBe(true);
    expect(w.pick).toBe(-1);
  });

  it('stays within reach of the middle, so coming back from a flick is short', () => {
    const w = new WheelPointer();
    w.start();
    w.move(0, -1000);
    expect(w.y).toBeCloseTo(-ORDER_WHEEL.pointerReach);
    expect(w.pick).toBe(0);
    w.move(0, ORDER_WHEEL.pointerReach);
    expect(w.pick).toBe(-1);
  });

  it('points at nothing once closed, and opens again in the middle', () => {
    const w = new WheelPointer();
    w.start();
    w.move(80, 0);
    w.close();
    expect(w.pick).toBe(-1);
    w.start();
    expect(w.x).toBe(0);
  });
});
