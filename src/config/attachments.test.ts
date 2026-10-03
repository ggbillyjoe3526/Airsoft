import { describe, expect, it } from 'vitest';
import { factoryParts, GRIP_CHOICES, GRIPS, type GripId, handlingOf, MAGAZINES, partsFor } from './attachments';
import { AEG, GAS_PISTOL, LOADOUT } from './replicas';

describe('attachments', () => {
  it('leave a replica as it comes with its factory parts (no grip, standard magazine)', () => {
    for (const r of LOADOUT) {
      const h = handlingOf(r, factoryParts(r));
      expect(h).toEqual({ magSize: r.magSize, mags: r.mags, reloadTime: r.reloadTime, drawTime: r.drawTime, raiseScale: 1, shakeScale: 1, rattles: false });
    }
  });

  it('fit only what a replica takes: no grip on the pistol, only magazines made for it', () => {
    expect(partsFor(GAS_PISTOL, { grip: 'vertical', magazine: 'hiCap' })).toEqual({ grip: 'none', magazine: 'standard' });
    expect(partsFor(GAS_PISTOL, { magazine: 'extended' })).toEqual({ grip: 'none', magazine: 'extended' });
    expect(partsFor(AEG, { grip: 'angled', magazine: 'extended' })).toEqual({ grip: 'angled', magazine: 'standard' });
    expect(partsFor(AEG, { grip: 'bogus' as GripId })).toEqual(factoryParts(AEG));
  });

  it('are trade-offs: every grip and magazine is better than the factory part at something and worse at something', () => {
    const better = (a: number, b: number) => a < b - 1e-9;
    for (const id of GRIP_CHOICES.map((g) => g.id).filter((g) => g !== 'none')) {
      const g = GRIPS[id];
      const gains = [better(g.handlingScale, 1), better(g.shakeScale, 1)];
      const costs = [better(1, g.handlingScale), better(1, g.shakeScale)];
      expect(gains.some(Boolean) && costs.some(Boolean), id).toBe(true);
    }
    // Magazines, by what they mean in play: BBs before a reload, BBs in all, reload and draw time, and noise.
    for (const r of LOADOUT) {
      const base = handlingOf(r, factoryParts(r));
      for (const id of r.magazines.slice(1)) {
        const h = handlingOf(r, { grip: 'none', magazine: id });
        const gains = [h.magSize > base.magSize, h.magSize * h.mags > base.magSize * base.mags, h.reloadTime < base.reloadTime, h.drawTime < base.drawTime];
        const costs = [h.magSize < base.magSize, h.magSize * h.mags < base.magSize * base.mags, h.reloadTime > base.reloadTime, h.drawTime > base.drawTime, h.rattles];
        expect(gains.some(Boolean) && costs.some(Boolean), `${r.id} ${id}`).toBe(true);
      }
    }
  });

  it("matches the roadmap's first guesses: hi-cap more per magazine but fewer carried, low-cap one more carried, extended slower to draw", () => {
    const std = handlingOf(AEG, factoryParts(AEG));
    const hi = handlingOf(AEG, { grip: 'none', magazine: 'hiCap' });
    expect(hi.magSize).toBeGreaterThan(std.magSize);
    expect(hi.mags).toBeLessThan(std.mags);
    expect(hi.rattles).toBe(true);
    const low = handlingOf(AEG, { grip: 'none', magazine: 'lowCap' });
    expect(low.magSize).toBeLessThan(std.magSize);
    expect(low.mags).toBe(std.mags + 1);
    expect(low.rattles).toBe(false);
    const ext = handlingOf(GAS_PISTOL, { grip: 'none', magazine: 'extended' });
    expect(ext.magSize).toBeGreaterThan(GAS_PISTOL.magSize);
    expect(ext.drawTime).toBeGreaterThan(GAS_PISTOL.drawTime);
    expect(Object.values(MAGAZINES).filter((m) => m.rattles)).toHaveLength(1); // only the hi-cap rattles
  });

  it('give the vertical grip steadiness and the angled grip quicker handling, small either way', () => {
    expect(GRIPS.vertical.shakeScale).toBeLessThan(1);
    expect(GRIPS.angled.handlingScale).toBeLessThan(1);
    for (const g of Object.values(GRIPS)) {
      expect(g.handlingScale).toBeGreaterThan(0.6);
      expect(g.handlingScale).toBeLessThan(1.4);
      expect(g.shakeScale).toBeGreaterThan(0.5);
      expect(g.shakeScale).toBeLessThan(1.5);
    }
    expect(handlingOf(AEG, { grip: 'angled', magazine: 'standard' }).drawTime).toBeLessThan(AEG.drawTime);
  });
});
