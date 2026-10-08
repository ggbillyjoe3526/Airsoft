import * as THREE from 'three';
import type { SkylinePiece } from '../map/mapTypes';
import { planeGeometry, planeReach } from './passingPlane';
import { skylineLights } from './skyline';

/**
 * The tree ring's mesh as the host of the sky's small unlit things (G9 perf): a skyline's lights (a tower's mast light,
 * blade sign and, by night, lit windows) and the passing plane ride the ring's one draw call instead of two of their
 * own. Each vertex carries `skyPart`: 0 a tree or skyline piece (lit as before), 1 a light (unlit, fogged, as the
 * MeshBasicMaterial it was), 2 the plane (unlit and unfogged, moved by the `skyPlane` matrix; collapsed to a point while
 * `skyPlaneUp` is 0, between passes). A ring without lights or a plane (Woodland, Depot) has no `skyPart` and keeps its
 * own program: nothing changes there.
 *
 * The plane's flight stays render/passingPlane.ts's (DressingEffects): each frame it writes the plane's matrix and
 * whether it is up into the host's uniforms (`mesh.userData.skyPlane`) and leaves its own mesh undrawn while a host
 * carries it; with no host in the scene the plane draws itself, as it always did.
 */

/** What a vertex of the ring's mesh is. */
export const SKY_PART = { ring: 0, light: 1, plane: 2 } as const;

/** The uniforms a ring carrying the plane exposes as `mesh.userData.skyPlane`. */
export interface SkyPlaneUniforms {
  skyPlane: { value: THREE.Matrix4 };
  skyPlaneUp: { value: number };
}

/** A map's guests for the ring: its skyline's lights (by `night` or day) and, when the map has one, its plane. */
export interface SkyGuests {
  parts: THREE.BufferGeometry[];
  /** The plane's flight height (m), when the plane is among them. */
  planeHeight: number | null;
}

/** The skyline's lights and the plane (`plane`: the map's MapDressing.plane), tagged for the ring; none for neither. */
export function skyGuests(skyline: readonly SkylinePiece[], centre: { x: number; z: number }, night: boolean, plane?: { height: number }): SkyGuests {
  const parts = skylineLights(skyline, centre, night).map((g) => tagged(g, SKY_PART.light));
  if (!plane) return { parts, planeHeight: null };
  const { geometry } = planeGeometry(night);
  // The ring's parts carry normals (flat-shaded, so unused here): the plane's must too, to merge.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3));
  parts.push(tagged(geometry, SKY_PART.plane));
  return { parts, planeHeight: plane.height };
}

/** `g` with every vertex's `skyPart` set to `part` (the ring's own parts take 0). */
export function tagged(g: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  g.setAttribute('skyPart', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(part), 1));
  return g;
}

/**
 * Makes `mesh` (the ring, merged with its guests) their host: its material learns `skyPart` (on top of the patch it
 * already has), its culling sphere holds every pass of a plane `planeHeight` m up, and with a plane its uniforms are
 * in `mesh.userData.skyPlane`.
 */
export function hostSkyGuests(mesh: THREE.Mesh, planeHeight: number | null): void {
  const material = mesh.material as THREE.MeshLambertMaterial;
  const uniforms: SkyPlaneUniforms = { skyPlane: { value: new THREE.Matrix4() }, skyPlaneUp: { value: 0 } };
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.skyPlane = uniforms.skyPlane;
    shader.uniforms.skyPlaneUp = uniforms.skyPlaneUp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute float skyPart;\nuniform mat4 skyPlane;\nuniform float skyPlaneUp;\nvarying float vSkyPart;\n#include <common>')
      // The ring's mesh sits at the world's origin, so the plane's own matrix places it in the world.
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkyPart = skyPart;\nif (skyPart > 1.5) transformed = (skyPlane * vec4(transformed * skyPlaneUp, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', 'varying float vSkyPart;\n#include <common>')
      // Lights and plane unlit: their own colour, as a MeshBasicMaterial draws it.
      .replace('#include <opaque_fragment>', 'if (vSkyPart > 0.5) outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>')
      // The plane is not fogged (it is high and small; fog would wash it out); the lights are, as before.
      .replace('#include <fog_fragment>', 'vec3 skyUnfogged = gl_FragColor.rgb;\n#include <fog_fragment>\nif (vSkyPart > 1.5) gl_FragColor.rgb = skyUnfogged;');
  };
  material.customProgramCacheKey = () => `${key}:sky-host`;
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  if (planeHeight !== null) {
    const { across, top } = planeReach(planeHeight);
    geometry.boundingSphere!.union(new THREE.Sphere(new THREE.Vector3(0, top / 2, 0), Math.hypot(across, top / 2)));
    mesh.userData.skyPlane = uniforms;
  }
}
