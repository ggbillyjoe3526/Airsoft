import { BALLISTICS } from '../config/ballistics';
import { HUD_TEXT } from '../config/hudText';
import { HOP_UP, type ReplicaConfig } from '../config/replicas';
import { bestHopUp, hopUpReach } from '../sim/hopUp';

/**
 * What the hop-up readout says about a level shot from `replica` with its dial at `dial` and `grams` BBs: how far it
 * stays on target, or that it floats (the Loadout's readout, ui/loadoutChoice.ts, in the HUD's few words).
 */
export function hopReachText(replica: ReplicaConfig, dial: number, grams: number): string {
  const { onTargetTo, peakRise } = hopUpReach(replica, dial, BALLISTICS, grams);
  if (peakRise > HOP_UP.onTargetBand) return HUD_TEXT.hop.floats;
  return onTargetTo >= HOP_UP.readoutRange ? HUD_TEXT.hop.past(HOP_UP.readoutRange) : HUD_TEXT.hop.flatTo(Math.round(onTargetTo));
}

/**
 * The hop-up readout on the replica panel (Dev 6 playtest item 15): while you turn the dial in play, and for
 * HUD.hopShowTime after, a row over the replica's name with the dial as a notched bar (a mark at the setting that keeps
 * this BB on target furthest), its percentage and what it does ("Flat to 39 m", "Too much · floats"). The words are
 * worked out per turn of the dial (a flight of one BB, as the Loadout's readout does), never per frame.
 */
export class HopGauge {
  private readonly fill: HTMLElement;
  private readonly best: HTMLElement;
  private readonly value: HTMLElement;
  private readonly reach: HTMLElement;
  private left = 0;
  private shown = false;
  /** The replica and BB weight the best-setting mark was found for (bestHopUp flies a BB per notch). */
  private bestFor = '';

  /** `row`: the panel's `.hud-hop` (REPLICA_PANEL_HTML). */
  constructor(private readonly row: HTMLElement) {
    const find = (selector: string) => row.querySelector(selector) as HTMLElement;
    this.fill = find('.hud-hop-track b');
    this.best = find('.hud-hop-track i');
    this.value = find('.hud-hop-value');
    this.reach = find('.hud-hop-reach');
  }

  /** The dial of `replica` (with `grams` BBs) now reads `dial`: shown for `seconds`. */
  show(replica: ReplicaConfig, dial: number, grams: number, seconds: number): void {
    const key = `${replica.id}@${grams}`;
    if (key !== this.bestFor) {
      this.bestFor = key;
      this.best.style.left = `${Math.round(bestHopUp(replica, BALLISTICS, grams).dial * 100)}%`;
    }
    const pct = Math.round(dial * 100);
    this.fill.style.width = `${pct}%`;
    this.value.textContent = `${pct}%`;
    this.reach.textContent = hopReachText(replica, dial, grams);
    this.left = seconds;
    if (!this.shown) this.row.hidden = !(this.shown = true);
  }

  /** Once per frame: counts its time down and goes when it is up (or at once with `hide`). */
  update(dt: number, hide = false): void {
    if (!this.shown) return;
    this.left -= dt;
    if (hide || this.left <= 0) this.row.hidden = !(this.shown = false);
  }
}
