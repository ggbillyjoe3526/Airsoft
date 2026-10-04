import type * as THREE from 'three';
import type { MapData } from '../map/mapTypes';
import { drawDecalAtlas } from './mapDecals';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapNeedsRebuild, restyleMap } from './mapMeshes';
import type { SurfaceTextures } from './proceduralTextures';

/**
 * The last map's built meshes, kept between sessions (audit CORE-33): Quit → Play on the same map, or the range rebuilt
 * after a loadout change, takes them back instead of building them again (the larger part of a match build). Kept per
 * map (its data) and per look (map detail and the steel's sheen: what changes the geometry or the material kinds); a
 * look that only changes relief or the texture size is applied to the kept meshes in place, as Settings → Graphics does
 * in play. One map is kept: taking another frees it. The renderer owns the cache and frees it with itself, on a
 * context swap while no session holds it, and on a quality change that would build it again (`trim`).
 */
export class MapMeshCache {
  private kept: { map: MapData; look: MapLook; group: THREE.Group } | null = null;
  /** A session holds the kept meshes (between take and release). */
  private held = false;

  /** `decalAtlas` as for buildMapMeshes (the tests pass a stand-in). */
  constructor(private readonly decalAtlas: (() => THREE.Texture) | null = drawDecalAtlas) {}

  /** Whether the last `take` handed back meshes already built (for the build's `?perf` line). */
  reused = false;

  /**
   * The map's meshes in `look` for a session, not yet in a scene: the kept ones when they are this map's (restyled to
   * `look`, or built again when the look needs it), else built (the kept ones freed). Give them back with `release`.
   */
  take(map: MapData, textures: SurfaceTextures, look: MapLook): THREE.Group {
    const kept = this.kept;
    this.reused = kept !== null && kept.map === map && !mapNeedsRebuild(kept.look, look);
    if (kept && kept.map === map) {
      kept.group = restyleMap(kept.group, map, textures, kept.look, look, this.decalAtlas);
      kept.look = look;
    } else {
      this.clear();
      this.kept = { map, look, group: buildMapMeshes(map, textures, look, this.decalAtlas) };
    }
    this.held = true;
    return this.kept!.group;
  }

  /** New settings for the session holding the meshes (MatchSession.setQuality): returns its (maybe new) group. */
  restyle(textures: SurfaceTextures, look: MapLook): THREE.Group {
    const kept = this.kept!;
    kept.group = restyleMap(kept.group, kept.map, textures, kept.look, look, this.decalAtlas);
    kept.look = look;
    return kept.group;
  }

  /** The session is done with the meshes: out of its scene, kept for the next take. */
  release(): void {
    this.held = false;
    this.kept?.group.removeFromParent();
  }

  /**
   * New quality settings while no session holds the meshes: freed when that look would build them again (map detail,
   * the steel's sheen), kept otherwise (relief and texture size follow on the next take).
   */
  trim(look: MapLook): void {
    if (!this.held && this.kept && mapNeedsRebuild(this.kept.look, look)) this.clear();
  }

  /**
   * The WebGL context is being replaced (antialiasing, REN-04): meshes no session holds are freed, so nothing outside
   * the scene keeps the old renderer alive (REN-24); held ones are in the scene and handed over with it.
   */
  contextReplaced(): void {
    if (!this.held) this.clear();
  }

  /** Frees the kept meshes (a session must not hold them: Game disposes its session first). */
  clear(): void {
    if (this.kept) disposeMapMeshes(this.kept.group);
    this.kept = null;
    this.held = false;
  }
}
