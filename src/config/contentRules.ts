import type { MatchMode } from './modes';

/**
 * The content toolkit's rules as data (CT1, plan `plans/content-toolkit-concept.md`, approved by the owner 2026-10-05
 * with every default): what a replica's numbers may be, the names it may not use, which parts may skip a trade-off and
 * which items may be stronger than the rest, the balance band, and the register of items made public. The checks that
 * read them are in `src/content/`; the rulebook pages that explain them to a person are `docs/content/*.md`. A test-only
 * and tooling table: nothing in the game reads it.
 */

/** A number's normal range, both ends inclusive. */
export interface Range {
  min: number;
  max: number;
}

/** The replica numbers the rules range-check (a ReplicaConfig's own fields). */
export type RangedStat = 'muzzleEnergy' | 'bbWeight' | 'fireRate' | 'magSize' | 'mags' | 'reloadTime' | 'drawTime' | 'spreadDeg' | 'recoilDeg' | 'hopUpMax' | 'hopUpDial';

/** What each ranged number is called in a report, and its unit. */
export const STAT_WORDS: Readonly<Record<RangedStat, { label: string; unit: string }>> = {
  muzzleEnergy: { label: 'energy', unit: 'J' },
  bbWeight: { label: 'factory BB weight', unit: 'g' },
  fireRate: { label: 'fire rate', unit: 'BBs/s' },
  magSize: { label: 'magazine', unit: 'BBs' },
  mags: { label: 'magazines carried', unit: '' },
  reloadTime: { label: 'reload', unit: 's' },
  drawTime: { label: 'draw', unit: 's' },
  spreadDeg: { label: 'spread', unit: '°' },
  recoilDeg: { label: 'kick', unit: '°' },
  hopUpMax: { label: 'hop-up strength', unit: '' },
  hopUpDial: { label: 'factory hop-up dial', unit: '' },
};

/**
 * The game's normal range for each replica number, by site class (stats.md's Class column): wide enough for every
 * replica type planned to 0.3 (SMG, DMR, shotgun, spring sniper), narrow enough that a typo (13 BBs/s typed 130, a
 * 1.8 s reload typed 18) is caught. The shipped replicas sit well inside them. A number outside its range fails unless
 * RANGE_EXCEPTIONS gives the reason (the brief's "unless it says why").
 */
export const REPLICA_RANGES: Readonly<Record<string, Readonly<Record<RangedStat, Range>>>> = {
  rifle: {
    muzzleEnergy: { min: 0.5, max: 1.2 },
    bbWeight: { min: 0.2, max: 0.3 },
    fireRate: { min: 0.5, max: 25 },
    magSize: { min: 5, max: 200 },
    mags: { min: 2, max: 8 },
    reloadTime: { min: 0.8, max: 4 },
    drawTime: { min: 0.25, max: 1.2 },
    spreadDeg: { min: 0.15, max: 1.5 },
    recoilDeg: { min: 0.02, max: 1 },
    hopUpMax: { min: 0.1, max: 0.6 },
    hopUpDial: { min: 0, max: 1 },
  },
  pistol: {
    muzzleEnergy: { min: 0.3, max: 1.0 },
    bbWeight: { min: 0.2, max: 0.3 },
    fireRate: { min: 2, max: 20 },
    magSize: { min: 6, max: 60 },
    mags: { min: 2, max: 8 },
    reloadTime: { min: 0.6, max: 2.5 },
    drawTime: { min: 0.15, max: 0.6 },
    spreadDeg: { min: 0.2, max: 1.6 },
    recoilDeg: { min: 0.02, max: 1 },
    hopUpMax: { min: 0.1, max: 0.6 },
    hopUpDial: { min: 0, max: 1 },
  },
};

/**
 * How far a fitted kit (every part) may take a number past its class's normal range before the compatibility grid
 * warns: parts move numbers on purpose, so only a kit that runs well past the range (two multipliers stacking) is
 * shown.
 */
export const KIT_RANGE_SLACK = 0.25;

/** Numbers allowed outside their range, by replica key and number, each with the reason (empty: none yet). */
export const RANGE_EXCEPTIONS: Readonly<Record<string, Partial<Record<RangedStat, string>>>> = {};

/**
 * Words no content name may use: real airsoft and firearm makers, models and accessory brands (CLAUDE.md §4, no real
 * brand names or trademarked designs). Matched as whole words, any case.
 */
