import { soundCueCss } from '../config/accessibility';
import { hudInsetX, hudScale, scoreboardScale } from '../config/matchInfo';
import { MINIMAP, minimapScale } from '../config/minimap';
import { type HudPrefs, motionClass, motionReduced, setHudPref, systemReducedMotionQuery } from '../settings/hudPrefs';

/**
 * The HUD's look from the HUD and accessibility preferences (M24; out of game.ts, DX5), on the game's container, which
 * the menus and every match's HUD sit in. It also keeps the preferences' `systemReducedMotion` current from the
 * system's setting (audit UI-07), and shows it on Settings › Accessibility's Reduced motion picker until the player
 * picks. Again on resize; `dispose` stops watching.
 */
export class HudLook {
  /** The system's "reduce motion" setting, watched while the page is open. */
  private readonly systemMotion = systemReducedMotionQuery();
  /** Shows a value on the Reduced motion picker without saving it (BP2), once the Settings screen is built. */
  private showOnPicker: ((on: boolean) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly prefs: HudPrefs,
  ) {
    setHudPref(prefs, 'systemReducedMotion', this.systemMotion?.matches ?? false);
    this.show();
    window.addEventListener('resize', this.show);
    this.systemMotion?.addEventListener('change', this.systemMotionChanged);
  }

  /**
   * The preferences as CSS on the container (style.css): the HUD's size (audit UI-04; the screen's height scales it
   * further) and the minimap's (held back in a narrow window to clear the score bar, UX1), its panels' opacity (G4), the sound cues' size and colour, and the scoreboard's size, held back in a narrow
   * window so the hit feed and the minimap keep their room. And reduced motion for the HUD's CSS animations (audit
   * M-03): `reduced-motion` calms them; `full-motion` marks an explicit Off, so the stylesheet's
   * `prefers-reduced-motion` fallback doesn't override the player's choice; neither before the player picks (UI-07), so
   * that fallback follows the system live.
   */
  readonly show = (): void => {
    const p = this.prefs;
    const style = this.container.style;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const hud = hudScale(p.hudSize, height);
    const minimap = minimapScale(hud, width, height);
    style.setProperty('--hud-scale', String(hud));
    style.setProperty('--minimap-scale', minimap.toFixed(3));
    style.setProperty('--hud-opacity', String(p.hudOpacity));
    style.setProperty('--cue-scale', String(p.soundCueSize));
    style.setProperty('--cue-colour', soundCueCss(p.soundCueColour));
    // The scoreboard grows with the HUD, still only as far as leaves the hit feed its room and clears the minimap.
    const minimapEdge = hudInsetX(width, height) + MINIMAP.size * minimap;
    style.setProperty('--sb-scale', scoreboardScale(p.scoreboardSize * hud, width, minimapEdge).toFixed(3));
    const cls = motionClass(p.reducedMotion);
    this.container.classList.toggle('reduced-motion', cls === 'reduced-motion');
    this.container.classList.toggle('full-motion', cls === 'full-motion');
  };

  /** The menus' way to show the system's setting on the Reduced motion picker (MenusOptions › prefs.followMotion). */
  readonly follow = (show: (on: boolean) => void): void => {
    this.showOnPicker = show;
  };

  /** The system's setting changed: the 3D motion (the session reads the preferences) and the picker follow it, until the player picks. */
  private readonly systemMotionChanged = (): void => {
    setHudPref(this.prefs, 'systemReducedMotion', this.systemMotion?.matches ?? false);
    if (this.prefs.reducedMotion === null) this.showOnPicker?.(motionReduced(this.prefs));
  };

  dispose(): void {
    window.removeEventListener('resize', this.show);
    this.systemMotion?.removeEventListener('change', this.systemMotionChanged);
  }
}
