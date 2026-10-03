import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { AEG, BB_WEIGHT, GAS_PISTOL, HOP_UP, hopUpLift, LOADOUT } from '../config/replicas';
import { createArmament, setHopUps } from './armament';
import { bestHopUp, flightTime, hopUpReach } from './hopUp';

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

describe('BB weight', () => {
  // Each weight flown with the hop-up set for it, as a player would.
  const flown = (replica: (typeof LOADOUT)[number]) =>
    BB_WEIGHT.choices.map((grams) => {
      const best = bestHopUp(replica, BALLISTICS, grams);
      return { grams, ...best, t10: flightTime(replica, best.dial, 10, BALLISTICS, grams), t20: flightTime(replica, best.dial, 20, BALLISTICS, grams) };
    });

  it('is a trade-off: a lighter BB always gets to 10 and 20 m sooner, a heavier one carries at least as far once hopped', () => {
    for (const replica of LOADOUT) {
      const w = flown(replica);
      for (let i = 1; i < w.length; i++) {
        expect(w[i]!.t10, `${replica.id} ${w[i]!.grams} g`).toBeGreaterThan(w[i - 1]!.t10);
        expect(w[i]!.t20, `${replica.id} ${w[i]!.grams} g`).toBeGreaterThan(w[i - 1]!.t20);
      }
    }
  });

  it('never offers a weight that a lighter one beats outright: each heavier one carries further, even at full hop', () => {
    for (const replica of LOADOUT) {
      const w = flown(replica);
      for (let i = 1; i < w.length; i++) expect(w[i]!.onTargetTo, `${replica.id} ${w[i]!.grams} g`).toBeGreaterThan(w[i - 1]!.onTargetTo);
    }
  });
});
