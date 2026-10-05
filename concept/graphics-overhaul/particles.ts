import * as THREE from 'three';
import type { Preset } from './quality';

/**
 * v3 particles (set dressing): dust motes drifting in the sun, smoke from chimneys and vents, dust kicked up by feet.
 * The real game animates them; the concept shows one frame of each. Every count scales with the preset's `particles`.
 */

let soft: THREE.Texture | null = null;
/** A soft round puff, white, alpha falling off to the edge. */
function softTex(): THREE.Texture {
  if (soft) return soft;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  soft = new THREE.CanvasTexture(c);
  soft.colorSpace = THREE.SRGBColorSpace;
  return soft;
}

let puffT: THREE.Texture | null = null;
/** A lumpy smoke puff: several soft blobs, so the plume does not read as a row of discs. */
function puffTex(): THREE.Texture {
  if (puffT) return puffT;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 52;
    const x = 128 + Math.cos(a) * d;
    const y = 128 + Math.sin(a) * d;
    const rad = 40 + r() * 46;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.42)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  puffT = new THREE.CanvasTexture(c);
  puffT.colorSpace = THREE.SRGBColorSpace;
  return puffT;
}

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Fine dust hanging in the air round `centre`, caught by the sun (additive, so it only shows against shade and sky). */
export function dustMotes(scene: THREE.Scene, p: Preset, centre: THREE.Vector3, size: THREE.Vector3, count = 700, color = 0xfff0d2): THREE.Points | null {
  const n = Math.round(count * p.particles);
  if (!n) return null;
  const r = rng(41);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = centre.x + (r() - 0.5) * size.x;
    // Thicker near the ground.
    pos[i * 3 + 1] = centre.y + Math.pow(r(), 1.8) * size.y;
    pos[i * 3 + 2] = centre.z + (r() - 0.5) * size.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: softTex(), color, size: 0.014, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const pts = new THREE.Points(g, m);
  pts.name = 'dust';
  pts.renderOrder = 3;
  scene.add(pts);
  return pts;
}

/**
 * A smoke plume rising from `base`: puffs that grow, fade and drift with the wind. `lit` puffs (chimney smoke in
 * daylight) take the sun's warmth on top; dark smoke (a vent at night) stays flat.
 */
export function plume(scene: THREE.Scene, p: Preset, base: THREE.Vector3, opts: { height: number; wind: THREE.Vector3; width: number; count?: number; color?: number; opacity?: number; seed?: number }): THREE.Group | null {
  const n = Math.max(p.particles > 0 ? 6 : 0, Math.round((opts.count ?? 36) * p.particles));
  if (!n) return null;
  const r = rng(opts.seed ?? 17);
  const group = new THREE.Group();
  group.name = 'smoke';
  const tex = puffTex();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const m = new THREE.SpriteMaterial({ map: tex, color: opts.color ?? 0xf2efe9, transparent: true, opacity: (opts.opacity ?? 0.75) * (1 - t * 0.85), depthWrite: false, fog: true, rotation: r() * 6.28 });
    const s = new THREE.Sprite(m);
    // Rises fast at first, then bends over with the wind.
    const up = opts.height * Math.sqrt(t);
    s.position.copy(base).addScaledVector(opts.wind, t * t * opts.height).add(new THREE.Vector3((r() - 0.5) * opts.width * t, up, (r() - 0.5) * opts.width * t));
    const sz = opts.width * (0.6 + t * 2.4) * (0.8 + r() * 0.4);
    s.scale.set(sz, sz, 1);
    s.renderOrder = 4;
    group.add(s);
  }
  scene.add(group);
  return group;
}

/** A low dust puff where a foot or a BB hit the ground: a few flattened sprites. */
export function kickUp(scene: THREE.Scene, p: Preset, at: THREE.Vector3, size = 0.5, color = 0xd8ccb6): void {
  if (!p.particles) return;
  const r = rng(Math.floor(at.x * 100 + at.z * 7) + 9);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.SpriteMaterial({ map: puffTex(), color, transparent: true, opacity: 0.5 - i * 0.07, depthWrite: false, fog: true, rotation: r() * 6.28 });
    const s = new THREE.Sprite(m);
    s.position.set(at.x + (r() - 0.5) * size, at.y + 0.06 + r() * size * 0.25, at.z + (r() - 0.5) * size);
    const sz = size * (0.5 + r() * 0.6);
    s.scale.set(sz * 1.4, sz * 0.8, 1);
    s.renderOrder = 4;
    scene.add(s);
  }
}
