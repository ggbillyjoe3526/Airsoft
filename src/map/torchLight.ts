import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import { TORCHES } from '../config/torches';
import { aimDirection, type WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { hitTop } from '../sim/hitbox';
import { leanedEye } from '../sim/lean';
import { lightInHand, torchLit } from '../sim/torch';
import { vec3 } from '../sim/vec';
import type { NightField } from './nightSight';

/**
 * Who the weapon torches light on a night field (M33h): worked out once per simulation tick from the characters' torches
 * (sim/torch.ts), and read by the bots' sight (ai/perception.ts) like a light pool: anyone a lit beam falls on is made out
 * from NIGHT_SIGHT.lit. A beam lights a character inside its spill cone, within its reach, with nothing static between
 * the torch and them. The cone is tested first and only those inside it are ray cast. Allocation-free once its table
 * is as long as the highest character id (the first update).
 */
export interface TorchLight {
  /** The simulation time it was worked out for (NaN: never). */
  time: number;
  /** By character id: 1 while another's lit torch shines on them. */
  lit: Uint8Array;
}

export function createTorchLight(): TorchLight {
  return { time: Number.NaN, lit: new Uint8Array(0) };
}

const eye = vec3();
const aim = vec3();
const point = vec3();
const ray = vec3();

/**
 * Works out who the lit torches shine on at simulation time `time` (once per tick: a second call at the same time does
 * nothing). `height` is the share of a target's height the beam must reach (the bots' chest aim).
 */
export function updateTorchLight(field: TorchLight, characters: readonly Character[], query: WorldQuery, body: BodyConfig, hits: HitConfig, height: number, time: number): void {
  if (field.time === time) return;
  field.time = time;
  let maxId = -1;
  for (const c of characters) maxId = Math.max(maxId, c.id);
  if (field.lit.length <= maxId) field.lit = new Uint8Array(maxId + 1);
  field.lit.fill(0);
  for (const h of characters) {
    if (!torchLit(h)) continue;
    const light = TORCHES[lightInHand(h)!];
    const cosHalf = Math.cos(((light.spillDeg / 2) * Math.PI) / 180);
    leanedEye(h, body, hits, eye);
    aimDirection(aim, h.yaw, h.pitch);
    for (const t of characters) {
      if (t === h || field.lit[t.id] === 1 || !isInPlay(t)) continue;
      point.x = t.position.x;
      point.y = t.position.y + hitTop(t.crouchAmount, hits) * height;
      point.z = t.position.z;
      ray.x = point.x - eye.x;
      ray.y = point.y - eye.y;
      ray.z = point.z - eye.z;
      const d = Math.hypot(ray.x, ray.y, ray.z);
      if (d > light.reach || d < 1e-6) continue;
      ray.x /= d;
      ray.y /= d;
      ray.z /= d;
      if (ray.x * aim.x + ray.y * aim.y + ray.z * aim.z < cosHalf) continue;
      if (query.raycastStatic(eye, ray, d) < 0) field.lit[t.id] = 1;
    }
  }
}

/**
 * How far `viewer` makes `target` out by torchlight at night (m): the lit range when a beam shines on the target, or
 * when the target's own lit torch points within `torchSeenFromDeg` of the viewer (its lens gives it away); else 0.
 */
export function torchSightRange(field: TorchLight, night: NightField, viewer: Character, target: Character): number {
  if (field.lit[target.id] === 1) return night.sight.lit;
  if (!torchLit(target)) return 0;
  aimDirection(aim, target.yaw, target.pitch);
  const dx = viewer.position.x - target.position.x;
  const dz = viewer.position.z - target.position.z;
  const flat = Math.hypot(dx, dz);
  if (flat < 1e-6) return night.sight.lit;
  // Seen across the ground: the torch's heading against the way to the viewer.
  const ax = aim.x;
  const az = aim.z;
  const along = Math.hypot(ax, az);
  const cos = along < 1e-6 ? 0 : (ax * dx + az * dz) / (along * flat);
  return cos >= Math.cos((night.sight.torchSeenFromDeg * Math.PI) / 180) ? night.sight.lit : 0;
}