export const BRAND_WORDS: readonly string[] = [
  'Tokyo Marui', 'Marui', 'G&G', 'VFC', 'KWA', 'Krytac', 'ICS', 'Classic Army', 'CYMA', 'Specna', 'Ares', 'Lonex', 'Systema',
  'Novritsch', 'Silverback', 'Action Army', 'Maple Leaf', 'Prometheus', 'Polarstar', 'Wolverine', 'Gate', 'Titan', 'Umarex',
  'Elite Force', 'Lancer', 'Echo1', 'Valken', 'Jing Gong', 'Double Eagle', 'Glock', 'Colt', 'Heckler', 'Koch', 'H&K',
  'Sig Sauer', 'Sig', 'Beretta', 'Kalashnikov', 'Desert Eagle', 'Uzi', 'Steyr', 'FN', 'Herstal', 'Walther', 'Smith & Wesson',
  'Ruger', 'Remington', 'Benelli', 'Mossberg', 'Barrett', 'Magpul', 'Aimpoint', 'EOTech', 'Trijicon', 'SureFire', 'Vortex',
  'Holosun', 'Noveske', 'Daniel Defense', 'Knight\'s Armament', 'Arcturus', 'Hi-Capa', 'MP5', 'MP7', 'P90', 'AUG', 'SCAR',
  'M4A1', 'AK-47', 'AK47', 'AKM', 'G36', 'HK416', 'M1911', 'P226', 'USP', 'Five-seveN',
];

/**
 * Parts that may skip the trade-off rule (a part better at everything needs the owner's OK, so the others stay worth
 * fitting), by pool ID, each with the reason. The ones that were in the game before the toolkit are listed so the rule
 * holds from here on; their costs that aren't numbers are given.
 */
export const TRADE_OFF_EXCEPTIONS: Readonly<Record<string, string>> = {
  '000016': 'Tight-Bore Barrel: a quality part with no downside, the owner\'s call (2026-10-04: "a higher quality barrel could give better performance")',
  '000015': '11.1 V LiPo Battery: in the game before the toolkit (M29), kept as it is (DECISIONS); it empties a magazine sooner and is found only in Shots',
};

/**
 * Costs a part has that are not numbers in stats.md, by category: a part in one of these categories has its trade-off
 * built in. A laser's dot and a torch's beam give away where you are; an optic narrows your view while you aim.
 */
export const CATEGORY_COSTS: Readonly<Partial<Record<string, string>>> = {
  laser: 'its dot shows where you aim',
  light: 'its beam gives you away at night',
  optic: 'it narrows your view while you aim',
};

/**
 * The owner's balance target for a new replica or part (decision 1 of the plan, 2026-10-05): the team carrying it wins
 * 40 to 60 % of the decided rounds against the same team without it.
 */
export const CONTENT_BALANCE_BAND: Range = { min: 0.4, max: 0.6 };

/**
 * Items allowed to be stronger than the band, one by one (decision 1), by pool ID, each with the owner's reason: the
 * balance run shows their figures but never fails them.
 */
export const ALLOWED_STRONGER: Readonly<Record<string, string>> = {
  '000019': 'Cyber Pistol: the level cap reward, rifle-class power with pistol handling by design (owner, M32, 2026-10-04; LV1, 2026-10-13)',
};

/**
 * The register of items made public (the public gate, CT1): every pool asset tagged `public` is here, with the date it
 * went public or "before the toolkit". A `public` tag with no entry fails the rules check, so nothing goes public
 * without passing the gate (`node pipeline/content-check.mjs <item> --public` and the owner's playtest).
 */
export const PUBLIC_ITEMS: Readonly<Record<string, string>> = {
  '000001': 'before the toolkit',
  '000002': 'before the toolkit',
  '000003': 'before the toolkit',
  '000004': 'before the toolkit',
  '000005': 'before the toolkit',
  '000006': 'before the toolkit',
  '000007': 'before the toolkit',
  '000008': 'before the toolkit',
  '000009': 'before the toolkit',
  '000010': 'before the toolkit',
  '000011': 'before the toolkit',
  '000012': 'before the toolkit',
  '000013': 'before the toolkit',
  '000014': 'before the toolkit',
  '000015': 'before the toolkit',
  '000016': 'before the toolkit',
  '000017': 'before the toolkit',
  '000018': 'before the toolkit',
  '000019': 'before the toolkit',
};

