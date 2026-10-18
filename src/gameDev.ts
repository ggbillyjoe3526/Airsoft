import { activeDev, DEV_ACTION_TEXT, DEV_GIFTS, type DevActionId, type DevSettings, devCheating } from './config/dev';
import { type RetroSettings, retroLookOf } from './config/look';
import { BROWSER_NOTES } from './config/menus';
import type { RetroLook } from './config/render';
import { adaptiveNote } from './adaptivePicks';
import { type GameReadout, reportInfo } from './gameReport';
import { allMapsLoaded, loadDevMaps } from './map/maps';
import type { MatchSession } from './matchSession';
import type { PlaySetup } from './playSetup';
import { GAME_LEVELS } from './progress/gameLevels';
import { addXp, resetProgress, saveProgress, xpToNext } from './progress/progress';
import type { RangeSession } from './rangeSession';
import type { Renderer } from './render/renderer';
import type { SaveManager } from './save/saveManager';
import { loadDevEnabled, loadDevSettings } from './settings/dev';
import { carryOverDevRetro, loadRetroSettings } from './settings/retroLook';
import type { DebugOverlay } from './ui/debugOverlay';
import type { Menus } from './ui/menus/menus';
import type { MenusOptions } from './ui/menus/menusOptions';

/** What the Dev settings reach (Game wires it): the picture, the debug overlay, the session and the next Play. */
export interface DevHost {
  readonly renderer: Renderer;
  readonly debug: DebugOverlay;
  readonly setup: PlaySetup;
  readonly readout: GameReadout;
  readonly save: SaveManager;
  /** The session loaded, a match or the range; null on the menus with nothing loaded. */
  session(): MatchSession | RangeSession | null;
  /** The menus (built after this, with its Dev tab): a hint by the play buttons, and everything read again. */
  menus(): Menus;
  /** Set by Game.dispose(): work still in flight (the dev maps' fetch) then does nothing. */
  disposed(): boolean;
}

/**
 * With Dev content on (M50), the dev maps load at start alongside the physics, so New game can show a dev map picked
 * last time; null with it off.
 */
export function devMapsAtStart(): Promise<boolean> | null {
  return activeDev(loadDevEnabled(), loadDevSettings()).devContent ? loadDevMaps() : null;
}

/**
 * The Dev settings (M24) and Settings › Dev's glue (out of game.ts, DX8): whether their tab is shown, the values picked
 * on it, what applies (the picked values while the tab is shown, else the defaults), the Retro look, and the tab's
 * buttons.
 */
export class GameDev {
  /** The Dev tab is shown (Settings › Dev). */
  private enabled = loadDevEnabled();
  private readonly picked: DevSettings = loadDevSettings();
  /** What applies now: the picked values while the tab is shown, else the defaults. */
  inForce: DevSettings;
  /** Settings › Dev › Retro look (M96, back on the Dev tab since the Dev 6 playtest; applies while the Dev tab is shown). */
  private retro: RetroSettings;

  constructor(
    private readonly host: DevHost,
    /** The perf harness drives the player (`?script=perf`): the retro filter stays off so its budgets compare (M42). */
    private readonly scripted: boolean,
  ) {
    this.inForce = this.devInForce();
    carryOverDevRetro();
    this.retro = loadRetroSettings();
    this.showRetro();
    // Tone mapping (RV2) as in force: the Dev tab's pick while it is shown, else Neutral.
    host.renderer.setToneMapping(this.inForce.toneMapping);
  }

  /** The Dev settings in force while their tab is shown; null while it is hidden (the reports). */
  get shown(): DevSettings | null {
    return this.enabled ? this.inForce : null;
  }

  /** The Retro look in force, or null. */
  retroLook(): RetroLook | null {
    return retroLookOf(this.retro, this.scripted, this.enabled);
  }

