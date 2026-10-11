/**
 * Team identity. Sites mark teams with coloured tape or armbands; here it's Alpha (blue tape) vs Beta (orange), by team
 * index (0, 1; the index is what the simulation and the saves keep). These colours belong to the teams only: neutral
 * props must never use them (checked on every map by content/mapChecks.ts).
 */
export const TEAMS = [
  { id: 'alpha', name: 'Alpha', color: 0x3d8bff },
  { id: 'beta', name: 'Beta', color: 0xff8a2a },
] as const;

/** A team as the Match screen's "Your team" pick saves it (M98): its TEAMS id. */
export type TeamPickId = (typeof TEAMS)[number]['id'];

/** The Match screen's "Your team" row (M98): Alpha or Beta, by its colour in words too (not colour alone). */
export const TEAM_PICKS: readonly { id: TeamPickId; label: string; blurb: string }[] = [
  { id: 'alpha', label: 'Alpha', blurb: 'The blue team.' },
  { id: 'beta', label: 'Beta', blurb: 'The orange team.' },
];

/** Alpha unless another team is picked (owner, playtest note 4, 2026-10-07). */
export const DEFAULT_TEAM_PICK: TeamPickId = 'alpha';

/** The team index (0 Alpha, 1 Beta) of a "Your team" pick. */
export function teamOfPick(id: TeamPickId): number {
  return Math.max(0, TEAMS.findIndex((t) => t.id === id));
}

/** The standard team colours (the figures' tape and armbands), by team. */
export const TEAM_COLORS: readonly number[] = TEAMS.map((t) => t.color);

/** A team colour as CSS (`#3d8bff`). */
export const cssColor = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Settings → Accessibility (M18b): the team colours. Blue and orange already stay far apart for the common kinds of
 * colour blindness; High contrast also sets them far apart in lightness (light blue, dark orange), so they read even
 * with little colour vision at all. Its hues stay the teams' own (props never use them, content/mapChecks.ts). Checked by simulation in colourVision.test.ts.
 */
export type TeamColourSetId = 'standard' | 'highContrast';

export interface TeamColours {
  /** The figures' tape and armbands, the flag and the held replica's armband (3D), by team. */
  readonly figures: readonly number[];
  /**
   * The HUD and menus (hit feed, scoreboard, markers), by team. High contrast lifts its dark orange a little here,
   * so it still reads as text on the HUD's dark panels.
   */
  readonly hud: readonly number[];
}

export const TEAM_COLOUR_SETS: Readonly<Record<TeamColourSetId, TeamColours>> = {
  standard: { figures: TEAM_COLORS, hud: TEAM_COLORS },
  highContrast: { figures: [0x8ccfff, 0xb8460c], hud: [0x8ccfff, 0xe0601a] },
};

export const TEAM_COLOUR_CHOICES: readonly { id: TeamColourSetId; label: string; blurb: string }[] = [
  { id: 'standard', label: 'Standard', blurb: 'Blue and orange: they stay apart for the common kinds of colour blindness.' },
  { id: 'highContrast', label: 'High Contrast', blurb: 'Light blue and dark orange: apart in lightness too, for little or no colour vision. From the next match.' },
];

export const DEFAULT_TEAM_COLOURS: TeamColourSetId = 'standard';

/**
 * A team's colour for CSS: a custom property the game sets on its container from the picked set as each match is
 * built (`--team-0`, `--team-1`; style.css has the standard set until then), so every HUD and menu part follows it.
 */
export const teamCss = (team: number): string => `var(--team-${team})`;

/** Sets the HUD's team colours (`teamCss`) on `root` from `colours`. */
export function applyTeamCss(root: HTMLElement, colours: TeamColours): void {
  colours.hud.forEach((c, team) => root.style.setProperty(`--team-${team}`, cssColor(c)));
}
