import { describe, expect, it } from 'vitest';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { heardReplicas } from './combatPresentation';

const who = (id: number, loadout: Parameters<typeof createCharacter>[3]) => createCharacter(id, vec3(), 0, loadout, id === 0 ? 0 : 1);

describe('M32 acceptance 7: every replica a character carries has its sounds', () => {
  it("lists the player's replicas first, as carried, then each other replica once, by id", () => {
    const player = who(0, [AEG, GAS_PISTOL]);
    const bot = who(1, [CYBER_PISTOL, GAS_PISTOL]);
    const other = who(2, [CYBER_PISTOL, AEG]);
    const heard = heardReplicas([AEG, GAS_PISTOL], [player, bot, other]);
    expect(heard.map((r) => r.id)).toEqual(['aeg', 'pistol', 'cyber']);
    expect(heard.slice(0, 2)).toEqual([AEG, GAS_PISTOL]);
    expect(heard[2]).toBe(CYBER_PISTOL);
  });

  it("includes a bot's replica even when the player carries something else (the AEG left at home)", () => {
    const player = who(0, [GAS_PISTOL]);
    const bot = who(1, [CYBER_PISTOL, AEG]);
    // Without the other characters the Cyber Pistol would shoot silently.
    expect(heardReplicas([GAS_PISTOL], []).map((r) => r.id)).toEqual(['pistol']);
    expect(heardReplicas([GAS_PISTOL], [player, bot]).map((r) => r.id)).toEqual(['pistol', 'cyber', 'aeg']);
  });

  it('adds nothing when everyone carries what the player does, and does not change what it is given', () => {
    const loadout = [AEG, GAS_PISTOL];
    const heard = heardReplicas(loadout, [who(0, loadout), who(1, loadout), who(2, loadout)]);
    expect(heard).toEqual(loadout);
    expect(heard).not.toBe(loadout);
    expect(loadout).toEqual([AEG, GAS_PISTOL]);
  });
});
