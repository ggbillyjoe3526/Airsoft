import type { ReplicaConfig } from './replicas';

/**
 * Replica colour schemes (graphics overhaul G1; William, 5 October 2026). Every replica is two-tone, like a painted
 * airsoft replica in the Marathon style: a `body` (receiver, frame, slide), `furniture` (stock, handguard, grip
 * panels), `detail` (magazines, rails, small parts), a thin `accent` line and the `steel` of its metal parts. The
 * player picks one of the eight bold schemes per replica in Loadout › Customise; bots carry their team's.
 *
 * The Realistic colours setting swaps each bold scheme for one plain family (black, wolf grey, ranger green or tan),
 * never mixed on one replica. Colours are sRGB hex.
 */
export interface Scheme {
  /** The name shown in Customise. */
  name: string;
  body: number;
  furniture: number;
  detail: number;
  accent: number;
  steel: number;
  /** The accent line glows (Ghost's cyan line). */
  glow?: boolean;
  /** The plain family the Realistic colours setting turns this scheme into. */
  family: FamilyId;
}

/** The eight bold schemes a player can pick. Ids are save keys: never rename one. */
export type SchemeId = 'cobalt' | 'signal' | 'acid' | 'teal' | 'hazard' | 'coral' | 'onyx' | 'ghost';

/** The four plain families of the Realistic colours setting. */
export type FamilyId = 'black' | 'grey' | 'ranger' | 'tan';

export const SCHEMES: Readonly<Record<SchemeId, Scheme>> = {
  cobalt: { name: 'Cobalt', body: 0x24282f, furniture: 0x2f6fd6, detail: 0x30343b, accent: 0xf2f0ea, steel: 0x484d56, family: 'black' },
  signal: { name: 'Signal', body: 0xe8ebee, furniture: 0xff5a1f, detail: 0x2a2d33, accent: 0x2a2d33, steel: 0x484d56, family: 'tan' },
  acid: { name: 'Acid', body: 0x2a2e33, furniture: 0xb8e636, detail: 0x1e2125, accent: 0xb8e636, steel: 0x40454c, family: 'ranger' },
  teal: { name: 'Teal', body: 0x23272c, furniture: 0x22a196, detail: 0x2e3238, accent: 0xffb23a, steel: 0x484d56, family: 'ranger' },
  hazard: { name: 'Hazard', body: 0x2a2d32, furniture: 0xf0b429, detail: 0x1f2226, accent: 0x1f2226, steel: 0x484d56, family: 'tan' },
  coral: { name: 'Coral', body: 0xf1ece3, furniture: 0xff4f6d, detail: 0x34373e, accent: 0x34373e, steel: 0x50555d, family: 'tan' },
  onyx: { name: 'Onyx', body: 0x1d1f23, furniture: 0x34383e, detail: 0x2a2d32, accent: 0x7d838c, steel: 0x40454c, family: 'black' },
  ghost: { name: 'Ghost', body: 0xeef0f2, furniture: 0xc4c9cf, detail: 0x3a3e45, accent: 0x30f0ff, steel: 0x6a7079, glow: true, family: 'grey' },
};

/** The plain families, as schemes (their own family is themselves). Small metal parts match the family. */
export const FAMILIES: Readonly<Record<FamilyId, Scheme>> = {
  black: { name: 'Black', body: 0x26292e, furniture: 0x30343a, detail: 0x2b2e33, accent: 0x4a4f56, steel: 0x3c4046, family: 'black' },
  grey: { name: 'Wolf grey', body: 0x4f545b, furniture: 0x646a72, detail: 0x464a50, accent: 0x7a8088, steel: 0x3c4046, family: 'grey' },
  ranger: { name: 'Ranger green', body: 0x4a5439, furniture: 0x5a6645, detail: 0x434c34, accent: 0x6c7856, steel: 0x3f4536, family: 'ranger' },
  tan: { name: 'Tan', body: 0xb49668, furniture: 0xc9ab79, detail: 0x564a39, accent: 0x8c7250, steel: 0x45433f, family: 'tan' },
};

/** The schemes in the order Customise lists them. */
export const SCHEME_IDS: readonly SchemeId[] = ['cobalt', 'signal', 'acid', 'teal', 'hazard', 'coral', 'onyx', 'ghost'];

/** What a player's replica wears before they pick (William: a Cobalt rifle and a Ghost pistol). */
export const DEFAULT_SCHEMES: Readonly<Record<ReplicaConfig['look']['model'], SchemeId>> = { rifle: 'cobalt', pistol: 'ghost' };

/** What bots carry: their team's colour on the rifle, a plainer partner on the pistol. By team index (Blue, Orange). */
export const BOT_SCHEMES: readonly Readonly<Record<ReplicaConfig['look']['model'], SchemeId>>[] = [
  { rifle: 'cobalt', pistol: 'onyx' },
  { rifle: 'signal', pistol: 'coral' },
];

/**
 * The Cyber Pistol's own colours (M32; restyled to the v3 concept William approved, 5 October 2026): a white slab with
 * cyan light lines and a magenta core on a dark frame, the same on either team. No scheme applies to it; Realistic
 * colours turns it into a dark grey slab with plain grey lines and no glow.
 */
export interface CyberColours {
  slab: number;
  frame: number;
  line: number;
  core: number;
  /** The lines and the core glow. */
  glow: boolean;
}

export const CYBER_COLOURS: Readonly<Record<'bold' | 'realistic', CyberColours>> = {
  bold: { slab: 0xe9edf0, frame: 0x23262c, line: 0x30f0ff, core: 0xff3aa8, glow: true },
  realistic: { slab: 0x4a4f57, frame: 0x23262c, line: 0x2a2d32, core: 0x6a7079, glow: false },
};

/** A replica's scheme before the player picks one. */
export function defaultScheme(replica: ReplicaConfig): SchemeId {
  return DEFAULT_SCHEMES[replica.look.model];
}

/** The scheme a bot on `team` carries for `replica`. */
export function botScheme(replica: ReplicaConfig, team: number): SchemeId {
  return (BOT_SCHEMES[team] ?? BOT_SCHEMES[0]!)[replica.look.model];
}

/** A replica keeps its own colours (no scheme row in Customise). */
export function hasFixedColours(replica: ReplicaConfig): boolean {
  return replica.look.viewmodel === 'cyber';
}

/** The colours a replica is drawn in: its scheme, or that scheme's plain family under Realistic colours. */
export function schemeColours(id: SchemeId, realistic: boolean): Scheme {
  const scheme = SCHEMES[id];
  return realistic ? FAMILIES[scheme.family] : scheme;
}

/** True for a saved value that is one of the eight schemes. */
export function isSchemeId(raw: unknown): raw is SchemeId {
  return typeof raw === 'string' && (SCHEME_IDS as readonly string[]).includes(raw);
}

/** How each replica of a loadout is painted: its scheme by slot, and the Realistic colours setting. */
export interface ReplicaPaint {
  schemes: readonly SchemeId[];
  realistic: boolean;
}
