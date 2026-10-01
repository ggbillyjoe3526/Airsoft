import type { FlagStatus } from '../sim/flag';

/** What the flag strip under the scoreboard says, from your side: the line, and whether it's a warning. */
export interface FlagLine {
  text: string;
  /** Your side is losing ground: shown as a warning. */
  urgent: boolean;
}

/**
 * The flag strip's line for a player who is attacking (or defending) the pole. Between rounds (`live`
 * false) it only says whether the flag went up; the rest would be stale.
 */
export function flagLine(attacking: boolean, status: FlagStatus, progress: number, live = true): FlagLine {
  if (progress >= 1) return { text: attacking ? 'Your flag is up!' : 'Their flag is up', urgent: false };
  if (!live) return { text: '', urgent: false };
  const pct = `${Math.floor(progress * 100)}%`;
  if (status === 'contested') return { text: `Contested at the pole · ${pct}`, urgent: false };
  if (attacking) {
    if (status === 'raising') return { text: `Raising your flag · ${pct}`, urgent: false };
    if (status === 'lowering') return { text: `They're pulling your flag down · ${pct}`, urgent: true };
    return { text: progress > 0 ? `Your flag is ${pct} up · get back to the pole` : 'Attack · raise your flag on their pole', urgent: false };
  }
  if (status === 'raising') return { text: `Their flag is going up! · ${pct}`, urgent: true };
  if (status === 'lowering') return { text: `Pulling their flag down · ${pct}`, urgent: false };
  return { text: progress > 0 ? `Their flag is ${pct} up · pull it down` : 'Defend · keep their flag off your pole', urgent: progress > 0 };
}
