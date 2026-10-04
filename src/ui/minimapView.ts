import { MINIMAP } from '../config/minimap';
import type { MapBlock } from '../map/mapTypes';
import type { HeardSound } from './soundCues';

/** A point on the minimap, in pixels from its middle (x right, y down). */
export interface MapPoint {
  x: number;
  y: number;
}

/**
 * Where world (x, z) shows on a minimap centred on (cx, cz) and turned so `yaw` (the game's: 0 looks down -z,
 * positive turns left) points up, at `scale` pixels per metre. The same turn as the canvas's `rotate(yaw)`.
 */
export function toMinimap(yaw: number, cx: number, cz: number, x: number, z: number, scale: number, out: MapPoint): MapPoint {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = (dx * c - dz * s) * scale;
  out.y = (dx * s + dz * c) * scale;
  return out;
}

/** Whether (x, y) lies inside the circle at (cx, cy) of radius `r` (a marker under the minimap; audit UI-13). */
export function insideCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return r > 0 && dx * dx + dy * dy <= r * r;
}

/** The minimap canvas's pixels per CSS pixel on a screen of `devicePixelRatio`: 1 to MINIMAP.maxPixelRatio. */
export function minimapPixelRatio(devicePixelRatio: number | undefined): number {
  return Math.min(MINIMAP.maxPixelRatio, Math.max(1, devicePixelRatio || 1));
}

/** Pulls `p` back onto a circle of `radius` round the middle if it's further out; true if it was. */
export function clampToRim(p: MapPoint, radius: number): boolean {
  const d = Math.hypot(p.x, p.y);
  if (d <= radius) return false;
  p.x *= radius / d;
  p.y *= radius / d;
  return true;
}

/** The kinds of sound that place a player of the other team on the minimap (a hit call means they're out). */
export type NoiseKind = 'step' | 'shot';

/** How far off (m) a `kind` heard `metres` away may be placed: vaguer further off, footsteps vaguer than shots. */
export function noiseBlur(kind: NoiseKind, metres: number): number {
  return Math.min(MINIMAP.noiseMaxBlur, Math.max(MINIMAP.noiseMinBlur, metres * MINIMAP.noiseBlurShare[kind]));
}

/** Opacity of a heard player's patch `age` seconds after the sound (0 once it's gone). */
export function noiseAlpha(age: number): number {
  if (age < 0 || age >= MINIMAP.noiseLife) return 0;
  return Math.min(1, (MINIMAP.noiseLife - age) / MINIMAP.noiseFade);
}

/** A small integer hash to [0, 1) (presentation only: the same sounds always land the same way). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** A heard player's patch: somewhere within its radius of where the sound really was. */
export interface HeardPlayer {
  sourceId: number;
  kind: NoiseKind;
  /** Middle of the patch (world x, z) and its radius (m). */
  x: number;
  z: number;
  radius: number;
  /** Simulation time of the sound (NaN: free). */
  at: number;
}

/**
 * The other team on the minimap (M23): one patch per player, where they were last heard. A new footstep or shot from
 * the same player moves their patch; a sound beyond its hearing range from the listener isn't heard at all. Pure data:
 * the minimap draws `players`.
 */
export class HeardPlayers {
  readonly players: HeardPlayer[] = [];
  /** Sounds placed so far, so each lands its own way. */
  private count = 0;

  /** `sound` (a step or a shot by the other team; hit calls are ignored) at simulation time `time`, heard from (fromX, fromZ). */
  add(sound: HeardSound, fromX: number, fromZ: number, time: number): void {
    if (sound.kind === 'hit') return;
    const kind: NoiseKind = sound.kind;
    const metres = Math.hypot(sound.x - fromX, sound.z - fromZ);
    if (metres > MINIMAP.hearing[kind] * (sound.reach ?? 1)) return;
    let p = this.players.find((h) => h.sourceId === sound.sourceId) ?? this.players.find((h) => Number.isNaN(h.at));
    if (!p) {
      p = { sourceId: -1, kind, x: 0, z: 0, radius: 0, at: Number.NaN };
      this.players.push(p);
    }
    const blur = noiseBlur(kind, metres);
    const n = this.count++;
    // A uniform spot in the blur circle (the square root spreads it over the area rather than bunching it in the middle).
    const angle = hash01(sound.sourceId, n) * Math.PI * 2;
    const r = Math.sqrt(hash01(n, sound.sourceId + 7)) * blur;
    p.sourceId = sound.sourceId;
    p.kind = kind;
    p.x = sound.x + Math.cos(angle) * r;
    p.z = sound.z + Math.sin(angle) * r;
    p.radius = blur + MINIMAP.noisePad;
    p.at = time;
  }

  /** Forgets player `sourceId` (they've been hit). */
  forget(sourceId: number): void {
    for (const p of this.players) if (p.sourceId === sourceId) this.free(p);
  }

  /** Frees the patches that have faded out by `time`. */
  expire(time: number): void {
    for (const p of this.players) if (!Number.isNaN(p.at) && noiseAlpha(time - p.at) <= 0) this.free(p);
  }

  /** Everyone forgotten (a new round). */
  clear(): void {
    for (const p of this.players) this.free(p);
  }

  private free(p: HeardPlayer): void {
    p.at = Number.NaN;
    p.sourceId = -1;
  }
}

/**
 * How tall `b` stands above the floor it is on: its top less the top of the highest floor or ramp under its middle
 * (the ground, 0, if none). A crate stacked on another crate stands on the ground, so the stack reads as one tall piece
 * of cover, while a crate on the dock is only as tall as itself (bug pass).
 */
export function coverHeight(b: MapBlock, blocks: readonly MapBlock[]): number {
  const top = b.center.y + b.size.y / 2;
  const bottom = b.center.y - b.size.y / 2;
  let floor = 0;
  for (const f of blocks) {
    if (f.kind !== 'floor' && f.kind !== 'ramp') continue;
    const fTop = f.center.y + f.size.y / 2;
    if (fTop > bottom + MINIMAP.floorContact || fTop <= floor) continue;
    if (Math.abs(b.center.x - f.center.x) > f.size.x / 2 || Math.abs(b.center.z - f.center.z) > f.size.z / 2) continue;
    floor = fTop;
  }
  return top - floor;
}
