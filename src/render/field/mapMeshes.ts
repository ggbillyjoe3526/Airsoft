import * as THREE from 'three';
import { BAKED_LIGHT } from '../../config/bake';
import { type BakedLightMode, type QualitySettings, SURFACES, type SurfaceTextureId } from '../../config/render';
import { type ShaderWear, WEATHERING } from '../../config/weathering';
import { groundGridOf } from '../../map/groundSurfaces';
import type { MapBlock, MapData } from '../../map/mapTypes';
import { terrainHeightAt } from '../../map/terrain';
import { buildCanopyMesh } from './canopyMeshes';
import { blockShade, blockTint, castsShadow, styleOf } from './mapPieces/blockStyles';
import { cityPropTextures, isCityProp } from './mapPieces/cityProps';
import type { Piece } from './mapPieces/pieceKit';
import { pieceShape } from './mapPieces/pieceShape';
import { blockPieces } from './mapPieces/pieceTable';
import { appendRamp } from './mapPieces/rampWedge';
import { hasCeiling } from './mapPieces/sitePieces';
import { disposeProbeUniforms, probeUniforms, tintVertices } from '../light/bakedLight';
import { appendCuboid, type Buffers, type CuboidShape, emptyBuffers, PLAIN } from './cuboidMesh';
import { buildFoliageMesh } from './foliageMeshes';
import { appendFixtureSolids } from '../light/lightFixtures';
import { keyDirection, resolveLighting } from '../light/lightingPreset';
import { groundUnder } from '../../map/nightSight';
import { buildJunkMesh, buildPuddleMesh } from '../dressing/dressingMeshes';
import { buildMapDecals, disposeMapDecals, drawDecalAtlas } from './mapDecals';
import { placeDressing } from '../dressing/mapDressing';
import { appendNatureShape, appendPebbles, isNatureKind } from './natureShapes';
import type { ProbeGrid } from '../light/probeGrid';
import { CORE_SURFACES, type ProceduralTexture, type SurfaceTextures, surfaceTexture } from './proceduralTextures';
import { isSurfaceMaterial, setReliefMaps, type SurfaceMaterial } from './surfaceMaterials';
import { releaseNormalMaps, usesNormalMaps } from './surfaceNormals';
import { patchesShader, patchSurfaceMaterial, type ProbeUniforms, type SurfacePatch } from '../light/surfaceShader';
import { buildTerrainMesh } from './terrainMeshes';
import { buildOccluders } from './vertexOcclusion';

/** Every block a map draws: its blocks, then its look-only `decor` (M34f). */
export function drawnBlocks(map: MapData): readonly MapBlock[] {
  return map.decor ? [...map.blocks, ...map.decor] : map.blocks;
}

/**
 * The surface textures `map`'s meshes are painted with (M33i): the core set every map has, and the woods' ones its
 * blocks, ground and light fixtures use, so a map draws only what it shows (Depot: the core set, as before).
 */
export function texturesFor(map: MapData): SurfaceTextureId[] {
  const ids = new Set<SurfaceTextureId>(CORE_SURFACES);
  for (const b of drawnBlocks(map)) {
    ids.add(styleOf(b).texture);
    if (isCityProp(b.kind) && !b.finish) for (const id of cityPropTextures(b.kind)) ids.add(id);
  }
  for (const l of map.lights ?? []) {
    if (l.kind === 'fire') ids.add('stone').add('bark');
    if (l.kind === 'lantern') ids.add('bark');
  }
  if (map.ground) ids.add('groundDetail');
  if (drawnBlocks(map).some(hasCeiling)) ids.add('plaster');
  if (map.ground?.patches.some((p) => p.surface === 'gravel')) ids.add('stone');
  return [...ids];
}

