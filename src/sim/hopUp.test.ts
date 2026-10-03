import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { AEG, GAS_PISTOL, HOP_UP, hopUpLift, LOADOUT } from '../config/replicas';
import { createArmament, setHopUps } from './armament';
import { hopUpReach } from './hopUp';

describe('hop-up dial', () => {
  it("out of the box, the rifle reaches Depot's longest sightlines (~34 m) without rising more than a hand's width", () => {
    const r = hopUpReach(AEG, AEG.hopUpDial, BALLISTICS);
    expect(r.onTargetTo).toBeGreaterThanOrEqual(34);
    expect(r.peakRise).toBeGreaterThan(0.03); // a gentle rise, as a well-set hop gives
    expect(r.peakRise).toBeLessThan(HOP_UP.onTargetBand);
  });

  it('out of the box, the pistol is a sidearm: on target to 20-30 m, well short of the rifle', () => {
    const r = hopUpReach(GAS_PISTOL, GAS_PISTOL.hopUpDial, BALLISTICS);
    expect(r.onTargetTo).toBeGreaterThan(20);
    expect(r.onTargetTo).toBeLessThan(30);
    expect(r.onTargetTo).toBeLessThan(hopUpReach(AEG, AEG.hopUpDial, BALLISTICS).onTargetTo - 5);
  });

  it('more hop carries the BB further until it is over-hopped: then it rises out of the band and floats', () => {
    for (const replica of LOADOUT) {
      const none = hopUpReach(replica, 0, BALLISTICS);
      const factory = hopUpReach(replica, replica.hopUpDial, BALLISTICS);
      const full = hopUpReach(replica, HOP_UP.maxDial, BALLISTICS);
      expect(factory.onTargetTo, replica.id).toBeGreaterThan(none.onTargetTo + 8);
      expect(none.peakRise, replica.id).toBeLessThan(0.01); // no backspin: it only falls
      expect(full.peakRise, replica.id).toBeGreaterThan(0.4); // turned right up: well over the aim
      expect(full.onTargetTo, replica.id).toBeLessThan(factory.onTargetTo);
    }
  });

  it('turns the dial into lift, kept within the dial range', () => {
    expect(hopUpLift(AEG, 0.5)).toBeCloseTo(AEG.hopUpMax / 2, 12);
    expect(hopUpLift(AEG, 2)).toBe(AEG.hopUpMax);
    expect(hopUpLift(AEG, -1)).toBe(0);
  });

  it('is set per replica on the armament, starting at the factory dials', () => {
    const a = createArmament(LOADOUT);
    expect(a.hopUps).toEqual(LOADOUT.map((r) => r.hopUpDial));
    setHopUps(a, [0.9, Number.NaN]);
    expect(a.hopUps).toEqual([0.9, GAS_PISTOL.hopUpDial]); // garbage is ignored
    setHopUps(a, [1.5]);
    expect(a.hopUps[0]).toBe(HOP_UP.maxDial);
  });
});
