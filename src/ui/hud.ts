import type { ReplicaConfig } from '../config/replicas';
import { HUD } from '../config/render';
import type { Armament } from '../sim/armament';

/**
 * Minimal in-game HUD: crosshair and the replica panel (name, magazine / reserve, reload progress).
 * DOM is only touched when a displayed value changes.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly mag: HTMLSpanElement;
  private readonly reserve: HTMLSpanElement;
  private readonly status: HTMLDivElement;
  private readonly reloadBar: HTMLDivElement;
  private readonly reloadFill: HTMLDivElement;
  private shown = { name: '', mag: -1, reserve: -1, status: '', reloadPct: -1 };

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-crosshair"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="hud-replica">
        <div class="hud-replica-name"></div>
        <div class="hud-ammo"><span class="hud-mag"></span><span class="hud-sep">/</span><span class="hud-reserve"></span></div>
        <div class="hud-reload"><div></div></div>
        <div class="hud-status"></div>
      </div>`;
    parent.appendChild(this.root);
    this.name = this.root.querySelector('.hud-replica-name') as HTMLDivElement;
    this.mag = this.root.querySelector('.hud-mag') as HTMLSpanElement;
    this.reserve = this.root.querySelector('.hud-reserve') as HTMLSpanElement;
    this.status = this.root.querySelector('.hud-status') as HTMLDivElement;
    this.reloadBar = this.root.querySelector('.hud-reload') as HTMLDivElement;
    this.reloadFill = this.reloadBar.firstElementChild as HTMLDivElement;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(armament: Armament, loadout: readonly ReplicaConfig[]): void {
    const replica = loadout[armament.active]!;
    const ammo = armament.ammo[armament.active]!;
    const s = this.shown;
    if (s.name !== replica.name) this.name.textContent = s.name = replica.name;
    if (s.mag !== ammo.mag) {
      this.mag.textContent = String((s.mag = ammo.mag));
      this.mag.classList.toggle('low', ammo.mag <= Math.ceil(replica.magSize * HUD.lowAmmoFraction));
    }
    if (s.reserve !== ammo.reserve) this.reserve.textContent = String((s.reserve = ammo.reserve));

    const reloading = armament.reload > 0;
    const pct = reloading ? Math.round((1 - armament.reload / replica.reloadTime) * 100) : -1;
    if (s.reloadPct !== pct) {
      s.reloadPct = pct;
      this.reloadBar.classList.toggle('active', reloading);
      this.reloadFill.style.width = `${Math.max(0, pct)}%`;
    }

    let status = '';
    if (reloading) status = 'Reloading';
    else if (ammo.mag === 0 && ammo.reserve === 0) status = 'Out of BBs';
    else if (ammo.mag === 0) status = 'Empty: pull the trigger or press R to reload';
    if (s.status !== status) this.status.textContent = s.status = status;
  }

  dispose(): void {
    this.root.remove();
  }
}
