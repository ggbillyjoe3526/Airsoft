import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, REBINDABLE } from '../config/controls';
import { GAME_POOL } from '../pool/gamePool';
import type { CaseFind } from '../sim/extraction';
import { DROPPED_LINE, foundLine, itemName, openingLine, promptLine } from './casePrompt';
import { carriedNote, haulWhat } from './runStatus';

const grip = GAME_POOL.assets.find((a) => a.category === 'grip')!;
const part: CaseFind = { fc: 120, resupply: false, item: { asset: grip.id, tier: 'epic' } };

describe("Extraction's case prompt (M44)", () => {
  it('says which key opens the case beside you, and what is being opened', () => {
    expect(promptLine({ name: 'Field case', dropped: false }, 'G')).toBe('Hold G to open the field case');
    expect(promptLine({ name: "Marshal's locker", dropped: false }, 'G')).toBe("Hold G to open the marshal's locker");
    expect(promptLine({ name: 'Dropped case', dropped: true }, 'H')).toBe('Hold H to pick up what you dropped');
    expect(openingLine({ name: 'Ammo can', dropped: false })).toBe('Opening the ammo can');
    expect(openingLine({ name: 'Dropped case', dropped: true })).toBe('Picking up what you dropped');
  });

  it('says what a case held: its part by tier and name, its FC, a resupply', () => {
    expect(itemName(GAME_POOL, part.item!)).toBe(`Epic ${grip.name}`);
    expect(foundLine({ dropped: false, finds: [part] })).toBe(`Epic ${grip.name} · +120 FC`);
    expect(foundLine({ dropped: false, finds: [{ fc: 0, resupply: true, item: null }] })).toBe('BB resupply · magazines topped up');
    expect(foundLine({ dropped: true, finds: [part, { fc: 30, resupply: false, item: null }] })).toBe('Picked up 150 FC and 1 part');
    expect(DROPPED_LINE).toMatch(/go back for it/);
  });

  it('shows what you carry beside the respawn note, and nothing when your hands are empty', () => {
    expect(carriedNote([])).toBe('');
    expect(carriedNote([part, { fc: 25, resupply: false, item: null }])).toBe('Carrying 145 FC and 1 part');
    expect(haulWhat({ fc: 0, items: [1, 2] })).toBe('2 parts');
    expect(haulWhat({ fc: 1600, items: [] })).toBe('1,600 FC');
  });

  it('opens cases on a key of its own, G by default, rebindable on Key Bindings', () => {
    expect(DEFAULT_BINDINGS.use).toEqual(['KeyG']);
    expect(REBINDABLE.some((r) => r.action === 'use')).toBe(true);
    const taken = Object.entries(DEFAULT_BINDINGS).filter(([a, keys]) => a !== 'use' && (keys as readonly string[]).includes('KeyG'));
    expect(taken).toEqual([]);
  });
});