/** What a built map looks like (from QualitySettings): rebuilt when `detail` or `steelSheen` changes (mapNeedsRebuild). */
export interface MapLook {
  /** Surface relief on, drawn as normal maps (else bump maps). */
  relief: boolean;
  normalMaps: boolean;
  /** Map detail: bevels, baked occlusion on finer tiles, ground variation, prop detail, signs (render/field/mapDecals.ts). */
  detail: boolean;
  /** Steel tread plate as painted steel that picks up the sky (with Environment lighting). */
  steelSheen: boolean;
  /**
   * Tree crowns and bushes cast shadows (M33i): only where the shadow map follows the view (High), whose texels are
   * fine enough for them and whose triangle budget has room; Medium's whole-field map is stretched already, and its
   * 200k ceiling is spent on the figures at 5v5. Changed in place, never a rebuild. Absent: they cast.
   */
  foliageShadows?: boolean;
  /** Weathering in the surfaces' shader (G6, render/light/surfaceShader.ts). Absent: none. */
  weathering?: boolean;
  /** How the map's baked light is drawn (G6, render/light/bakedLight.ts), with `probes`, the map's own. Absent: none. */
  bakedLight?: BakedLightMode;
  probes?: ProbeGrid | null;
}

/** The look `q` gives a map whose baked light is `probes` (render/light/bakedLight.ts bakedLightFor; null for none). */
export function mapLookOf(q: QualitySettings, probes: ProbeGrid | null = null): MapLook {
  return {
    relief: q.surfaceRelief,
    normalMaps: q.normalMaps,
    detail: q.mapDetail,
    steelSheen: q.environment,
    foliageShadows: q.shadows && q.shadowFollowsView,
    weathering: q.weathering,
    bakedLight: q.bakedLight,
    probes,
  };
}

/** How a look draws the baked light: its mode, or off without probes. */
function bakedLightOf(look: MapLook): BakedLightMode {
  return look.probes ? (look.bakedLight ?? 'off') : 'off';
}

/** Whether going from one look to another needs the map built again (geometry or material kind changes). */
export function mapNeedsRebuild(from: MapLook, to: MapLook): boolean {
  return (
    from.detail !== to.detail ||
    from.steelSheen !== to.steelSheen ||
    (from.weathering ?? false) !== (to.weathering ?? false) ||
    bakedLightOf(from) !== bakedLightOf(to) ||
    (bakedLightOf(to) !== 'off' && from.probes !== to.probes)
  );
}

/**
 * The material for a merged surface mesh: its texture, with relief (a normal map worked out from it, or the texture
 * itself as a bump map) when surface relief is on. Painted surfaces are Lambert and never take the environment map
 * (the largest part of the screen; DECISIONS 2026-09-28); the steel tread plate is painted steel under environment
 * lighting (audit section 5, "Map props and surfaces"). With weathering or per-pixel baked light (G6) the material
 * carries render/light/surfaceShader.ts's node patch; without either it is Three's own (Low's).
 */
function surfaceMaterial(surface: ProceduralTexture, id: SurfaceTextureId, look: MapLook, probes: ProbeUniforms | null): SurfaceMaterial {
  const base = { map: surface.texture, vertexColors: true, bumpScale: SURFACES.relief[id] };
  const environment = look.steelSheen && id === 'steelPlate';
  const mat: SurfaceMaterial = environment ? new THREE.MeshStandardMaterial({ ...base, ...SURFACES.steelSheen }) : new THREE.MeshLambertMaterial(base);
  const patch: SurfacePatch = { wear: wearOf(id, look), probes };
  if (patchesShader(patch)) patchSurfaceMaterial(mat, patch);
  setReliefMaps(mat, surface, look.relief, look.normalMaps);
  return mat;
}

/** The surface a material paints (by its texture's name, a SurfaceTextureId), or null for one that isn't a surface. */
function surfaceOf(mat: THREE.Material, textures: SurfaceTextures): ProceduralTexture | null {
  if (!isSurfaceMaterial(mat) || !mat.map || !Object.hasOwn(textures, mat.map.name)) return null;
  return textures[mat.map.name as SurfaceTextureId] ?? null;
}

/** Surface relief on or off, as normal or bump maps, for a built map (Settings → Graphics): the shaders rebuild once. */
export function setMapRelief(group: THREE.Group, textures: SurfaceTextures, look: Pick<MapLook, 'relief' | 'normalMaps'>): void {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const surface = surfaceOf(obj.material as THREE.Material, textures);
    if (surface) setReliefMaps(obj.material as SurfaceMaterial, surface, look.relief, look.normalMaps);
  });
}

/**
 * Points a built map at another set of surface textures (Texture detail, audit REN-13): each material keeps its surface
 * (by the texture's name, its SurfaceTextureId) and its relief. The UVs are in metres, so any size maps the same way.
 */
