import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cameraWorldMatrix, cos, positionLocal, sin, vec3 } from 'three/tsl';
import type { Node } from './kernelOps';

/**
 * How the compute passes' particles are drawn on the node path (WebGPU overhaul W5): camera-facing quads, one instanced
 * draw per pool as on WebGL, each placed and sized by its pass's output. The quads turn to the camera that draws them,
 * by its world right and up axes (what the CPU modules' `matrix.compose(position, camera.quaternion, size)` turns x and
 * y to), so a quad sits where the WebGL path's would, and faces any camera that draws it, not only the one the frame
 * was moved for.
 */

/** The drawing camera's world right and up axes: its world matrix's first two columns. */
export interface Facing {
  readonly rightNode: Node;
  readonly upNode: Node;
}

export function facing(): Facing {
  const world: Node = cameraWorldMatrix;
  return { rightNode: world.element(0).xyz, upNode: world.element(1).xyz };
}

/**
 * A quad corner (the plane's local x, y) placed at `centre` and scaled by `size`, turned `roll` radians about the view
 * (0: none) and then to face the camera.
 */
export function facingCorner(face: Facing, centre: Node, size: Node, roll: Node | null = null): Node {
  let x: Node = positionLocal.x;
  let y: Node = positionLocal.y;
  if (roll) {
    const c = cos(roll);
    const s = sin(roll);
    const rx = x.mul(c).sub(y.mul(s));
    y = x.mul(s).add(y.mul(c));
    x = rx;
  }
  return vec3(centre).add(face.rightNode.mul(x).add(face.upNode.mul(y)).mul(size));
}

/**
 * The instanced quad a pool draws (`plane`'s triangles, `count` instances, none drawn while `instanceCount` is 0): its
 * own geometry, so freeing it frees only what it made.
 */
export function quads(plane: THREE.BufferGeometry, count: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(plane.getIndex());
  g.setAttribute('position', plane.getAttribute('position'));
  g.setAttribute('uv', plane.getAttribute('uv'));
  g.instanceCount = count;
  return g;
}

/** A node twin of a pool's plain Basic material: its colour (the same object, so a night tint follows), map, blending. */
export function basicTwin(plain: THREE.MeshBasicMaterial): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.color = plain.color;
  m.map = plain.map;
  m.transparent = plain.transparent;
  m.opacity = plain.opacity;
  m.depthWrite = plain.depthWrite;
  m.depthTest = plain.depthTest;
  m.blending = plain.blending;
  m.side = plain.side;
  m.fog = plain.fog;
  m.name = `${plain.name || 'particles'}-gpu`;
  return m;
}

/**
 * Hangs `draw` under the CPU pool's `object` (whose own draw leaves the camera's layers on this path, as the sized
 * points' twins do): the pool's visibility, removal and draw order keep governing it, and the modules that own it don't
 * know. Returns how to undo it.
 */
export function hangUnder(object: THREE.Object3D, draw: THREE.Mesh): () => void {
  const mask = object.layers.mask;
  draw.name = `${object.name || 'particles'}-gpu`;
  draw.frustumCulled = false;
  draw.matrixAutoUpdate = false;
  draw.renderOrder = object.renderOrder;
  object.layers.disableAll();
  object.add(draw);
  return () => {
    draw.removeFromParent();
    object.layers.mask = mask;
  };
}
