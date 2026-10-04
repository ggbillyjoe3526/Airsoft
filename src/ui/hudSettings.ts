import { HIT_FEED_MODES, type HitFeedMode, HUD_SIZE, SCOREBOARD_SIZE } from '../config/matchInfo';
import { menuRow, rangeControl } from './menus/menuParts';
import { OptionPicker } from './optionPicker';

export interface HudSettingsOptions {
  /** The whole HUD's size (a scale, 1 = sized for the screen; audit UI-04). */
  hudSize: { initial: number; onChange: (scale: number) => void };
  /** The scoreboard's size (a scale, 1 = as before M24). */
  scoreboardSize: { initial: number; onChange: (scale: number) => void };
  hitFeed: { initial: HitFeedMode; onChange: (mode: HitFeedMode) => void };
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
    menuRow('Hit feed', 'Who hit whom, in the top-right corner.', new OptionPicker('Hit feed', HIT_FEED_MODES, opts.hitFeed.initial, 'hitFeed', opts.hitFeed.onChange).root),
  ];
}
