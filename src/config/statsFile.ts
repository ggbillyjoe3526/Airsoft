import { type PoolRow, type PoolTable, readTables } from '../pool/poolFile';

/**
 * Reads stats.md (M29): the hand-edited performance numbers of every replica, power source and part, and the site's
 * energy limits. Pure text in, plain data out; the config modules lay these numbers over
 * their built-in ones (config/gameStats.ts loads the bundled file). Never throws: a cell it can't read is left out (the
 * built-in number stays) and listed in `errors` with its line.
 */

/** A replica's numbers (ReplicaConfig fields) and its site class (`Site limits`). */
export interface ReplicaStats {
  siteClass: string;
  muzzleEnergy: number;
  bbWeight: number;
  fireRate: number;
  magSize: number;
  mags: number;
  reloadTime: number;
  drawTime: number;
  spreadDeg: number;
  recoilDeg: number;
}

/** What a power source adds, as shares (0.1 = 10 %): to the energy, the rate of fire and the kick of each shot. */
export interface PowerStats {
  energy: number;
  fireRate: number;
  recoil: number;
}

export const NO_POWER_STATS: PowerStats = { energy: 0, fireRate: 0, recoil: 0 };

/** The site limits as shipped (J), by replica class. */
export const DEFAULT_SITE_LIMITS: Readonly<Record<string, number>> = { rifle: 1.2, pistol: 1.0 };

export interface StatsFile {
  /** By replica Key. */
  replicas: Readonly<Record<string, Partial<ReplicaStats>>>;
  /** By pool.md ID. */
  power: Readonly<Record<string, PowerStats>>;
  /** By Key: the fields of OpticConfig, GripConfig, LaserConfig and MagazineConfig the file sets. */
  optics: Readonly<Record<string, { zoom?: number; raiseScale?: number }>>;
  grips: Readonly<Record<string, { handlingScale?: number; shakeScale?: number }>>;
  lasers: Readonly<Record<string, { spreadScale?: number }>>;
  magazines: Readonly<Record<string, { capacity?: number; carried?: number; reloadScale?: number; drawScale?: number; rattles?: boolean }>>;
  barrels: Readonly<Record<string, { energy?: number; spreadScale?: number; handlingScale?: number }>>;
  muzzles: Readonly<Record<string, { energy?: number; handlingScale?: number; heardScale?: number }>>;
  /** Weapon lights (M33h). */
  lights: Readonly<Record<string, { reach?: number; beamDeg?: number; spillDeg?: number }>>;
  /** Energy limit (J) by replica class. */
  siteLimits: Readonly<Record<string, number>>;
  /** What couldn't be read, each with its stats.md line ("line 12: …"). */
  errors: readonly string[];
}

type Fail = (line: number, message: string) => void;

/** A column: the field it sets, how it is read, and the range a number must fall in. */
interface Column {
  field: string;
  kind: 'number' | 'percent' | 'yesNo' | 'word';
  min?: number;
  max?: number;
}

const REPLICA_COLUMNS: Readonly<Record<string, Column>> = {
  Class: { field: 'siteClass', kind: 'word' },
  'Energy (J)': { field: 'muzzleEnergy', kind: 'number', min: 0.05, max: 5 },
  'BB (g)': { field: 'bbWeight', kind: 'number', min: 0.1, max: 0.5 },
  'Fire rate (BBs/s)': { field: 'fireRate', kind: 'number', min: 0.5, max: 50 },
  'Magazine (BBs)': { field: 'magSize', kind: 'number', min: 1, max: 1000 },
  Magazines: { field: 'mags', kind: 'number', min: 1, max: 20 },
  'Reload (s)': { field: 'reloadTime', kind: 'number', min: 0.1, max: 10 },
  'Draw (s)': { field: 'drawTime', kind: 'number', min: 0.05, max: 5 },
  'Spread (°)': { field: 'spreadDeg', kind: 'number', min: 0, max: 10 },
  'Recoil (°)': { field: 'recoilDeg', kind: 'number', min: 0, max: 5 },
};

const POWER_COLUMNS: Readonly<Record<string, Column>> = {
  'Energy %': { field: 'energy', kind: 'percent', min: -50, max: 100 },
  'Fire rate %': { field: 'fireRate', kind: 'percent', min: -50, max: 100 },
  'Recoil %': { field: 'recoil', kind: 'percent', min: -50, max: 200 },
};