export function setMapTextures(group: THREE.Group, textures: SurfaceTextures): void {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material as THREE.Material;
    const surface = surfaceOf(mat, textures);
    if (!surface || surface.texture === (mat as SurfaceMaterial).map) return;
    const m = mat as SurfaceMaterial;
    const relief = m.bumpMap !== null || m.normalMap !== null;
    const normal = m.normalMap !== null;
    m.map = surface.texture;
    m.bumpMap = null;
    m.normalMap = null;
    setReliefMaps(m, surface, relief, normal);
  });
}

/** Appends `from`'s vertices and triangles to `into` (its indices moved past `into`'s vertices). */
function appendBuffers(into: Buffers, from: Buffers): void {
  const base = into.positions.length / 3;
  if (into.feet || from.feet) {
    footTo(into, 0);
    footTo(from, 0);
    for (const f of from.feet!) into.feet!.push(f);
  }
  for (const key of ['positions', 'normals', 'uvs', 'colors'] as const) for (const v of from[key]) into[key].push(v);
  for (const i of from.indices) into.indices.push(base + i);
}

/**
 * Weathering's creep (G6) measures up a wall from its foot: `foot` (m) for each vertex written into `buf` since the
 * last call, so a piece's vertices carry its block's foot (KI1: it measured from y = 0, so a wall on an upper floor or
 * raised ground had no creep). Vertices nothing filled in measure from 0, as before.
 */
export function footTo(buf: Buffers, foot: number): void {
  const feet = (buf.feet ??= []);
  const count = buf.positions.length / 3;
  while (feet.length < count) feet.push(foot);
}

/** The surface's weathering in the shader at `look`, or null: none without Weathering, or where it would add nothing. */
function wearOf(id: SurfaceTextureId, look: MapLook): ShaderWear | null {
  const wear = look.weathering ? WEATHERING.shader[id] : null;
  return wear && (wear.grime > 0 || wear.rust > 0) ? wear : null;
}

/**
 * A map mesh's shadow range: its first `drawn` indices are what the camera sees, and the shadow map draws `count`
 * indices from `start` in their place: with map detail the shadow casters' boxes plain after the drawn part (the same
 * silhouette, a fraction of the triangles); without, the drawn part's casting pieces only (G6: a texture's casting and
 * non-casting pieces are one mesh, one draw call, its casters first).
 */
function shadowRange(mesh: THREE.Mesh, drawn: number, start: number, count: number): void {
  const geo = mesh.geometry;
  geo.setDrawRange(0, drawn);
  mesh.onBeforeShadow = () => geo.setDrawRange(start, count);
  mesh.onAfterShadow = () => geo.setDrawRange(0, drawn);
}

/** One merged map mesh's buffers as it is built: its casting pieces, its others, and the casters' plain boxes. */
interface MeshParts {
  cast: Buffers;
  flat: Buffers;
  shadow: Buffers | null;
}

/** A mesh's parts as one set of buffers (casters, others, the shadow boxes), with where the others and the boxes start. */
function joinParts(parts: MeshParts): { buf: Buffers; flatAt: number; shadowAt: number } {
  const buf = parts.cast;
  const flatAt = buf.indices.length;
  appendBuffers(buf, parts.flat);
  const shadowAt = buf.indices.length;
  if (parts.shadow) appendBuffers(buf, parts.shadow);
  return { buf, flatAt, shadowAt };
}

/** The face tiles Low's baked light lands on (BAKED_LIGHT.look.vertex.cell); plain boxes otherwise. */
const VERTEX_LIGHT_SHAPE: CuboidShape = { bevel: 0, cell: BAKED_LIGHT.look.vertex.cell, shade: null };

/**
 * Builds the static level as one merged mesh per surface texture, its shadow casters first and the rest after (the
 * shadow map draws only the casters): a handful of draw calls for the whole map, details included; with map detail,
 * the signs and stains as one more (render/field/mapDecals.ts; `decalAtlas` draws their texture, null leaves them out). With
 * the map's baked light (G6) per pixel the surfaces read it from a 3D texture; per vertex it is in their vertex
 * colours. Returns a group; call `disposeMapMeshes` to free GPU resources.
 */
