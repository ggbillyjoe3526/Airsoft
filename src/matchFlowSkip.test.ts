import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUNDS } from './config/hits';
import { HUD_TEXT } from './config/hudText';
import { SIM_DT, SKIP_ROUND } from './config/sim';
import { idleCommand, skipEnds, skipOffer, skipTickCap, skipTickShown } from './matchFlow';
import { type Character, createCharacter } from './sim/character';
import { createCommand } from './sim/commands';
import type { GameEvent } from './sim/events';
import { createRoundState, longestOvertime, type RoundRules } from './sim/round';
import { spectatingText } from './ui/hitFeedback';
import { type EventNode, stubMenuPage } from './ui/menus/menuTestSupport';
import { PauseScreen } from './ui/menus/pauseScreen';

const rules = ROUNDS as unknown as RoundRules;
const out = (status: Character['status']): Character => ({ ...createCharacter(0, { x: 0, y: 0, z: 0 }, 0), status });

describe('Skip to next round: where it is offered (M83)', () => {
  it('is offered once you are out and spectating a live Elimination or Attack / Defend round', () => {
    for (const mode of ['elimination', 'attackDefend'] as const) {
      const round = createRoundState(rules, mode, { x: 0, y: 0, z: 0 });
      for (const s of ['walkingOff', 'leaving', 'out'] as const) expect(skipOffer(round, rules, out(s)), `${mode} ${s}`).toBe('round');
    }
  });

  it('is not offered while you are still in play or calling your hit', () => {
    const round = createRoundState(rules, 'elimination');
    expect(skipOffer(round, rules, out('alive'))).toBeNull();
    expect(skipOffer(round, rules, out('calling'))).toBeNull();
  });

  it('is not offered between rounds (the next one starts in seconds) nor once the match is decided', () => {
    const round = createRoundState(rules, 'elimination');
    round.phase = 'over';
    expect(skipOffer(round, rules, out('out'))).toBeNull();
    round.phase = 'matchOver';
    expect(skipOffer(round, rules, out('out'))).toBeNull();
  });

  it('is never offered in Extraction: a hit runner is back at the insertion, or the run is over', () => {
    const round = createRoundState(rules, 'extraction');
    expect(skipOffer(round, rules, out('out'))).toBeNull();
  });

  it('skips to the result when this round could decide the match, for either team (the last round, or match point)', () => {
    const round = createRoundState(rules, 'elimination');
    const last = rules.winsNeeded - 1;
    round.score = [last, 0];
    expect(skipOffer(round, rules, out('out'))).toBe('result');
    round.score = [0, last];
    expect(skipOffer(round, rules, out('out'))).toBe('result');
    round.score = [last - 1, last - 1];
    expect(skipOffer(round, rules, out('out'))).toBe('round');
    // Win by two (M39): level at match point, one more win doesn't take it.
    const byTwo = { ...rules, winBy: 2 };
    round.score = [last, last];
    expect(skipOffer(round, byTwo, out('out'))).toBe('round');
    round.score = [last + 1, last];
    expect(skipOffer(round, byTwo, out('out'))).toBe('result');
  });
});

describe('Skip to next round: how it runs (M83)', () => {
  const ev = (...types: GameEvent['type'][]): GameEvent[] => types.map((type) => ({ type }) as GameEvent);

  it('ends on the tick the next round starts or the match is decided, and on no other', () => {
    expect(skipEnds(ev('roundStart'))).toBe(true);
    expect(skipEnds(ev('roundOver', 'matchOver'))).toBe(true);
    expect(skipEnds(ev('roundOver'))).toBe(false);
    expect(skipEnds(ev('shot', 'characterHit', 'bbImpact'))).toBe(false);
    expect(skipEnds([])).toBe(false);
  });

  it('shows only the round ending and the next one starting (the banner, the feed, the view reset); the rest runs unseen', () => {
    for (const t of ['roundOver', 'roundStart', 'matchOver'] as const) expect(skipTickShown(ev(t)), t).toBe(true);
    expect(skipTickShown(ev('shot', 'characterHit', 'bbImpact', 'footstep' as GameEvent['type']))).toBe(false);
  });

  it('gives up only after the longest the rest of a round and the pause after it can take, plus a margin', () => {
    const cap = skipTickCap(rules);
    const longest = (rules.roundTime + longestOvertime(rules) + rules.resetDelay) / SIM_DT;
    expect(cap).toBeGreaterThan(longest);
    expect(cap).toBeLessThanOrEqual(longest + Math.ceil(SKIP_ROUND.spareSeconds / SIM_DT) + 1);
    // A custom round time (M39) moves the cap with it.
    expect(skipTickCap({ ...rules, roundTime: 60 })).toBeLessThan(cap);
  });

  it('works through the round in slices of a frame, so the page keeps drawing', () => {
    expect(SKIP_ROUND.frameBudgetMs).toBeGreaterThan(0);
    expect(SKIP_ROUND.frameBudgetMs).toBeLessThanOrEqual(33);
    expect(SKIP_ROUND.ticksPerCheck).toBeGreaterThanOrEqual(1);
  });

  it("holds nothing on the player's command while skipping (you are out: nothing reads it), in place", () => {
    const cmd = createCommand();
    Object.assign(cmd, { forward: 1, right: -1, fire: true, sprint: true, aim: true, reload: true, switchTo: 1, use: true, lean: 1 });
    idleCommand(cmd, 1.2, -0.3);
    expect(cmd).toEqual({ ...createCommand(), yaw: 1.2, pitch: -0.3 });
  });
});

describe('Skip to next round on screen (M83)', () => {
  it('the spectating line says how to skip, and says so while the round is played out', () => {
    expect(spectatingText('Blue 2', 'Left click', null)).toBe('Spectating Blue 2 · Left click for next');
    expect(spectatingText('Blue 2', 'Left click', 'round')).toBe(`Spectating Blue 2 · Left click for next · ${HUD_TEXT.skip.round}`);
    expect(spectatingText('Blue 2', '', 'result')).toBe(`Spectating Blue 2 · ${HUD_TEXT.skip.result}`);
    expect(spectatingText('', 'Left click', 'skipping')).toBe(HUD_TEXT.skip.skipping);
    expect(spectatingText('', 'Left click', 'round')).toBe('');
  });

  describe('the pause menu', () => {
    beforeEach(() => stubMenuPage());
    afterEach(() => vi.unstubAllGlobals());
    const noop = (): void => {};
    const shownButtons = (p: PauseScreen): string[] => (p.root as unknown as EventNode).all('button').filter((b) => !b.hidden).map((b) => b.text);

    it('has the button only where the skip applies, named by what it skips to, and it calls back', () => {
      let skipped = 0;
      const pause = new PauseScreen({ onResume: noop, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop, onSkipRound: () => skipped++, onChallenge: noop, onFullscreen: noop });
      expect(shownButtons(pause)).not.toContain(HUD_TEXT.skipButton.round);
      pause.setSkip('round');
      expect(shownButtons(pause)).toContain('Skip to next round');
      pause.setSkip('result');
      expect(shownButtons(pause)).toContain('Skip to the result');
      (pause.root as unknown as EventNode).all('button').find((b) => b.text === 'Skip to the result')!.click();
      expect(skipped).toBe(1);
      pause.setSkip(null);
      expect(shownButtons(pause).filter((t) => t.startsWith('Skip to'))).toEqual([]);
    });
  });
});
