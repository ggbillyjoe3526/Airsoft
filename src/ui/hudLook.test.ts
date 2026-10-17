import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHudPrefs, setHudPref } from '../settings/hudPrefs';
import { HudLook } from './hudLook';

/** A container and a window stand-in: the HUD's CSS look reads the one preferences object each time it is shown (DX5). */
function setup(systemReduce: boolean) {
  const vars = new Map<string, string>();
  const classes = new Set<string>();
  const container = {
    clientWidth: 1280,
    clientHeight: 720,
    style: { setProperty: (k: string, v: string) => vars.set(k, v) },
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
  } as unknown as HTMLElement;
  const listeners: Record<string, (() => void)[]> = {};
  const media = { matches: systemReduce, addEventListener: (_: string, fn: () => void) => (listeners.change ??= []).push(fn), removeEventListener: () => undefined };
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal('matchMedia', () => media);
  return { vars, classes, container, media, fire: () => listeners.change?.forEach((f) => f()) };
}

afterEach(() => vi.unstubAllGlobals());

describe('the HUD look follows the preferences object (DX5)', () => {
  it('shows a size, opacity and cue change at once, and the motion classes only once the player picks', () => {
    const t = setup(false);
    const prefs = loadHudPrefs(null);
    const look = new HudLook(t.container, prefs);
    const before = t.vars.get('--hud-scale');
    expect([t.classes.has('reduced-motion'), t.classes.has('full-motion')]).toEqual([false, false]);
    setHudPref(prefs, 'hudSize', 1.5);
    setHudPref(prefs, 'hudOpacity', 0.6);
    setHudPref(prefs, 'soundCueSize', 1.4);
    setHudPref(prefs, 'reducedMotion', true);
    look.show();
    expect(Number(t.vars.get('--hud-scale'))).toBeCloseTo(Number(before) * 1.5, 5);
    expect([t.vars.get('--hud-opacity'), t.vars.get('--cue-scale')]).toEqual(['0.6', '1.4']);
    expect([t.classes.has('reduced-motion'), t.classes.has('full-motion')]).toEqual([true, false]);
    setHudPref(prefs, 'reducedMotion', false);
    look.show();
    expect([t.classes.has('reduced-motion'), t.classes.has('full-motion')]).toEqual([false, true]);
    look.dispose();
  });

  it('keeps the system reduce-motion setting in the preferences, moves the version, and shows the picker only until the player picks', () => {
    const t = setup(true);
    const prefs = loadHudPrefs(null);
    const look = new HudLook(t.container, prefs);
    const shown: boolean[] = [];
    look.follow((on) => shown.push(on));
    expect(prefs.systemReducedMotion).toBe(true);
    const v = prefs.version;
    t.media.matches = false;
    t.fire();
    expect([prefs.systemReducedMotion, prefs.version > v, shown]).toEqual([false, true, [false]]);
    setHudPref(prefs, 'reducedMotion', true);
    t.media.matches = true;
    t.fire();
    expect(shown).toEqual([false]); // a pick stands over the system
    look.dispose();
  });
});
