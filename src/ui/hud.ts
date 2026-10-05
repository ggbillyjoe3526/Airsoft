import type { Action } from '../config/controls';
import type { CrosshairSettings } from '../config/matchInfo';
import { type OpticId, OPTICS } from '../config/optics';
import { FIRE_MODE_LABELS, type ReplicaConfig } from '../config/replicas';
import { type Armament, canReload, nextSpare, type ReplicaAmmo, spareBBs } from '../sim/armament';
import { emptyMagHint, isLowAmmo } from './ammoStatus';
import { crosshairElement, crosshairGap, setCrosshairGap, styleCrosshair } from './crosshair';
import { TimedFill } from './timedFill';

/**
 * Minimal in-game HUD: crosshair (the player's own, Settings → Crosshair; or the red dot, or a scope's eyepiece and reticle, while aiming down one) and the replica panel (name and fire mode, BBs in the loaded magazine, a
 * gauge per spare magazine showing how full it is, with the one a reload takes marked, and reload progress).
 * DOM is only touched when a displayed value changes (the reload bar's fill runs on one CSS transition, ui/timedFill.ts).
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
  /** The reload key the empty-magazine hint was last worded for, and that hint (rebuilt only when the key changes). */
  private hintKey: string | null = null;
  private emptyHint = '';
  private readonly status: HTMLDivElement;
  private readonly reloadBar: HTMLDivElement;
  /** The reload bar's fill: one CSS transition per reload, not a write per percent (M64, audit UI-11). */
  private readonly reloadFill: TimedFill;
  private shownInPlay = true;
  private shownAiming = false;
  private shownScoped = false;
  private readonly crosshair: HTMLDivElement;
  /** The smallest gap the crosshair shows (px, Settings → Crosshair); the spread opens it further. */
  private minGap: number;
  /** The crosshair opens with the spread (Settings → Crosshair, audit UI-21: off is static). */
  private dynamic: boolean;
  private shownGap = -1;
  /** What is on screen now: the DOM is only written when one of these changes. */
  private shown = { name: '', fireMode: '', mag: -1, low: false, status: '', reloadPct: -1 };

  /** `keyName` gives the key the player has bound to an action now ('' if unbound), so hints follow rebinding. */
  constructor(
    parent: HTMLElement,
    private readonly keyName: (action: Action) => string,
    crosshair: CrosshairSettings,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-reddot"></div>
      <div class="hud-scope"><i></i><i></i><i></i></div>
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
    this.reloadFill = new TimedFill(this.reloadBar.firstElementChild as HTMLElement);
    this.crosshair = crosshairElement();
    this.root.prepend(this.crosshair);
    this.minGap = crosshair.gap;
    this.dynamic = crosshair.dynamic === 'on';
    styleCrosshair(this.crosshair, crosshair);
  }

  /** The player changed the crosshair on Settings → Crosshair. */
  setCrosshair(crosshair: CrosshairSettings): void {
    styleCrosshair(this.crosshair, crosshair);
    this.minGap = crosshair.gap;
    this.dynamic = crosshair.dynamic === 'on';
    this.shownGap = -1;
  }

  private emptyMagHint(): string {
    const key = this.keyName('reload');
    if (key !== this.hintKey) this.emptyHint = emptyMagHint((this.hintKey = key));
    return this.emptyHint;
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
   * away. `spreadPx` is one standard deviation of where the next BB can go, in screen pixels. `sight`: the optic
   * up at your eye (null if none), whose red dot or scope reticle takes the crosshair's place.
   */
  update(armament: Armament, loadout: readonly ReplicaConfig[], inPlay: boolean, spreadPx: number, sight: OpticId | null, dt: number): void {
    if (this.shownInPlay !== inPlay) this.root.classList.toggle('out', !(this.shownInPlay = inPlay));
    const aiming = sight !== null;
    if (this.shownAiming !== aiming) this.root.classList.toggle('aiming', (this.shownAiming = aiming));
    const scoped = sight !== null && OPTICS[sight].scope;
    if (this.shownScoped !== scoped) this.root.classList.toggle('scoped', (this.shownScoped = scoped));
    const gap = crosshairGap(this.minGap, spreadPx, this.dynamic);
    if (gap !== this.shownGap) setCrosshairGap(this.crosshair, (this.shownGap = gap));
    const replica = loadout[armament.active]!;
    const ammo = armament.ammo[armament.active]!;
    const s = this.shown;
    if (s.name !== replica.name) this.name.textContent = s.name = replica.name;
    const fireMode = FIRE_MODE_LABELS[armament.modes[armament.active]!];
    if (s.fireMode !== fireMode) this.fireMode.textContent = s.fireMode = fireMode;
    if (s.mag !== ammo.mag) this.mag.textContent = String((s.mag = ammo.mag));
    // Compared on its own: switching replicas can change it with the count unchanged.
    const handling = armament.handling[armament.active]!;
    const low = isLowAmmo(ammo.mag, handling.magSize);
    if (s.low !== low) this.mag.classList.toggle('low', (s.low = low));
    if (this.shownReplica !== replica.id) {
      this.shownReplica = replica.id;
      this.shownFill.length = 0; // different magazines: redraw every gauge
      for (const gauge of this.gauges) gauge.classList.remove('next');
      this.shownNext = -1;
      this.noticeLeft = 0; // a notice about the other replica no longer applies
    }
    this.updateGauges(ammo, handling.magSize);
    // A notice is about the moment it was raised: a reload starting (or time passing) ends it.
    this.noticeLeft = armament.reload > 0 ? 0 : Math.max(0, this.noticeLeft - dt);

    const reloading = armament.reload > 0;
    const pct = reloading ? Math.round((1 - armament.reload / handling.reloadTime) * 100) : -1;
    if (s.reloadPct !== pct) {
      s.reloadPct = pct;
      this.reloadBar.classList.toggle('active', reloading);
      if (!reloading) this.reloadFill.hold(0);
    }
    if (reloading) this.reloadFill.follow(1 - armament.reload / handling.reloadTime, armament.reload);

    let status = '';
    if (reloading) status = 'Reloading';
    else if (this.noticeLeft > 0) status = this.noticeText;
    else if (ammo.mag === 0 && !canReload(ammo)) status = 'Out of BBs';
    else if (ammo.mag === 0) status = this.emptyMagHint();
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
