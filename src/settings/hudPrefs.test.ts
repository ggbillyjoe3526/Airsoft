import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_CUE_COLOUR, SOUND_CUE_COLOURS, SOUND_CUE_SIZE } from '../config/accessibility';
import { DEFAULT_HIT_MARKER_SETTINGS, HIT_MARKER_RANGES } from '../config/hits';
import {
  CROSSHAIR_SHAPES,
  DEFAULT_CROSSHAIR,
  DEFAULT_FEED_CORNER,
  DEFAULT_HIT_FEED_MODE,
  DEFAULT_WHAT_GOT_YOU_MODE,
  FEED_CORNERS,
  HIT_FEED_MODES,
  HUD_OPACITY,
  HUD_SIZE,
  SCOREBOARD_SIZE,
  WHAT_GOT_YOU_MODES,
} from '../config/matchInfo';
import { DEFAULT_MINIMAP_TURN, MINIMAP_TURN_CHOICES } from '../config/minimap';
import { DEFAULT_TEAM_COLOURS, TEAM_COLOUR_CHOICES } from '../config/teams';
import { type HudPrefs, loadHudPrefs, motionReduced, setHudPref } from './hudPrefs';
import { SETTINGS_KEY, SETTINGS_VERSION } from './storage';

/** A Storage holding the settings object as a build wrote it. */
function storageWith(fields: Record<string, unknown>): Storage {
  const data = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields })]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: data.size,
  };
}

/** An option of `list` other than `fallback`, so reading it back shows the saved value was read. */
const other = <T extends string>(list: readonly { id: T }[], fallback: T): T => list.find((o) => o.id !== fallback)!.id;

describe('HudPrefs (DX5): every HUD and accessibility preference in one object', () => {
  it('reads a 0.1 Dev 6 settings object: the same keys, each value as saved', () => {
    const shape = other(CROSSHAIR_SHAPES, DEFAULT_CROSSHAIR.shape);
    const saved = {
      'crosshair.shape': shape,
      hitMarker: 'on',
      'hitMarker.thickness': HIT_MARKER_RANGES.thickness.max,
      hudSize: HUD_SIZE.max,
      scoreboardSize: SCOREBOARD_SIZE.max,
      hudOpacity: HUD_OPACITY.min,
      hitFeed: other(HIT_FEED_MODES, DEFAULT_HIT_FEED_MODE),
      feedCorner: other(FEED_CORNERS, DEFAULT_FEED_CORNER),
      whatGotYou: other(WHAT_GOT_YOU_MODES, DEFAULT_WHAT_GOT_YOU_MODE),
      minimapTurn: other(MINIMAP_TURN_CHOICES, DEFAULT_MINIMAP_TURN),
      callouts: 'off',
      pingMarkers: 'off',
      magPrompts: 'off',
      ammoCounter: 'off',
      reducedMotion: 'on',
      teamColours: other(TEAM_COLOUR_CHOICES, DEFAULT_TEAM_COLOURS),
      soundCues: 'on',
      soundCueSize: SOUND_CUE_SIZE.max,
      soundCueColour: other(SOUND_CUE_COLOURS, DEFAULT_SOUND_CUE_COLOUR),
    };
    const p = loadHudPrefs(storageWith(saved));
    expect(p.crosshair.shape).toBe(shape);
    expect(p.hitMarker).toEqual({ ...DEFAULT_HIT_MARKER_SETTINGS, on: true, thickness: HIT_MARKER_RANGES.thickness.max });
    const { crosshair: _c, hitMarker: _h, systemReducedMotion, version, ...rest } = p;
    expect(rest).toEqual({
      hudSize: saved.hudSize,
      scoreboardSize: saved.scoreboardSize,
      hudOpacity: saved.hudOpacity,
      hitFeed: saved.hitFeed,
      feedCorner: saved.feedCorner,
      whatGotYou: saved.whatGotYou,
      minimapTurn: saved.minimapTurn,
      callouts: 'off',
      pingMarkers: 'off',
      magPrompts: 'off',
      ammoCounter: 'off',
      reducedMotion: true,
      teamColours: saved.teamColours,
      soundCues: true,
      soundCueSize: saved.soundCueSize,
      soundCueColour: saved.soundCueColour,
    });
    expect([systemReducedMotion, version]).toEqual([false, 0]);
  });

  it('falls back to each default with nothing saved, or no storage at all', () => {
    for (const p of [loadHudPrefs(storageWith({})), loadHudPrefs(null)]) {
      expect(p.crosshair).toEqual(DEFAULT_CROSSHAIR);
      expect(p.hitMarker).toEqual(DEFAULT_HIT_MARKER_SETTINGS);
      expect([p.hudSize, p.scoreboardSize, p.hudOpacity, p.soundCueSize]).toEqual([HUD_SIZE.default, SCOREBOARD_SIZE.default, HUD_OPACITY.default, SOUND_CUE_SIZE.default]);
      expect([p.hitFeed, p.feedCorner, p.whatGotYou, p.minimapTurn]).toEqual([DEFAULT_HIT_FEED_MODE, DEFAULT_FEED_CORNER, DEFAULT_WHAT_GOT_YOU_MODE, DEFAULT_MINIMAP_TURN]);
      expect([p.reducedMotion, p.teamColours, p.soundCues, p.soundCueColour]).toEqual([null, DEFAULT_TEAM_COLOURS, false, DEFAULT_SOUND_CUE_COLOUR]);
    }
  });

  it('moves its version on with every change, so a session knows to show it again', () => {
    const p: HudPrefs = loadHudPrefs(null);
    setHudPref(p, 'feedCorner', other(FEED_CORNERS, p.feedCorner));
    setHudPref(p, 'callouts', 'off');
    expect(p.version).toBe(2);
    expect(p.callouts).toBe('off');
  });

  it('reduces motion as the system says until the player picks, then as picked', () => {
    const p = loadHudPrefs(null);
    setHudPref(p, 'systemReducedMotion', true);
    expect(motionReduced(p)).toBe(true);
    setHudPref(p, 'reducedMotion', false);
    expect(motionReduced(p)).toBe(false);
  });
});
