import { describe, expect, it, vi } from 'vitest';
import { CombatPresentation } from './combatPresentation';

/**
 * Bug pass BP6a: the start whistle waits for the warm-up (PF1). Round 1 owes its whistle until play starts; while the
 * session holds for the warm-up's draws no tick runs, so the whistle blows once they settle, not as the picture froze.
 * A bare presentation (the real one needs a renderer).
 */
function bare() {
  const c = Object.create(CombatPresentation.prototype) as CombatPresentation;
  const whistle = vi.fn(() => true);
  let settle = (): void => {};
  const warmed = new Promise<void>((done) => (settle = done));
  Object.assign(c, {
    playing: false,
    startWhistleOwed: true,
    holding: false,
    disposed: false,
    sfx: { roundStartWhistle: whistle, setPaused: vi.fn() },
    hud: { setVisible: vi.fn() },
    vaultPrompt: { update: vi.fn() },
    overlay: {},
    magTosses: { warmTargets: () => [] },
    viewmodel: { warmTargets: () => [], withEverySlotShown: (run: () => void) => run() },
    dressing: { warmTargets: () => [] },
    renderer: { warmShaders: () => warmed },
  });
  return { c, whistle, settle };
}

describe('the start whistle waits for the warm-up (bug pass BP6a)', () => {
  it('blows when the held warm-up settles, not when play starts behind it', async () => {
    const f = bare();
    const warm = f.c.warmShaders([], undefined, true);
    f.c.setPlaying(true);
    expect(f.whistle).not.toHaveBeenCalled();
    f.settle();
    await warm;
    expect(f.whistle).toHaveBeenCalledTimes(1);
    // Paused and resumed later: blown once only.
    f.c.setPlaying(false);
    f.c.setPlaying(true);
    expect(f.whistle).toHaveBeenCalledTimes(1);
  });

  it('blows on Play when the warm-up settled first, and never for a session already disposed', async () => {
    const f = bare();
    const warm = f.c.warmShaders([], undefined, true);
    f.settle();
    await warm;
    expect(f.whistle).not.toHaveBeenCalled();
    f.c.setPlaying(true);
    expect(f.whistle).toHaveBeenCalledTimes(1);

    const g = bare();
    const warm2 = g.c.warmShaders([], undefined, true);
    g.c.setPlaying(true);
    (g.c as unknown as { disposed: boolean }).disposed = true;
    g.settle();
    await warm2;
    expect(g.whistle).not.toHaveBeenCalled();
  });
});