const OPTIC_COLUMNS: Readonly<Record<string, Column>> = {
  'Zoom (×)': { field: 'zoom', kind: 'number', min: 1, max: 8 },
  'Raise time (×)': { field: 'raiseScale', kind: 'number', min: 0.1, max: 5 },
};

const GRIP_COLUMNS: Readonly<Record<string, Column>> = {
  'Handling (×)': { field: 'handlingScale', kind: 'number', min: 0.1, max: 5 },
  'Shake (×)': { field: 'shakeScale', kind: 'number', min: 0.1, max: 5 },
};

const LASER_COLUMNS: Readonly<Record<string, Column>> = { 'Spread (×)': { field: 'spreadScale', kind: 'number', min: 0.1, max: 2 } };

const MAGAZINE_COLUMNS: Readonly<Record<string, Column>> = {
  'Capacity (×)': { field: 'capacity', kind: 'number', min: 0.1, max: 10 },
  'Carried (+)': { field: 'carried', kind: 'number', min: -10, max: 10 },
  'Reload (×)': { field: 'reloadScale', kind: 'number', min: 0.1, max: 5 },
  'Draw (×)': { field: 'drawScale', kind: 'number', min: 0.1, max: 5 },
  Rattles: { field: 'rattles', kind: 'yesNo' },
};

const BARREL_COLUMNS: Readonly<Record<string, Column>> = {
  'Energy %': { field: 'energy', kind: 'percent', min: -50, max: 50 },
  'Spread (×)': { field: 'spreadScale', kind: 'number', min: 0.1, max: 3 },
  'Handling (×)': { field: 'handlingScale', kind: 'number', min: 0.1, max: 5 },
};

const MUZZLE_COLUMNS: Readonly<Record<string, Column>> = {
  'Energy %': { field: 'energy', kind: 'percent', min: -50, max: 50 },
  'Handling (×)': { field: 'handlingScale', kind: 'number', min: 0.1, max: 5 },
  'Heard from (×)': { field: 'heardScale', kind: 'number', min: 0.05, max: 2 },
};

const LIGHT_COLUMNS: Readonly<Record<string, Column>> = {
  'Reach (m)': { field: 'reach', kind: 'number', min: 1, max: 100 },
  'Beam (°)': { field: 'beamDeg', kind: 'number', min: 1, max: 90 },
  'Spill (°)': { field: 'spillDeg', kind: 'number', min: 1, max: 120 },
};

const ID_PATTERN = /^\d{6}$/;
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const CLASS_PATTERN = /^[a-z]+(-[a-z]+)*$/;

function cell(row: PoolRow, header: string): string {
  return row.cells[header] ?? '';
}

/** One cell read by its column, or undefined (and an error) if it can't be. */
function readCell(row: PoolRow, header: string, col: Column, fail: Fail): number | boolean | string | undefined {
  const raw = cell(row, header).trim();
  if (col.kind === 'yesNo') {
    if (raw.toLowerCase() === 'yes') return true;
    if (raw.toLowerCase() === 'no') return false;
    return fail(row.line, `${header} must be yes or no, not "${raw}"`), undefined;
  }
  if (col.kind === 'word') {
    if (CLASS_PATTERN.test(raw)) return raw;
    return fail(row.line, `${header} must be a lower case word, not "${raw}"`), undefined;
  }
  // A minus sign typed as − or – reads as -, and a trailing % is allowed.
  const text = raw.replace(/^[−–]/, '-').replace(/%$/, '').trim();
  const v = text === '' ? Number.NaN : Number(text);
  const min = col.min ?? Number.NEGATIVE_INFINITY;
  const max = col.max ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(v) || v < min || v > max) return fail(row.line, `${header} must be a number from ${min} to ${max}, not "${raw}"`), undefined;
  return col.kind === 'percent' ? v / 100 : v;
}

/**
 * The rows of a table keyed by its first column (a Key, or an ID for power sources): each the fields its columns set.
 * A column the table lacks is reported once; a row whose key is malformed or repeated is left out.
 */
