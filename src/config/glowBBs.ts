/**
 * Glowing BBs (M33b, owner, 2026-10-04): an option on each replica's Customise screen, beside its BB weight. Glowing
 * BBs show where every shot goes (green, larger, a longer streak: render/bbRenderer.ts); they fly like any other BB.
 * By default they are loaded on night fields only (owner: "default for a night map"), and the player can have them on
 * every field or never.
 */
export type GlowBBs = 'night' | 'always' | 'off';

export const GLOW_BB_CHOICES: readonly { id: GlowBBs; label: string; blurb: string }[] = [
  { id: 'night', label: 'At Night', blurb: 'Glowing BBs on night fields, white BBs by day.' },
  { id: 'always', label: 'Always', blurb: 'Glowing BBs on every field: every shot easy to follow, by day too.' },
  { id: 'off', label: 'Off', blurb: 'White BBs on every field, at night too.' },
];

export const DEFAULT_GLOW_BBS: GlowBBs = 'night';

/** Whether BBs loaded with `choice` glow on a field played at night (`night`) or by day. */
export function bbsGlow(choice: GlowBBs, night: boolean): boolean {
  return choice === 'always' || (choice === 'night' && night);
}

/**
 * Bots load glowing BBs the default way: on night fields only. (Your bot teammates and the other team alike; they
 * don't use the Loadout.)
 */
export const BOT_GLOW_BBS: GlowBBs = DEFAULT_GLOW_BBS;
