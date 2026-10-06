/**
 * Item pictures (graphics overhaul G2): the small images of replicas, parts and colour schemes the menus show, rendered
 * in the game from the same models the hands hold (render/itemPictures.ts), so a picture always matches what you carry
 * and nothing extra is downloaded. One picture is drawn per animation frame, at most, and kept for the visit.
 */
export const ITEM_PICTURE = {
  /**
   * Picture sizes in pixels (width, height), shown at about half that so they stay sharp on a high-density screen: a
   * replica's is wide, a part's or a colour's square.
   */
  sizes: { wide: [384, 192], square: [256, 256] } as const,
  /** Multisampling on the picture's render target, for clean edges. */
  samples: 4,
  /** The camera: a narrow lens, turned `yaw` (radians) from straight side-on towards the muzzle and `pitch` down onto it. */
  fov: 20,
  yaw: 0.32,
  pitch: 0.2,
  /** Room left round the item, as a share of its size. */
  margin: 1.12,
  /** Studio light: a sky-and-ground fill, a warm key from the front above, a cool rim from behind (intensities). */
  light: {
    sky: 0xdfe8ff,
    ground: 0x3a3530,
    fill: 1.6,
    key: { colour: 0xfff2e0, intensity: 2.6, at: [1.2, 2.2, -1.6] as const },
    rim: { colour: 0x9fc8ff, intensity: 2.2, at: [-1.4, 1.0, 2.0] as const },
  },
  /** Brightness before the filmic curve (render/itemPictures.ts toneMap). */
  exposure: 1.15,
} as const;
