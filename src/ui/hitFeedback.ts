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
  private shownSpectating = '';
  private shownRound = '';
  private shownOut = '';
  private shownCalling = false;
  private shownAngle = Number.NaN;

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
      <div class="hitfx-round"></div>`;
    parent.appendChild(this.root);
    const q = (sel: string) => this.root.querySelector(sel) as HTMLDivElement;
    this.flash = q('.hitfx-flash');
    this.marker = q('.hitfx-marker');
    this.direction = q('.hitfx-direction');
    this.banner = q('.hitfx-banner');
    this.out = q('.hitfx-out');
    this.spectating = q('.hitfx-spectating');
    this.round = q('.hitfx-round');
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    // One-shot effects end when hidden: an element coming back from display:none (resume, Play again) would
    // otherwise replay its animation.
    if (!visible) {
      this.flash.classList.remove('show');
      this.marker.classList.remove('show');
    }
  }

  /** Your BB hit someone. `friendly` marks a teammate (friendly fire counts, as at a real site). */
  showHitMarker(friendly: boolean): void {
    this.marker.classList.toggle('friendly', friendly);
    restart(this.marker, 'show');
  }

  /** You've been hit: flash, and show where it came from (see setHitDirection). */
  showHit(fromAngle: number): void {
    this.setHitDirection(fromAngle);
    restart(this.flash, 'show');
    restart(this.direction, 'show');
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
    if (!calling) this.direction.classList.remove('show'); // it points relative to a view you no longer have
  }

  /** Small label while you're out (e.g. "OUT · hit by Orange 2"), or '' to hide it. */
  setOutLabel(text: string): void {
    if (text === this.shownOut) return;
    this.shownOut = text;
    this.out.textContent = text;
    this.out.classList.toggle('show', text !== '');
  }

  /** Name of the player being watched, or '' when not spectating. */
  setSpectating(name: string): void {
    if (name === this.shownSpectating) return;
    this.shownSpectating = name;
    const key = this.fireKey();
    this.spectating.textContent = name ? `Spectating ${name}${key ? ` · ${key} for next` : ''}` : '';
    this.spectating.classList.toggle('show', name !== '');
  }

  /** Round message (e.g. "Blue wins the round"), or '' to hide it. */
  setRoundMessage(text: string): void {
    if (text === this.shownRound) return;
    this.shownRound = text;
    this.round.textContent = text;
    this.round.classList.toggle('show', text !== '');
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Restarts a CSS animation by toggling its class across a reflow. */
function restart(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
