import { HUD_TEXT } from '../config/hudText';
import { FIRE_MODE_LABELS, type FireMode, type ReplicaConfig } from '../config/replicas';
import type { PictureSubject } from '../render/itemPictures';
import { type Armament, canReload, nextSpare, type ReplicaAmmo, spareBBs } from '../sim/armament';
import { emptyMagHint, isLowAmmo } from './ammoStatus';
import { ITEM_ICONS } from './menus/icons';
import { PictureSlot, type PictureSource } from './menus/menuPictures';
import { TimedFill } from './timedFill';

/** The replica panel's markup, inside the HUD (ui/hud.ts), which finds its parts by class. */
export const REPLICA_PANEL_HTML = `
      <div class="hud-replica">
        <div class="hud-replica-main">
          <div class="hud-replica-words">
            <div class="hud-replica-name"><span></span></div>
            <div class="hud-modes"></div>
          </div>
          <div class="hud-ammo"><span class="hud-mag"></span><span class="hud-spare"></span></div>
        </div>
        <div class="hud-mags"></div>
        <div class="hud-reload"><div></div></div>
        <div class="hud-status"></div>
      </div>`;

/**
 * The replica panel (graphics overhaul G4; the ammo block since M19): bottom right, the carried replica's picture (in
 * its scheme with its parts, from the game's ItemPictures; its line drawing until it arrives), its name, a chip per fire
 * mode it has with the current one lit, the loaded BBs large with the spare BBs and magazines beside them, a bar per
 * spare magazine filled to its BBs (the one a reload takes marked), the reload bar and the status line. Every write is
 * made only when what it shows changes; the reload bar's fill runs on one CSS transition (ui/timedFill.ts).
 */
export class ReplicaPanel {
  private readonly panel: HTMLElement;
  private readonly name: HTMLSpanElement;
  private readonly modes: HTMLElement;
  private readonly mag: HTMLSpanElement;
  private readonly spare: HTMLSpanElement;
  private readonly mags: HTMLElement;
  private readonly status: HTMLElement;
  private readonly reloadBar: HTMLElement;
  private readonly reloadFill: TimedFill;
  private readonly picture = new PictureSlot('hud-replica-pic');
  /** The game's pictures and each carried replica's subject, by slot (setPictures); none until given. */
  private source: PictureSource | null = null;
  private subjects: readonly (PictureSubject | null)[] = [];
  /** One chip per fire mode of the replica shown, and which is lit. */
  private chips: HTMLElement[] = [];
  private chipModes: readonly FireMode[] = [];
  private shownMode = -1;
  /** One bar per spare magazine, and what each shows (percent full). */
  private gauges: HTMLElement[] = [];
  private readonly shownFill: number[] = [];
  private shownNext = -1;
  /** The slot and replica shown (a switch redraws the chips, the bars and the picture). */
  private shownSlot = -1;
  private shownReplica = '';
  /** A short notice that briefly takes the status line (see showNotice). */
  private noticeText = '';
  private noticeLeft = 0;
  /** The reload key the empty-magazine hint was last worded for, and that hint (rebuilt only when the key changes). */
  private hintKey: string | null = null;
  private emptyHint = '';
  private readonly shown = { name: '', mag: -1, low: false, spareBBs: -1, spareMags: -1, status: '', reloadPct: -1 };

  /** `root`: the HUD, holding REPLICA_PANEL_HTML. `keyName`: the reload key's name now, for the empty-magazine hint. */
  constructor(
    root: HTMLElement,
    private readonly keyName: () => string,
  ) {
    const find = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    this.panel = find('.hud-replica-main');
    this.name = find('.hud-replica-name > span');
    this.modes = find('.hud-modes');
    this.mag = find('.hud-mag');
    this.spare = find('.hud-spare');
    this.mags = find('.hud-mags');
    this.status = find('.hud-status');
    this.reloadBar = find('.hud-reload');
    this.reloadFill = new TimedFill(this.reloadBar.firstElementChild as HTMLElement);
    this.panel.prepend(this.picture.root);
  }

  /** The game's pictures and each carried replica's subject, by slot (a null subject keeps the drawing). */
  setPictures(source: PictureSource | null, subjects: readonly (PictureSubject | null)[]): void {
    this.source = source;
    this.subjects = subjects;
    this.shownSlot = -1;
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
    if (this.shownSlot !== slot || this.shownReplica !== replica.id) this.switchTo(slot, replica);
    if (s.name !== replica.name) this.name.textContent = s.name = replica.name;
    const mode = this.chipModes.indexOf(armament.modes[slot]!);
    if (mode !== this.shownMode) {
      this.chips[this.shownMode]?.classList.remove('on');
      this.chips[mode]?.classList.add('on');
      this.shownMode = mode;
    }
    if (s.mag !== ammo.mag) this.mag.textContent = String((s.mag = ammo.mag));
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

    let status = '';
    if (reloading) status = HUD_TEXT.reloading;
    else if (this.noticeLeft > 0) status = this.noticeText;
    else if (ammo.mag === 0 && !canReload(ammo)) status = HUD_TEXT.outOfBBs;
    else if (ammo.mag === 0) status = this.emptyMagHint();
    else if (spareBBs(ammo) === 0) status = HUD_TEXT.lastMagazine;
    if (s.status !== status) this.status.textContent = s.status = status;
  }

  /** Another replica in hand: its picture, its fire modes' chips, and every bar drawn afresh. */
  private switchTo(slot: number, replica: ReplicaConfig): void {
    this.shownSlot = slot;
    this.shownReplica = replica.id;
    const drawing = replica.look.model === 'pistol' ? ITEM_ICONS.pistol : ITEM_ICONS.aeg;
    this.picture.show(this.source, this.subjects[slot] ?? null, drawing);
    if (this.chipModes !== replica.fireModes) {
      this.chipModes = replica.fireModes;
      this.chips = replica.fireModes.map((m) => {
        const chip = document.createElement('span');
        chip.className = 'hud-mode';
        chip.textContent = FIRE_MODE_LABELS[m];
        return chip;
      });
      this.modes.replaceChildren(...this.chips);
      this.shownMode = -1;
    }
    this.shownFill.length = 0; // different magazines: redraw every bar
    for (const gauge of this.gauges) gauge.classList.remove('next');
    this.shownNext = -1;
    this.noticeLeft = 0; // a notice about the other replica no longer applies
  }

  private emptyMagHint(): string {
    const key = this.keyName();
    if (key !== this.hintKey) this.emptyHint = emptyMagHint((this.hintKey = key));
    return this.emptyHint;
  }

  /** "/ 120 · 2 spare": the BBs in the spare magazines and how many of them hold any. */
  private updateSpare(ammo: ReplicaAmmo): void {
    const bbs = spareBBs(ammo);
    let mags = 0;
    for (const m of ammo.pouch) if (m > 0) mags++;
    if (bbs === this.shown.spareBBs && mags === this.shown.spareMags) return;
    this.shown.spareBBs = bbs;
    this.shown.spareMags = mags;
    this.spare.textContent = HUD_TEXT.spare(bbs, mags);
  }

  /** A bar per spare magazine, filled to how many BBs it has; the one a reload would take is marked. */
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
      (gauge.firstElementChild as HTMLElement).style.width = `${pct}%`;
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
