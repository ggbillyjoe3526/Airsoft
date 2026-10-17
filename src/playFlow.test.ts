import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevSettings } from './config/dev';
import { DEFAULT_TEAM_COLOURS } from './config/teams';
import { type Loaded, PlayFlow, type PlayParts, playMenus } from './playFlow';

/**
 * The play flow (DX8): play, enter, resume, pause, stop and leave, the round skipped without the mouse and the graphics
 * context's loss, on stand-in parts and sessions (a session needs a page to build, so these play one already loaded, as
 * Play does when it reuses one). What Play decides is core/sessionPlan.ts's (sessionPlan.test.ts).
 */

/** A match (or the range) as the flow sees it: what it calls is recorded, `phase` and the skip are set by the test. */
function stubSession(kind: 'match' | 'range' = 'match') {
  const round = { phase: 'live' as string };
  return {
    kind,
    state: { round },
    skipping: false,
    skipOffer: null as 'round' | 'result' | null,
    status: 'range status',
    coaching: false,
    challengeOffer: null as boolean | null,
    player: { armament: { active: 0 } },
    combat: { unlockAudio: vi.fn(), setBbPaths: vi.fn(), setReplicaPictures: vi.fn() },
    setPlaying: vi.fn(),
    setDevCheats: vi.fn(),
    contextRestored: vi.fn(),
    dispose: vi.fn(),
    beginSkip: vi.fn(() => true),
    pauseLine: () => 'match status',
    resultView: () => ({ headline: 'You won', scoreLine: '5–3' }),
    takeTutorialComplete: () => false,
    takeTutorialFinished: () => false,
  };
}

function stubParts(over: Partial<{ crashed: boolean }> = {}) {
  const pointer = { locked: false, request: vi.fn(() => Promise.resolve()), release: vi.fn(), setUnlockedButtons: vi.fn() };
  const keyboard = { capturing: false, releaseAll: vi.fn(), endFrame: vi.fn() };
  const menus = {
    screen: 'title',
    hide: vi.fn(),
    showPause: vi.fn(),
    showResult: vi.fn(),
    showHint: vi.fn(),
    showTutorialComplete: vi.fn(),
    showPracticeLoadout: vi.fn(),
    setBlocked: vi.fn(),
    updatePause: vi.fn(),
    markTutorialDone: vi.fn(),
  };
  const results = { settle: vi.fn(), summary: vi.fn(() => ({ summary: true })) };
  const hooks = { built: vi.fn(), resumed: vi.fn() };
  const parts = {
    container: { style: { setProperty: vi.fn() } },
    renderer: {},
    input: { clearLatches: vi.fn() },
    keyboard,
    pointer,
    menus,
    audio: {},
    prefs: { teamColours: DEFAULT_TEAM_COLOURS },
    pictures: {},
    setup: { setupChanged: false, loadoutChanged: false, loadout: { gearSlotOf: () => 'primary' } },
    results,
    playPrompt: { show: vi.fn(), hide: vi.fn(), dispose: vi.fn() },
    graphicsNotice: { setVisible: vi.fn(), dispose: vi.fn() },
    seed: 7,
    allowUnlocked: true,
    perfLog: false,
    dev: () => ({}) as DevSettings,
    quality: () => ({}),
    crashed: () => over.crashed === true,
    ...hooks,
  };
  return { parts, pointer, keyboard, menus, results, hooks };
}

/** A flow with a session loaded and play begun on it (a match by Play, as `?nolock` plays it: no lock to wait for). */
function playing(kind: 'match' | 'range' = 'match', over: Partial<{ crashed: boolean }> = {}) {
  const stubs = stubParts(over);
  const flow = new PlayFlow(stubs.parts as unknown as PlayParts);
  const session = stubSession(kind);
  flow.session = session as unknown as Loaded;
  if (kind === 'match') {
    flow.newGamePlay();
  } else {
    // Play on the title would build a range (its code fetched); Resume on the one loaded is the same from here.
    flow.unlockedPlay = true;
    flow.resume();
  }
  return { ...stubs, flow, session };
}

