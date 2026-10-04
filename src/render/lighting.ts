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

/** An orthographic camera's bounds in its own space (left, right, bottom, top). */
export interface ShadowBounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

const focusScratch = new THREE.Vector3();

/** Where the view-fitted map's centre goes on one light-space axis: in whole texels, kept inside the level's bounds. */
function placeCentre(at: number, min: number, max: number, half: number, texel: number): number {
  if (max - min <= 2 * half) return (min + max) / 2;
  return Math.min(max - half, Math.max(min + half, Math.round(at / texel) * texel));
}

/**
 * Fits the shadow camera (already pointed by fitShadowCamera, whose bounds are `level`) to a square of `half` metres
 * either side of `focus` in light space (audit REN-08). The square is a fixed size, so the texel is too, and its centre
 * moves in whole texels: a moving view never makes shadow edges crawl. Kept inside the level's bounds (no texels spent
 * outside the field). Allocation-free: runs every frame on High.
 */
export function fitShadowToView(cam: THREE.OrthographicCamera, level: ShadowBounds, focus: THREE.Vector3, half: number, mapSize: number): void {
  const p = focusScratch.copy(focus).applyMatrix4(cam.matrixWorldInverse);
  const texel = (2 * half) / mapSize;
  const x = placeCentre(p.x, level.left, level.right, half, texel);
  const y = placeCentre(p.y, level.bottom, level.top, half, texel);
  if (cam.left === x - half && cam.bottom === y - half && cam.right === x + half && cam.top === y + half) return;
  cam.left = x - half;
  cam.right = x + half;
  cam.bottom = y - half;
  cam.top = y + half;
  cam.updateProjectionMatrix();
}

/** The world size of one shadow-map texel for the camera's bounds (the larger side over the map size). */
export function shadowTexel(cam: THREE.OrthographicCamera, mapSize: number): number {
  return Math.max(cam.right - cam.left, cam.top - cam.bottom) / mapSize;
}

/** The match's daylight: change it with a new quality preset, follow the view each frame, dispose it with the match. */
export interface Daylight {
  /** Shadows on or off, their map size, softness and reach; the trees and clouds (Settings → Graphics → Quality). */
  setQuality(quality: QualitySettings): void;
  /** Moves a view-fitted shadow map to the ground ahead of `camera` (High; nothing otherwise). Call before drawing. */
  follow(camera: THREE.Camera): void;
  /** Removes the lights, sky, trees and clouds and frees the shadow map. */
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

/** The normal bias for the shadow camera's texel (REN-08): the same share of a texel at any map size or fit. */
function applyNormalBias(sun: THREE.DirectionalLight): void {
  sun.shadow.normalBias = LIGHTING.shadowNormalBiasTexels * shadowTexel(sun.shadow.camera, sun.shadow.mapSize.x);
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
  const cam = sun.shadow.camera;
  fitShadowCamera(cam, sun.position, sun.target.position, box, LIGHTING.shadowMargin);
  const level: ShadowBounds = { left: cam.left, right: cam.right, bottom: cam.bottom, top: cam.top };
  const viewHalf = LIGHTING.shadowView.radius + LIGHTING.shadowMargin;
  sun.shadow.bias = LIGHTING.shadowBias;
  let following = false;
  const forward = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const setQuality = (q: QualitySettings): void => {
    applyShadowQuality(sun, q);
    following = q.shadows && q.shadowFollowsView;
    if (!following) {
      // The whole field again.
      cam.left = level.left;
      cam.right = level.right;
      cam.bottom = level.bottom;
      cam.top = level.top;
      cam.updateProjectionMatrix();
    } else fitShadowToView(cam, level, sun.target.position, viewHalf, q.shadowMapSize);
    applyNormalBias(sun);
  };
  setQuality(quality);

  scene.add(hemi, sun, sun.target);
  const sunDirection = sun.position.clone().sub(sun.target.position).normalize();
  const atmosphere = addAtmosphere(scene, sun.target.position, sunDirection, quality, box);
  return {
    setQuality: (q) => {
      setQuality(q);
      atmosphere.setQuality(q);
    },
    follow: (camera) => {
      if (!following) return;
      // The ground ahead: the view's heading, flattened, `ahead` metres out from the eye.
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
      const len = forward.length();
      focus.copy(camera.position);
      if (len > 1e-6) focus.addScaledVector(forward, LIGHTING.shadowView.ahead / len);
      focus.y = 0;
      fitShadowToView(cam, level, focus, viewHalf, sun.shadow.mapSize.x);
    },
    dispose: () => {
      atmosphere.dispose();
      scene.remove(hemi, sun, sun.target);
      sun.dispose();
      hemi.dispose();
    },
  };
}
