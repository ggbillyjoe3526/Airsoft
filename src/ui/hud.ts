import type { CrosshairSettings } from '../config/matchInfo';
import { FIRE_MODE_LABELS, type ReplicaConfig } from '../config/replicas';
import { HUD } from '../config/render';
import { type Armament, canReload, nextSpare, type ReplicaAmmo, spareBBs } from '../sim/armament';
import { isLowAmmo } from './ammoStatus';
import { crosshairElement, setCrosshairGap, styleCrosshair } from './crosshair';

/**
 * Minimal in-game HUD: crosshair (the player's own, Settings → Crosshair; or the red dot while aiming down one) and the replica panel (name and fire mode, BBs in the loaded magazine, a
 * gauge per spare magazine showing how full it is, with the one a reload takes marked, and reload progress).
 * DOM is only touched when a displayed value changes.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly name: HTMLSpanElement;
  private readonly fireMode: HTMLSpanElement;
  private readonly mag: HTMLSpanElement;
  private readonly mags: HTMLSpanElement;
  /** One fill element per spare magazine gauge, and what each shows (percent full). */
  private gauges: HTMLElement[] = [];
  private readonly shownFill: number[] = [];
  private shownNext = -1;
  /** Replica the gauges were last drawn for (a switch redraws them). */
  private shownReplica = '';
  /** A short notice that briefly takes the status line (see showNotice). */
  private noticeText = '';
  private noticeLeft = 0;
  private readonly status: HTMLDivElement;
  private readonly reloadBar: HTMLDivElement;
  private readonly reloadFill: HTMLDivElement;
  private shownInPlay = true;
  private shownAiming = false;
  private readonly crosshair: HTMLDivElement;
  /** The smallest gap the crosshair shows (px, Settings → Crosshair); the spread opens it further. */
  private minGap: number;
  private shownGap = -1;
  /** What is on screen now: the DOM is only written when one of these changes. */
  private shown = { name: '', fireMode: '', mag: -1, low: false, status: '', reloadPct: -1 };

  constructor(parent: HTMLElement, crosshair: CrosshairSettings) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-reddot"></div>
      <div class="hud-replica">
        <div class="hud-replica-name"><span></span><span class="hud-firemode"></span></div>
        <div class="hud-ammo"><span class="hud-mag"></span><span class="hud-mags"></span></div>
        <div class="hud-reload"><div></div></div>
        <div class="hud-status"></div>
      </div>`;
    parent.appendChild(this.root);
    this.name = this.root.querySelector('.hud-replica-name > span') as HTMLSpanElement;
    this.fireMode = this.root.querySelector('.hud-firemode') as HTMLSpanElement;
    this.mag = this.root.querySelector('.hud-mag') as HTMLSpanElement;
    this.mags = this.root.querySelector('.hud-mags') as HTMLSpanElement;
    this.status = this.root.querySelector('.hud-status') as HTMLDivElement;
    this.reloadBar = this.root.querySelector('.hud-reload') as HTMLDivElement;
    this.reloadFill = this.reloadBar.firstElementChild as HTMLDivElement;
    this.crosshair = crosshairElement();
    this.root.prepend(this.crosshair);
    this.minGap = crosshair.gap;
    styleCrosshair(this.crosshair, crosshair);
  }

  /** The player changed the crosshair on Settings → Crosshair. */
  setCrosshair(crosshair: CrosshairSettings): void {
    styleCrosshair(this.crosshair, crosshair);
    this.minGap = crosshair.gap;
    this.shownGap = -1;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** Shows `text` in the status line for `seconds` (unless a reload is under way). */
  showNotice(text: string, seconds: number): void {
    this.noticeText = text;
    this.noticeLeft = seconds;
  }

  /**
   * Once per frame (`dt` seconds). `inPlay` is false once you've been hit: the crosshair and ammo panel go
   * away. `spreadPx` is one standard deviation of where the next BB can go, in screen pixels. `aiming`: the sight
   * is up at your eye, so the red dot takes the crosshair's place.
   */
  update(armament: Armament, loadout: readonly ReplicaConfig[], inPlay: boolean, spreadPx: number, aiming: boolean, dt: number): void {
    if (this.shownInPlay !== inPlay) this.root.classList.toggle('out', !(this.shownInPlay = inPlay));
    if (this.shownAiming !== aiming) this.root.classList.toggle('aiming', (this.shownAiming = aiming));
    const gap = Math.round(Math.max(this.minGap, HUD.crosshairSpreadSigmas * spreadPx) / HUD.crosshairGapStep) * HUD.crosshairGapStep;
    if (gap !== this.shownGap) setCrosshairGap(this.crosshair, (this.shownGap = gap));
    const replica = loadout[armament.active]!;
    const ammo = armament.ammo[armament.active]!;
    const s = this.shown;
    if (s.name !== replica.name) this.name.textContent = s.name = replica.name;
    const fireMode = FIRE_MODE_LABELS[armament.modes[armament.active]!];
    if (s.fireMode !== fireMode) this.fireMode.textContent = s.fireMode = fireMode;
    if (s.mag !== ammo.mag) this.mag.textContent = String((s.mag = ammo.mag));
    // Compared on its own: switching replicas can change it with the count unchanged.
    const low = isLowAmmo(ammo.mag, replica.magSize);
    if (s.low !== low) this.mag.classList.toggle('low', (s.low = low));
    if (this.shownReplica !== replica.id) {
      this.shownReplica = replica.id;
      this.shownFill.length = 0; // different magazines: redraw every gauge
      for (const gauge of this.gauges) gauge.classList.remove('next');
      this.shownNext = -1;
      this.noticeLeft = 0; // a notice about the other replica no longer applies
    }
    this.updateGauges(ammo, replica.magSize);
    // A notice is about the moment it was raised: a reload starting (or time passing) ends it.
    this.noticeLeft = armament.reload > 0 ? 0 : Math.max(0, this.noticeLeft - dt);

    const reloading = armament.reload > 0;
    const pct = reloading ? Math.round((1 - armament.reload / replica.reloadTime) * 100) : -1;
    if (s.reloadPct !== pct) {
      s.reloadPct = pct;
      this.reloadBar.classList.toggle('active', reloading);
      this.reloadFill.style.width = `${Math.max(0, pct)}%`;
    }

    let status = '';
    if (reloading) status = 'Reloading';
    else if (this.noticeLeft > 0) status = this.noticeText;
    else if (ammo.mag === 0 && !canReload(ammo)) status = 'Out of BBs';
    else if (ammo.mag === 0) status = 'Empty: pull the trigger or press R to reload';
    else if (spareBBs(ammo) === 0) status = 'Last magazine';
    if (s.status !== status) this.status.textContent = s.status = status;
  }

  dispose(): void {
    this.root.remove();
  }

  /** A gauge per spare magazine, filled to how many BBs it has; the one a reload would take is marked. */
  private updateGauges(ammo: ReplicaAmmo, magSize: number): void {
    if (this.gauges.length !== ammo.pouch.length) {
      this.mags.innerHTML = '<i><b></b></i>'.repeat(ammo.pouch.length);
      this.gauges = Array.from(this.mags.querySelectorAll('i'));
      this.shownFill.length = 0;
      this.shownNext = -1;
    }
    for (let i = 0; i < ammo.pouch.length; i++) {
      const pct = Math.round((ammo.pouch[i]! / magSize) * 100);
      if (this.shownFill[i] === pct) continue;
      this.shownFill[i] = pct;
      const gauge = this.gauges[i]!;
      (gauge.firstElementChild as HTMLElement).style.height = `${pct}%`;
      gauge.classList.toggle('empty', pct === 0);
      // Same threshold as the loaded magazine's count turning orange.
      gauge.classList.toggle('low', ammo.pouch[i]! > 0 && isLowAmmo(ammo.pouch[i]!, magSize));
    }
    const next = nextSpare(ammo); // the one a reload would take (none if no spare is fuller)
    if (next !== this.shownNext) {
      this.gauges[this.shownNext]?.classList.remove('next');
      this.gauges[next]?.classList.add('next');
      this.shownNext = next;
    }
  }
}