beforeEach(() => {
  // The lock's drop reads whether the page is in front (core/escSkip.ts).
  vi.stubGlobal('document', { visibilityState: 'visible', hasFocus: () => true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlayFlow: play and resume (DX8)', () => {
  it('Play reuses the match already built and resumes it: keys captured, menus hidden, the session playing', () => {
    const { flow, session, keyboard, menus, pointer, hooks } = playing();
    expect(session.combat.unlockAudio).toHaveBeenCalledOnce();
    expect(pointer.setUnlockedButtons).toHaveBeenCalledWith(true);
    expect(flow.unlockedPlay).toBe(true);
    expect(flow.inPlay).toBe(true);
    expect(keyboard.capturing).toBe(true);
    expect(keyboard.endFrame).toHaveBeenCalled();
    expect(menus.hide).toHaveBeenCalled();
    expect(hooks.resumed).toHaveBeenCalled();
    expect(session.setPlaying).toHaveBeenLastCalledWith(true);
    expect(session.dispose).not.toHaveBeenCalled();
  });

  it('a lock granted after the graphics context was lost resumes nothing and gives the mouse back', () => {
    const { flow, session, pointer } = playing();
    flow.contextChanged(true);
    session.setPlaying.mockClear();
    flow.resume();
    expect(pointer.release).toHaveBeenCalled();
    expect(session.setPlaying).not.toHaveBeenCalled();
  });

  it('with the mouse lock asked for, Play waits for the answer and resumes once it is granted', async () => {
    const stubs = stubParts();
    const flow = new PlayFlow({ ...stubs.parts, allowUnlocked: false } as unknown as PlayParts);
    const session = stubSession();
    flow.session = session as unknown as Loaded;
    stubs.pointer.request.mockImplementation(() => {
      stubs.pointer.locked = true;
      return Promise.resolve();
    });
    flow.newGamePlay();
    // A second click while the browser answers does nothing.
    flow.newGamePlay();
    expect(stubs.pointer.request).toHaveBeenCalledOnce();
    expect(session.setPlaying).not.toHaveBeenCalled();
    await new Promise((done) => setTimeout(done, 0));
    expect(session.setPlaying).toHaveBeenLastCalledWith(true);
    expect(flow.unlockedPlay).toBe(false);
  });
});

describe('PlayFlow: pause, stop and leave (DX8)', () => {
  it('the mouse lost in a match pauses: keys released, the pause menu with the match seed, the session stopped', () => {
    const { flow, session, keyboard, menus } = playing();
    flow.unlockedPlay = false;
    flow.lockChanged(false, false);
    expect(keyboard.capturing).toBe(false);
    expect(keyboard.releaseAll).toHaveBeenCalled();
    expect(menus.showPause).toHaveBeenCalledWith('match status', 7, false, false, null);
    expect(session.setPlaying).toHaveBeenLastCalledWith(false);
    // Resume carries on with the same match.
    flow.newGamePlay();
    expect(session.setPlaying).toHaveBeenLastCalledWith(true);
    expect(session.dispose).not.toHaveBeenCalled();
  });

  it('stopping play without the lock pauses and gives the play buttons back', () => {
    const { flow, pointer, menus } = playing();
    flow.stopPlay();
    expect(flow.unlockedPlay).toBe(false);
    expect(flow.inPlay).toBe(false);
    expect(pointer.setUnlockedButtons).toHaveBeenLastCalledWith(false);
    expect(menus.showPause).toHaveBeenCalledOnce();
  });

  it('a decided match settles before its result screen shows, with the results summary', () => {
    const { flow, session, menus, results } = playing();
    session.state.round.phase = 'matchOver';
    flow.stopPlay();
    expect(results.settle).toHaveBeenCalledWith(session);
    expect(results.settle.mock.invocationCallOrder[0]).toBeLessThan(menus.showResult.mock.invocationCallOrder[0]!);
    expect(menus.showResult).toHaveBeenCalledWith('You won', '5–3', { summary: true });
    expect(menus.showPause).not.toHaveBeenCalled();
  });

  it('leaving the match disposes it and play starts over from New game', () => {
    const { flow, session, pointer, parts } = playing();
    flow.leaveMatch();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(flow.session).toBeNull();
    expect(flow.unlockedPlay).toBe(false);
    expect(pointer.setUnlockedButtons).toHaveBeenLastCalledWith(false);
    // The menus' swatches take the team colours.
    expect(parts.container.style.setProperty).toHaveBeenCalled();
  });

  it('the Loadout key in Practice stops play and the pause opens the Loadout over its pause menu', () => {
    const { flow, menus } = playing('range');
    flow.openPracticeLoadout();
    expect(menus.showPracticeLoadout).toHaveBeenCalledWith('range status', 7, false, 'primary', null);
    expect(menus.showPause).not.toHaveBeenCalled();
  });

  it('dispose disposes the session, the prompt and the notice', () => {
    const { flow, session, parts } = playing();
    flow.dispose();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(parts.playPrompt.dispose).toHaveBeenCalledOnce();
    expect(parts.graphicsNotice.dispose).toHaveBeenCalledOnce();
    expect(flow.session).toBeNull();
  });
});

describe('PlayFlow: the round skipped without the mouse, the lost context, a crash (DX8)', () => {
  /** A player out in a live round, the skip offered, the lock dropped by Esc. */
  function outAndEsc(): ReturnType<typeof playing> {
    const p = playing();
    p.flow.unlockedPlay = false;
    p.session.skipOffer = 'round';
    p.flow.lockChanged(false, false);
    return p;
  }

  it('out, Esc skips the round with the menus shut and the prompt up', () => {
    const { flow, session, menus, parts } = outAndEsc();
    expect(session.beginSkip).toHaveBeenCalledOnce();
    expect(flow.escSkip).toBe(true);
    expect(flow.inPlay).toBe(true);
    expect(parts.playPrompt.show).toHaveBeenCalled();
    expect(menus.showPause).not.toHaveBeenCalled();
  });

  it('a click takes the mouse again; Esc again after the guard opens the pause menu', () => {
    const { flow, pointer, menus } = outAndEsc();
    const click = { button: 0, preventDefault: vi.fn() } as unknown as MouseEvent;
    flow.clickToPlay(click);
    expect(pointer.request).toHaveBeenCalledOnce();
    const esc = { code: 'Escape', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;
    flow.escSkipKey(esc);
    expect(menus.showPause).not.toHaveBeenCalled(); // within the guard: the Esc that let the mouse go
    flow.escSkipAt = performance.now() - 10_000;
    flow.escSkipKey(esc);
    expect(flow.escSkip).toBe(false);
    expect(menus.showPause).toHaveBeenCalledOnce();
  });

  it('the graphics context lost stops play and blocks the menus; Play does nothing until it is back', () => {
    const { flow, session, menus, parts } = playing();
    flow.contextChanged(true);
    expect(parts.graphicsNotice.setVisible).toHaveBeenLastCalledWith(true);
    expect(menus.setBlocked).toHaveBeenLastCalledWith(true);
    expect(session.setPlaying).toHaveBeenLastCalledWith(false);
    session.combat.unlockAudio.mockClear();
    flow.newGamePlay();
    expect(session.combat.unlockAudio).not.toHaveBeenCalled();
    menus.screen = 'pause';
    flow.contextChanged(false);
    expect(session.contextRestored).toHaveBeenCalledOnce();
    expect(menus.setBlocked).toHaveBeenLastCalledWith(false);
    expect(menus.showHint).toHaveBeenCalled();
  });

  it('after a crash a lock granted late is given back and nothing resumes', () => {
    const { flow, session, pointer } = playing('match', { crashed: true });
    session.setPlaying.mockClear();
    flow.lockChanged(true, false);
    expect(pointer.release).toHaveBeenCalled();
    expect(session.setPlaying).not.toHaveBeenCalled();
  });
});

describe("the menus' play buttons (DX8)", () => {
  it('each reaches the flow built after the menus', () => {
    const flow = { newGamePlay: vi.fn(), leaveMatch: vi.fn(), skipTutorial: vi.fn() };
    const menus = playMenus(() => flow as unknown as PlayFlow);
    menus.onPlay();
    menus.onLeaveMatch();
    menus.onSkipTutorialStep();
    menus.onSkipTutorial();
    expect(flow.newGamePlay).toHaveBeenCalledOnce();
    expect(flow.leaveMatch).toHaveBeenCalledOnce();
    expect(flow.skipTutorial.mock.calls).toEqual([[false], [true]]);
  });
});
