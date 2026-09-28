import * as THREE from 'three';
import { RENDER } from '../config/render';
import { createRng, rngNext, type RngState } from '../sim/rng';

/**
 * Small canvas-generated textures so greybox surfaces read clearly without downloaded assets.
 * `worldSize` is how many metres one texture repeat covers (see mapMeshes world-space UVs).
 */
export interface ProceduralTexture {
  texture: THREE.CanvasTexture;
  worldSize: number;
}

const SIZE = 256;

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

function speckle(ctx: CanvasRenderingContext2D, rng: RngState, count: number, alpha: number, light: boolean): void {
  const v = light ? 255 : 0;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rngNext(rng)})`;
    const s = 1 + rngNext(rng) * 2;
    ctx.fillRect(rngNext(rng) * SIZE, rngNext(rng) * SIZE, s, s);
  }
}

function finish(canvas: HTMLCanvasElement, worldSize: number): ProceduralTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = RENDER.textureAnisotropy;
  return { texture, worldSize };
}

/** Warehouse concrete slab with expansion joints every 4 m. */
function concrete(): ProceduralTexture {
  const [canvas, ctx] = makeCanvas();
  const rng = createRng(11);
  ctx.fillStyle = '#9a9a96';
  ctx.fillRect(0, 0, SIZE, SIZE);
  speckle(ctx, rng, 2500, 0.18, false);
  speckle(ctx, rng, 1500, 0.15, true);
  ctx.strokeStyle = 'rgba(40,40,40,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  return finish(canvas, 4);
}

/** Painted breeze-block wall, 4 courses per repeat. */
function blockWall(): ProceduralTexture {
  const [canvas, ctx] = makeCanvas();
  const rng = createRng(23);
  ctx.fillStyle = '#c9c3b5';
  ctx.fillRect(0, 0, SIZE, SIZE);
  speckle(ctx, rng, 1500, 0.1, false);
  ctx.strokeStyle = 'rgba(90,85,75,0.6)';
  ctx.lineWidth = 3;
  const rows = 4;
  const rowH = SIZE / rows;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rowH);
    ctx.lineTo(SIZE, r * rowH);
    ctx.stroke();
  }
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : SIZE / 4;
    for (let x = offset; x <= SIZE; x += SIZE / 2) {
      ctx.beginPath();
      ctx.moveTo(x, r * rowH);
      ctx.lineTo(x, (r + 1) * rowH);
      ctx.stroke();
    }
  }
  return finish(canvas, 1.6);
}

/** Plywood crate planks with a dark frame; mapped once per face. */
function crate(): ProceduralTexture {
  const [canvas, ctx] = makeCanvas();
  const rng = createRng(37);
  ctx.fillStyle = '#b48a55';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const planks = 5;
  const ph = SIZE / planks;
  for (let p = 0; p < planks; p++) {
    const shade = 0.85 + rngNext(rng) * 0.3;
    ctx.fillStyle = `rgb(${Math.round(170 * shade)},${Math.round(125 * shade)},${Math.round(75 * shade)})`;
    ctx.fillRect(0, p * ph + 2, SIZE, ph - 4);
    for (let g = 0; g < 14; g++) {
      ctx.strokeStyle = `rgba(90,60,30,${0.15 + rngNext(rng) * 0.2})`;
      ctx.lineWidth = 1;
      const y = p * ph + 4 + rngNext(rng) * (ph - 8);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y + (rngNext(rng) - 0.5) * 6);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(70,45,20,0.9)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, SIZE - 10, SIZE - 10);
  return finish(canvas, 1.2);
}

export type SurfaceTextures = Record<'concrete' | 'blockWall' | 'crate', ProceduralTexture>;

export function createSurfaceTextures(): SurfaceTextures {
  return { concrete: concrete(), blockWall: blockWall(), crate: crate() };
}

export function disposeSurfaceTextures(t: SurfaceTextures): void {
  for (const key of Object.keys(t) as (keyof SurfaceTextures)[]) t[key].texture.dispose();
}
