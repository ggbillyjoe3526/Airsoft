import { describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import type { FootstepKind } from '../sim/footsteps';
import { duel } from './testSupport';

describe('bots hear a vault (M102)', () => {
  it('further than any step: quick movement, at the cost of noise (owner, 2026-10-13)', () => {
    expect(BOTS.footstepHearingVault).toBeGreaterThan(BOTS.footstepHearingSprint);
    expect(BOTS.footstepHearingVault).toBeGreaterThan(BOTS.footstepHearingLand);
    expect(BOTS.footstepHearingVault).toBeLessThan(BOTS.hearingDistance);
    const cases: [FootstepKind, number, boolean][] = [
      ['vault', 8, true],
      ['vault', 17, true],
      ['sprint', 17, false],
      ['land', 17, false],
      ['vault', 20, false],
    ];
    for (const [kind, dist, heard] of cases) {
      // The bot faces away: only its ears can tell it.
      const { state, player, bots } = duel(dist, (st) => (st.characters[1]!.yaw += Math.PI));
      state.events.length = 0;
      state.events.push({ type: 'footstep', characterId: player.id, kind });
      bots.observe(state);
      expect(bots.bots[0]!.hasLastKnown, `${kind} at ${dist} m`).toBe(heard);
    }
  });
});
