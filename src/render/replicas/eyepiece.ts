import * as THREE from 'three';

/** The rear glass of an optic, in the optic's own space: its centre, how far back it sits (+Z) and its radius (m). */
export interface Eyepiece {
  x: number;
  y: number;
  z: number;
  radius: number;
}

const v = new THREE.Vector3();
const toOptic = new THREE.Matrix4();

/**
 * The rearmost glass (the meshes drawn in `lens`) under `optic`: the glass your eye is at when aiming through it. Null
 * if it has none. Built-in and file optics alike: their forward axis is -Z, so the eyepiece is the glass furthest +Z.
 */
export function findEyepiece(optic: THREE.Object3D, lens: (material: THREE.Material) => boolean): Eyepiece | null {
  optic.updateWorldMatrix(true, true);
  const back = toOptic.copy(optic.matrixWorld).invert();
  const points: THREE.Vector3[] = [];
  optic.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !lens(o.material)) return;
    const pos = (o.geometry as THREE.BufferGeometry).getAttribute('position');
    const m = new THREE.Matrix4().multiplyMatrices(back, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) points.push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  });
  if (points.length === 0) return null;
  const z = Math.max(...points.map((p) => p.z));
  const rim = points.filter((p) => z - p.z < 1e-4);
  const [minX, maxX] = [Math.min(...rim.map((p) => p.x)), Math.max(...rim.map((p) => p.x))];
  const [minY, maxY] = [Math.min(...rim.map((p) => p.y)), Math.max(...rim.map((p) => p.y))];
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  const radius = Math.max(...rim.map((p) => Math.hypot(p.x - x, p.y - y)));
  return radius > 1e-3 ? { x, y, z, radius } : null;
}

/**
 * Opens a scope's eyepiece to the world (the owner's 0.1 Dev 5 playtest, note 5): a disc just in front of its rear
 * glass, drawn first in the held replica's pass and only into the depth buffer, so nothing of the replica behind it (the
 * scope's dark core, its far glass) is drawn there and the world, drawn before the replica, shows through the glass.
 * Added to `optic` hidden: shown only while the scope is at your eye (Viewmodel.setScoped). Null if it has no glass.
 */
export function eyepieceMask(optic: THREE.Object3D, lens: (material: THREE.Material) => boolean, material: THREE.Material, inset: number): THREE.Mesh | null {
  const eye = findEyepiece(optic, lens);
  if (!eye) return null;
  const mask = new THREE.Mesh(new THREE.CircleGeometry(eye.radius, 32), material);
  mask.name = 'eyepieceMask';
  mask.position.set(eye.x, eye.y, eye.z - inset);
  mask.renderOrder = -1;
  mask.visible = false;
  optic.add(mask);
  return mask;
}

/** The mask's material: writes depth, no colour. One for every mask. */
export function eyepieceMaskMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ colorWrite: false });
  m.name = 'eyepieceMask';
  return m;
}
