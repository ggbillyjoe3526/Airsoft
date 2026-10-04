/**
 * Team identity. Sites mark teams with coloured tape or armbands; here it's Blue vs Orange. These
 * colours belong to the teams only: neutral props must never use them (checked in mapMeshes.test.ts).
 */
export const TEAMS = [
  { name: 'Blue', color: 0x3d8bff },
  { name: 'Orange', color: 0xff8a2a },
] as const;

/** The standard team colours (the figures' tape and armbands), by team. */
export const TEAM_COLORS: readonly number[] = TEAMS.map((t) => t.color);

/** A team colour as CSS (`#3d8bff`). */
export const cssColor = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Settings → Accessibility (M18b): the team colours. Blue and orange already stay far apart for the common kinds of
 * colour blindness; High contrast also sets them far apart in lightness (light blue, dark orange), so they read even
 * with little colour vision at all. Its hues stay the teams' own (props never use them, mapMeshes.test.ts). Checked by simulation in colourVision.test.ts.
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
  highContrast: { figures: [0x8ccfff, 0xb8460c], hud: [0x8ccfff, 0xcc4f14] },
};

export const TEAM_COLOUR_CHOICES: readonly { id: TeamColourSetId; label: string; blurb: string }[] = [
  { id: 'standard', label: 'Standard', blurb: 'Blue and orange: they stay apart for the common kinds of colour blindness.' },
  { id: 'highContrast', label: 'High contrast', blurb: 'Light blue and dark orange: apart in lightness too, for little or no colour vision. From the next match.' },
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