  /** Settings › Dev's options for the menus. */
  menuOptions(): MenusOptions['dev'] {
    const setup = this.host.setup;
    return {
      initial: this.picked,
      enabled: this.enabled,
      // The filter is a screen effect: on, off and its sliders show at once.
      retro: { initial: this.retro, onChange: (r) => ((this.retro = r), this.showRetro()) },
      onChange: (id, value) => {
        this.picked[id] = value;
        this.apply();
      },
      onEnabled: (on) => {
        this.enabled = on;
        this.apply();
        // Only a Retro look that is on changes the picture; setRetro rebuilds the post stack, so skip it otherwise.
        if (this.retro.on) this.showRetro();
      },
      cheating: () => devCheating(this.inForce),
      devContent: () => this.inForce.devContent,
      devContentUsed: () => setup.devContentUsed(setup.playedPicks()),
      adaptive: () => adaptiveNote(this.inForce.adaptiveDifficulty, setup.playedPicks(), this.inForce.devContent),
      diagnostics: () => reportInfo(this.host.readout, 'Airsoft diagnostics'),
      actions: (id) => this.action(id),
    };
  }

  /** A Dev setting changed, or the Dev tab was shown or hidden (M24): what applies now goes to the game and the session. */
  private apply(): void {
    const before = this.inForce;
    this.inForce = this.devInForce();
    const dev = this.inForce;
    const { debug, setup } = this.host;
    const session = this.host.session();
    // Only on a change, so the debug keys (` / F3, ]) keep working as toggles.
    if (dev.showDebug !== before.showDebug) debug.setVisible(dev.showDebug);
    if (dev.showBbPaths !== before.showBbPaths) session?.combat.setBbPaths(dev.showBbPaths);
    session?.setDevCheats(dev);
    // Disable levelling and Dev content (M35) change what the Loadout offers and carries, and Dev content what New game
    // plays; the next Play rebuilds the match with it.
    if (dev.unlockAllGear !== before.unlockAllGear || dev.devContent !== before.devContent) setup.kitChanged();
    if (dev.devContent !== before.devContent) setup.prefetchFieldSounds();
    // Time of day (M90) changes the light the next match is built under, and its sounds.
    if (dev.timeOfDay !== before.timeOfDay) {
      setup.setupChanged = true;
      setup.prefetchFieldSounds();
    }
    // Tone mapping (RV2) is a look: it shows at once, and with the Dev tab hidden it's Neutral again.
    if (dev.toneMapping !== before.toneMapping) this.host.renderer.setToneMapping(dev.toneMapping);
  }

  /** The Retro look (Settings › Dev) on screen as saved while the Dev tab is shown, else off. */
  private showRetro(): void {
    this.host.renderer.setRetro(this.retroLook());
  }

  /**
   * A Dev button (M90): XP, a level or a reset go into the progress (another tab's newer save read first, LV1), End the
   * round now runs the loaded match's clock out (that match then stays out of the records), Reset the save deletes it
   * (kept for Undo) and reloads. Returns what the button says for a moment.
   */
  private action(id: DevActionId): string {
    if (id === 'giveXp' || id === 'levelUp' || id === 'resetLevel') {
      const p = this.host.setup.syncedProgress();
      const left = xpToNext(p, GAME_LEVELS);
      if (id === 'levelUp' && left === 0) return DEV_ACTION_TEXT.topLevel;
      if (id === 'resetLevel') resetProgress(p, GAME_LEVELS);
      else addXp(p, GAME_LEVELS, id === 'giveXp' ? DEV_GIFTS.xp : left);
      saveProgress(p);
      this.host.setup.kitChanged();
      this.host.menus().refresh();
      return DEV_ACTION_TEXT.done;
    }
    const s = this.host.session();
    if (id === 'endRound') return s?.kind === 'match' && s.endRoundNow() ? DEV_ACTION_TEXT.done : DEV_ACTION_TEXT.noRound;
    this.host.save.deleteSave();
    return DEV_ACTION_TEXT.done;
  }

  /**
   * The Dev settings that apply now (M24). Dev content (M35) waits for the dev maps' data (M50, map/maps.ts): turned on,
   * it fetches them and applies once they are in, so a dev map is never listed or played before its data is here.
   */
  private devInForce(): DevSettings {
    const dev = activeDev(this.enabled, this.picked);
    if (!dev.devContent || allMapsLoaded()) return dev;
    void loadDevMaps().then((loaded) => {
      if (this.host.disposed()) return;
      // Not here (a failed download): say so by the play buttons, not only in the console (BP2).
      if (!loaded) return this.host.menus().showHint(BROWSER_NOTES.devMapsFailed);
      this.apply();
      this.host.menus().refresh();
    });
    return { ...dev, devContent: false };
  }
}
