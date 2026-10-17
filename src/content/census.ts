import * as THREE from 'three';
import { renderSounds } from '../audio/soundBank';
import type { ReplicaConfig } from '../config/replicas';
import { cues, type ShotProfile } from '../config/sounds';
import { fitParts } from '../render/replicas/itemPictures';
import { buildReplicaModels, LOW_DETAIL, type ReplicaDetail } from '../render/replicas/replicaModels';
import { NO_REPLICA_FILES, type ReplicaFiles } from '../render/replicas/replicaFiles';

/**
 * The spec test's model and sound census (CT1, level 3): what a replica costs to draw (triangles and meshes, each mesh
 * a draw call, at Low and High, as it comes and per part) and how its shot sounds (loudness and pitch) beside the
 * others. Runs in Node with three.js and the game's synthesiser, no browser: the report runner calls it.
 */

export const HIGH_DETAIL: ReplicaDetail = { replica: 'high', hands: 'high' };

export interface DrawCost {
  triangles: number;
  /** Meshes drawn: about one draw call each. */
  meshes: number;
}

export interface ModelCensus {
  replica: string;
  /** Drawn from its model file (M101) rather than the built-in model. */
  fromFile: boolean;
  /** As it comes, hands included, at each level. */
  low: DrawCost;
  high: DrawCost;
  /** Each part its table draws, on its own, at each level. */
  parts: { name: string; low: DrawCost; high: DrawCost }[];
}

/** The meshes that show under `root` (a hidden group hides what is in it). */
export function drawCost(root: THREE.Object3D): DrawCost {
  const cost = { triangles: 0, meshes: 0 };
  const visit = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    if (o instanceof THREE.Mesh) {
      const g = o.geometry;
      cost.triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      cost.meshes++;
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  return cost;
}

/** The part groups a built model has, by name ('optic:redDot', 'magazine:hiCap', 'muzzle:silencer' …). */
function partGroups(group: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (/^(optic|grip|laser|barrel|light|magazine|muzzle):/.test(o.name)) out.push(o);
  });
  return out;
}

/** The census of `replica`, drawn with `files` (a replica with one is drawn from it, as the game does). */
export function modelCensus(replica: ReplicaConfig, files: ReplicaFiles = NO_REPLICA_FILES): ModelCensus {
  const built = [LOW_DETAIL, HIGH_DETAIL].map((detail) => buildReplicaModels([replica], 0x3a7bd5, false, detail, null, 'hands', undefined, files));
  const [low, high] = built.map((b) => b.models.get(replica.id)!);
  for (const m of [low!, high!]) fitParts(m, {});
  const asItComes = [drawCost(low!.group), drawCost(high!.group)];
  const lowParts = new Map(partGroups(low!.group).map((g) => [g.name, g]));
  const parts = partGroups(high!.group).map((g) => {
    const lo = lowParts.get(g.name);
    const show = (o: THREE.Object3D | undefined): DrawCost => {
      if (!o) return { triangles: 0, meshes: 0 };
      o.visible = true;
      return drawCost(o);
    };
    return { name: g.name, low: show(lo), high: show(g) };
  });
  for (const b of built) b.dispose();
  return { replica: replica.id, fromFile: files.has(replica.id), low: asItComes[0]!, high: asItComes[1]!, parts };
}

export interface SoundCensus {
  profile: ShotProfile;
  /** The shot's peak and its loudness over its first 100 ms (dB below full scale), and its brightness (Hz). */
  peakDb: number;
  loudnessDb: number;
  centroidHz: number;
}

const RATE = 48_000;
/** The window a shot's loudness is read over (s): the crack, not its tail. */
const LOUDNESS_WINDOW = 0.1;

const db = (x: number): number => 10 * Math.log10(Math.max(x, 1e-12));

/** The spectral centroid of `x` (Hz): a plain DFT over its first 4,096 samples, Hann-windowed. Slow, but run once. */
function centroid(x: Float32Array): number {
  const n = Math.min(4096, x.length);
  let num = 0;
  let den = 0;
  for (let k = 1; k < n / 2; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
      const a = (-2 * Math.PI * k * i) / n;
      re += x[i]! * w * Math.cos(a);
      im += x[i]! * w * Math.sin(a);
    }
    const p = re * re + im * im;
    num += p * ((k * RATE) / n);
    den += p;
  }
  return den > 0 ? num / den : 0;
}

/** The shot sound of each profile in `profiles`, rendered by the game's synthesiser. */
export function soundCensus(profiles: readonly ShotProfile[]): SoundCensus[] {
  const bank = renderSounds(RATE);
  return profiles.map((profile) => {
    const v = bank.get(cues.shot(profile))?.[0];
    if (!v) return { profile, peakDb: Number.NaN, loudnessDb: Number.NaN, centroidHz: Number.NaN };
    let peak = 0;
    let sum = 0;
    const window = Math.min(v.length, Math.round(LOUDNESS_WINDOW * RATE));
    for (let i = 0; i < v.length; i++) peak = Math.max(peak, Math.abs(v[i]!));
    for (let i = 0; i < window; i++) sum += v[i]! * v[i]!;
    return { profile, peakDb: db(peak * peak), loudnessDb: db(sum / Math.max(1, window)), centroidHz: centroid(v) };
  });
}