/**
 * Replica tags that describe a replica for the parts and rules rather than taking a part: its class (a light fits by
 * it), what drives it (a power source fits by it) and a built-in battery. The "every tag is used" check leaves them out.
 */
export const DESCRIPTIVE_TAGS: readonly string[] = ['rifle', 'pistol', 'electric', 'gas', 'spring', 'built-in-power'];

/** What drives a replica, by its tag, and the ReplicaConfig power that must match it (spring replicas come in 0.3). */
export const DRIVE_TAGS: Readonly<Record<string, string>> = { electric: 'electric', gas: 'gas', spring: 'spring' };

/** The spec test's chrono, range and grouping table (src/content/specSheet.ts). */
export const SPEC_SHEET = {
  /** BB weights the chrono table reads (g). */
  bbWeights: [0.2, 0.25, 0.28, 0.3],
  /** Distances the drop row reads (m): how far below the aim line a level shot at the factory hop-up is. */
  dropAt: [20, 30, 40, 50],
  /** Distances the grouping row reads (m): half the BBs land within this radius of the aim point. */
  groupAt: [10, 25],
} as const;

/**
 * The spec test's model budget (src/content/census.ts): the most triangles a replica draws as it comes on High, hands
 * included, by site class (one viewmodel drawn once a frame, render/replicas/replicaDetail.test.ts's G2 budgets), and the most
 * meshes (draw calls) one part may add.
 */
export const MODEL_BUDGET = {
  highTriangles: { rifle: 17_500, pistol: 11_000 } as Readonly<Record<string, number>>,
  partMeshes: 4,
} as const;

/** How far (dB) a shot's loudness may sit from the other replicas' before the spec test asks for a listen. */
export const SOUND_LOUDNESS_SPREAD_DB = 6;

/** The balance run's defaults (src/content/report/balance.report.ts): seeds per map, mode and level, seconds per match. */
export const CONTENT_BALANCE_RUN = {
  seeds: 8,
  seconds: 300,
} as const;

/**
 * The map standard (CT2; owner decision 6 of the plan, 2026-10-05): Depot's measured layout. A new map is held to these
 * numbers unless MAP_EXCEPTIONS writes down why it differs. They are the numbers Depot's own layout tests hold
 * (map/depot.test.ts), measured the same way over every map by src/content/mapLayout.ts.
 */
export const MAP_STANDARD = {
  /** Lanes (bot routes end to end): Depot has three; fewer than `lanes` asks for a look, fewer than `minLanes` fails (no way round). */
  lanes: 3,
  minLanes: 2,
  /** The longest clear eye line between two places a player can stand (m): Depot's 34 on its 50 × 32 m field. */
  longestSightline: 34,
  /** Everyone within this of one end's spawns is out of sight of everyone within it of the other's (m), standing or crouched. */
  spawnYardRadius: 5,
  /**
   * Walk from each end's spawns to the middle of the field (the middle of its walkable ground): the longer walk may be
   * this much longer than the shorter and pass (the plan's "about 15 %"), up to `walkSpreadWarn` asks for a look, more fails.
   * Depot measures 3 %.
   */
  walkSpread: 0.15,
  walkSpreadWarn: 0.25,
  /** Attack / Defend: the attackers' walk to the flag is at least this many times the defenders' (Depot's rule; it measures 1.9). */
  flagHeadStart: 1.6,
  /** How far a spawn, dead-zone spot, lane point or flag may sit from the floor under it (m), plus a slope's rise over one nav cell. */
  onFloor: 0.05,
  /** How far a look-only block (MapData.decor) may stand proud of the floor it lies on (m): more would hide a gap a BB passes. */
  decorProud: 0.05,
  /**
   * Floors and walls drawn edge to edge are grown a centimetre a side to meet (Neon Heights' SEAM), so neighbours overlap
   * by up to 2 cm; two blocks overlapping by more than this every way stand inside each other (m).
   */
  seamSlack: 0.025,
  /** The layout's measures sample a place to stand every this many metres, or coarser on a big field so each map costs about the same. */
  sightSpacing: 0.5,
  sightPoints: 6000,
} as const;

/** A colour reads as a team's when it is this saturated and within this many degrees of hue of a team colour (any set). */
export const TEAM_COLOUR_RULE = { hueMarginDeg: 20, minSaturation: 0.3 } as const;

