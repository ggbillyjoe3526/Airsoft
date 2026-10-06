import { SOUND_CUES } from './accessibility';

/**
 * The minimap (M23), top left while you play: the field round you, turned so the way you look is up. Your teammates
 * show at all times. The other team shows only where you last heard each of them (a footstep or a shot, as far as the
 * sound plays: the sound cue ranges), as a patch rather than a point, wider the further off it was, fading out.
 */
export const MINIMAP = {
  /** On-screen size (CSS px, square: the field fills the square panel, G4), before the HUD's scale. */
  size: 200,
  /** The canvas never draws finer than this many pixels per CSS pixel: the field drawing's detail (layerScale). */
  maxPixelRatio: 2,
  /** Metres from the middle to the panel's edge (its corners reach a little further). */
  viewRadius: 20,
  /**
   * Pixels per metre in the field drawing made once per match (it's scaled as drawn: about 4.9 px/m on screen, so this
   * stays sharp up to a pixel ratio of 2).
   */
  layerScale: 10,
  /** The furthest each sound kind places a player: as far as its sound cue shows (and the sound plays). */
  hearing: SOUND_CUES.range,
  /**
   * How long a heard player's patch stays (s), fading over the last `fade` of them. Each player has one patch: the
   * last thing they were heard doing.
   */
  noiseLife: 5,
  noiseFade: 2,
  /**
   * How far off a heard player's patch can sit from where they really were (m): this share of the distance to them,
   * at least `noiseMinBlur` and at most `noiseMaxBlur`. Footsteps place less well than shots.
   */
  noiseBlurShare: { step: 0.22, shot: 0.12 },
  noiseMinBlur: 1.5,
  noiseMaxBlur: 7,
  /** The patch's radius is the blur plus this (m), so the player is always inside it. */
  noisePad: 1,
  /** A player heard beyond the minimap's edge shows as a patch this big (px) on that edge, towards them. */
  rimPatch: 5,
  /** Blocks whose top is at most this high (m) above the floor they stand on draw as low cover; taller ones as walls. */
  lowCoverTop: 1.3,
  /** How close (m) a floor's top must be to a block's bottom for the block to stand on it. */
  floorContact: 0.05,
  /** Floors whose top is above this (m) draw as raised ground (docks, platforms). */
  raisedFloor: 0.3,
  /**
   * Maps with several storeys (M34c): feet at most this far (m) below a storey's floor already count as on it (the top
   * of a stair), and a storey's drawing leaves out every block starting more than `storeyCut` (m) above its floor (the
   * storeys over it: a body's height, so the walls and cover of the storey itself all show).
   */
  storeyPick: 0.5,
  storeyCut: 1.8,
  /** Sloping ground (M33c) is lightened by up to this much white at its highest point, so hills read on the minimap. */
  terrainShade: 0.22,
  /** Colours of the field drawing (CSS). */
  colours: {
    /** The circle under the field: the HUD's panel colour (style.css --hud-panel, audit section 6, item 14). */
    backdrop: 'rgba(12, 14, 18, 0.6)',
    ground: 'rgba(72, 80, 88, 0.92)',
    raised: 'rgba(96, 104, 110, 0.95)',
    ramp: 'rgba(80, 88, 94, 0.95)',
    low: 'rgba(150, 156, 160, 0.95)',
    tall: 'rgba(214, 218, 220, 0.98)',
    /** Laid over everything under the storey drawn (M34c), so the street through a stairwell reads as below you. */
    belowStorey: 'rgba(8, 10, 14, 0.55)',
    /** Bushes (M33e): a soft green, darker than cover, as they hide you but stop nothing. */
    bush: 'rgba(70, 120, 70, 0.75)',
    you: '#ffffff',
    out: 'rgba(170, 170, 170, 0.8)',
  },
} as const;
