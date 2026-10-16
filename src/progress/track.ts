import { type LevelStanding, type LevelTable, standing } from './levels';
import type { Progress } from './progress';

/**
 * The level track as the Armory shows it (LV1): every level from 0 to the cap with what it unlocks, where the player
 * stands, and what comes next. Pure: the screen draws it, the tests read it.
 */

/** A level's place on the track: reached, the next one to reach, or further on. */
export type LevelState = 'unlocked' | 'next' | 'locked';

export interface TrackLevel {
  level: number;
  /** XP from nothing to reach it. */
  total: number;
  /** What it unlocks that is offered (M35: dev items only with Dev content on), by pool asset id. */
  items: readonly string[];
  /**
   * Which of `items` the player has (all of them on a reached level, or with levelling off): a level a hand edit of
   * levels.md moved up still lists an item unlocked on its old level as theirs (KI1), as Ownership does.
   */
  owned: readonly boolean[];
  state: LevelState;
}

export interface Track {
  standing: LevelStanding;
  cap: number;
  levels: readonly TrackLevel[];
  /** The lowest level still to reach that unlocks something offered; null when there is none (or levelling is off). */
  next: TrackLevel | null;
  /** Offered items the player has, and how many offered items the levels unlock in all. */
  unlocked: number;
  total: number;
  /** Levelling is off (Dev settings): everything counts as unlocked. */
  off: boolean;
}

/**
 * The track for `progress` against `t`. `offered`: whether an asset shows at all (the pool as offered now). `off`:
 * levelling is off, so every level reads as unlocked and nothing is next.
 */
export function levelTrack(t: LevelTable, progress: Progress, offered: (id: string) => boolean, off: boolean): Track {
  const s = standing(t, progress.xp);
  const has = new Set(progress.unlocked);
  // The next unlock is the lowest level still to reach with something offered, so a level whose items are all hidden
  // (dev items, Dev content off) never reads as next while the next-unlock card shows a later one.
  const nextLevel = off ? null : (t.levels.find((l) => l.level > s.level && l.unlocks.some(offered))?.level ?? null);
  const levels = t.levels.map((l): TrackLevel => {
    const state: LevelState = off || l.level <= s.level ? 'unlocked' : l.level === nextLevel ? 'next' : 'locked';
    const items = l.unlocks.filter(offered);
    return { level: l.level, total: l.total, items, owned: items.map((id) => state === 'unlocked' || has.has(id)), state };
  });
  const all = levels.flatMap((l) => l.items);
  return {
    standing: s,
    cap: t.cap,
    levels,
    next: levels.find((l) => l.level === nextLevel) ?? null,
    unlocked: off ? all.length : all.filter((id) => has.has(id)).length,
    total: all.length,
    off,
  };
}