/** A map's written-down differences from the standard, by map id: what differs and the owner's reason. */
export interface MapException {
  /** The longest clear eye line allowed on this map (m), and why. */
  longestSightline?: { metres: number; reason: string };
  /** Blocks left standing inside each other on purpose (as the check words them), and why. */
  clashes?: { list: readonly string[]; reason: string };
}

export const MAP_EXCEPTIONS: Readonly<Record<string, MapException>> = {
  woodland: {
    longestSightline: {
      metres: 141,
      reason:
        'corner to corner across the meadow and the Knoll, 140 m: the map is played at night, where the dark, not the ground, decides what anyone sees, and a BB does not carry that far (owner decision 11, 2026-10-05)',
    },
  },
  neonHeights: {
    clashes: {
      list: [
        'floor at 9.50, 2.85, 5.35 and barrier at 11.30, 2.00, 7.63 fill the same space',
        'floor at 12.15, 2.85, -1.50 and barrier at 11.30, 2.00, 7.63 fill the same space',
      ],
      reason:
        "two walls rise through a floor's edge, out of sight; cutting them changes the bots' nav grid and how the map plays, so it waits for its own change (M55; BP5 ended the Plaza landing where its stair starts)",
    },
  },
};

/**
 * The register of maps made public (the public gate, CT2): every map tagged `public` in map/maps.ts is here, with the
 * date it went public or "before the toolkit". A public map with no entry fails the rules check.
 */
export const PUBLIC_MAPS: Readonly<Record<string, string>> = {
  depot: 'before the toolkit',
};

/**
 * The map balance run's watch (CT2, src/content/report/matchWatch.ts): a bot that stays within `leaveSpawnMetres` of its
 * spawn through a round it was in play for at least `leaveSpawnSeconds` never left spawn (the audit's 8 m); one standing
 * still (under `stuckSpeed` m/s) with nothing to do for over `stuckSeconds` is stuck (the audit's stall rule); anyone more
 * than `fallMetres` under the lowest floor fell through.
 */
export const MAP_BALANCE_WATCH = {
  leaveSpawnMetres: 8,
  leaveSpawnSeconds: 20,
  stuckSpeed: 0.3,
  stuckSeconds: 5,
  fallMetres: 0.5,
} as const;

/**
 * The map balance run's bands for what the watch counts (src/content/report/mapBalance.report.ts), besides who wins
 * and the rounds on time: the share of bots' rounds spent at spawn, stuck stretches per 10 bot-minutes. Measured on the
 * shipped maps when CT2 landed (its record); a falling body always fails.
 */
export const MAP_BALANCE_BANDS = {
  stayedAtSpawn: 0.05,
  stuckPerTenMinutes: 1,
} as const;

// ---- Modes (CT3) -------------------------------------------------------------------------------------------------

/**
 * The register of modes made public (the public gate, CT3): every mode tagged `public` in config/modes.ts MATCH_MODES is
 * here, with the date it went public or "before the toolkit". A public mode with no entry fails the rules check.
 */
export const PUBLIC_MODES: Readonly<Record<string, string>> = {
  elimination: 'before the toolkit',
  attackDefend: 'before the toolkit',
};

/**
 * Mode ids already in players' saves (the New game picks and the records' cells, `<level>.<mode>`; stats/records.ts
 * resultKey): each stays in MATCH_MODES under the same id for good. A new mode's id joins when it first ships in a build.
 */
export const SHIPPED_MODE_IDS: readonly string[] = ['elimination', 'attackDefend', 'extraction'];

/**
 * Modes the perf gate's matrix (pipeline/perf-budget.json) doesn't run, each with the mode whose runs stand for it and
 * why; any other mode must be in the matrix. The spec test (`content-check mode:<id>`) still measures it on every map.
 */
export const MODE_PERF_STAND_INS: Readonly<Record<string, { by: MatchMode; reason: string }>> = {
  attackDefend: {
    by: 'elimination',
    reason: "the same field, figures and replicas as Elimination with one flagpole more, so Elimination's runs measure what it draws",
  },
};

/**
 * The mode checks' short headless matches (CT3; src/content/modePlay.ts): seconds per pairing in the compatibility
 * check's grid, and in the check that the bots play the mode its own way (`botSeconds`: long enough for the attackers to
 * reach the flag or the run's jobs to start, short enough for every pull request).
 */
export const MODE_PLAY_TEST = {
  seconds: 40,
  botSeconds: 30,
  /** In `botSeconds`, the bots of a mode with its own plan stand at least this far (m, on average) from where Elimination's stood. */
  botApart: 1,
} as const;

