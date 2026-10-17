import { HUD_TEXT, type SkipLabel } from '../../config/hudText';
import { MENU_TEXT } from '../../config/menus';
import type { MenuHint } from './chrome';
import { PAUSE_ICONS } from './icons';
import { el, hintLine, menuButton, setHint, withIcon } from './menuParts';

export interface PauseActions {
  onResume: () => void;
  /** The practice range only (M21): open the Loadout. */
  onLoadout: () => void;
  onSettings: () => void;
  onQuit: () => void;
  /** The tutorial only (audit POOL-14): skip the step under way, or the rest of the tutorial. */
  onSkipStep: () => void;
  onSkipTutorial: () => void;
  /** A match once you are out (M83): play the rest of the round out at once and go on to the next. */
  onSkipRound: () => void;
  /** The practice range only (M93): turn the timed challenge on or off. */
  onChallenge: () => void;
  /** The click the Fullscreen key asked for (IN1): fullscreen, then play resumes. */
  onFullscreen: () => void;
}

/** What a click anywhere on the pause menu does once the browser asked for one (IN1); `none` until then. */
export type PauseClick = 'none' | keyof typeof MENU_TEXT.clickToResume;

/**
 * Esc during a match: the score so far, then Resume, Settings and Quit (to the title screen). The loadout, mode and
 * difficulty change between matches, so they are not offered here (owner, 2026-10-03). On the practice range (M21)
 * there's no match: the Loadout is offered too, and you go back to the range with what you picked, and the timed
 * challenge's switch (M93).
 */
export class PauseScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly status: HTMLParagraphElement;
  private readonly hint = hintLine();
  private readonly loadout: HTMLButtonElement;
  private readonly skipStep: HTMLButtonElement;
  private readonly skipTutorial: HTMLButtonElement;
  private readonly skipRound: HTMLButtonElement;
  private readonly challenge: HTMLButtonElement;
  private readonly seed: HTMLParagraphElement;
  /** The browser asked for a click (IN1): one anywhere on the screen resumes, or goes fullscreen and resumes. */
  private click: PauseClick = 'none';

  constructor(actions: PauseActions) {
    this.root = el('div', 'menu-screen menu-pause');
    this.root.hidden = true;
    const panel = el('div', 'menu-pause-panel');
    const resume = withIcon(menuButton('Resume', 'primary', actions.onResume), PAUSE_ICONS.resume);
    resume.dataset.autofocus = '';
    this.status = el('p', 'menu-pause-status');
    this.loadout = withIcon(menuButton('Loadout', 'secondary', actions.onLoadout), PAUSE_ICONS.loadout);
    this.skipStep = menuButton('Skip step', 'secondary', actions.onSkipStep);
    this.skipTutorial = menuButton('Skip tutorial', 'secondary', actions.onSkipTutorial);
    this.skipRound = menuButton(HUD_TEXT.skipButton.round, 'secondary', actions.onSkipRound);
    this.skipRound.classList.add('menu-pause-skip');
    this.skipRound.hidden = true;
    this.challenge = menuButton(HUD_TEXT.challengeButton.off, 'secondary', actions.onChallenge);
    this.challenge.hidden = true;
    // The match's seed, small at the bottom, so a bug seen in play can be reported and replayed (bug pass).
    this.seed = el('p', 'menu-pause-seed');
    panel.append(
      el('h1', 'menu-heading', 'Paused'),
      this.status,
      resume,
      this.hint,
      this.skipRound,
      this.loadout,
      this.challenge,
      this.skipStep,
      this.skipTutorial,
      withIcon(menuButton('Settings', 'secondary', actions.onSettings), PAUSE_ICONS.settings),
      withIcon(menuButton('Quit', 'secondary', actions.onQuit), PAUSE_ICONS.quit),
      this.seed,
    );
    this.setRange(false);
    resume.classList.add('menu-button-big');
    // Esc resumes too: the menus handle it, after a short guard (audit UI-09), so there is no key of its own here.
    this.hints = [];
    this.root.append(panel);
    // A click is what the browser needs to give the mouse back; one off the buttons resumes too, once it was refused.
    this.root.addEventListener('click', (e) => {
      if (this.click === 'none' || (e.target as Element | null)?.closest?.('button, a, input, select, textarea, label')) return;
      if (this.click === 'fullscreen') actions.onFullscreen();
      else actions.onResume();
    });
  }

  /** On the practice range (M21): the Loadout button shows; with the tutorial running, Skip step and Skip tutorial. */
  setRange(range: boolean, tutorial = false): void {
    this.loadout.hidden = !range;
    this.skipStep.hidden = this.skipTutorial.hidden = !(range && tutorial);
  }

  /**
   * The timed challenge's switch (M93), on the practice range outside the tutorial: says whether it is on (and is a
   * toggle button for a screen reader); hidden where it doesn't apply (null).
   */
  setChallenge(on: boolean | null): void {
    this.challenge.hidden = on === null;
    if (on === null) return;
    this.challenge.textContent = HUD_TEXT.challengeButton[on ? 'on' : 'off'];
    this.challenge.setAttribute('aria-pressed', String(on));
  }

  /**
   * Skip to next round (M83): shown in a match once you are out and spectating, named by what it skips to (the next
   * round, or the result when this round could decide the match); hidden where it doesn't apply (null).
   */
  setSkip(offer: Exclude<SkipLabel, 'skipping'>): void {
    this.skipRound.hidden = offer === null;
    if (offer) this.skipRound.textContent = HUD_TEXT.skipButton[offer];
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  /** The seed of what's in play, for bug reports. */
  setSeed(seed: number): void {
    this.seed.textContent = `Seed ${seed}`;
  }

  showHint(text: string): void {
    this.setClick('none');
    setHint(this.hint, text);
  }

  /**
   * The browser needs a click (IN1): it refused the mouse (Esc is no click, and Chrome refuses one for about a second
   * after Esc; `again`, a click was refused too), or fullscreen from the Fullscreen key (Firefox). The hint says so, and
   * a click anywhere on the screen does it.
   */
  askForClick(click: Exclude<PauseClick, 'none'>): void {
    setHint(this.hint, MENU_TEXT.clickToResume[click]);
    this.setClick(click);
  }

  private setClick(click: PauseClick): void {
    this.click = click;
    this.root.classList.toggle('click-to-resume', click !== 'none');
  }
}
