import { DEFAULT_HIT_MARKER, HITS, type HitMarkerSettings } from '../config/hits';
import { HUD_TEXT, type SkipLabel } from '../config/hudText';
import { styleHitMarker } from './hitMarkerLook';
import { restartAnimation } from './restartAnimation';
import { isRoundStart, spokenRoundMessage } from './roundBanner';

/**
 * Hit feedback and round messages over the game view: the hit marker when your BB lands, the "you're
 * hit" flash with a marker pointing to where the shot came from, the spectating label and the
 * round banner. Timed effects are CSS animations restarted from here, so nothing runs per frame.
 */
export class HitFeedback {
  private readonly root: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly direction: HTMLDivElement;
  private readonly out: HTMLDivElement;
  private readonly spectating: HTMLDivElement;
  private readonly round: HTMLDivElement;
  /** Read out by a screen reader (audit UI-15): your hit call at once, the round's news when the player can listen. */
  private readonly urgent: HTMLDivElement;
  private readonly news: HTMLDivElement;
  private spokenRound = '';
  private shownSpectating = '';
  private shownFireKey = '';
  private shownSkip: SkipLabel = null;
  private shownRound = '';
  private shownOut = '';
  private shownCalling = false;
  private shownAngle = Number.NaN;
  /** Settings › Gameplay › Hit marker (M97): whether your BB landing shows the X (the tick sounds either way). */
  private markerOn = DEFAULT_HIT_MARKER;

  /** `fireKey` names the key or button the player has on fire now (the spectating label's "… for next"). */
  constructor(
    parent: HTMLElement,
    private readonly fireKey: () => string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hitfx';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hitfx-flash"></div>
      <div class="hitfx-marker"><i></i><i></i><i></i><i></i></div>
      <div class="hitfx-direction"><b></b></div>
      <div class="hitfx-banner"><strong>HIT!</strong><span>You called your hit</span></div>
      <div class="hitfx-out"></div>
      <div class="hitfx-spectating"></div>
      <div class="hitfx-round"></div>
      <div class="sr-only" aria-live="assertive"></div>
      <div class="sr-only" aria-live="polite"></div>`;
    // The hit-direction wedge fades over the hit call, so it's gone just as calling ends (setCalling) rather than cut off.
    this.root.style.setProperty('--hit-call', `${HITS.callTime}s`);
    parent.appendChild(this.root);
    const q = (sel: string) => this.root.querySelector(sel) as HTMLDivElement;
    this.flash = q('.hitfx-flash');
    this.marker = q('.hitfx-marker');
    this.direction = q('.hitfx-direction');
    this.banner = q('.hitfx-banner');
    this.out = q('.hitfx-out');
    this.spectating = q('.hitfx-spectating');
    this.round = q('.hitfx-round');
    [this.urgent, this.news] = [...this.root.querySelectorAll<HTMLDivElement>('.sr-only')] as [HTMLDivElement, HTMLDivElement];
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    // One-shot effects end when hidden: an element coming back from display:none (resume, Play again) would
    // otherwise replay its animation.
    if (!visible) {
      this.flash.classList.remove('show');
      this.marker.classList.remove('show');
      this.direction.classList.remove('show');
    }
  }

  /**
   * The Hit marker settings (M97; its look, the owner's 0.1 Dev 5 playtest, note 4): off, a landed BB shows no X and one
   * showing now goes at once; on, the X takes the size, thickness, outline and colour set.
   */
  setHitMarker(settings: HitMarkerSettings): void {
    this.markerOn = settings.on;
    styleHitMarker(this.marker, settings);
    if (!settings.on) this.marker.classList.remove('show');
  }

  /** Your BB hit someone. `friendly` marks a teammate (friendly fire counts, as at a real site). Nothing with the Hit marker off. */
  showHitMarker(friendly: boolean): void {
    if (!this.markerOn) return;
    this.marker.classList.toggle('friendly', friendly);
    restartAnimation(this.marker, 'show');
  }

  /** You've been hit: flash, and show where it came from (see setHitDirection). */
  showHit(fromAngle: number): void {
    this.setHitDirection(fromAngle);
    restartAnimation(this.flash, 'show');
    restartAnimation(this.direction, 'show');
  }

  /**
   * Where the BB that hit you came from, relative to where you're looking now (radians, 0 = straight
   * ahead, positive = to your right). Call as the view turns so the marker keeps pointing at the shooter.
   */
  setHitDirection(fromAngle: number): void {
    const a = Math.round(fromAngle * 100) / 100;
    if (a === this.shownAngle) return;
    this.shownAngle = a;
    this.direction.style.transform = `rotate(${a}rad)`;
  }

  /** The big "HIT!" while you call your hit. */
  setCalling(calling: boolean): void {
    if (calling === this.shownCalling) return;
    this.shownCalling = calling;
    this.banner.classList.toggle('show', calling);
    this.urgent.textContent = calling ? 'Hit! You called your hit.' : '';
    if (!calling) this.direction.classList.remove('show'); // it points relative to a view you no longer have
  }

  /** Small label while you're out (e.g. "OUT · hit by Beta 2"), or '' to hide it. */
  setOutLabel(text: string): void {
    if (text === this.shownOut) return;
    this.shownOut = text;
    this.out.textContent = text;
    if (text) this.news.textContent = text;
    this.out.classList.toggle('show', text !== '');
  }

  /**
   * Name of the player being watched, or '' when not spectating. `skip` (M83): how to skip the rest of the round, or
   * that it is being played out (said even with nobody left to watch).
   */
  setSpectating(name: string, skip: SkipLabel = null): void {
    // The fire key too: it can be rebound mid-match from the pause menu.
    const key = this.fireKey();
    if (name === this.shownSpectating && key === this.shownFireKey && skip === this.shownSkip) return;
    this.shownSpectating = name;
    this.shownFireKey = key;
    this.shownSkip = skip;
    this.spectating.textContent = spectatingText(name, key, skip);
    this.spectating.classList.toggle('show', this.spectating.textContent !== '');
  }

  /**
   * Round message (e.g. "Alpha wins the round"), or '' to hide it. The words are kept as written (a screen reader reads
   * them so); the banner sets them in capitals, the round's start ("Round 2") larger as its headline (G4).
   */
  setRoundMessage(text: string): void {
    if (text === this.shownRound) return;
    this.shownRound = text;
    this.round.textContent = text;
    this.round.classList.toggle('show', text !== '');
    this.round.classList.toggle('start', isRoundStart(text));
    // Without the countdown, so the reader says the result once rather than every second.
    const spoken = spokenRoundMessage(text);
    if (spoken && spoken !== this.spokenRound) this.news.textContent = spoken;
    this.spokenRound = spoken;
  }

  /**
   * News the round banner may not show for long, or at all (M53, audit UI-02: a late exit opening, a minute left), said
   * once by a screen reader through the polite region. The banner showing the same words next is not said again.
   */
  announce(text: string): void {
    this.news.textContent = text;
    this.spokenRound = text;
  }

  dispose(): void {
    this.root.remove();
  }
}


/** The spectating line (M83 adds the skip): "Spectating Blue 2 · Left click for next · Esc to skip the round". Pure. */
export function spectatingText(name: string, fireKey: string, skip: SkipLabel): string {
  if (skip === 'skipping') return HUD_TEXT.skip.skipping;
  if (!name) return '';
  return [`Spectating ${name}`, ...(fireKey ? [`${fireKey} for next`] : []), ...(skip ? [HUD_TEXT.skip[skip]] : [])].join(' · ');
}
