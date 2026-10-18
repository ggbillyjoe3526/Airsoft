import type { ReplicaConfig } from '../config/replicas';
import type { StatsFile } from '../config/statsFile';
import type { BotKitTable } from '../pool/botKit';
import type { Asset, Pool } from '../pool/pool';
import type { LevelTable } from '../progress/levels';

/**
 * Everything the rules and compatibility checks read (CT1), passed in so a test can hand them a pool or a table with a
 * fault in it. `gameContent.ts` builds the game's own.
 */

/** The names a replica's model table draws (render/replicas/replicaParts.ts REPLICA_PART_TABLES), by kind. */
export interface DrawTable {
  /** `<category>:<key>` for optics, grips, lasers, barrels and lights ('optic:redDot'). */
  parts: readonly string[];
  /** Magazine keys ('standard', 'hiCap'). */
  magazines: readonly string[];
  /** Muzzle device keys ('none' for a bare muzzle's own, 'silencer'). */
  muzzles: readonly string[];
}

/** One thing a part changes, and whether that is better or worse than without it. */
export interface PartEffect {
  /** In plain words, with the number: "handling ×1.25 (slower)". */
  says: string;
  change: 'better' | 'worse' | 'same';
}

export interface ContentInputs {
  pool: Pool;
  stats: StatsFile;
  /** The levels (levels.md, LV1): the level each item unlocks at. */
  levels: LevelTable;
  /** The replica configs by Key (pool.ts REPLICA_KEYS). */
  replicas: Readonly<Record<string, ReplicaConfig>>;
  /** The model tables by table name (the replica's viewmodel, else 'pistol' or 'aeg'). */
  drawTables: Readonly<Record<string, DrawTable>>;
  /** Every sound cue the game can play (config/sounds.ts SOUNDS). */
  soundCues: ReadonlySet<string>;
  /** The code keys each part category knows (pool.ts OPTIC_KEYS and its neighbours). */
  partKeys: Readonly<Record<PartCategory, readonly string[]>>;
  /** What a part changes (its numbers, read from the game's configs). */
  effects(part: Asset): readonly PartEffect[];
  /** The bots' kits (bot-kits.md, BG1): which replicas the other team brings. Absent: not checked. */
  botKits?: BotKitTable;
}

/** The pool categories a replica's Customise slots take (pool/kit.ts FIT_CATEGORY), power sources included. */
export type PartCategory = 'optic' | 'grip' | 'laser' | 'magazine' | 'barrel' | 'muzzle' | 'light' | 'power';

export const PART_CATEGORIES: readonly PartCategory[] = ['optic', 'grip', 'laser', 'magazine', 'barrel', 'muzzle', 'light', 'power'];

/** The model table a replica is drawn from (render/replicas/replicaModels.ts buildReplicaModels picks it the same way). */
export function drawTableOf(r: ReplicaConfig): string {
  return r.look.viewmodel ?? (r.look.model === 'pistol' ? 'pistol' : 'aeg');
}

/** The name a part's draw has in its replica's table, by kind: null for a power source (never drawn on the replica). */
export function drawName(part: Asset): { kind: keyof DrawTable; name: string } | null {
  if (part.category === 'power' || part.category === 'grenade' || part.category === 'replica') return null;
  if (part.category === 'magazine') return { kind: 'magazines', name: part.key };
  if (part.category === 'muzzle') return { kind: 'muzzles', name: part.key };
  return { kind: 'parts', name: `${part.category}:${part.key}` };
}

/** The name a part's drawn group has on the built model ('optic:redDot', 'magazine:hiCap', 'muzzle:silencer'), or null. */
export function sceneName(part: Asset): string | null {
  const d = drawName(part);
  if (!d) return null;
  return d.kind === 'parts' ? d.name : `${d.kind === 'magazines' ? 'magazine' : 'muzzle'}:${d.name}`;
}

/** How a multiplier reads: "×1.25". */
const times = (x: number): string => `×${Number(x.toFixed(3))}`;
/** How a share reads: "+8 %". */
const percent = (x: number): string => `${x >= 0 ? '+' : ''}${Number((x * 100).toFixed(1))} %`;

/** One effect: a number against its neutral value, where `lowerIsBetter` says which way is the gain. */
export function effect(label: string, value: number, neutral: number, lowerIsBetter: boolean, shown: (x: number) => string = times): PartEffect {
  const change = Math.abs(value - neutral) < 1e-9 ? 'same' : value < neutral === lowerIsBetter ? 'better' : 'worse';
  return { says: `${label} ${shown(value)}`, change };
}

/** A share's effect ("energy +8 %"). */
export const shareEffect = (label: string, value: number, lowerIsBetter = false): PartEffect => effect(label, value, 0, lowerIsBetter, percent);

/** A yes/no effect: `bad` when it is on (a rattling magazine). */
export const flagEffect = (label: string, on: boolean): PartEffect => ({ says: `${label}: ${on ? 'yes' : 'no'}`, change: on ? 'worse' : 'same' });
