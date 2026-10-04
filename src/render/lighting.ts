import * as THREE from 'three';
import { LIGHTING, type QualitySettings } from '../config/render';
import type { MapData } from '../map/mapTypes';
import { addAtmosphere } from './atmosphere';

/** World-space bounding box of every block in the map (walls, floor, props). */
export function mapBoundingBox(map: MapData): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const b of map.blocks) {
    box.expandByPoint(v.set(b.center.x - b.size.x / 2, b.center.y - b.size.y / 2, b.center.z - b.size.z / 2));
    box.expandByPoint(v.set(b.center.x + b.size.x / 2, b.center.y + b.size.y / 2, b.center.z + b.size.z / 2));
  }
  return box;
}

/**
 * Points an orthographic shadow camera from `lightPos` at `target` and sizes its frustum to
 * contain every corner of `box` (plus `margin`), so no part of the level loses its shadows.
 */
export function fitShadowCamera(
  cam: THREE.OrthographicCamera,
  lightPos: THREE.Vector3,
  target: THREE.Vector3,
  box: THREE.Box3,
  margin: number,
): void {
  cam.position.copy(lightPos);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  const inverse = cam.matrixWorld.clone().invert();

  const lightBox = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    lightBox.expandByPoint(corner.applyMatrix4(inverse));
  }
  cam.left = lightBox.min.x - margin;
  cam.right = lightBox.max.x + margin;
  cam.bottom = lightBox.min.y - margin;
  cam.top = lightBox.max.y + margin;
  // The camera looks down -Z in its own space.
  cam.near = Math.max(0.1, -lightBox.max.z - margin);
  cam.far = -lightBox.min.z + margin;
  cam.updateProjectionMatrix();
}

/** The match's daylight: change it with a new quality preset, dispose it with the match. */
export interface Daylight {
  /** Shadows on or off, their map size and softness (Settings → Graphics → Quality). */
  setQuality(quality: QualitySettings): void;
  /** Removes the lights, sky and trees and frees the shadow map. */
  dispose(): void;
}

/**
 * Points the sun's shadow at the preset: on or off, map size and softness. The old map is freed when the size changes
 * (Three.js makes a new one at the next shadow pass) and when shadows go off, so Low keeps no render target (audit L-01).
 */
function applyShadowQuality(sun: THREE.DirectionalLight, quality: QualitySettings): void {
  sun.castShadow = quality.shadows;
  if (!quality.shadows || sun.shadow.mapSize.x !== quality.shadowMapSize) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  }
  sun.shadow.radius = quality.shadowRadius;
}

/**
 * Adds daylight sized to the map (a sky fill, one warm shadow-casting sun) and the world round it (render/atmosphere.ts:
 * the sky dome and the trees), and returns its handle.
 */
export function addLighting(scene: THREE.Scene, map: MapData, quality: QualitySettings): Daylight {
  const hemi = new THREE.HemisphereLight(LIGHTING.hemiSky, LIGHTING.hemiGround, LIGHTING.hemiIntensity);

  const sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity);
  const box = mapBoundingBox(map);
  const centre = box.getCenter(new THREE.Vector3());
  sun.target.position.set(centre.x, 0, centre.z);
  sun.position.set(centre.x + LIGHTING.sunOffset.x, LIGHTING.sunOffset.y, centre.z + LIGHTING.sunOffset.z);
  applyShadowQuality(sun, quality);
  fitShadowCamera(sun.shadow.camera, sun.position, sun.target.position, box, LIGHTING.shadowMargin);
  sun.shadow.bias = LIGHTING.shadowBias;
  sun.shadow.normalBias = LIGHTING.shadowNormalBias;

  scene.add(hemi, sun, sun.target);
  const sunDirection = sun.position.clone().sub(sun.target.position).normalize();
  const disposeAtmosphere = addAtmosphere(scene, sun.target.position, sunDirection);
  return {
    setQuality: (q) => applyShadowQuality(sun, q),
    dispose: () => {
      disposeAtmosphere();
      scene.remove(hemi, sun, sun.target);
      sun.dispose();
      hemi.dispose();
    },
  };
}
