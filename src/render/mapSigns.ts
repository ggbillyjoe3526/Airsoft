import * as THREE from 'three';
import { SIGNS } from '../config/render';
import type { MapData, MapSign } from '../map/mapTypes';
import { propSigns } from './cityProps';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * A map's signs and lit windows drawn (M34e, MapData.signs): one mesh of flat panels for all of them, on any map that has
 * them. By Night the mesh is unlit and self-lit (neon and windows glow in the dark); by Day it is plain Lambert, painted
 * boards and dark glass. M34f: the city props' screens and windows join them (render/cityProps.ts propSigns), and
 * painted markings (kind `paint`, upright or flat on a floor) are a second mesh, lit like the surface under them by Day
 * and Night. Presentation only: bots see by the light pools (map/nightSight.ts), not by signs.
 */

type SignConfig = typeof SIGNS;

const NORMALS: Readonly<Record<MapSign['facing'], THREE.Vector3>> = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
  '+y': new THREE.Vector3(0, 1, 0),
};
const UP = new THREE.Vector3(0, 1, 0);
/** A flat sign's (facing '+y') right and up as seen from above: x across it, `height` along -z. */
const FLAT_RIGHT = new THREE.Vector3(1, 0, 0);
const FLAT_UP = new THREE.Vector3(0, 0, -1);

/**
 * The colour a sign is drawn in (linear RGB, into `out`): its glow by Night, its paint or glass by Day. A painted
 * marking is its colour either way (the light on it does the rest).
 */
export function signColour(sign: MapSign, night: boolean, out = new THREE.Color(), cfg: SignConfig = SIGNS): THREE.Color {
  if (sign.kind === 'paint') return out.setHex(sign.colour);
  if (night) return out.setHex(sign.colour).multiplyScalar(sign.kind === 'neon' ? cfg.neon : cfg.window);
  if (sign.kind === 'window') return out.setHex(cfg.glass);
  return out.setHex(sign.colour).lerp(new THREE.Color(cfg.board), cfg.paint);
}

/**
 * Every sign as one geometry: a quad each, `offset` m out from its wall (or up from its floor) along `facing`, wound so
 * its front looks that way, coloured by signColour.
 */
export function buildSignGeometry(signs: readonly MapSign[], night: boolean, cfg: SignConfig = SIGNS): THREE.BufferGeometry {
  const pos = new Float32Array(signs.length * 4 * 3);
  const nor = new Float32Array(signs.length * 4 * 3);
  const col = new Float32Array(signs.length * 4 * 3);
  const index: number[] = [];
  const c = new THREE.Color();
  const centre = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const corner = new THREE.Vector3();
  signs.forEach((s, i) => {
    const n = NORMALS[s.facing];
    centre.set(s.centre.x, s.centre.y, s.centre.z).addScaledVector(n, cfg.offset);
    // Right as seen from the front: up × normal, so (right, up) is counter-clockwise from the front.
    if (s.facing === '+y') {
      right.copy(FLAT_RIGHT);
      up.copy(FLAT_UP);
    } else {
      right.crossVectors(UP, n);
      up.copy(UP);
    }
    signColour(s, night, c, cfg);
    const first = i * 4;
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([u, v], k) => {
      corner.copy(centre).addScaledVector(right, (u! * s.width) / 2).addScaledVector(up, (v! * s.height) / 2);
      corner.toArray(pos, (first + k) * 3);
      n.toArray(nor, (first + k) * 3);
      c.toArray(col, (first + k) * 3);
    });
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  return geo;
}

/** The material for the signs: unlit and unfogged by Night (they are the light), Lambert by Day. */
function signMaterial(night: boolean): THREE.Material {
  if (night) {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    m.fog = false;
    return withoutEnvironment(m);
  }
  return withoutEnvironment(new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** A map's signs in the scene, removed with the match's lighting. */
export interface MapSigns {
  dispose(): void;
}

const NONE: MapSigns = { dispose: () => undefined };

/** Every sign a map shows: its own (MapData.signs) and its city props' screens and windows (M34f). */
export function mapSignsOf(map: MapData): MapSign[] {
  return [...(map.signs ?? []), ...map.blocks.flatMap(propSigns)];
}

/**
 * Adds `map`'s signs to `scene` lit for Night or Day (the preset the match plays under): the signs and windows as one
 * mesh ('map-signs'), its painted markings as another ('map-paint', M34f), Lambert by Day and Night, taking the
 * shadows that fall on them. A map without either gets nothing for it.
 */
export function addMapSigns(scene: THREE.Scene, map: MapData, night: boolean): MapSigns {
  const all = mapSignsOf(map);
  const meshes: THREE.Mesh[] = [];
  const add = (signs: MapSign[], name: string, material: THREE.Material, receiveShadow: boolean): void => {
    if (signs.length === 0) {
      material.dispose();
      return;
    }
    const mesh = new THREE.Mesh(buildSignGeometry(signs, night), material);
    mesh.name = name;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    meshes.push(mesh);
  };
  add(all.filter((s) => s.kind !== 'paint'), 'map-signs', signMaterial(night), false);
  add(all.filter((s) => s.kind === 'paint'), 'map-paint', signMaterial(false), true);
  if (meshes.length === 0) return NONE;
  return {
    dispose: () => {
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  };
}
