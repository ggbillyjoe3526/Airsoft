import type { DevSettings } from './config/dev';
import type { QualitySettings } from './config/render';
import type { EventLog } from './core/eventLog';
import type { CombatPresentation } from './render/match/combatPresentation';
import type { Character } from './sim/character';
import type { GameState } from './sim/state';

/**
 * What `Game` asks of the session loaded, a match (`MatchSession`) or Practice (`RangeSession`), without knowing which
 * (DX5, audit A2). `kind` tells them apart where only one has the answer (a match's skip and result, the range's
 * tutorial and Loadout key). Both read the HUD and accessibility preferences by reference (settings/hudPrefs.ts), so
 * there is nothing to forward to them when one changes.
 */
export interface Session {
  readonly kind: 'match' | 'range';
  readonly state: GameState;
  readonly player: Character;
  readonly combat: CombatPresentation;
  /** The recent events, for the reports (IM7). */
  readonly eventLog: EventLog;
  /** Characters on the field (the debug overlay). */
  readonly characterCount: number;
  /** One frame of play: the input, then the simulation ticks due. Returns how many ran. */
  advance(dt: number): number;
  /** Places the camera and draws the frame; `boardHeld`: the scoreboard key is held (a match's). */
  draw(dt: number, boardHeld: boolean): void;
  /** True once when play should stop for the result screen (a match) or the tutorial's end (the range). */
  takeResultDue(): boolean;
  /** Play running or stopped (the pause menu): the preferences changed meanwhile show as it runs again. */
  setPlaying(playing: boolean): void;
  /** New quality settings (Settings → Graphics), after the renderer's own. */
  setQuality(quality: QualitySettings): void;
  /** The Dev settings that change play (M24). */
  setDevCheats(cheats: DevSettings): void;
  /** The graphics context is back after a loss: render targets drawn again. */
  contextRestored(): void;
  dispose(): void;
}
