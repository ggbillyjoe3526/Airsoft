import { HUD_TEXT } from '../config/hudText';
import { HUD } from '../config/render';
import { FIRE_MODE_LABELS, FIRE_MODE_LETTERS, type FireMode, type ReplicaConfig } from '../config/replicas';
import { type Armament, canReload, nextSpare, type ReplicaAmmo, spareBBs } from '../sim/armament';
import { isLowAmmo } from './ammoStatus';
import { HopGauge } from './hopGauge';
import { TimedFill } from './timedFill';

/** The replica panel's markup, inside the HUD (ui/hud.ts), which finds its parts by class. */
export const REPLICA_PANEL_HTML = `
      <div class="hud-replica">
        <div class="hud-hop" hidden><span class="hud-hop-label">${HUD_TEXT.hop.label}</span><span class="hud-hop-track"><b></b><i></i></span><span class="hud-hop-value"></span><span class="hud-hop-reach"></span></div>
        <div class="hud-replica-main">
          <div class="hud-replica-side">
            <div class="hud-modes"></div>
            <div class="hud-mags"></div>
          </div>
          <div class="hud-ammo"><span class="hud-mag"></span><span class="hud-spare"></span></div>
        </div>
        <div class="hud-reload"><div></div></div>
        <div class="hud-status"></div>
      </div>`;

/**
 * The replica panel (graphics overhaul G4; the ammo block since M19; compact since UI2, Beta 1 playtest): bottom right,
 * a lettered chip per fire mode the replica has (S, B, A) with the current one lit, a small box per spare magazine
 * filled to its BBs (the one a reload takes marked) under them, the loaded BBs with the spare BBs under them at the
 * right, the reload bar and the status line; over them, while you turn it, the hop-up readout (ui/hopGauge.ts, Dev 6
 * playtest item 15). No picture or name: the replica in hand shows which it is.
 * Every write is made only when what it shows changes; the reload bar's fill runs on one CSS transition
 * (ui/timedFill.ts). With the ammo counter off (Settings › HUD, AC1) the counts go and each box shows only whether its
 * magazine holds any BBs.
 */
export class ReplicaPanel {
  private readonly box: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly modes: HTMLElement;
  private readonly mag: HTMLSpanElement;
  private readonly spare: HTMLSpanElement;
  private readonly mags: HTMLElement;
  private readonly status: HTMLElement;
  private readonly reloadBar: HTMLElement;
  private readonly reloadFill: TimedFill;
  private readonly hop: HopGauge;
  /** One chip per fire mode of the replica shown, and which is lit. */
  private chips: HTMLElement[] = [];
  private chipModes: readonly FireMode[] = [];
  private shownMode = -1;
  /** One box per spare magazine, and what each shows (percent full). */
  private gauges: HTMLElement[] = [];
  private readonly shownFill: number[] = [];
  private shownNext = -1;
  /** The slot and replica shown (a switch redraws the chips and the boxes). */
  private shownSlot = -1;
  private shownReplica = '';
  /** A short notice that briefly takes the status line (see showNotice). */
  private noticeText = '';
  private noticeLeft = 0;
  private readonly shown = { mag: -1, low: false, spareBBs: -1, status: '', reloadPct: -1, holstered: false };
  /** Settings › HUD › Ammo counter (AC1): the BB counts and each box's fill shown (true), or only whether a spare holds any. */
  private counts = true;

  /** `root`: the HUD, holding REPLICA_PANEL_HTML. */
  constructor(root: HTMLElement) {
    const find = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    this.box = find('.hud-replica');
    this.panel = find('.hud-replica-main');
    this.modes = find('.hud-modes');
    this.mag = find('.hud-mag');
    this.spare = find('.hud-spare');
    this.mags = find('.hud-mags');
    this.status = find('.hud-status');
    this.reloadBar = find('.hud-reload');
    this.reloadFill = new TimedFill(this.reloadBar.firstElementChild as HTMLElement);
    this.hop = new HopGauge(find('.hud-hop'));
  }

  /** The hop-up dial of the replica in hand (`replica`, with `grams` BBs) was turned to `dial`: the readout shows it. */
  showHop(replica: ReplicaConfig, dial: number, grams: number): void {
    this.hop.show(replica, dial, grams, HUD.hopShowTime);
  }

  /**
   * Settings › HUD › Ammo counter (AC1): false takes the loaded count and the spare line away (replica.css) and draws each
   * spare's box full while it holds any BBs and hollow once empty, with no low stripes and no mark on the one a reload
   * takes; the status line still says Last magazine and Out of BBs. Every box is redrawn the next frame.
   */
  setCounts(shown: boolean): void {
    if (this.counts === shown) return;
    this.counts = shown;
    this.box.classList.toggle('no-count', !shown);
    this.shownFill.length = 0;
  }

  /** Shows `text` in the status line for `seconds` (unless a reload is under way). */
  showNotice(text: string, seconds: number): void {
    this.noticeText = text;
    this.noticeLeft = seconds;
  }

