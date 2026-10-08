import * as THREE from 'three';
import { SURFACES, type SurfaceTextureId } from '../config/render';
import type { ProceduralTexture, SurfaceTextures } from './proceduralTextures';

/** Rec. 601 luma weights: a pixel's brightness, read as its height. */
const LUMA = [0.299, 0.587, 0.114] as const;

/**
 * A tangent-space normal map from a tiling picture whose brightness is read as height (audit section 5, F4): a Sobel
 * slope at every pixel, wrapping at the edges so the map tiles as the picture does, scaled by `strength` (slope per
 * unit of brightness, 0..1, per pixel), encoded as RGB = normal × 0.5 + 0.5 with full alpha. The picture's rows run
 * downwards (a canvas), and a texture made from it is flipped (flipY), so up the picture is +v: the green channel is
 * the slope down the rows. Pure: `rgba` is the picture's pixels (4 bytes each), the result a new array of the same size.
 */
export function heightToNormal(rgba: Uint8ClampedArray, width: number, height: number, strength: number): Uint8ClampedArray {
  const h = new Float32Array(width * height);
  for (let i = 0; i < h.length; i++) h[i] = (rgba[i * 4]! * LUMA[0] + rgba[i * 4 + 1]! * LUMA[1] + rgba[i * 4 + 2]! * LUMA[2]) / 255;
  const out = new Uint8ClampedArray(width * height * 4);
  const at = (x: number, y: number): number => h[((y + height) % height) * width + ((x + width) % width)]!;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Sobel: the slope along x (right) and along y (down the rows), each from a 3 × 3 neighbourhood.
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      // The surface rises to the right by gx: its normal leans left (-x). Down the rows is -v, so a rise down the rows
      // (gy > 0) leans the normal towards +v.
      const nx = (-gx / 8) * strength;
      const ny = (gy / 8) * strength;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * width + x) * 4;
      out[o] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * The slope scale for a surface's normal map at `size` pixels a side: the textures are the same drawing at every size,
 * so a feature is `size / 256` times wider in pixels and its slope per pixel that much gentler; the scale makes up for
 * it, so relief reads the same at any Texture detail.
 */
export function normalStrength(id: SurfaceTextureId, size: number): number {
  return SURFACES.normalStrength[id] * (size / 256);
}

/**
 * The normal map for one of the surface textures (Relief maps: Normal), worked out from its canvas the first time it
 * is wanted and kept with it (disposeSurfaceTextures frees both). At most SURFACES.normalMapMaxSize pixels a side (the
 * picture scaled down first): High's 1024² pictures add pixel-fine grain that would read as pits, and a 1024² normal
 * map would take 4× the memory for relief nobody sees. Filtered and repeated as the colour texture, and not
 * colour-managed (its numbers are directions).
 */
export function ensureNormalMap(surface: ProceduralTexture): THREE.Texture {
  if (surface.normal) return surface.normal;
  const picture = surface.texture.image as HTMLCanvasElement;
  const width = Math.min(picture.width, SURFACES.normalMapMaxSize);
  const height = Math.min(picture.height, SURFACES.normalMapMaxSize);
  let source = picture;
  if (width !== picture.width || height !== picture.height) {
    source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    source.getContext('2d')?.drawImage(picture, 0, 0, width, height);
  }
  const ctx = source.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const pixels = heightToNormal(ctx.getImageData(0, 0, width, height).data, width, height, normalStrength(surface.texture.name as SurfaceTextureId, width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const out = canvas.getContext('2d');
  if (!out) throw new Error('2D canvas unavailable');
  out.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const normal = new THREE.CanvasTexture(canvas);
  normal.wrapS = THREE.RepeatWrapping;
  normal.wrapT = THREE.RepeatWrapping;
  normal.colorSpace = THREE.NoColorSpace;
  normal.anisotropy = surface.texture.anisotropy;
  normal.name = `${surface.texture.name}-normal`;
  surface.normal = normal;
  return normal;
}

/**
 * Frees the surfaces' normal maps while nothing draws with them (relief off, or Relief maps: Bump), as the sheen is
 * freed while off: a 512² set is about 11 MB. They are worked out again the next time a material asks
 * (ensureNormalMap). Returns how many it freed.
 */
export function releaseNormalMaps(textures: Partial<SurfaceTextures>): number {
  let freed = 0;
  for (const surface of Object.values(textures) as ProceduralTexture[]) {
    if (!surface.normal) continue;
    surface.normal.dispose();
    delete surface.normal;
    freed++;
  }
  return freed;
}

/** Whether a look draws normal maps (Surface relief on, Relief maps: Normal). */
export function usesNormalMaps(q: { surfaceRelief: boolean; normalMaps: boolean }): boolean {
  return q.surfaceRelief && q.normalMaps;
}
