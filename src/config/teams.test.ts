import { describe, expect, it } from 'vitest';
import { cssColor, TEAM_COLOUR_SETS, type TeamColourSetId } from './teams';

const SETS = Object.entries(TEAM_COLOUR_SETS) as [TeamColourSetId, (typeof TEAM_COLOUR_SETS)[TeamColourSetId]][];

describe('the exit colour of each team colour set (M68, audit UI-15)', () => {
  it('is on every set, as a colour of its own that is neither team’s', () => {
    for (const [id, set] of SETS) {
      expect(Number.isInteger(set.exit) && set.exit > 0 && set.exit <= 0xffffff, id).toBe(true);
      for (const team of [...set.figures, ...set.hud]) expect(set.exit, id).not.toBe(team);
    }
  });

  it('is the green it always was in every set for now (owner, 2026-10-05: until a colour-blind playtester asks)', () => {
    for (const [id, set] of SETS) expect(cssColor(set.exit), id).toBe('#3fcf6a');
  });
});
