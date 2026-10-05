import * as THREE from 'three';
import { SIGNS } from '../config/render';
import type { MapData, MapSign } from '../map/mapTypes';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * A map's signs and lit windows drawn (M34e, MapData.signs): one mesh of flat panels for all of them, on any map that has
 * them. By Night the mesh is unlit and self-lit (neon and windows glow in the dark); by Day it is plain Lambert, painted
 * boards and dark glass. Presentation only: bots see by the light pools (map/nightSight.ts), not by signs.
 */

type SignConfig = typeof SIGNS;

const NORMALS: Readonly<Record<MapSign['facing'], THREE.Vector3>> = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
};
const UP = new THREE.Vector3(0, 1, 0);

/** The colour a sign is drawn in (linear RGB, into `out`): its glow by Night, its paint or glass by Day. */
export function signColour(sign: MapSign, night: boolean, out = new THREE.Color(), cfg: SignConfig = SIGNS): THREE.Color {
  if (night) return out.setHex(sign.colour).multiplyScalar(sign.kind === 'neon' ? cfg.neon : cfg.window);
  if (sign.kind === 'window') return out.setHex(cfg.glass);
  return out.setHex(sign.colour).lerp(new THREE.Color(cfg.board), cfg.paint);
}

/**
 * Every sign as one geometry: a quad each, `offset` m out from its wall along `facing`, wound so its front looks that
 * way, coloured by signColour.
 */
export function buildSignGeometry(signs: readonly MapSign[], night: boolean, cfg: SignConfig = SIGNS): THREE.BufferGeometry {
  const pos = new Float32Array(signs.length * 4 * 3);
  const nor = new Float32Array(signs.length * 4 * 3);
  const col = new Float32Array(signs.length * 4 * 3);
  const index: number[] = [];
  const c = new THREE.Color();
  const centre = new THREE.Vector3();
  const right = new THREE.Vector3();
  const corner = new THREE.Vector3();
  signs.forEach((s, i) => {
    const n = NORMALS[s.facing];
    centre.set(s.centre.x, s.centre.y, s.centre.z).addScaledVector(n, cfg.offset);
    // Right as seen from the front: up × normal, so (right, up) is counter-clockwise from the front.
    right.crossVectors(UP, n);
    signColour(s, night, c, cfg);
    const first = i * 4;
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([u, v], k) => {
      corner.copy(centre).addScaledVector(right, (u! * s.width) / 2).addScaledVector(UP, (v! * s.height) / 2);
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

/** Adds `map`'s signs to `scene` lit for Night or Day (the preset the match plays under); a map without signs gets nothing. */
export function addMapSigns(scene: THREE.Scene, map: MapData, night: boolean): MapSigns {
  const signs = map.signs ?? [];
  if (signs.length === 0) return NONE;
  const mesh = new THREE.Mesh(buildSignGeometry(signs, night), signMaterial(night));
  mesh.name = 'map-signs';
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return {
    dispose: () => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
  };
}
