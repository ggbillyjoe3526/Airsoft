import { BotController } from './ai/botController';
import { SquadFollow } from './ai/squadFollow';
import { lowCoverBlocks, tallCoverBlocks } from './ai/cover';
import { sightConditionsOf } from './ai/perception';
import type { SfxSetup } from './audio/sfx';
import { FULL_MOTION, type MotionScale } from './config/accessibility';
import { BALLISTICS, WIND } from './config/ballistics';
import { BOT_BEHAVIOUR, BOT_LOADOUTS, BOT_PART_CHANCE, BOTS, type BotConfig, botConfig, type Difficulty } from './config/bots';
import { FOOTSTEPS } from './config/footsteps';
import type { HitConfig } from './config/hits';
import { type DevSettings, devCheating } from './config/dev';
import type { CrosshairSettings, HitFeedMode } from './config/matchInfo';
import { countsForRecords, hitRulesFor, kitUnderRules, type MatchRules, recordsKeyOf, roundRulesFor, type RulesetId, standardRules } from './config/matchRules';
import type { MatchMode } from './config/modes';
import { BODY, MOVEMENT } from './config/movement';
import { NAV } from './config/nav';
import { PHYSICS } from './config/physics';
import { matchOverScreenDelay, type QualitySettings } from './config/render';
import { LOADOUT, REALCAP, type ReplicaConfig, replicaUnderRules } from './config/replicas';
import { botKitSeed, carriedLoadout, chaseCarrier, chaseReady, kittedCharacter, randomKit } from './pool/botKit';
import { contentPool } from './pool/contentPool';
import { GAME_POOL } from './pool/gamePool';
import { bbGlowFor, type PlayerKit } from './pool/loadoutModel';
import { SIM, SIM_DT } from './config/sim';
import type { SquadCommand } from './config/squad';
import { TEAMS, type TeamColours } from './config/teams';
import { BuildTiming } from './core/buildTiming';
import { runSeed } from './core/seed';
import { advanceStepper, createStepper, stepperAlpha } from './core/fixedStepper';
import type { PlayerInput } from './input/playerInput';
import type { MapData } from './map/mapTypes';
import { playableMode } from './map/playableMode';
import { buildNavGrid, type NavGrid } from './nav/navGrid';
import { PhysicsWorld } from './physics/physicsWorld';
import { updateFirstPersonCamera } from './render/cameraRig';
import { CombatPresentation } from './render/combatPresentation';
import { ContactShadows } from './render/contactShadows';
import { addLighting, type Daylight } from './render/lighting';
import { resolveLighting } from './render/lightingPreset';
import { mapLookOf } from './render/mapMeshes';
import { MatchPresentation } from './render/matchPresentation';
import type { Renderer } from './render/renderer';
import { canAimDownSights } from './sim/aiming';
import { fitOptics, fitParts, setBbWeights, setHopUps } from './sim/armament';
import { type Character, createCharacter, respawnCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { isInPlay } from './sim/elimination';
import { createRunContext, type ExtractionContext } from './sim/extraction';
import { placeTeams, startRun } from './sim/round';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { createWind } from './sim/wind';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import { MatchStats } from './stats/matchStats';
import { matchStanding, MatchTakes } from './stats/settleMatch';
import type { MatchResult } from './stats/records';
import type { MatchOutcome } from './pool/armory';
import type { NotCounted } from './ui/recordsView';
import { pauseText, resultText, type ResultText } from './ui/matchStopText';
import { rosterNames, statsBlocks, type TeamBlock } from './ui/statsRows';

const PLAYER_ID = 0;
/** The team the player is on at the start (Blue); the other team is the opponents. */
const PLAYER_TEAM = 0;

/** What New game sets up, read when Play is pressed (M15b: nothing is loaded before that). */
export interface MatchSetup {
  map: MapData;
  mode: MatchMode;
  /** The opponents' bot difficulty, and your bot teammates' (M20). */
  difficulty: Difficulty;
  teammateDifficulty: Difficulty;
  /** The Rules picker's ruleset (M39): where the match goes in the records, and whether its rules are custom. */
  ruleset: RulesetId;
  /**
   * The rules as played (the Match pop-up, M20, under the ruleset's own switches, M39: newGamePicks.ts playedPicks):
   * rounds to win, round time, team size, friendly fire, ricochets and the Rules picker's switches.
   */
  rules: MatchRules;
  /**
   * The player's kit from the Loadout screen (M26b): each gear slot's replica as carried (rarity, power source and laser
   * worked in), its optic, parts, hop-up dial and BB weight. Bots carry config/replicas.ts LOADOUT as it comes.
   */
  kit: PlayerKit;
  /** Dev content is on (M35): bots may roll dev gear (config/content.ts). */
  devContent: boolean;
  /**
   * The match uses dev content (M35, newGamePicks.ts matchUsesDev: its picks, the player's kit, or gear the opponents
   * may roll): it stays out of the records and pays no Field Credits.
   */
  devContentUsed: boolean;
  /**
   * The chase replicas the player owns (pool asset ids, M32): on a difficulty that rolls kits, one opponent now and then
   * carries one (pool/botKit.ts chaseCarrier). Absent: none.
   */
  chaseOwned?: readonly string[];
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
  /** The player's kit under the match's rules (M39 kitUnderRules: the factory kit, semi only, realcap), fitted each round. */
  private readonly kit: PlayerKit;
  /** The bots' factory loadout under the match's rules (LOADOUT itself when none apply). */
  private readonly botLoadout: readonly ReplicaConfig[];
  /** Every player's numbers for the match and the round (M19). */
  readonly stats: MatchStats;
  private readonly physics: PhysicsWorld;
  private readonly nav: NavGrid;
  private readonly bots: BotController;
  private readonly daylight: Daylight;
  /** A soft dark disc on the floor under every player (audit section 5, F5), on every preset. */
  private readonly contact: ContactShadows;
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
  /** The decided match goes to the records (takeMatchResult) and is paid (takeOutcome, M26c) once each. */
  private readonly takes = new MatchTakes();
  /** The standard match, so its result could go into the records (custom rules don't, M20). */
  private readonly standardRules: boolean;
  /** Not the ruleset's standard match (M39): custom rules pay no more than CUSTOM_RULES_PAY_CAP. */
  private readonly customRules: boolean;
  /** Dev settings that change play were on at some point in this match (M24), so it stays out of the records. */
  private devAssisted = false;
  /** Play has begun in this match (since it was built): Dev help switched off before then doesn't count. */
  private played = false;
  /**
   * How long each part of building this match took (audit CORE-33): `performance.measure` entries, and one line Game logs
   * with `?perf`. Started as the session is made, so it counts everything the constructor does.
   */
  readonly build = new BuildTiming('match build');

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
    this.kit = kitUnderRules(setup.kit, setup.rules);
    this.loadout = this.kit.slots.map((s) => s.replica);
    this.botLoadout = LOADOUT.map((r) => replicaUnderRules(r, setup.rules));
    // The surface textures are the renderer's, shared by every session (audit L-04), and so are the last map's meshes,
    // kept between sessions (audit CORE-33): the same map again takes them back rather than building them.
    renderer.scene.add(renderer.mapMeshes.take(map, renderer.surfaceTextures, mapLookOf(quality)));
    this.build.phase('map meshes');
    if (renderer.mapMeshes.reused) this.build.notes.push('map meshes reused');
    // The map's light (M33f): its haze, exposure and environment on the renderer, set by every session so none keeps the
    // last map's; its lights, sky and light pools in the scene.
    const lighting = resolveLighting(map);
    renderer.setLighting(lighting);
    this.daylight = addLighting(renderer.scene, map, quality, lighting);
    this.build.phase('lighting');

    this.physics = new PhysicsWorld(map, BODY, SIM_DT);
    this.build.phase('physics');
    this.nav = buildNavGrid(map, NAV);
    this.build.phase('navigation');
    // Maps without a flagpole can only be played in elimination, and those without Extraction data not in Extraction.
    this.mode = playableMode(map, setup.mode);
    this.extraction =
      this.mode === 'extraction' && map.extraction
        ? createRunContext(map.extraction, { squad: setup.rules.teamSize, seed: runSeed(seed), runner: PLAYER_ID, squadTeam: PLAYER_TEAM, respawnAfter: hitRulesFor(setup.rules).callTime, spawnLift: PHYSICS.groundRestGap })
        : undefined;
    // An Extraction run is one "round" of the map's run time (sim/round.ts); there is nothing to win twice.
    this.rounds = this.extraction && map.extraction ? { ...roundRulesFor(setup.rules), roundTime: map.extraction.runTime, winsNeeded: 1, winBy: 1 } : roundRulesFor(setup.rules);
    this.hits = hitRulesFor(setup.rules);
    this.standardRules = countsForRecords(setup.rules, setup.difficulty, setup.teammateDifficulty, setup.ruleset);
    this.customRules = !standardRules(setup.ruleset, setup.rules);
    this.state = createGameState(seed, BALLISTICS.maxBBs, this.rounds, this.mode, map.flag);
    this.ctx = createSimContext({
      mover: this.physics,
      query: this.physics,
      movement: MOVEMENT,
      footsteps: FOOTSTEPS,
      body: BODY,
      ballistics: BALLISTICS,
      wind: createWind(seed, WIND),
      killY: map.killY,
      hits: this.hits,
      deadZones: map.deadZones,
      spawns: map.spawns,
      spawnLift: PHYSICS.groundRestGap,
      nav: this.nav,
      navSnap: NAV.snap,
      rounds: this.rounds,
      pole: map.flag,
      extraction: this.extraction,
    });
    this.player = this.spawnRoster(map, seed);
    this.fitPickedLoadout();
    this.commands.set(PLAYER_ID, this.playerCommand);
    this.bots = new BotController(
      this.state,
      this.state.characters.filter((c) => c !== this.player),
      this.commands,
      { query: this.physics, nav: this.nav, navSnap: NAV.snap, lanes: map.lanes, lowCover: lowCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), tallCover: tallCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), sight: sightConditionsOf(map), body: BODY, hits: this.hits, loadout: this.botLoadout, cfg: BOTS, teamCfg: teamBotConfigs(this.player.team, setup), seed },
    );
    this.build.phase('simulation and bots');
    input.resetView(this.player.spawnYaw);
    input.restartScript();
    // The player is always on Blue.
    this.combat = new CombatPresentation(renderer, container, this.state, this.player, this.loadout, MOVEMENT, this.physics, setup.teamColours.figures[this.player.team]!, SIM_DT, map, audio, (action) => input.keyName(action), crosshair, quality, this.hits, bbGlowFor(this.kit, map.night ?? false));
    this.build.phase('replica, effects and sound');
    this.stats = new MatchStats(this.state.characters);
    this.match = new MatchPresentation(renderer.scene, container, renderer, this.state, this.player, BODY, this.hits, this.physics, this.teamSizes(), this.rounds, this.stats, (action) => input.keyName(action), setup.teamColours, map, renderer.figureModel, quality.figureDetail, this.extraction);
    this.match.setFigureShadows(quality.figureShadows);
    this.match.setFlagQuality(quality);
    // Teammates only on the minimap, with no heard patches, under rules that say so (M39).
    this.match.setHeardOnMinimap(setup.rules.heardOnMinimap);
    this.contact = new ContactShadows(this.state.characters, this.hits.vanishTime);
    renderer.scene.add(this.contact.object);
    input.ordersEnabled = true;
    this.build.phase('figures, flag and HUD');
  }

  /** Extraction's run context (the insertion, the home team's starts, the exits); undefined in the other modes. */
  readonly extraction: ExtractionContext | undefined;
  /** Extraction: your bot teammates follow you unless you order otherwise (ai/squadFollow.ts). */
  private readonly squadFollow = new SquadFollow();

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
    return this.takes.result(r.phase === 'matchOver', this.countsForRecords, () => {
      const mine = this.stats.matchOf(this.player.id);
      // A named ruleset has its own cells (M39); Skirmish the plain ones, as before.
      const ruleset = recordsKeyOf(this.setup.ruleset) ?? '';
      return { difficulty: this.setup.difficulty, mode: this.mode, ...(ruleset ? { ruleset } : {}), won: r.matchWinner === this.player.team, hits: mine.hits, bbsFired: mine.bbsFired };
    });
  }

  /** Whether this match pays Field Credits at all: not with Dev settings that change play (M24), nor with dev content (M35). */
  get paysFieldCredits(): boolean {
    return this.unpaidReason === null;
  }

  /** Why it pays nothing: Dev settings that change play, dev content, or null when it pays. */
  get unpaidReason(): 'dev' | 'devContent' | null {
    return this.standing().unpaid;
  }

  /**
   * The decided match for its Field Credits (M26c), once per match: custom rules pay too (scaled by pool.md), but a
   * match played with Dev settings that change play (M24) pays nothing, so null then.
   */
  takeOutcome(): MatchOutcome | null {
    const r = this.state.round;
    return this.takes.outcome(r.phase === 'matchOver', this.paysFieldCredits, () => ({
      won: r.matchWinner === this.player.team,
      // Rounds won with you in them (audit POOL-08), and the teammates' difficulty when you have any.
      roundsWon: this.stats.roundsContributed(this.player.id),
      hits: this.stats.matchOf(this.player.id).hits,
      winsNeeded: this.rounds.winsNeeded,
      difficulty: this.setup.difficulty,
      ...(this.rounds.teamSize > 1 ? { teammateDifficulty: this.setup.teammateDifficulty } : {}),
      // Custom rules pay no more than ×1.5 (M39): Pro's ×2 is for the named rulesets played as they are.
      ...(this.customRules ? { customRules: true } : {}),
    }));
  }

  /** Every player's numbers over the match, your team first, for the end-of-match summary. */
  summaryBlocks(): TeamBlock[] {
    const names = rosterNames(this.state.characters, this.player.id);
    return statsBlocks(this.state.characters, names, (id) => this.stats.matchOf(id), this.state.round.score, this.player, false, this.extraction !== undefined);
  }

  /** The result screen for the decided match (audit CORE-05): its lines and every player's numbers, for Game to show. */
  resultView(): ResultText & { summaryBlocks: TeamBlock[] } {
    return { ...resultText(this.state.round, this.player.team, this.rounds.roundTime), summaryBlocks: this.summaryBlocks() };
  }

  /** The pause screen's line about the match (the round, your role, the score; ui/matchStopText.ts). */
  pauseLine(): string {
    return pauseText(this.state.round, this.player.team, this.rounds);
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
    this.contact.update(alpha, spectating ? -1 : PLAYER_ID);
    const holding = this.bots.holdSpot(this.player, this.holdSpot);
    const order = this.bots.orderOf(this.player);
    this.match.showSquadOrder(order, holding ? this.holdSpot : null, this.renderer.camera, dt);
    this.match.showOrderWheel(this.input.wheelOpen, this.input.wheelPointer, order, this.input.wheelSelect);
    this.match.showMinimap(holding ? this.holdSpot : null);
    this.combat.frame(dt, alpha, this.input.yaw, pitch);
    // High's shadow map follows the view (REN-08), the spectator's too.
    this.daylight.follow(this.renderer.camera, dt);
    this.combat.render(!spectating);
  }

  /** Reduced motion turned on or off (also called once as the match is built). */
  setMotion(scale: MotionScale): void {
    this.motion = scale;
    this.combat.setMotion(scale);
  }

  /**
   * New quality settings (Settings → Graphics): the sun's shadows, the surfaces' textures and relief, the figures'
   * shading, the dust in the air and the held replica's sheen follow them at once. Call after Renderer.setQuality (the
   * renderer's part, which draws a new texture size when the map asks for it here).
   */
  setQuality(quality: QualitySettings): void {
    this.daylight.setQuality(quality);
    this.renderer.mapMeshes.restyle(this.renderer.surfaceTextures, mapLookOf(quality));
    this.match.setFigureShadows(quality.figureShadows);
    this.match.setFlagQuality(quality);
    this.match.setFigureDetail(quality.figureDetail);
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
    this.player.armament.bottomless = cheats.bottomlessMags;
    this.player.ghost = cheats.ghost;
    // Before play begins (a match built by a Play whose mouse lock was refused) only what applies now counts (bug pass).
    if (!this.played) this.devAssisted = devCheating(cheats);
    else if (devCheating(cheats)) this.devAssisted = true;
  }

  /**
   * Whether this match's result goes into the records: the standard match (M20), played without Dev help (M24) and
   * without dev content (M35).
   */
  get countsForRecords(): boolean {
    return this.notCountedReason === '';
  }

  /** Why it doesn't, for the summary: custom rules, Dev settings, dev content, or '' when it counts. */
  get notCountedReason(): NotCounted {
    return this.standing().notCounted;
  }

  private standing(): ReturnType<typeof matchStanding> {
    return matchStanding({ standardRules: this.standardRules, devAssisted: this.devAssisted, devContentUsed: this.setup.devContentUsed });
  }

  /** Settings → HUD → Hit feed (M24). */
  setHitFeedMode(mode: HitFeedMode): void {
    this.match.setHitFeedMode(mode);
  }

  setPlaying(playing: boolean): void {
    if (playing) this.played = true;
    this.combat.setPlaying(playing);
    this.match.setPlaying(playing);
  }

  dispose(): void {
    this.combat.dispose();
    this.match.dispose();
    this.contact.dispose();
    // Out of the scene, kept by the renderer for the next session on this map (freed there, CORE-33).
    this.renderer.mapMeshes.release();
    this.daylight.dispose();
    this.physics.dispose();
    this.renderer.setZoom(1);
  }

  /**
   * Creates both teams at the map's spawns for round 1 (each team at its end, see placeTeams): the local player
   * plus bot teammates on Blue, and Orange bots. Returns the player.
   */
  private spawnRoster(map: MapData, seed: number): Character {
    const [size, opposing] = this.teamSizes();
    if (!this.extraction) {
      for (const [end, spawns] of map.spawns.entries()) {
        if (spawns.length < size) throw new Error(`Map ${map.name} needs ${size} spawns at end ${end}`);
      }
    }
    let id = PLAYER_ID;
    // Bots roll only from what is offered: dev gear only with Dev content on (M35).
    const botPool = contentPool(GAME_POOL, this.setup.devContent);
    // Under the factory kit rule (M39) nobody rolls a kit: everyone carries LOADOUT as it comes.
    const rolls = BOT_LOADOUTS[this.setup.difficulty] === 'random' && !this.setup.rules.factoryKit;
    // Now and then, on a difficulty that rolls kits, one opponent carries a chase replica the player owns (M32).
    const opponents = TEAMS.flatMap((_, team) => (team === PLAYER_TEAM ? [] : Array.from({ length: opposing }, (_, i) => PLAYER_ID + team * size + i)));
    const carrier = rolls ? chaseCarrier(botPool, this.setup.chaseOwned ?? [], seed, opponents) : null;
    for (let team = 0; team < TEAMS.length; team++) {
      // You carry your kit; your teammates carry the default loadout as it comes, and so do the other team's bots unless
      // their difficulty rolls each one a kit of its own (M29b).
      const rolled = team !== PLAYER_TEAM && rolls;
      const members = team === PLAYER_TEAM ? size : opposing;
      for (let i = 0; i < members; i++, id++) {
        if (id === PLAYER_ID) this.state.characters.push(createCharacter(id, vec3(), 0, this.loadout, team));
        else if (rolled) this.state.characters.push(this.underRules(chaseReady(kittedCharacter(id, team, randomKit(botPool, carriedLoadout(LOADOUT, id, carrier), botKitSeed(seed, id), BOT_PART_CHANCE[this.setup.difficulty])), carrier)));
        else this.state.characters.push(createCharacter(id, vec3(), 0, this.botLoadout, team));
      }
    }
    if (this.extraction) startRun(this.state.round, this.state.characters, this.ctx.round);
    else {
      placeTeams(this.state.round, this.state.characters, this.ctx.round);
      for (const c of this.state.characters) respawnCharacter(c);
    }
    for (const c of this.state.characters) this.physics.addCharacter(c);
    return this.state.characters[0]!;
  }

  /** Players per team, yours first: equal sides, or in Extraction your squad against the map's opponents in play. */
  private teamSizes(): [number, number] {
    const size = this.setup.rules.teamSize;
    const x = this.setup.map.extraction;
    return this.mode === 'extraction' && x ? [size, x.baseOpponents + size] : [size, size];
  }

  /**
   * A bot with a rolled kit under the match's replica rules (M39): each replica held on semi and/or on realcap
   * magazines (the standard one fitted). Once, as the match is built; the bot itself when no rule applies.
   */
  private underRules(c: Character): Character {
    const rules = this.setup.rules;
    if (!rules.semiAutoOnly && !rules.realcap) return c;
    const a = c.armament;
    for (let i = 0; i < a.replicas.length; i++) {
      a.replicas[i] = replicaUnderRules(a.replicas[i]!, rules);
      // Semi only resets the selector; realcap alone keeps it (a chase carrier stays on auto, chaseReady).
      if (rules.semiAutoOnly) a.modes[i] = a.replicas[i]!.defaultFireMode;
    }
    if (rules.realcap) fitParts(a, a.parts.map((p) => ({ ...p, magazine: REALCAP.magazine })));
    return c;
  }

  /**
   * Fits the picked optic, hop-up dials, BB weights, grips and magazines to the player's replicas (fresh magazines of
   * the picked kind). A direct sim-state change, between rounds.
   */
  private fitPickedLoadout(): void {
    const kit = this.kit;
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
      // Back at the insertion after a hit (Extraction): looking the way its spawn faces.
      if (e.type === 'respawned' && e.characterId === this.player.id) this.input.resetView(this.player.spawnYaw);
    }
    // Extraction: your bot teammates follow you unless you order otherwise (ai/squadFollow.ts).
    if (this.extraction) this.squadFollow.update(this.bots, this.player, this.state.characters, this.state.events, this.state.round.phase === 'live');
  }

}

/** Per team, the bots' tuning: your team's bots at the teammates' difficulty, the other team's at the opponents' (M20). */
function teamBotConfigs(playerTeam: number, setup: MatchSetup): BotConfig[] {
  return TEAMS.map((_, team) => botConfig(team === playerTeam ? setup.teammateDifficulty : setup.difficulty));
}