function keyedRows(t: PoolTable | undefined, name: string, keyHeader: string, columns: Readonly<Record<string, Column>>, fail: Fail, errors: string[]): Record<string, Record<string, number | boolean | string>> {
  const out: Record<string, Record<string, number | boolean | string>> = {};
  if (!t) return errors.push(`no "${name}" table: using the built-in numbers`), out;
  for (const header of Object.keys(columns)) if (!t.headers.includes(header)) fail(t.line, `the ${name} table has no "${header}" column: using the built-in numbers`);
  const pattern = keyHeader === 'ID' ? ID_PATTERN : KEY_PATTERN;
  for (const row of t.rows) {
    const key = cell(row, keyHeader);
    if (!pattern.test(key)) {
      fail(row.line, `${keyHeader} must be ${keyHeader === 'ID' ? 'six digits (the pool.md ID)' : "a Key as in pool.md's Key column"}, not "${key}"`);
      continue;
    }
    if (key in out) {
      fail(row.line, `${key} is listed twice in ${name}`);
      continue;
    }
    const fields: Record<string, number | boolean | string> = {};
    for (const [header, col] of Object.entries(columns)) {
      if (!t.headers.includes(header)) continue;
      const v = readCell(row, header, col, fail);
      if (v !== undefined) fields[col.field] = v;
    }
    out[key] = fields;
  }
  return out;
}

function readLimits(t: PoolTable | undefined, fail: Fail, errors: string[]): Record<string, number> {
  if (!t) return errors.push('no "Site limits" table: using the built-in limits'), { ...DEFAULT_SITE_LIMITS };
  const out: Record<string, number> = {};
  for (const row of t.rows) {
    const c = cell(row, 'Class').toLowerCase();
    if (!CLASS_PATTERN.test(c)) {
      fail(row.line, `Class must be a lower case word, not "${cell(row, 'Class')}"`);
      continue;
    }
    if (c in out) {
      fail(row.line, `class ${c} is listed twice`);
      continue;
    }
    const v = readCell(row, 'Limit (J)', { field: '', kind: 'number', min: 0.1, max: 10 }, fail);
    if (typeof v === 'number') out[c] = v;
  }
  return out;
}

/** Reads stats.md's text. Never throws: what it can't read keeps the built-in number and is listed in `errors`. */
export function loadStats(text: string): StatsFile {
  const tables = readTables(text);
  const errors: string[] = [];
  const fail: Fail = (line, message) => void errors.push(`line ${line}: ${message}`);
  const table = (heading: string): PoolTable | undefined => tables.find((t) => t.heading === heading);
  const power = keyedRows(table('Power sources'), 'Power sources', 'ID', POWER_COLUMNS, fail, errors) as Record<string, Partial<PowerStats>>;
  return {
    replicas: keyedRows(table('Replicas'), 'Replicas', 'Key', REPLICA_COLUMNS, fail, errors) as Record<string, Partial<ReplicaStats>>,
    power: Object.fromEntries(Object.entries(power).map(([id, p]) => [id, { ...NO_POWER_STATS, ...p }])),
    optics: keyedRows(table('Optics'), 'Optics', 'Key', OPTIC_COLUMNS, fail, errors) as StatsFile['optics'],
    grips: keyedRows(table('Grips'), 'Grips', 'Key', GRIP_COLUMNS, fail, errors) as StatsFile['grips'],
    lasers: keyedRows(table('Lasers'), 'Lasers', 'Key', LASER_COLUMNS, fail, errors) as StatsFile['lasers'],
    magazines: keyedRows(table('Magazines'), 'Magazines', 'Key', MAGAZINE_COLUMNS, fail, errors) as StatsFile['magazines'],
    barrels: keyedRows(table('Barrels'), 'Barrels', 'Key', BARREL_COLUMNS, fail, errors) as StatsFile['barrels'],
    muzzles: keyedRows(table('Muzzle parts'), 'Muzzle parts', 'Key', MUZZLE_COLUMNS, fail, errors) as StatsFile['muzzles'],
    lights: keyedRows(table('Lights'), 'Lights', 'Key', LIGHT_COLUMNS, fail, errors) as StatsFile['lights'],
    siteLimits: readLimits(table('Site limits'), fail, errors),
    errors,
  };
}

/** `base` with each entry's fields replaced by the file's (entries the file doesn't name stay as they are). */
export function overlay<T extends object>(base: Readonly<Record<string, T>>, rows: Readonly<Record<string, Partial<T>>>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(base)) out[key] = { ...value, ...(rows[key] ?? {}) };
  return out;
}
