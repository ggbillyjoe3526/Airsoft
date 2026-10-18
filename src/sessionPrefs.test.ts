import { describe, expect, it, vi } from 'vitest';
import { FULL_MOTION, REDUCED_MOTION } from './config/accessibility';
import { MatchSession } from './matchSession';
import { RangeSession } from './rangeSession';
import { MatchPresentation } from './render/match/matchPresentation';
import { type HudPrefs, loadHudPrefs, setHudPref } from './settings/hudPrefs';

/**
 * DX5: both sessions read the HUD and accessibility preferences by reference and show a change as play runs again
 * (setPlaying(true)) and on each frame drawn, once per change. Stand-ins for what they hand it to: the real sessions
 * need a GPU and physics.
 */
type Syncing = { syncPrefs(): void; motion: unknown };

function matchWith(prefs: HudPrefs) {
  const calls = { combat: vi.fn(), match: vi.fn(), counts: [] as boolean[] };
  const s = Object.create(MatchSession.prototype) as MatchSession;
  Object.assign(s, {
    prefs,
    prefsSeen: -1,
    combat: { applyPrefs: calls.combat, setPlaying() {} },
    match: { applyPrefs: calls.match, setPlaying() {} },
    mags: { setCounts: (on: boolean) => calls.counts.push(on) },
  });
  return { s, inside: s as unknown as Syncing, calls };
}

describe('the sessions show the preferences once per change (DX5)', () => {
  it('a match takes them as play runs again, not again until one changes', () => {
    const prefs = loadHudPrefs(null);
    const { s, inside, calls } = matchWith(prefs);
    s.setPlaying(true);
    s.setPlaying(false);
    s.setPlaying(true);
    expect([calls.combat.mock.calls.length, calls.match.mock.calls.length, calls.counts]).toEqual([1, 1, [true]]);
    expect(inside.motion).toBe(FULL_MOTION);
    // Changed on the pause menu: shown as play resumes.
    setHudPref(prefs, 'ammoCounter', 'off');
    setHudPref(prefs, 'reducedMotion', true);
    s.setPlaying(true);
    expect([calls.combat.mock.calls.length, calls.match.mock.calls.length, calls.counts]).toEqual([2, 2, [true, false]]);
    expect(inside.motion).toBe(REDUCED_MOTION);
  });

  it('a match follows the system\'s reduce-motion setting changing in play, from the next frame drawn', () => {
    const prefs = loadHudPrefs(null);
    const { s, inside } = matchWith(prefs);
    s.setPlaying(true);
    setHudPref(prefs, 'systemReducedMotion', true);
    inside.syncPrefs(); // the first thing draw() does
    expect(inside.motion).toBe(REDUCED_MOTION);
  });

  it('both sessions look before each frame they draw', () => {
    const sources = import.meta.glob<string>(['./matchSession.ts', './rangeSession.ts'], { query: '?raw', import: 'default', eager: true });
    for (const [file, text] of Object.entries(sources)) expect(text.replace(/\r\n/g, '\n'), file).toMatch(/ draw\(dt: number[^)]*\): void \{\n    this\.syncPrefs\(\);/);
  });

  it('the range shows the crosshair, motion, minimap turn and BB counts the same way', () => {
    const prefs = loadHudPrefs(null);
    const combat = vi.fn();
    const turns: boolean[] = [];
    const counts: boolean[] = [];
    const s = Object.create(RangeSession.prototype) as Syncing;
    Object.assign(s, { prefs, prefsSeen: -1, combat: { applyPrefs: combat }, minimap: { setRotating: (on: boolean) => turns.push(on) }, coach: { setAmmoCounter: (on: boolean) => counts.push(on) } });
    s.syncPrefs();
    s.syncPrefs();
    setHudPref(prefs, 'minimapTurn', 'fixed');
    setHudPref(prefs, 'ammoCounter', 'off');
    s.syncPrefs();
    expect([combat.mock.calls.length, turns, counts]).toEqual([2, [true, false], [true, false]]);
  });

  it('the match presentation shows each HUD preference from the one object, and clears callouts turned off', () => {
    const prefs = loadHudPrefs(null);
    const seen: Record<string, unknown[]> = {};
    const log = (name: string) => (v?: unknown) => (seen[name] ??= []).push(v);
    const m = Object.create(MatchPresentation.prototype) as MatchPresentation;
    Object.assign(m, {
      soundCues: { setEnabled: log('soundCues') },
      feed: { setMode: log('hitFeed'), setCorner: log('feedCorner'), clearCallouts: log('clearCallouts') },
      minimap: { setRotating: log('rotating') },
      feedback: { setHitMarker: log('hitMarker') },
      magPrompt: { setShown: log('magPrompts') },
      pingMarkers: { setShown: log('pingMarkers') },
      setWhatGotYou: log('whatGotYou'),
    });
    m.applyPrefs(); // before the session hands them over: nothing
    expect(seen).toEqual({});
    m.usePrefs(prefs, 'normal');
    setHudPref(prefs, 'callouts', 'off');
    setHudPref(prefs, 'pingMarkers', 'off');
    m.applyPrefs();
    expect(seen).toEqual({
      soundCues: [prefs.soundCues],
      hitFeed: [prefs.hitFeed],
      feedCorner: [prefs.feedCorner],
      whatGotYou: [false],
      rotating: [true],
      hitMarker: [prefs.hitMarker],
      magPrompts: [true],
      pingMarkers: [false],
      clearCallouts: [undefined],
    });
  });
});