export function buildMapMeshes(map: MapData, textures: SurfaceTextures, look: MapLook, decalAtlas: (() => THREE.Texture) | null = drawDecalAtlas): THREE.Group {
  const group = new THREE.Group();
  group.name = 'map';
  // The node renderer's map-driven compute dressing (W5: the grass, the tree stand-ins) reads the map it was built from.
  group.userData.map = map;
  const light = bakedLightOf(look);
  const probes = light === 'pixel' && look.probes ? probeUniforms(look.probes) : null;
  if (probes) group.userData.probes = probes;
  const plainShape = light === 'vertex' ? VERTEX_LIGHT_SHAPE : PLAIN;
  // With map detail a mesh also holds its casters' plain boxes, drawn into the shadow map instead (shadowRange).
  const meshes = new Map<SurfaceTextureId, MeshParts>();
  const entry = (texture: SurfaceTextureId, castShadow: boolean): { buf: Buffers; shadow: Buffers | null } => {
    let e = meshes.get(texture);
    if (!e) meshes.set(texture, (e = { cast: emptyBuffers(), flat: emptyBuffers(), shadow: look.detail ? emptyBuffers() : null }));
    return castShadow ? { buf: e.cast, shadow: e.shadow } : { buf: e.flat, shadow: null };
  };

  // With weathering, each vertex's foot for the creep (footTo); filled in as each piece is written.
  const feet = look.weathering === true;
  const pieces: { piece: Piece; block: MapBlock }[] = [];
  for (const block of drawnBlocks(map)) {
    if (block.kind === 'ramp') {
      const style = styleOf(block);
      const color = new THREE.Color().setHex(blockTint(block), THREE.SRGBColorSpace).multiplyScalar(blockShade(block));
      const e = entry(style.texture, castsShadow(block));
      appendRamp(e.buf, block, surfaceTexture(textures, style.texture), color);
      if (e.shadow) appendRamp(e.shadow, block, surfaceTexture(textures, style.texture), color);
      if (feet) footTo(e.buf, 0);
      continue;
    }
    for (const piece of blockPieces(block, map.blocks, look.detail)) pieces.push({ piece, block });
  }
  // G9: with map detail, a map's dressing may grow moss on its hard cover (boulders, logs, trunks).
  const mossLook = look.detail ? map.dressing?.moss : undefined;
  const moss = mossLook ? { colour: new THREE.Color().setHex(mossLook.colour, THREE.SRGBColorSpace), share: mossLook.share } : undefined;
  // Map detail: every piece's box shades the others' vertices (the ramps, being wedges, don't).
  const occ = look.detail ? buildOccluders(pieces.map(({ piece: p }) => [...p.box.min, ...p.box.max] as const), SURFACES.occlusion.reach) : null;
  pieces.forEach(({ piece: p, block }, i) => {
    const bottom = block.center.y - block.size.y / 2;
    const e = entry(p.texture, p.castShadow);
    const paint = { uv: p.uv, worldSize: surfaceTexture(textures, p.texture).worldSize, color: p.color, grimeFrom: p.grime ? bottom : null };
    // The woods' trees, logs and boulders are shapes inside their box (M33i); the shadow map still takes the box.
    if (isNatureKind(block.kind)) appendNatureShape(e.buf, block, moss ? { ...paint, moss } : paint, pieceShape(p, block, i, occ).shade);
    else appendCuboid(e.buf, p.box, paint, pieceShape(p, block, i, occ, plainShape));
    if (e.shadow) appendCuboid(e.shadow, p.box, paint, PLAIN);
    if (feet) footTo(e.buf, p.grime ? bottom : 0);
  });
  // M33i: the light fixtures' stones, logs, lanterns and posts, and the pebbles on gravel: drawn, never in the shadow map.
  const groundAt = (x: number, z: number, below: number): number => groundUnder(map, x, z, below) ?? 0;
  appendFixtureSolids(map, (texture) => entry(texture, true).buf, groundAt);
  if (map.ground && map.terrain) {
    const t = map.terrain;
    appendPebbles(entry('stone', true).buf, map, (x, z) => terrainHeightAt(t, x, z) ?? 0);
  }

  for (const [texture, parts] of meshes) {
    const castShadow = parts.cast.indices.length > 0;
    const drawnVertices = (parts.cast.positions.length + parts.flat.positions.length) / 3;
    const { buf, flatAt, shadowAt } = joinParts(parts);
    if (light === 'vertex' && look.probes) tintVertices(buf, look.probes, 0, drawnVertices);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
    if (feet && wearOf(texture, look)) {
      footTo(buf, 0);
      geo.setAttribute('wearFoot', new THREE.Float32BufferAttribute(buf.feet!, 1));
    }
    geo.setIndex(buf.indices);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, surfaceMaterial(surfaceTexture(textures, texture), texture, look, probes));
    mesh.name = `map-${texture}`;
    mesh.castShadow = castShadow;
    if (parts.shadow && castShadow) shadowRange(mesh, shadowAt, shadowAt, buf.indices.length - shadowAt);
    else if (castShadow && flatAt < shadowAt) shadowRange(mesh, shadowAt, 0, flatAt);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  // M33i: the ground's surfaces on the terrain, and its tree crowns; crowns and bushes baked towards the key light.
  // The ground grid the physics and the footsteps already built (groundGridOf, BP5: Woodland's was built again here).
  const grid = map.terrain ? groundGridOf(map) : null;
  if (map.terrain) {
    const detail = grid ? surfaceTexture(textures, 'groundDetail') : null;
    group.add(buildTerrainMesh(map.terrain, grid && detail ? { grid, material: surfaceMaterial(detail, 'groundDetail', look, probes), tile: detail.worldSize, mean: detail.mean ?? 1 } : null));
  }
  const moon = map.blocks.some((b) => b.kind === 'tree') || map.ground ? keyDirection(resolveLighting(map)) : null;
  if (moon) {
    const canopy = buildCanopyMesh(map.blocks, map.terrain, moon, look.foliageShadows ?? true);
    if (canopy) group.add(canopy);
  }
  const foliage = buildFoliageMesh(map.foliage ?? [], map.ground ? moon : null, look.foliageShadows ?? true);
  if (foliage) group.add(foliage);
  // G8: a map's set dressing with map detail: its decals join the decal mesh, its junk, strips and puddles two meshes.
  const dressing = look.detail ? placeDressing(map) : null;
  if (look.detail && decalAtlas) {
    const decals = buildMapDecals(map, decalAtlas, dressing?.decals);
    if (decals) group.add(decals);
  }
  if (dressing) for (const mesh of [buildJunkMesh(dressing, probes, map.terrain), buildPuddleMesh(dressing, probes, map.terrain)]) if (mesh) group.add(mesh);
  return group;
}

