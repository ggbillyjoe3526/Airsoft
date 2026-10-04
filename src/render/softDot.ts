import * as THREE from 'three';

/**
 * A small round dot that fades to nothing at its edge (M14): the shape of dust motes and puffs, so they read as soft
 * dust and gas rather than hard-edged discs. `core` is how far out (0..1 of the radius) it stays nearly solid.
 * The caller owns (and disposes) the texture.
 */
export function softDotTexture(core = 0.4, size = 32): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(core, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
