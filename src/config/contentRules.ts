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
 * How far a fitted kit (every part and the rarest tier) may take a number past its class's normal range before the
 * compatibility grid warns: parts and tiers move numbers on purpose, so only a kit that runs well past the range (two
 * multipliers stacking) is shown.
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
  '000019': 'Cyber Pistol: a chase item, rifle-class power with pistol handling by design (owner, M32, 2026-10-04)',
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
 * included, by site class (one viewmodel drawn once a frame, render/replicaDetail.test.ts's G2 budgets), and the most
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