/**
 * A new look for a built map (Settings → Graphics): built again (a new group in the old one's place, the old one freed)
 * when its geometry or materials change (map detail, the steel's sheen), else its textures and relief follow in place.
 * Returns the map's group. `decalAtlas` as for buildMapMeshes. Normal maps the new look doesn't draw are freed.
 */
export function restyleMap(
  group: THREE.Group,
  map: MapData,
  textures: SurfaceTextures,
  from: MapLook,
  to: MapLook,
  decalAtlas: (() => THREE.Texture) | null = drawDecalAtlas,
): THREE.Group {
  // Normal maps nothing draws with any more are freed (they are made again when wanted).
  const trim = (): void => {
    if (!usesNormalMaps({ surfaceRelief: to.relief, normalMaps: to.normalMaps })) releaseNormalMaps(textures);
  };
  if (!mapNeedsRebuild(from, to)) {
    setMapTextures(group, textures);
    setMapRelief(group, textures, to);
    setFoliageShadows(group, to.foliageShadows ?? true);
    trim();
    return group;
  }
  const parent = group.parent;
  disposeMapMeshes(group);
  const next = buildMapMeshes(map, textures, to, decalAtlas);
  parent?.add(next);
  trim();
  return next;
}

/** Tree crowns and bushes cast shadows or not (MapLook.foliageShadows, M33i), in place. */
function setFoliageShadows(group: THREE.Group, on: boolean): void {
  for (const name of ['map-canopy', 'map-foliage']) {
    const mesh = group.getObjectByName(name);
    if (mesh) mesh.castShadow = on;
  }
}

export function disposeMapMeshes(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
  });
  disposeMapDecals(group);
  const probes = group.userData.probes as ProbeUniforms | undefined;
  if (probes) disposeProbeUniforms(probes);
  group.removeFromParent();
}
