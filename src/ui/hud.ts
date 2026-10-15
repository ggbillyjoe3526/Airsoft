import type { Action } from '../config/controls';
import { HUD_TEXT } from '../config/hudText';
import type { CrosshairSettings } from '../config/matchInfo';
import { type SightId, sightConfig } from '../config/optics';
import type { ReplicaConfig } from '../config/replicas';
import type { PictureSubject } from '../render/itemPictures';
import type { Armament } from '../sim/armament';
import { crosshairElement, crosshairGap, setCrosshairGap, styleCrosshair } from './crosshair';
import type { PictureSource } from './menus/menuPictures';
import { REPLICA_PANEL_HTML, ReplicaPanel } from './replicaPanel';

/**
 * The in-game HUD: the crosshair (the player's own, Settings → Crosshair; or the red dot, or a scope's fine
 * reticle, while aiming down one), the "Rested" tag under it while the replica rests on cover (M104), and the replica
 * panel (ui/replicaPanel.ts: picture, name, fire modes, BBs and magazines, reload). The DOM is only touched when a
 * displayed value changes.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly panel: ReplicaPanel;
  private shownInPlay = true;
  private shownAiming = false;
  private shownIrons = false;
  private shownScoped = false;
  private shownRested = false;
  private readonly crosshair: HTMLDivElement;
  /** The smallest gap the crosshair shows (px, Settings → Crosshair); the spread opens it further. */
  private minGap: number;
  /** The crosshair opens with the spread (Settings → Crosshair, audit UI-21: off is static). */
  private dynamic: boolean;
  private shownGap = -1;

  /** `keyName` gives the key the player has bound to an action now ('' if unbound), so hints follow rebinding. */
  constructor(parent: HTMLElement, keyName: (action: Action) => string, crosshair: CrosshairSettings) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-reddot"></div>
      <div class="hud-scope"><i></i><i></i><i></i></div>
      <div class="hud-rest" aria-hidden="true">${HUD_TEXT.rested}</div>${REPLICA_PANEL_HTML}`;
    parent.appendChild(this.root);
    this.panel = new ReplicaPanel(this.root, () => keyName('reload'));
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

  /** The carried replicas' pictures (graphics overhaul G4): the game's ItemPictures and each slot's subject. */
  setPictures(source: PictureSource | null, subjects: readonly (PictureSubject | null)[]): void {
    this.panel.setPictures(source, subjects);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /**
   * The replica rests on cover (M104): the "Rested" tag shows under the sight. Shown from halfway settled, so it comes
   * and goes with the steadier aim rather than flickering at its edges.
   */
  setRested(rested: boolean): void {
    if (this.shownRested !== rested) this.root.classList.toggle('rested', (this.shownRested = rested));
  }

  /** Settings › HUD › Ammo counter (AC1): false hides the BB counts on the replica panel (ui/replicaPanel.ts setCounts). */
  setAmmoCounter(shown: boolean): void {
    this.panel.setCounts(shown);
  }

  /** Shows `text` in the status line for `seconds` (unless a reload is under way). */
  showNotice(text: string, seconds: number): void {
    this.panel.showNotice(text, seconds);
  }

  /**
   * Once per frame (`dt` seconds). `inPlay` is false once you've been hit: the crosshair and the replica panel go
   * away. `spreadPx` is one standard deviation of where the next BB can go, in screen pixels. `sight`: the sight
   * up at your eye (null if none): an optic's red dot or scope reticle takes the crosshair's place; iron sights
   * (M84) take it themselves, with nothing drawn over them.
   */
  update(armament: Armament, loadout: readonly ReplicaConfig[], inPlay: boolean, spreadPx: number, sight: SightId | null, dt: number): void {
    if (this.shownInPlay !== inPlay) this.root.classList.toggle('out', !(this.shownInPlay = inPlay));
    const aiming = sight !== null && sight !== 'iron';
    if (this.shownAiming !== aiming) this.root.classList.toggle('aiming', (this.shownAiming = aiming));
    const irons = sight === 'iron';
    if (this.shownIrons !== irons) this.root.classList.toggle('irons', (this.shownIrons = irons));
    const scoped = sight !== null && sightConfig(sight).scope;
    if (this.shownScoped !== scoped) this.root.classList.toggle('scoped', (this.shownScoped = scoped));
    const gap = crosshairGap(this.minGap, spreadPx, this.dynamic);
    if (gap !== this.shownGap) setCrosshairGap(this.crosshair, (this.shownGap = gap));
    this.panel.update(armament, loadout, dt);
  }

  dispose(): void {
    this.root.remove();
  }
}
