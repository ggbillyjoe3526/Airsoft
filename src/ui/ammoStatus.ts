import { HUD } from '../config/render';

/**
 * True if `count` BBs is low for a magazine of `magSize` (the HUD shows it orange): at most
 * HUD.lowAmmoFraction of a full one. The same count can be low for one replica and not another.
 */
export function isLowAmmo(count: number, magSize: number): boolean {
  return count <= Math.ceil(magSize * HUD.lowAmmoFraction);
}

/** The status line for an empty magazine with spares left, naming the player's reload key ('' if it's unbound). */
export function emptyMagHint(reloadKey: string): string {
  return reloadKey ? `Empty: pull the trigger or press ${reloadKey} to reload` : 'Empty: pull the trigger to reload';
}
