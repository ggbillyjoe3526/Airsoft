import { describe, expect, it, vi } from 'vitest';
import { MatchSession } from './matchSession';
import { LOADOUT } from './config/replicas';
import { createCharacter } from './sim/character';
import { vec3 } from './sim/vec';

/** PF1 QA: the session holds its round while the warm-up's draws are pending (the real session needs a GPU). */
function bare(warm: boolean) {
  const s = Object.create(MatchSession.prototype) as MatchSession;
  const clearLatches = vi.fn();
  const takeClick = vi.fn(() => true);
  const advanceCalls = vi.fn();
  Object.assign(s, {
    warm,
    player: createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0),
    loadout: [],
    combat: { aimRaised: false, aimSensitivityScale: 1 },
    input: { update: vi.fn(), clearLatches, takeClick, takeInspect: advanceCalls, takeOrder: advanceCalls, takePing: advanceCalls },
    skip: null,
  });
  return { s, clearLatches, takeClick, advanceCalls };
}

describe('the round waits for the warm-up (PF1)', () => {
  it('runs no ticks, drops latched clicks and reports warmingUp while the warm-up is pending', () => {
    const f = bare(false);
    expect(f.s.warmingUp).toBe(true);
    expect(f.s.advance(10)).toBe(0);
    expect(f.clearLatches).toHaveBeenCalledTimes(1);
    expect(f.takeClick).not.toHaveBeenCalled();
    expect(f.advanceCalls).not.toHaveBeenCalled();
  });

  it('is not warming up once the warm-up is done', () => {
    expect(bare(true).s.warmingUp).toBe(false);
  });
});
