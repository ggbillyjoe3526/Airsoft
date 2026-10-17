import { BOT_KIT_SUIT_LEAN, DIFFICULTIES, type Difficulty } from '../config/bots';
import { isLightId, type LightId } from '../config/torches';
import { fitOptics, fitParts } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { createRng, rngNext } from '../sim/rng';
import { vec3 } from '../sim/vec';
import type { ItemRef } from './item';
import { EMPTY_FIT, FIT_CATEGORY, FIT_SLOTS, type FitSlot, kitSlot, type KitSlot, type ReplicaFit } from './kit';
import { type Asset, assetOfReplica, fits, type Pool } from './pool';
import { missingColumns, readTables } from './poolFile';

/**
 * The bots' kits (BG1): data/bot-kits.md, the hand-edited table of what the other team's bots carry
 * and how often each difficulty picks each kit. Every opponent picks its own kit, seeded by the match's seed and its
 * id, so a match replays the same kits, leaning towards the kits that suit its personality; what the player has
 * unlocked never enters into it. Here the table is read, a kit picked and a bot built carrying it, and on a night field
 * every bot is given the torch the pool offers (M33h).
 * Pure.
 */

/** The seed for bot `id`'s kit in a match seeded `seed`: each bot's pick is its own. */
export function botKitSeed(seed: number, id: number): number {
  return (seed ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0;
}

/** One replica of a kit and what is fitted to it, as pool.md asset IDs. */
export interface BotKitSlot {
  replica: string;
  parts: readonly string[];
}

/**
 * A kit: its name, its replicas (the primary first, then the sidearm if it has one), the personalities it suits and each
 * difficulty's weight.
 */
export interface BotKit {
  name: string;
  slots: readonly BotKitSlot[];
  /** The bot personalities (lower case) that lean towards it (kitWeights); empty: none, and it keeps its chance. */
  suits: readonly string[];
  /** How likely a bot at each difficulty is to carry it, against the other kits (0: never). */
  weights: Readonly<Record<Difficulty, number>>;
}

export interface BotKitTable {
  /** The kits the file could read, in its order. */
  kits: readonly BotKit[];
  /** What couldn't be read, each with its line ("line 12: …"). Those rows are left out. */
  errors: readonly string[];
}

/**
 * The table's columns: the kit, its two replicas and their parts, then a weight per difficulty (by its label). Suits, the
 * personalities a kit suits, may be left out.
 */
const KIT = 'Kit';
const SUITS = 'Suits';
const SLOT_COLUMNS = [
  ['Primary', 'Primary parts'],
  ['Secondary', 'Secondary parts'],
] as const;
const COLUMNS: readonly string[] = [KIT, ...SLOT_COLUMNS.flat(), ...DIFFICULTIES.map((d) => d.label)];

/** The fit slot each part category goes in (a weapon torch is fitted by rule on a night field, never by a kit). */
const SLOT_OF: ReadonlyMap<Asset['category'], FitSlot> = new Map(FIT_SLOTS.filter((s) => s !== 'light').map((s) => [FIT_CATEGORY[s], s]));

/** The asset a cell names: by its ID, or by its Name in any case. */
function assetNamed(pool: Pool, name: string): Asset | undefined {
  const lower = name.toLowerCase();
  return pool.byId.get(name) ?? pool.assets.find((a) => a.name.toLowerCase() === lower);
}

/** A replica cell and its parts cell as a kit slot, or what is wrong with them. Empty replica: no slot (null). */
function readSlot(pool: Pool, column: string, replicaCell: string, partsCell: string): BotKitSlot | null | string {
  if (replicaCell === '') return partsCell === '' ? null : `${column} parts but no ${column}`;
  const replica = assetNamed(pool, replicaCell);
  if (!replica) return `${column} "${replicaCell}" isn't in pool.md`;
  if (replica.category !== 'replica') return `${column} "${replicaCell}" isn't a replica`;
  const parts: string[] = [];
  const used = new Map<FitSlot, string>();
  for (const name of partsCell.split(',').map((p) => p.trim()).filter((p) => p !== '')) {
    const part = assetNamed(pool, name);
    if (!part) return `${column} part "${name}" isn't in pool.md`;
    const slot = SLOT_OF.get(part.category);
    if (!slot) return part.category === 'light' ? `${column} part "${name}": weapon torches are fitted by rule on night fields` : `${column} part "${name}" isn't a part`;
    if (!fits(part, replica)) return `${column} part "${name}" doesn't fit the ${replica.name}`;
    const other = used.get(slot);
    if (other) return `${column} parts "${other}" and "${name}" both take the ${slot} slot`;
    used.set(slot, part.name);
    parts.push(part.id);
  }
  return { replica: replica.id, parts };
}

/** A Suits cell as personality names in lower case, or what is wrong with it (a name `known` doesn't list). */
function readSuits(cell: string, known: readonly string[] | undefined): string[] | string {
  const names = [...new Set(cell.split(',').map((p) => p.trim().toLowerCase()).filter((p) => p !== ''))];
  const stray = known ? names.find((n) => !known.includes(n)) : undefined;
  return stray === undefined ? names : `Suits "${stray}" isn't a bot personality`;
}

/** A weight cell: a number of 0 or more (empty: 0), or null when it isn't one. */
function readWeight(cell: string): number | null {
  if (cell === '') return 0;
  const n = Number(cell);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The kits in bot-kits.md's text, read against `pool` (the full pool: dev assets are left to pickBotKit) and the bot
 * personalities `personalities` (a Suits name it doesn't list is an error; absent: any name). Rows it can't read are
 * left out and listed in `errors` with their lines; so is the table when it lacks a column.
 */
export function readBotKits(text: string, pool: Pool, personalities?: readonly string[]): BotKitTable {
  const errors: string[] = [];
  const table = readTables(text).find((t) => t.headers.includes(KIT));
  if (!table) return { kits: [], errors: ['no table with a Kit column'] };
  for (const p of table.problems) errors.push(`line ${p.line}: ${p.message}`);
  const missing = missingColumns(table, COLUMNS);
  if (missing) return { kits: [], errors: [...errors, `line ${table.line}: ${missing}`] };
  const kits: BotKit[] = [];
  for (const row of table.rows) {
    const cells = row.cells;
    const at = `line ${row.line}`;
    const name = cells[KIT]!;
    if (name === '') {
      errors.push(`${at}: no Kit name`);
      continue;
    }
    if (kits.some((k) => k.name.toLowerCase() === name.toLowerCase())) {
      errors.push(`${at}: kit "${name}" is listed twice`);
      continue;
    }
    const slots: BotKitSlot[] = [];
    let problem: string | null = null;
    for (const [replicaColumn, partsColumn] of SLOT_COLUMNS) {
      const slot = readSlot(pool, replicaColumn, cells[replicaColumn]!, cells[partsColumn]!);
      if (typeof slot === 'string') problem ??= slot;
      else if (slot) slots.push(slot);
    }
    if (!problem && cells[SLOT_COLUMNS[0][0]] === '') problem = 'no Primary';
    const suits = readSuits(cells[SUITS] ?? '', personalities);
    if (typeof suits === 'string') problem ??= suits;
    const weights = {} as Record<Difficulty, number>;
    for (const d of DIFFICULTIES) {
      const w = readWeight(cells[d.label]!);
      if (w === null) problem ??= `${d.label} weight "${cells[d.label]}" isn't a number of 0 or more`;
      else weights[d.id] = w;
    }
    if (problem) {
      errors.push(`${at}: ${problem}`);
      continue;
    }
    kits.push({ name, slots, suits: typeof suits === 'string' ? [] : suits, weights });
  }
  return { kits, errors };
}

/** Every pool asset a kit holds: its replicas and their parts. */
export function kitAssets(kit: BotKit): string[] {
  return kit.slots.flatMap((s) => [s.replica, ...s.parts]);
}

/** Whether `pool` offers everything `kit` holds (a contentPool: dev gear only with Dev content on). */
export function kitOffered(pool: Pool, kit: BotKit): boolean {
  return kitAssets(kit).every((id) => pool.byId.has(id));
}

/** The kits a bot at `difficulty` may carry from what `offered` offers: weight above 0 and everything offered. */
export function kitsFor(table: BotKitTable, difficulty: Difficulty, offered: Pool): BotKit[] {
  return table.kits.filter((k) => k.weights[difficulty] > 0 && kitOffered(offered, k));
}

/**
 * The weights a bot at `difficulty` with `personality` (null: none) picks `kits` by. A kit whose Suits name it weighs
 * BOT_KIT_SUIT_LEAN times its weight against the other kits with Suits, and those kits together keep the weight the
 * table gives them, so a kit with no Suits (the Factory) keeps its chance: the level decides how often a bot carries gear,
 * its personality which. Without a personality, or one no kit suits, the table's weights as they are.
 */
export function kitWeights(kits: readonly BotKit[], difficulty: Difficulty, personality: string | null = null): number[] {
  const weights = kits.map((k) => k.weights[difficulty]);
  if (personality === null) return weights;
  let total = 0;
  let leaned = 0;
  for (const [i, k] of kits.entries()) {
    if (k.suits.length === 0) continue;
    total += weights[i]!;
    leaned += weights[i]! * (k.suits.includes(personality) ? BOT_KIT_SUIT_LEAN : 1);
  }
  if (leaned === total || leaned <= 0) return weights;
  const scale = total / leaned;
  return kits.map((k, i) => (k.suits.length === 0 ? weights[i]! : weights[i]! * (k.suits.includes(personality) ? BOT_KIT_SUIT_LEAN : 1) * scale));
}

/**
 * The kit a bot at `difficulty` carries, drawn by the weights from `seed` (botKitSeed: the match's seed and the bot's
 * id) among the kits `offered` has everything for, leaning towards those that suit its `personality` (kitWeights; null:
 * none); null (the replicas as they come) when there are none.
 */
export function pickBotKit(table: BotKitTable, difficulty: Difficulty, offered: Pool, seed: number, personality: string | null = null): BotKit | null {
  const kits = kitsFor(table, difficulty, offered);
  const weights = kitWeights(kits, difficulty, personality);
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return null;
  let left = rngNext(createRng(seed)) * total;
  for (const [i, k] of kits.entries()) {
    left -= weights[i]!;
    if (left < 0) return k;
  }
  return kits[kits.length - 1]!;
}

/** The pool item a kit carries of asset `id` (LV1: an item is its asset). */
function itemOf(id: string): ItemRef {
  return { asset: id };
}

/**
 * Kit slots for `kit` (its replicas, primary first, each with what is fitted), built from `pool` as the player's are
 * (pool/kit.ts kitSlot: the parts' and power source's numbers worked in). A replica the pool has no row for is
 * skipped; pickBotKit only picks kits the pool has everything for.
 */
export function botKitSlots(pool: Pool, kit: BotKit): KitSlot[] {
  return kit.slots.flatMap((slot) => {
    if (!pool.byId.has(slot.replica)) return [];
    const fit: ReplicaFit = { ...EMPTY_FIT };
    for (const part of slot.parts) {
      const asset = pool.byId.get(part);
      const s = asset ? SLOT_OF.get(asset.category) : undefined;
      if (s) fit[s] = itemOf(part);
    }
    return [kitSlot(pool, itemOf(slot.replica), fit)];
  });
}

/** A character carrying `kit`: its replicas as the kit makes them, with the kit's optics and parts fitted. */
export function kittedCharacter(id: number, team: number, kit: readonly KitSlot[]): Character {
  const c = createCharacter(id, vec3(), 0, kit.map((s) => s.replica), team);
  fitOptics(c.armament, kit.map((s) => s.optic));
  fitParts(c.armament, kit.map((s) => s.parts));
  return c;
}

/**
 * Bot `id` of `team` carrying `kit` from `pool`, ready to fight: each replica on full auto when it has it (bots shoot in
 * held bursts and never touch the selector: the Cyber Pistol comes on semi).
 */
export function kittedBot(id: number, team: number, pool: Pool, kit: BotKit): Character {
  const c = kittedCharacter(id, team, botKitSlots(pool, kit));
  const a = c.armament;
  for (let i = 0; i < a.replicas.length; i++) if (a.replicas[i]!.fireModes.includes('auto')) a.modes[i] = 'auto';
  return c;
}

/**
 * Whether a bot at `difficulty` may carry dev gear (M35): a kit weighted for it that holds an asset `pool` (the full
 * pool) tags dev. New game's note and the match's records rule both use it, so they agree before any pick is made.
 */
export function kitsMayHoldDev(table: BotKitTable, difficulty: Difficulty, pool: Pool): boolean {
  return table.kits.some((k) => k.weights[difficulty] > 0 && kitAssets(k).some((id) => pool.byId.get(id)?.tag === 'dev'));
}

/**
 * The light every bot carries on a night field (M33h): the first light `pool` offers (contentPool: a dev torch only with
 * Dev content on) whose Key the code knows, or null. By rule, at every difficulty, never part of a kit.
 */
export function botLight(pool: Pool): LightId | null {
  const light = pool.assets.find((a) => a.category === 'light' && isLightId(a.key));
  return light ? (light.key as LightId) : null;
}

/**
 * Fits `light` to each of bot `c`'s replicas it fits (by `pool`'s tags; a replica the pool doesn't list goes without),
 * keeping every other part. A match build's step, never a tick's.
 */
export function fitBotLight(c: Character, pool: Pool, light: LightId | null): void {
  if (!light) return;
  const asset = pool.assets.find((a) => a.category === 'light' && a.key === light);
  if (!asset) return;
  const a = c.armament;
  const parts = a.replicas.map((r, i) => {
    const replica = assetOfReplica(pool, r);
    return replica && fits(asset, replica) ? { ...a.parts[i]!, light } : a.parts[i]!;
  });
  fitParts(a, parts);
}