  /** Once per frame (`dt` seconds). */
  update(armament: Armament, loadout: readonly ReplicaConfig[], dt: number): void {
    const slot = armament.active;
    const replica = loadout[slot]!;
    const ammo = armament.ammo[slot]!;
    const handling = armament.handling[slot]!;
    const s = this.shown;
    const switched = this.shownSlot !== slot || this.shownReplica !== replica.id;
    if (switched) this.switchTo(slot, replica);
    // The readout is about the replica it was turned on: a switch or the holster takes it away.
    this.hop.update(dt, switched || armament.holstered);
    const mode = this.chipModes.indexOf(armament.modes[slot]!);
    if (mode !== this.shownMode) {
      this.chips[this.shownMode]?.classList.remove('on');
      this.chips[mode]?.classList.add('on');
      this.shownMode = mode;
    }
    if (s.mag !== ammo.mag) {
      this.mag.textContent = String((s.mag = ammo.mag));
      // The count's size follows its digits (replica.css), so a big count never runs into the chips beside it.
      this.mag.setAttribute('data-digits', String(this.mag.textContent.length));
    }
    // Compared on its own: switching replicas can change it with the count unchanged.
    const low = isLowAmmo(ammo.mag, handling.magSize);
    if (s.low !== low) this.mag.classList.toggle('low', (s.low = low));
    this.updateSpare(ammo);
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

    // Holstered (M92): the panel fades and says so; nothing else about the replica is news while it is away.
    if (s.holstered !== armament.holstered) this.panel.classList.toggle('holstered', (s.holstered = armament.holstered));
    let status = '';
    if (armament.holstered) status = HUD_TEXT.holstered;
    else if (reloading) status = HUD_TEXT.reloading;
    else if (this.noticeLeft > 0) status = this.noticeText;
    else if (ammo.mag === 0 && !canReload(ammo)) status = HUD_TEXT.outOfBBs;
    else if (spareBBs(ammo) === 0) status = HUD_TEXT.lastMagazine;
    if (s.status !== status) this.status.textContent = s.status = status;
  }

  /** Another replica in hand: its fire modes' chips, and every box drawn afresh. */
  private switchTo(slot: number, replica: ReplicaConfig): void {
    this.shownSlot = slot;
    this.shownReplica = replica.id;
    if (this.chipModes !== replica.fireModes) {
      this.chipModes = replica.fireModes;
      this.chips = replica.fireModes.map((m) => {
        const chip = document.createElement('span');
        chip.className = 'hud-mode';
        chip.textContent = FIRE_MODE_LETTERS[m];
        chip.setAttribute('aria-label', FIRE_MODE_LABELS[m]);
        return chip;
      });
      this.modes.replaceChildren(...this.chips);
      this.shownMode = -1;
    }
    this.shownFill.length = 0; // different magazines: redraw every box
    for (const gauge of this.gauges) gauge.classList.remove('next');
    this.shownNext = -1;
    this.noticeLeft = 0; // a notice about the other replica no longer applies
  }

  /** "/ 120": the BBs in the spare magazines (how many magazines hold any, the boxes show). */
  private updateSpare(ammo: ReplicaAmmo): void {
    const bbs = spareBBs(ammo);
    if (bbs === this.shown.spareBBs) return;
    this.shown.spareBBs = bbs;
    this.spare.textContent = HUD_TEXT.spare(bbs);
  }

  /**
   * A box per spare magazine, filled from the foot to how many BBs it has; the one a reload would take is marked. With
   * the counts off, a box is full while its magazine holds any BBs, and none is marked.
   */
  private updateGauges(ammo: ReplicaAmmo, magSize: number): void {
    if (this.gauges.length !== ammo.pouch.length) {
      this.mags.innerHTML = '<i><b></b></i>'.repeat(ammo.pouch.length);
      this.gauges = Array.from(this.mags.querySelectorAll('i'));
      this.shownFill.length = 0;
      this.shownNext = -1;
    }
    for (let i = 0; i < ammo.pouch.length; i++) {
      const bbs = ammo.pouch[i]!;
      const pct = !this.counts ? (bbs > 0 ? 100 : 0) : Math.round((bbs / magSize) * 100);
      if (this.shownFill[i] === pct) continue;
      this.shownFill[i] = pct;
      const gauge = this.gauges[i]!;
      (gauge.firstElementChild as HTMLElement).style.height = `${pct}%`;
      gauge.classList.toggle('empty', pct === 0);
      // Same threshold as the loaded magazine's count turning orange.
      gauge.classList.toggle('low', this.counts && bbs > 0 && isLowAmmo(bbs, magSize));
    }
    // The one a reload would take (none if no spare is fuller); unmarked with the counts off, where it would say which is fullest.
    const next = this.counts ? nextSpare(ammo) : -1;
    if (next !== this.shownNext) {
      this.gauges[this.shownNext]?.classList.remove('next');
      this.gauges[next]?.classList.add('next');
      this.shownNext = next;
    }
  }
}
