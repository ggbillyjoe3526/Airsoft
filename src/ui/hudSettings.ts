import { HIT_FEED_MODES, type HitFeedMode, HUD_OPACITY, HUD_SIZE, SCOREBOARD_SIZE, WHAT_GOT_YOU_MODES, type WhatGotYouMode } from '../config/matchInfo';
import { CALLOUT_CHOICES, type CalloutsMode, DEFAULT_CALLOUTS } from '../config/callouts';
import { DEFAULT_MINIMAP_TURN, MINIMAP_TURN_CHOICES, type MinimapTurn } from '../config/minimap';
import { browserStorage, loadSetting, oneOf } from '../settings/storage';
import { menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface HudSettingsOptions {
  /** The whole HUD's size (a scale, 1 = sized for the screen; audit UI-04). */
  hudSize: { initial: number; onChange: (scale: number) => void };
  /** The scoreboard's size (a scale, 1 = as before M24). */
  scoreboardSize: { initial: number; onChange: (scale: number) => void };
  /** How opaque the HUD's panels are (G4): 0.5 to 1. */
  hudOpacity: { initial: number; onChange: (opacity: number) => void };
  hitFeed: { initial: HitFeedMode; onChange: (mode: HitFeedMode) => void };
  /** The "what got you" card after a hit (M41). */
  whatGotYou: { initial: WhatGotYouMode; onChange: (mode: WhatGotYouMode) => void };
  /** Whether the minimap turns with the view or stays north up (M83). No row without it. */
  minimapTurn?: { initial: MinimapTurn; onChange: (turn: MinimapTurn) => void };
  /** Your teammates' callouts (CL1). No row without it. */
  callouts?: { initial: CalloutsMode; onChange: (mode: CalloutsMode) => void };
}

/** Settings › HUD › Minimap (M83): Rotating (as it always was) unless the player picked Fixed. */
export function loadMinimapTurn(storage = browserStorage()): MinimapTurn {
  return loadSetting('minimapTurn', oneOf(MINIMAP_TURN_CHOICES.map((c) => c.id)), DEFAULT_MINIMAP_TURN, storage);
}

/** Settings › HUD › Callouts (CL1): on unless the player turned them off. */
export function loadCallouts(storage = browserStorage()): CalloutsMode {
  return loadSetting('callouts', oneOf(CALLOUT_CHOICES.map((c) => c.id)), DEFAULT_CALLOUTS, storage);
}

/** The HUD tab's rows (Settings → HUD, M24), each saved and applied as it changes. */
export function hudSettings(opts: HudSettingsOptions): HTMLDivElement[] {
  return [
    menuRow(
      'HUD size',
      'Everything on screen in play except the crosshair. At 100% it grows on its own on a tall screen (1440p, 4K).',
      rangeControl('HUD size', HUD_SIZE, opts.hudSize.initial, (v) => `${Math.round(v * 100)}%`, 'hudSize', opts.hudSize.onChange),
    ),
    menuRow(
      'Scoreboard size',
      'The score and round clock at the top of the screen. In a narrow window it grows only as far as leaves the hit feed room.',
      rangeControl('Scoreboard size', SCOREBOARD_SIZE, opts.scoreboardSize.initial, (v) => `${Math.round(v * 100)}%`, 'scoreboardSize', opts.scoreboardSize.onChange),
    ),
    menuRow(
      'HUD opacity',
      'How solid the panels behind the score, minimap, hit feed, ammo and round banner are. Lower lets more of the field show through.',
      rangeControl('HUD opacity', HUD_OPACITY, opts.hudOpacity.initial, (v) => `${Math.round(v * 100)}%`, 'hudOpacity', opts.hudOpacity.onChange),
    ),
    menuRow('Hit feed', 'Who hit whom, in the top-right corner.', new OptionPicker('Hit feed', HIT_FEED_MODES, opts.hitFeed.initial, 'hitFeed', opts.hitFeed.onChange).root),
    menuRow(
      'What got you',
      'After you are hit: where it came from, whether that bot held the angle, how long you were in view and whether you were moving. Auto shows it against Pro opponents only.',
      new OptionPicker('What got you', WHAT_GOT_YOU_MODES, opts.whatGotYou.initial, 'whatGotYou', opts.whatGotYou.onChange).root,
    ),
    ...(opts.minimapTurn
      ? [menuRow('Minimap', 'Turning with you, so the way you look is up, or fixed north up with your arrow turning.', new OptionPicker('Minimap', MINIMAP_TURN_CHOICES, opts.minimapTurn.initial, 'minimapTurn', opts.minimapTurn.onChange).root)]
      : []),
    ...(opts.callouts
      ? [menuRow('Callouts', 'Your bot teammates calling what they see and do ("Contact, Dock!", "Two left"), bottom left.', new OptionPicker('Callouts', CALLOUT_CHOICES, opts.callouts.initial, 'callouts', opts.callouts.onChange).root)]
      : []),
  ];
}
