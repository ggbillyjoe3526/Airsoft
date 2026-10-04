import type * as THREE from 'three';
import { BotController } from './ai/botController';
import { lowCoverBlocks, tallCoverBlocks } from './ai/cover';
import type { SfxSetup } from './audio/sfx';
import { FULL_MOTION, type MotionScale } from './config/accessibility';
import { BALLISTICS } from './config/ballistics';
import { BOT_BEHAVIOUR, BOTS, type BotConfig, botConfig, type Difficulty } from './config/bots';
import { FOOTSTEPS } from './config/footsteps';
import type { HitConfig } from './config/hits';
import { DEV_DEFAULTS, type DevSettings, devCheating } from './config/dev';
import type { CrosshairSettings, HitFeedMode } from './config/matchInfo';
import { countsForRecords, hitRulesFor, type MatchRules, roundRulesFor } from './config/matchRules';
import type { MatchMode } from './config/modes';
import { BODY, MOVEMENT } from './config/movement';
import { NAV } from './config/nav';
import { PHYSICS } from './config/physics';
import { matchOverScreenDelay, type QualitySettings } from './config/render';
import { LOADOUT, type ReplicaConfig } from './config/replicas';
import type { PlayerKit } from './pool/loadoutModel';
import { SIM, SIM_DT } from './config/sim';
import type { SquadCommand } from './config/squad';
import { TEAMS, type TeamColours } from './config/teams';
import { advanceStepper, createStepper, stepperAlpha } from './core/fixedStepper';
import type { PlayerInput } from './input/playerInput';
import type { MapData } from './map/mapTypes';
import { buildNavGrid, type NavGrid } from './nav/navGrid';
import { PhysicsWorld } from './physics/physicsWorld';
import { updateFirstPersonCamera } from './render/cameraRig';
import { CombatPresentation } from './render/combatPresentation';
import { addLighting, type Daylight } from './render/lighting';
import { buildMapMeshes, disposeMapMeshes, setMapRelief } from './render/mapMeshes';
import { MatchPresentation } from './render/matchPresentation';
import type { Renderer } from './render/renderer';
import { canAimDownSights } from './sim/aiming';
import { fitOptics, fitParts, setBbWeights, setHopUps } from './sim/armament';
import { type Character, createCharacter, respawnCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { isInPlay } from './sim/elimination';
import { placeTeams, restartMatch } from './sim/round';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import { MatchStats } from './stats/matchStats';
import type { MatchResult } from './stats/records';
import type { MatchOutcome } from './pool/armory';
import type { NotCounted } from './ui/recordsView';
import { rosterNames, statsBlocks, type TeamBlock } from './ui/statsRows';

const PLAYER_ID = 0;

/** What New game sets up, read when Play is pressed (M15b: nothing is loaded before that). */
export interface MatchSetup {
  map: MapData;
  mode: MatchMode;
  /** The opponents' bot difficulty, and your bot teammates' (M20). */
  difficulty: Difficulty;
  teammateDifficulty: Difficulty;
  /** Rounds to win, round time, team size, friendly fire and ricochets (the Match pop-up, M20). */
  rules: MatchRules;
  /**
   * The player's kit from the Loadout screen (M26b): each gear slot's replica as carried (rarity, power source and laser
   * worked in), its optic, parts, hop-up dial and BB weight. Bots carry config/replicas.ts LOADOUT as it comes.
   */
  kit: PlayerKit;
  /** The team colours picked on Settings → Accessibility (M18b): the figures, the flag and your armband. */
  teamColours: TeamColours;
}

/**
 * One match on one map: the field's meshes and lighting, physics, the bots' navigation, the simulation and
 * everything drawn and heard in it. Built when Play is pressed and disposed when the player leaves the match
 * (Quit, or New Game after it), so the next Play can load another map with another setup.
 * The app around it (renderer, input, menus) outlives it; see Game.
 */
export class MatchSession {
  readonly state: GameState;
  readonly player: Character;
  readonly combat: CombatPresentation;
  readonly match: MatchPresentation;
  readonly mode: MatchMode;
  private readonly loadout: readonly ReplicaConfig[];
  /** Every player's numbers for the match and the round (M19). */
  readonly stats: MatchStats;
  private readonly physics: PhysicsWorld;
  private readonly nav: NavGrid;
  private readonly bots: BotController;
  private readonly mapGroup: THREE.Group;
  private readonly daylight: Daylight;
  private readonly stepper = createStepper(SIM_DT, SIM.maxTicksPerFrame);
  private readonly commands = new Map<number, PlayerCommand>();
  private readonly playerCommand = createCommand();
  /** Where your teammates hold, while they do (scratch for the HUD marker). */
  private readonly holdSpot = vec3();
  /** Reduced motion (Settings → Accessibility): the lean's roll here, the held replica's motion in `combat`. */
  private motion: MotionScale = FULL_MOTION;
  private readonly ctx: SimContext;
  /** The match's round rules and hit rules (from setup.rules). */
  readonly rounds: ReturnType<typeof roundRulesFor>;
  private readonly hits: HitConfig;
  /** Simulation time the match was decided (NaN while it's on, and once the result screen is due). */
  private matchOverAt = Number.NaN;
  /** The decided match has been handed to the records (takeMatchResult), so it is counted once. */
  private resultTaken = false;
  /** The decided match has been paid its Field Credits (takeOutcome, M26c), so it is paid once. */
  private outcomeTaken = false;
  /** The standard match, so its result could go into the records (custom rules don't, M20). */
  private readonly standardRules: boolean;
  /** Dev settings that change play were on at some point in this match (M24), so it stays out of the records. */
  private devAssisted = false;
  /** The Dev settings that change play, as last set. */
  private cheats: DevSettings = { ...DEV_DEFAULTS };

  constructor(
    private readonly renderer: Renderer,
    container: HTMLElement,
    private readonly input: PlayerInput,
    readonly setup: MatchSetup,
    seed: number,
    quality: QualitySettings,
    audio: SfxSetup,
    crosshair: CrosshairSettings,
  ) {
    const map = setup.map;
    this.loadout = setup.kit.slots.map((s) => s.replica);
    // The surface textures are the renderer's, shared by every session (audit L-04).
    this.mapGroup = buildMapMeshes(map, renderer.surfaceTextures, quality.surfaceRelief);
    renderer.scene.add(this.mapGroup);
    this.daylight = addLighting(renderer.scene, map, quality);

    this.physics = new PhysicsWorld(map, BODY, SIM_DT);
    this.nav = buildNavGrid(map, NAV);
    // Maps without a flagpole can only be played in elimination.
    this.mode = map.flag ? setup.mode : 'elimination';
    this.rounds = roundRulesFor(setup.rules);
    this.hits = hitRulesFor(setup.rules);
    this.standardRules = countsForRecords(setup.rules, setup.difficulty, setup.teammateDifficulty);
    this.state = createGameState(seed, BALLISTICS.maxBBs, this.rounds, this.mode, map.flag);
    this.ctx = createSimContext({
      mover: this.physics,
      query: this.physics,
      movement: MOVEMENT,
      footsteps: FOOTSTEPS,
      body: BODY,
      ballistics: BALLISTICS,
      killY: map.killY,
      hits: this.hits,
      deadZones: map.deadZones,
      spawns: map.spawns,
      spawnLift: PHYSICS.groundRestGap,
      nav: this.nav,
      navSnap: NAV.snap,
      rounds: this.rounds,
      pole: map.flag,
    });
    this.player = this.spawnRoster(map);
    this.fitPickedLoadout();
    this.commands.set(PLAYER_ID, this.playerCommand);
    this.bots = new BotController(
      this.state,
      this.state.characters.filter((c) => c !== this.player),
      this.commands,
      { query: this.physics, nav: this.nav, navSnap: NAV.snap, lanes: map.lanes, lowCover: lowCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), tallCover: tallCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), body: BODY, hits: this.hits, loadout: LOADOUT, cfg: BOTS, teamCfg: teamBotConfigs(this.player.team, setup), seed },
    );
    input.resetView(this.player.spawnYaw);
    // The player is always on Blue.
    this.combat = new CombatPresentation(renderer, container, this.state, this.player, this.loadout, MOVEMENT, this.physics, setup.teamColours.figures[this.player.team]!, SIM_DT, map.blocks, audio, (action) => input.keyName(action), crosshair, quality, this.hits);
    this.stats = new MatchStats(this.state.characters);
    this.match = new MatchPresentation(renderer.scene, container, renderer, this.state, this.player, BODY, this.hits, this.physics, setup.rules.teamSize, this.rounds, this.stats, (action) => input.keyName(action), setup.teamColours, map.blocks);
    input.ordersEnabled = true;
  }

  /** Characters in the match (for the debug overlay). */
  get characterCount(): number {
    return this.state.characters.length;
  }

  /**
   * One frame of play: reads the player's input, then runs the simulation ticks that are due, with the bots
   * thinking before each. Returns how many ticks ran.
   */
  advance(dt: number): number {
    const p = this.player;
    this.input.update(p.armament.active, this.loadout.length, this.combat.aimRaised, this.combat.aimSensitivityScale, canAimDownSights(p.armament));
    if (this.match.spectating && this.input.takeClick()) this.match.nextSpectateTarget();
    const order = this.input.takeOrder();
    if (order) this.giveOrder(order);
    const ticks = advanceStepper(this.stepper, dt);
    for (let i = 0; i < ticks; i++) {
      this.input.fillCommand(this.playerCommand);
      this.bots.think(this.state, SIM_DT);
      stepSimulation(this.state, this.commands, this.ctx, SIM_DT);
      this.afterTick();
    }
    return ticks;
  }

  /** True once, a little after the match is decided: time to give the mouse back and show the result screen. */
  takeResultDue(): boolean {
    if (!(this.state.time - this.matchOverAt >= matchOverScreenDelay())) return false;
    this.matchOverAt = Number.NaN;
    return true;
  }

  /**
   * The decided match for the records, once per match (null before it's decided, and after the first call). Only a
   * match played to the end counts: quitting one counts as nothing. A match with custom rules is never counted
   * (countsForRecords).
   */
  takeMatchResult(): MatchResult | null {
    const r = this.state.round;
    if (r.phase !== 'matchOver' || this.resultTaken) return null;
    this.resultTaken = true;
    if (!this.countsForRecords) return null;
    const mine = this.stats.matchOf(this.player.id);
    return { difficulty: this.setup.difficulty, mode: this.mode, won: r.matchWinner === this.player.team, hits: mine.hits, bbsFired: mine.bbsFired };
  }

  /**
   * The decided match for its Field Credits (M26c), once per match: custom rules pay too (scaled by pool.md), but a
   * match played with Dev settings that change play (M24) pays nothing, so null then.
   */
  takeOutcome(): MatchOutcome | null {
    const r = this.state.round;
    if (r.phase !== 'matchOver' || this.outcomeTaken) return null;
    this.outcomeTaken = true;
    if (this.devAssisted) return null;
    return {
      won: r.matchWinner === this.player.team,
      roundsWon: r.score[this.player.team] ?? 0,
      hits: this.stats.matchOf(this.player.id).hits,
      winsNeeded: this.rounds.winsNeeded,
      difficulty: this.setup.difficulty,
    };
  }

  /** Every player's numbers over the match, your team first, for the end-of-match summary. */
  summaryBlocks(): TeamBlock[] {
    const names = rosterNames(this.state.characters, this.player.id);
    return statsBlocks(this.state.characters, names, (id) => this.stats.matchOf(id), this.state.round.score, this.player, false);
  }

  /**
   * Places the camera and draws the frame; `dt` is 0 while paused, so presentation holds still. `boardHeld`: the
   * scoreboard key is held.
   */
  draw(dt: number, boardHeld: boolean): void {
    const alpha = stepperAlpha(this.stepper); // frozen while paused, so the view holds still
    // The camera shows where BBs actually go: view pitch plus the replica's recoil kick.
    const pitch = this.input.pitch + this.player.armament.recoil;
    updateFirstPersonCamera(this.renderer.camera, this.player, BODY, this.hits, alpha, this.input.yaw, pitch, this.motion.leanRoll);
    const spectating = this.match.frame(this.renderer.camera, alpha, dt, this.input.yaw, boardHeld);
    const holding = this.bots.holdSpot(this.player, this.holdSpot);
    const order = this.bots.orderOf(this.player);
    this.match.showSquadOrder(order, holding ? this.holdSpot : null, this.renderer.camera, dt);
    this.match.showOrderWheel(this.input.wheelOpen, this.input.wheelPointer, order, this.input.wheelSelect);
    this.match.showMinimap(holding ? this.holdSpot : null);
    this.combat.frame(dt, alpha, this.input.yaw, pitch);
    this.combat.render(!spectating);
  }

  /** Reduced motion turned on or off (also called once as the match is built). */
  setMotion(scale: MotionScale): void {
    this.motion = scale;
    this.combat.setMotion(scale);
  }

  /**
   * A new quality preset (Settings → Graphics, M14): the sun's shadows, the surfaces' relief, the dust in the air and
   * the held replica's sheen follow it at once. (The renderer's own part is Renderer.setQuality.)
   */
  setQuality(quality: QualitySettings): void {
    this.daylight.setQuality(quality);
    setMapRelief(this.mapGroup, quality.surfaceRelief);
    this.combat.setQuality(quality);
  }

  /** The graphics context is back after a loss: what was rendered once into a render target is rendered again. */
  contextRestored(): void {
    this.combat.contextRestored();
  }

  /** On-screen sound cues turned on or off (also called once as the match is built). */
  setSoundCues(on: boolean): void {
    this.match.setSoundCues(on);
  }

  /**
   * The Dev settings that change play (M24): applied to you at once; any of them on, now or earlier in the match, keeps
   * it out of the records.
   */
  setDevCheats(cheats: DevSettings): void {
    this.cheats = cheats;
    this.player.armament.bottomless = cheats.bottomlessMags;
    this.player.ghost = cheats.ghost;
    if (devCheating(cheats)) this.devAssisted = true;
  }

  /** Whether this match's result goes into the records: the standard match (M20), played without Dev help (M24). */
  get countsForRecords(): boolean {
    return this.standardRules && !this.devAssisted;
  }

  /** Why it doesn't, for the summary: custom rules, Dev settings, or '' when it counts. */
  get notCountedReason(): NotCounted {
    return !this.standardRules ? 'rules' : this.devAssisted ? 'dev' : '';
  }

  /** Settings → HUD → Hit feed (M24). */
  setHitFeedMode(mode: HitFeedMode): void {
    this.match.setHitFeedMode(mode);
  }

  setPlaying(playing: boolean): void {
    this.combat.setPlaying(playing);
    this.match.setPlaying(playing);
  }

  /** A fresh match from round 1 with the same setup ("Play Again" on the result screen). A direct sim-state change. */
  restart(): void {
    this.state.events.length = 0;
    restartMatch(this.state.round, this.state.characters, this.state.bbs, this.ctx.round, this.state.events, this.mode);
    this.matchOverAt = Number.NaN;
    this.resultTaken = false;
    this.outcomeTaken = false;
    this.stats.reset();
    // A new match: it stays out of the records only if Dev help is still on.
    this.devAssisted = devCheating(this.cheats);
    this.afterTick();
  }

  dispose(): void {
    this.combat.dispose();
    this.match.dispose();
    this.renderer.scene.remove(this.mapGroup);
    disposeMapMeshes(this.mapGroup);
    this.daylight.dispose();
    this.physics.dispose();
    this.renderer.setZoom(1);
  }

  /**
   * Creates both teams at the map's spawns for round 1 (each team at its end, see placeTeams): the local player
   * plus bot teammates on Blue, and Orange bots. Returns the player.
   */
  private spawnRoster(map: MapData): Character {
    const size = this.setup.rules.teamSize;
    for (const [end, spawns] of map.spawns.entries()) {
      if (spawns.length < size) throw new Error(`Map ${map.name} needs ${size} spawns at end ${end}`);
    }
    let id = PLAYER_ID;
    for (let team = 0; team < TEAMS.length; team++) {
      // You carry your kit; every bot carries the default loadout as it comes.
      for (let i = 0; i < size; i++, id++) this.state.characters.push(createCharacter(id, vec3(), 0, id === PLAYER_ID ? this.loadout : LOADOUT, team));
    }
    placeTeams(this.state.round, this.state.characters, this.ctx.round);
    for (const c of this.state.characters) {
      respawnCharacter(c);
      this.physics.addCharacter(c);
    }
    return this.state.characters[0]!;
  }

  /**
   * Fits the picked optic, hop-up dials, BB weights, grips and magazines to the player's replicas (fresh magazines of
   * the picked kind). A direct sim-state change, between rounds.
   */
  private fitPickedLoadout(): void {
    const kit = this.setup.kit;
    fitOptics(this.player.armament, kit.slots.map((s) => s.optic));
    fitParts(this.player.armament, kit.slots.map((s) => s.parts));
    setHopUps(this.player.armament, kit.hopUps);
    setBbWeights(this.player.armament, kit.bbWeights);
  }

  /**
   * A squad order key (M22) or an order picked on the wheel (M23): your bot teammates' radios answer when they take it;
   * the HUD says what's in force. Team plan (`cancel`, the wheel's) sends them back to the team plan. While you are out,
   * or between rounds, it does nothing but say so.
   */
  private giveOrder(order: SquadCommand): void {
    if (!isInPlay(this.player) || this.state.round.phase !== 'live') {
      this.match.orderGiven('none', 'notNow');
      return;
    }
    const before = this.bots.orderOf(this.player);
    if (order === 'cancel') {
      this.bots.cancelOrder(this.player);
      this.match.orderGiven('none', before !== 'none' ? 'cancelled' : 'onPlan');
      return;
    }
    // Picked again on the wheel, the order in force stays (Team Plan ends it there); its key again cancels it.
    const result = this.bots.giveOrder(this.player, order, !this.input.orderFromWheel);
    this.match.orderGiven(result, before !== 'none' ? 'cancelled' : 'nobody');
    if (result !== 'none') this.combat.orderHeard();
  }

  /** Everything that reacts to a simulation tick's events. */
  private afterTick(): void {
    this.stats.afterTick(this.state, SIM_DT);
    this.bots.observe(this.state);
    this.combat.afterTick();
    this.match.afterTick(this.input.yaw);
    for (const e of this.state.events) {
      if (e.type === 'roundStart') {
        this.input.resetView(this.player.spawnYaw);
        this.fitPickedLoadout();
      }
      if (e.type === 'matchOver') this.matchOverAt = this.state.time;
    }
  }
}

/** Per team, the bots' tuning: your team's bots at the teammates' difficulty, the other team's at the opponents' (M20). */
function teamBotConfigs(playerTeam: number, setup: MatchSetup): BotConfig[] {
  return TEAMS.map((_, team) => botConfig(team === playerTeam ? setup.teammateDifficulty : setup.difficulty));
}
