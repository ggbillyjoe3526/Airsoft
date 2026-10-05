import { AMBIENCES, type Ambience, FIRE_SOUND, type LoopId, type ReverbSpec } from '../config/audio';
import { cues, FOOTSTEP_PACES, isMapCue, type SoundCue } from '../config/sounds';
import { buildGroundGrid, GROUND_SURFACES, type GroundGrid } from '../map/groundSurfaces';
import type { MapData } from '../map/mapTypes';
import type { Vec3 } from '../sim/vec';

/**
 * What a match sounds like where it is played (M33j), worked out once from the map's data and the lighting preset's night
 * flag, never from a map's name: the field's ambience by day or by night, the ground grid footsteps read on terrain (the
 * one the terrain is painted from), the camp fires that crackle, and the map cues, loops and echo all that needs rendered.
 * Pure data: no Web Audio.
 */
export interface Soundscape {
  readonly ambience: Ambience;
  /** The ground underfoot on terrain (map/groundSurfaces.ts), or null: footsteps off blocks are concrete. */
  readonly ground: GroundGrid | null;
  /** Where each burning camp fire is (a `kind: 'fire'` light, at night only: by day no pool or fixture is lit). */
  readonly fires: readonly Vec3[];
  /** The map cues it plays (config/sounds.ts MAP_CUE_SEEDS), to render as the match loads. */
  readonly cues: readonly SoundCue[];
  /** The loops it plays (config/audio.ts AMBIENT_LOOPS). */
  readonly loops: readonly LoopId[];
  /** The echo every in-world sound feeds (its ambience's; M69, audit AUD-10): AUDIO.reverb is the yard's. */
  readonly reverb: ReverbSpec;
}

/** The ambience's map cues, loops and echo, plus the fire's crackle if there is a fire. */
function needs(ambience: Ambience, fires: readonly Vec3[], ground: GroundGrid | null): Pick<Soundscape, 'cues' | 'loops' | 'reverb'> {
  const loops: LoopId[] = ambience.beds.map((b) => b.loop);
  if (fires.length > 0) loops.push(FIRE_SOUND.loop);
  const wanted: SoundCue[] = [];
  if (ambience.call) wanted.push(ambience.call.cue);
  if (ground) {
    // Only the surfaces the grid holds: a map of grass and earth renders no gravel.
    const present = new Set(ground.surface);
    for (const id of present) for (const pace of FOOTSTEP_PACES) wanted.push(cues.step(GROUND_SURFACES[id]!, pace));
  }
  return { cues: wanted.filter(isMapCue), loops: [...new Set(loops)], reverb: ambience.reverb };
}

/** The soundscape of a field with no data for it, by day: the yard, with its birds (Depot, the range). */
export const YARD_BY_DAY: Soundscape = { ambience: AMBIENCES.yard.day, ground: null, fires: [], ...needs(AMBIENCES.yard.day, [], null) };

/**
 * Each map's soundscapes worked out so far, by day and at night (M65, audit AUD-01): New game's spare time works out the
 * picked field's ahead of Play (AudioEngine.prefetch) and the match takes the same one back, so Woodland's ground grid
 * (30-50 ms) isn't built twice. Weakly held, like the maps under lighting (map/lightingChoice.ts).
 */
const worked = new WeakMap<MapData, { day?: Soundscape; night?: Soundscape }>();

/**
 * The soundscape of `map` played by day or at night (`night`: the session's resolved lighting preset's flag,
 * LightingPreset.night). MapData.ambience absent is the yard; no ambience has birds by night. The same map and flag give
 * the same object each time.
 */
export function soundscapeOf(map: MapData, night: boolean): Soundscape {
  let held = worked.get(map);
  if (!held) worked.set(map, (held = {}));
  const when = night ? 'night' : 'day';
  let scene = held[when];
  if (!scene) {
    const ambience = AMBIENCES[map.ambience ?? 'yard'][when];
    const ground = map.terrain ? buildGroundGrid(map) : null;
    const fires = night ? (map.lights ?? []).filter((l) => l.kind === 'fire').map((l) => l.position) : [];
    held[when] = scene = { ambience, ground, fires, ...needs(ambience, fires, ground) };
  }
  return scene;
}
