import { GAME_STATS } from './gameStats';
import { overlay } from './statsFile';

/**
 * Weapon lights (M33h): a torch clipped to a replica, unlocked from the asset pool (pool.md's Lights table, slot
 * `light`). Switched on and off with the Weapon torch key (config/controls.ts). On a night preset it lights a cone the
 * holder and the bots see further in, and its lens gives the holder away; by day it is left off the replica
 * (sim/torch.ts partsUnder). No rarity tier improves it (pool/kit.ts scaledCategory): a brighter torch is a new row.
 * First guesses for the owner's playtest.
 */
export type LightId = 'weaponTorch';

export interface TorchConfig {
  /** One line on the Loadout's Customise screen. */
  blurb: string;
  /** How far the beam lights a target well enough for a bot to make it out (m): NIGHT_SIGHT.lit at most. */
  reach: number;
  /** The bright hotspot's full angle (degrees): the real spot light's cone and the drawn beam's core. */
  beamDeg: number;
  /** The spill round it (full angle, degrees): what the beam lights for the bots, and the drawn cone's edge. */
  spillDeg: number;
  /** The light's colour (presentation): a cool white LED. */
  colour: number;
}

/** Built-in numbers; stats.md's Lights table is what the game uses (colour stays here: it is presentation). */
export const TORCHES: Readonly<Record<LightId, TorchConfig>> = overlay<TorchConfig>(
  {
    weaponTorch: {
      blurb: 'A weapon torch: T switches it on. At night it lights the way and the bots in it, and gives you away.',
      reach: 40,
      beamDeg: 14,
      spillDeg: 28,
      colour: 0xeef4ff,
    },
  },
  GAME_STATS.lights,
) as Record<LightId, TorchConfig>;

/** The light keys the code knows (pool.md's Key column for a Lights row). */
export const LIGHT_KEYS = Object.keys(TORCHES) as LightId[];

/** Whether `key` is a light the code knows. */
export function isLightId(key: string | null | undefined): key is LightId {
  return !!key && key in TORCHES;
}