/**
 * The mode balance run's own bands (CT3; src/content/report/mapBalance.report.ts), besides each side's share and the
 * rounds on time (the map run's): in a mode with an objective, the share of decided rounds the objective decides (a flag
 * raised, or held to the whistle), so it is not Elimination by another name; and its XP a minute against Elimination's
 * on the same map, lighting and level (`pay`: the ratio's band; the plan's "in line with the other modes").
 */
export const MODE_BALANCE_BANDS = {
  objectiveDecides: 0.1,
  pay: { min: 0.75, max: 1.25 },
} as const;

// ---- Skins (CT4) -------------------------------------------------------------------------------------------------

/**
 * The register of skins made public (the public gate, CT4): every replica colour scheme tagged `public` in
 * config/schemes.ts SCHEMES is here, with the date it went public or "before the toolkit". A public skin with no entry
 * fails the rules check.
 */
export const PUBLIC_SKINS: Readonly<Record<string, string>> = {
  cobalt: 'before the toolkit',
  signal: 'before the toolkit',
  acid: 'before the toolkit',
  teal: 'before the toolkit',
  hazard: 'before the toolkit',
  coral: 'before the toolkit',
  onyx: 'before the toolkit',
  ghost: 'before the toolkit',
};

/**
 * Scheme ids already in players' saves (`scheme.<replica>`, pool/loadoutModel.ts): each stays in SCHEMES under the same
 * id for good. A new skin's id joins when it first ships in a build.
 */
export const SHIPPED_SCHEME_IDS: readonly string[] = ['cobalt', 'signal', 'acid', 'teal', 'hazard', 'coral', 'onyx', 'ghost'];

/**
 * Skins a player may pick although a colour that covers much of the replica reads as a team's, each with the reason. A
 * player's own replica is seen only in their hands (single player), so this never excuses a bot's: bots carry only their
 * own team's colour, whatever this says (the check holds that apart).
 */
export const TEAM_COLOUR_SKINS: Readonly<Record<string, string>> = {
  cobalt: "Alpha's blue: the scheme Alpha's bots carry on purpose (G1, owner 2026-10-05); in a player's hands only they see it",
  signal: "Beta's orange: the scheme Beta's bots carry on purpose (G1, owner 2026-10-05); in a player's hands only they see it",
  coral: "the pistol Beta's bots carry (G1); in a player's hands only they see it",
  hazard: "before the toolkit (G1): its amber reads as Beta's orange, but no bot carries it, so only the player who picks it sees it",
};

/**
 * The skin checks' numbers (CT4; src/content/skinDraw.ts, skinSpec.ts, skinMaps.ts):
 * - `readableShare`: a colour covering at least this share of a replica's surface on a figure reads at a distance (the
 *   rest, thin lines and small parts, doesn't), so the team and map checks judge it;
 * - `drawnShare`: a scheme's colours cover at least this share of the replica in first person (the rest is the hands'
 *   grip, glass, the tip and the BBs), or the scheme isn't really drawn;
 * - `tipApart`: the orange tip stands at least this far (ΔE00) from the colours around it, so it reads;
 * - `tipReach`: "around it" is within this many metres of the tip's centre;
 * - `blend`: a colour this close (ΔE00) to one of a map's common colours blends into it;
 * - `mapShare`: a map's common colours are those covering at least this share of its painted surface;
 * - `textureMB`: the texture memory one skin may add to one replica (MB, at 4 bytes a texel, mips a third more): a
 *   512-texel pattern and its normal map (1.4 MB each; the replicas' shared speckle is 128 texels and no skin's own).
 */
export const SKIN_RULES = {
  readableShare: 0.1,
  drawnShare: 0.6,
  tipApart: 20,
  tipReach: 0.03,
  blend: 10,
  mapShare: 0.05,
  textureMB: 2.8,
} as const;

/**
 * What decides how a replica shoots (CT4, "looks only"): the simulation, the bots, the physics, the nav grid and the
 * kit's numbers (a replica as carried, a bot's kit). None may import config/schemes.ts, directly or through another
 * module: then no number can read a skin. Paths under the repository root; a folder ends in `/`.
 */
export const PLAY_MODULES: readonly string[] = ['src/sim/', 'src/ai/', 'src/physics/', 'src/nav/', 'src/pool/kit.ts', 'src/pool/botKit.ts'];
