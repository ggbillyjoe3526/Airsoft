/**
 * Team identity. Sites mark teams with coloured tape or armbands; here it's Blue vs Orange. These
 * colours belong to the teams only: neutral props must never use them (checked in mapMeshes.test.ts).
 */
export const TEAMS = [
  { name: 'Blue', color: 0x3d8bff },
  { name: 'Orange', color: 0xff8a2a },
] as const;

export const TEAM_COLORS: readonly number[] = TEAMS.map((t) => t.color);

/** The team colours as CSS (`#3d8bff`), for the HUD and menus. */
export const TEAM_CSS: readonly string[] = TEAM_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);
