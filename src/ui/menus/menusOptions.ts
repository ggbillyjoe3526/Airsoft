import type { Difficulty } from '../../config/bots';
import type { MatchRules, RulesetId } from '../../config/matchRules';
import type { MatchMode } from '../../config/modes';
import type { LightingPresetId } from '../../config/render';
import type { TeamPickId } from '../../config/teams';
import type { GraphicsSettingsOptions } from '../graphicsSettings';
import type { KeyBindings } from '../../input/keyBindings';
import type { MapId } from '../../map/maps';
import type { AccessibilitySettingsOptions } from '../accessibilitySettings';
import type { AudioSettingsOptions } from '../audioSettings';
import type { ControlsSettingsOptions } from '../controlsSettings';
import type { CrosshairSettingsOptions } from '../crosshairSettings';
import type { HudSettingsOptions } from '../hudSettings';
import type { LookSettingsOptions } from '../lookSettings';
import type { ArmoryOptions } from './armoryScreen';
import type { LoadoutOptions } from './loadoutScreen';
import type { PictureSource } from './menuPictures';
import type { MatchRulesText, SideText } from './rulesText';
import type { SettingsOptions } from './settingsScreen';

/** What the menus are given and what they report back (out of menus.ts, M100). */

/**
 * The parts of the rules text that the Match section doesn't change (the flag's raise time). The team names, who attacks
 * first and where you start follow the Your team pick (M98, rulesText.ts sideText).
 */
export type FixedRulesText = Omit<MatchRulesText, 'teamSize' | 'winsNeeded' | 'roundTime' | 'halfTimeAfter' | 'friendlyFire' | 'ricochetsCount' | 'switches' | keyof SideText>;

/** The wallet the menus show: Field Credits and Tokens, or null while the Armory is switched off (Dev settings). */
export type MenuWallet = { fc: number; tokens: number } | null;

/** What the menus show and what they report back to the game. */
export interface MenusOptions {
  rules: FixedRulesText;
  bindings: KeyBindings;
  /**
   * The game's picture studio (G3, render/itemPictures.ts): the menus ask it for replica, part and scheme pictures and
   * show a drawing until each arrives. Null where there is none (a test): every item keeps its drawing.
   */
  pictures: PictureSource | null;
  /** The Loadout screen's model and change hook, and the line the Play screen shows under your kit. */
  loadout: Omit<LoadoutOptions, 'onBack' | 'context'> & { summary: () => { replicas: string; detail: string } };
  /** The Armory (M26c): its pool and the collection it changes, and the wallet on the top bar and the title. */
  armory: Omit<ArmoryOptions, 'onBack' | 'context'> & { wallet: () => MenuWallet };
  /** Start (or resume) play: Start match, Resume, Play again. */
  onPlay: () => void;
  /** The player leaves the match (Quit; New Game or Quit after it): it is unloaded. */
  onLeaveMatch: () => void;
  /** Practice, the Match screen's last mode (M21, M100): open the range and play. */
  onRange: () => void;
  /**
   * The title screen's Tutorial (M16): the range with the coach. `tutorialDone`: it was played through before (the title
   * also stops offering it once a first match was started, M100, savedChoices.ts › loadMatchStarted).
   */
  onTutorial: () => void;
  tutorialDone: boolean;
  /** The pause menu's Skip to next round (M83): the rest of the round played out at once, then play resumes. */
  onSkipRound: () => void;
  /** Settings › Gameplay › Replay tutorial (M97): the tutorial from its first step, finished or not, leaving any match. */
  onReplayTutorial: () => void;
  /** The practice range's pause menu (M93): turn the timed challenge on or off. */
  onToggleChallenge: () => void;
  /** The pause menu during the tutorial (audit POOL-14): skip the step under way, or the rest of it. */
  onSkipTutorialStep: () => void;
  onSkipTutorial: () => void;
  map: { initial: MapId; onChange: (m: MapId) => void };
  /** Each map's Day or Night pick (M34d), on the maps that offer both. */
  lighting: { initial: Partial<Record<MapId, LightingPresetId>>; onChange: (m: MapId, light: LightingPresetId) => void };
  /** `supply`: the line under Extraction for the supply event on as the Play screen opens (M49), or null when none is. */
  mode: { initial: MatchMode; onChange: (m: MatchMode) => void; supply?: () => string | null };
  /** The opponents' bot difficulty and your bot teammates' (M20). */
  difficulty: { initial: Difficulty; onChange: (d: Difficulty) => void };
  /** `follows`: no teammate level is saved yet, so it follows the opponents' picks until one is chosen. */
  teammateDifficulty: { initial: Difficulty; follows: boolean; onChange: (d: Difficulty) => void };
  /** The Match screen's Your team (M98): Alpha or Beta, saved as it is picked. */
  team: { initial: TeamPickId; onChange: (t: TeamPickId) => void };
  /** The Match section's rules (M20), and its Rules row (M39). */
  matchRules: { initial: MatchRules; onChange: (m: MatchRules) => void };
  ruleset: { initial: RulesetId; onChange: (r: RulesetId) => void };
  controls: ControlsSettingsOptions;
  fov: { initial: number; onChange: (v: number) => void };
  /** The quality rows on Settings → Graphics (ui/graphicsSettings.ts). */
  graphics: GraphicsSettingsOptions;
  audio: AudioSettingsOptions;
  crosshair: CrosshairSettingsOptions;
  accessibility: AccessibilitySettingsOptions;
  hud: HudSettingsOptions;
  /** Settings › Look (G1); its Realistic colours also decides how the menus' replica pictures look. */
  look: LookSettingsOptions;
  /**
   * The Dev tab (M24); `cheating`: a Dev setting now in force keeps the next match out of the records. `devContent`:
   * dev content is offered (M35); `devContentUsed`: New game's picks, the Loadout or the opponents' possible gear use
   * some, so the match won't count or pay.
   */
  dev: SettingsOptions['dev'] & { cheating: () => boolean; devContent: () => boolean; devContentUsed: () => boolean };
  /** The save, for Settings → Save (M31). */
  save: SettingsOptions['save'];
}
