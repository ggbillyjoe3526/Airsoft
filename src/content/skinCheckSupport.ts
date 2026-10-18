import { PLAY_MODULES, PUBLIC_SKINS, SHIPPED_SCHEME_IDS, SKIN_RULES, TEAM_COLOUR_SKINS } from '../config/contentRules';
import type { ReplicaConfig } from '../config/replicas';
import { BOT_SCHEMES, DEFAULT_SCHEMES, FAMILIES, type FamilyId, hasFixedColours, offeredSchemes, type Scheme, SCHEME_IDS, SCHEMES, type SchemeId } from '../config/schemes';
import { TEAM_COLOUR_SETS, TEAMS } from '../config/teams';
import { GAME_POOL } from '../pool/gamePool';
import { LoadoutModel } from '../pool/loadoutModel';
import { type Pool, replicaOf } from '../pool/pool';
import { MemoryStorage } from '../pool/testStorage';
import { NO_REPLICA_FILES, type ReplicaFiles } from '../render/replicas/replicaFiles';

/** What the skin checks share (CT4): their context, how a skin reads in a result. */

/** A skin: a replica colour scheme (config/schemes.ts SCHEMES) and its id, the save key. */
export interface SkinEntry {
  id: string;
  scheme: Scheme;
}

/** A replica a skin can be drawn on: its pool ID and name, and its config. */
export interface SkinReplica {
  id: string;
  name: string;
  config: ReplicaConfig;
}

/** The modules that decide play and import the schemes by value, with the names they take from it. */
export interface PlayImport {
  file: string;
  names: readonly string[];
}

/** What the skin checks read besides the skin. */
export interface SkinContext {
  /** Every skin, in Customise's order. */
  skins: readonly SkinEntry[];
  /** The plain families of the Realistic colours setting. */
  families: Readonly<Record<string, Omit<Scheme, 'tag'>>>;
  publicSkins: Readonly<Record<string, string>>;
  shipped: readonly string[];
  teamColourSkins: Readonly<Record<string, string>>;
  /** A new player's scheme by replica model ('rifle', 'pistol'), and the bots' by team. */
  defaults: Readonly<Record<string, string>>;
  bots: readonly Readonly<Record<string, string>>[];
  /** The skins Customise offers, with Dev content on or off (config/schemes.ts offeredSchemes). */
  offered(devContent: boolean): readonly string[];
  /** Every replica in the pool. */
  replicas: readonly SkinReplica[];
  /** Every team colour of every set (Settings › Accessibility), with its team's name and the set's. */
  teamColours: readonly { team: number; name: string; set: string; colour: number }[];
  /** The modules that decide play (config/contentRules.ts PLAY_MODULES) and reach the schemes by value. */
  playImports: readonly PlayImport[];
  /**
   * The player's kit with `replica` (a pool ID) equipped in `skin`, its colour left out: what the match plays with
   * (pool/loadoutModel.ts kit()), as text to compare.
   */
  kitWith(replica: string, skin: string): string;
  /** Replica model files to draw on too (what the game draws, BD1); none by default. */
  files: ReplicaFiles;
  rules: { readonly [K in keyof typeof SKIN_RULES]: number };
}

/** A replica that takes a skin: one whose colours aren't its own (the Cyber Pistol keeps its own, M32). */
export const takesSkin = (r: SkinReplica): boolean => !hasFixedColours(r.config);

/** The replicas a skin is drawn on: every replica that takes one (a skin fits every replica of the kind it is made for: all of them today). */
export const claimedReplicas = (ctx: SkinContext): SkinReplica[] => ctx.replicas.filter(takesSkin);

/** A skin's name in a result: its name and id. */
export const skinItem = (skin: SkinEntry): string => `${skin.scheme.name} (${skin.id})`;

/** A colour as text ("#2f6fd6"). */
export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** The teams whose bots carry `skin` (by team index). */
export const botTeams = (ctx: SkinContext, skin: string): number[] => ctx.bots.flatMap((b, team) => (Object.values(b).includes(skin) ? [team] : []));

/** A team's name ("Alpha"), from the team colours. */
export const teamName = (ctx: SkinContext, team: number): string => ctx.teamColours.find((t) => t.team === team)?.name ?? `team ${team + 1}`;

/** A list in words: "a, b and c". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The player's kit with `replica` equipped (as it comes) in `skin`, its colour left out, as text. */
export function gameKitWith(pool: Pool, replica: string, skin: string): string {
  const g = globalThis as { localStorage?: Storage };
  const saved = Object.getOwnPropertyDescriptor(g, 'localStorage');
  Object.defineProperty(g, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
  try {
    const model = new LoadoutModel(pool, { owns: () => true, devContent: () => true });
    model.equip('primary', { asset: replica });
    model.setScheme(replica, skin as SchemeId);
    const kit = model.kit();
    if (kit.schemes[0] !== skin) throw new Error(`the kit wears ${kit.schemes[0]}, not ${skin}`);
    return JSON.stringify({ ...kit, schemes: kit.schemes.map(() => '') });
  } finally {
    if (saved) Object.defineProperty(g, 'localStorage', saved);
    else delete g.localStorage;
  }
}

/** The game's own context; `playImports` from the source files (src/content/report/playImports.ts reads them in Node). */
export function gameSkinContext(playImports: readonly PlayImport[], files: ReplicaFiles = NO_REPLICA_FILES, pool: Pool = GAME_POOL): SkinContext {
  const sets = Object.entries(TEAM_COLOUR_SETS) as [string, (typeof TEAM_COLOUR_SETS)[keyof typeof TEAM_COLOUR_SETS]][];
  return {
    skins: SCHEME_IDS.map((id) => ({ id, scheme: SCHEMES[id] })),
    families: FAMILIES as Readonly<Record<FamilyId, Scheme>>,
    publicSkins: PUBLIC_SKINS,
    shipped: SHIPPED_SCHEME_IDS,
    teamColourSkins: TEAM_COLOUR_SKINS,
    defaults: DEFAULT_SCHEMES,
    bots: BOT_SCHEMES,
    offered: offeredSchemes,
    replicas: pool.assets.filter((a) => a.category === 'replica').map((a) => ({ id: a.id, name: a.name, config: replicaOf(a) })),
    teamColours: sets.flatMap(([set, c]) => c.figures.map((colour, team) => ({ team, name: TEAMS[team]?.name ?? `team ${team}`, set, colour }))),
    playImports,
    kitWith: (replica, skin) => gameKitWith(pool, replica, skin),
    files,
    rules: SKIN_RULES,
  };
}

/** Test-only files under the play folders: they never ship (src/ai/README.md, src/ai/balance/README.md). */
const TEST_ONLY = /(Support\.ts|\.test\.ts)$|^src\/ai\/balance\//;

/**
 * Whether `file` (a path under the repository root) is one of PLAY_MODULES. A test-only file there is not: the headless
 * matches' support reads the figure files (render/) for their hit rules since BD1, and none of it ships.
 */
export const isPlayModule = (file: string, roots: readonly string[] = PLAY_MODULES): boolean =>
  !TEST_ONLY.test(file) && roots.some((r) => (r.endsWith('/') ? file.startsWith(r) : file === r));
