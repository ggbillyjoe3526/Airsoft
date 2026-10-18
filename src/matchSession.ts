import type { Group } from 'three';
import { AdaptiveRun } from './ai/adaptiveRun';
import { BotController } from './ai/botController';
import { CalloutDirector } from './ai/callouts';
import { drawIdentities } from './ai/botRoster';
import type { BotIdentity } from './ai/personality';
import { SquadFollow } from './ai/squadFollow';
import { lowCoverBlocks, tallCoverBlocks } from './ai/cover';
import { bodyPoint, sightConditionsOf } from './ai/perception';
import { createPing } from './ai/pings';
import type { SfxSetup } from './audio/sfx';
import { FULL_MOTION, type MotionScale, motionScale } from './config/accessibility';
import { BALLISTICS, WIND } from './config/ballistics';
import { CALLOUT_LINES } from './config/calloutLines';
import { BOT_BEHAVIOUR, BOTS, type BotConfig, botConfig, type Difficulty, difficultyAtLeast } from './config/bots';
import { EXTRACTION, homeTeamCap } from './config/extraction';
import { FOOTSTEPS } from './config/footsteps';
import type { HitConfig } from './config/hits';
import { type DevSettings, devCheating } from './config/dev';
import { MAG_SHARE } from './config/magShare';
import { countsForRecords, hitRulesFor, kitUnderRules, type MatchRules, recordsKeyOf, roundRulesFor, type RulesetId, standardRules } from './config/matchRules';
import type { MatchMode } from './config/modes';
import { BODY, MOVEMENT } from './config/movement';
import { NAV } from './config/nav';
import { perfScriptFor } from './config/perfScript';
import { PHYSICS } from './config/physics';
import { PINGS } from './config/pings';
import { type LightingPreset, matchOverScreenDelay, type QualitySettings } from './config/render';
import { LOADOUT, REALCAP, type ReplicaConfig, replicaUnderRules } from './config/replicas';
import { TORCHES } from './config/torches';
import { botKitSeed, botLight, fitBotLight, kittedBot, pickBotKit } from './pool/botKit';
import { GAME_BOT_KITS } from './pool/gameBotKits';
import { contentPool } from './pool/contentPool';
import { rollRunCases } from './pool/caches';
import { GAME_POOL } from './pool/gamePool';
import { bbGlowFor, kitPaint, type PlayerKit } from './pool/loadoutModel';
import type { LookSettings } from './config/look';
import { SIM, SIM_DT, SKIP_ROUND } from './config/sim';
import { idleCommand, type SkipOffer, skipEnds, skipOffer, skipTickCap, skipTickShown } from './matchFlow';
import type { SquadCommand } from './config/squad';
import { dayColours, type TeamColours } from './config/teams';
import { BuildTiming } from './core/buildTiming';
import { caseSeed, runSeed } from './core/seed';
import { figureCrowd, playerArms } from './render/figures/figureMix';
import { EventLog } from './core/eventLog';
import { advanceStepper, createStepper, stepperAlpha } from './core/fixedStepper';
import type { PlayerInput } from './input/playerInput';
import type { MapData } from './map/mapTypes';
import { playableMode } from './map/playableMode';
import { buildNavGrid, type NavGrid } from './nav/navGrid';
import { PhysicsWorld } from './physics/physicsWorld';
import { LeanViewEase, updateFirstPersonCamera } from './render/match/cameraRig';
import { CombatPresentation } from './render/match/combatPresentation';
import { ContactShadows } from './render/light/contactShadows';
import { bakedLightFor, bakedLightMode } from './render/light/bakedLight';
import { addLighting, type Daylight } from './render/light/lighting';
import { resolveLighting } from './render/light/lightingPreset';
import { mapLookOf } from './render/field/mapMeshes';
import { MatchPresentation } from './render/match/matchPresentation';
import type { ProbeGrid } from './render/light/probeGrid';
import { TorchBeams } from './render/light/torchBeams';
import type { Renderer } from './render/renderer';
import { canAimDownSights } from './sim/aiming';
import { fitOptics, fitParts, setBbWeights, setHopUps } from './sim/armament';
import { type Character, createCharacter, respawnCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { isInPlay } from './sim/elimination';
import { createRunContext, type ExtractionContext, haulTotals, reserveSize, runFinds, runHaul } from './sim/extraction';
import { placeTeams, runOutRound, startRun } from './sim/round';
import { byTeam, rosterTeams } from './sim/roster';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { partsUnder } from './sim/torch';
import { createWind } from './sim/wind';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import { MatchStats } from './stats/matchStats';
import { matchStanding, MatchTakes, type NoXp } from './stats/settleMatch';
import { type MatchResult, runResultOf } from './stats/records';
import type { MatchOutcome } from './progress/xp';
import type { NotCounted } from './ui/recordsView';
import { pauseText, resultText, type ResultText } from './ui/matchStopText';
import { rosterNames, rosterTags, statsBlocks, type TeamBlock } from './ui/statsRows';
import { MagHandoff, putOnLastMag } from './magHandoff';
import type { Session } from './session';
import { type HudPrefs, motionReduced } from './settings/hudPrefs';

const PLAYER_ID = 0;
/** The colour figures glow in someone's torch beam (M33h): the torches' cool white. */
const TORCH_LIFT_COLOUR = TORCHES.weaponTorch.colour;
/** An Extraction run's squad is Alpha (M98: the run has no "Your team" pick); the home team is Beta. */
const RUN_SQUAD_TEAM = 0;

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
   * The player's kit from the Loadout screen (M26b): each gear slot's replica as carried (power source, laser and barrel
   * worked in), its optic, parts, hop-up dial and BB weight. Bots carry kits of their own (bot-kits.md, BG1).
   */
  kit: PlayerKit;
  /** Dev content is on (M35): bots may carry dev gear (config/content.ts). */
  devContent: boolean;
  /**
   * The match uses dev content (M35, newGamePicks.ts matchUsesDev: its picks, the player's kit, or gear the opponents
   * may carry): it stays out of the records and gives no XP.
   */
  devContentUsed: boolean;
  /** The team colours picked on Settings → Accessibility (M18b): the figures, the flag and your armband. */
  teamColours: TeamColours;
  /**
   * The Match screen's "Your team" (M98, config/teams.ts teamOfPick): 0 Alpha, 1 Beta. An Extraction run ignores it
   * (the squad is Alpha). Absent: Alpha.
   */
  playerTeam?: number;
  /** Settings → Look (G1): robots and Realistic colours. Absent: their defaults. */
  look?: LookSettings;
  /**
   * Adaptive difficulty (AD1, the Dev tab): the rating the other team starts at, the highest on offer and the Opponents
   * level it grew from; `difficulty` is then the level the rating plays as (ai/adaptiveSkill.ts levelAt). Absent, or in
   * an Extraction run: the fixed levels.
   */
  adaptive?: AdaptiveSetup;
}

/** Adaptive difficulty's start for a match (MatchSetup.adaptive). */
export interface AdaptiveSetup {
  rating: number;
  top: number;
  from: Difficulty;
}

/** What an Extraction run found, for the summary (MatchSession.runFinds). */
export interface RunFinds {
  extracted: boolean;
  found: { xp: number };
  out: { xp: number };
}

/**
 * One match on one map: the field's meshes and lighting, physics, the bots' navigation, the simulation and
 * everything drawn and heard in it. Built when Play is pressed and disposed when the player leaves the match
 * (Quit, or New Game after it), so the next Play can load another map with another setup.
 * The app around it (renderer, input, menus) outlives it; see Game.
 */
export class MatchSession implements Session {
  readonly kind = 'match';
  readonly state: GameState;
  readonly player: Character;
  readonly combat: CombatPresentation;
  readonly match: MatchPresentation;
  readonly mode: MatchMode;
  private readonly loadout: readonly ReplicaConfig[];
  /**
   * The player's kit under the match's rules (M39 kitUnderRules: the factory kit, semi only, realcap), fitted each round;
   * the HUD's replica pictures are drawn from it (BP3), not from the Loadout's own kit.
   */
  readonly kit: PlayerKit;
  /** The bots' factory loadout under the match's rules (LOADOUT itself when none apply). */
  private readonly botLoadout: readonly ReplicaConfig[];
  /** Every player's numbers for the match and the round (M19). */
  readonly stats: MatchStats;
  private readonly physics: PhysicsWorld;
  private readonly nav: NavGrid;
  private readonly bots: BotController;
  /** What the bots call to their team (CL1): read off them after each tick; shown and heard while Settings › HUD › Callouts is on. */
  private readonly callouts: CalloutDirector;
  /** Your side of the magazine hand-off (MG1): the Mag key, the toss it names, the HUD's line. */
  private readonly mags: MagHandoff;
  /** The HUD and accessibility preferences' version this session last showed (syncPrefs). */
  private prefsSeen = -1;
  /** Your last ping (PG1), and when you placed it: one at a time, at most one per PINGS.minGap. */
  private readonly playerPing = createPing();
  private pingedAt = Number.NEGATIVE_INFINITY;
  /** Where a teammate's mark of a sighting goes (PG1): the enemy's chest. */
  private readonly markPoint = vec3();
  private readonly daylight: Daylight;
  /** The map's light as resolved (M33f): a night preset gives the bots their torches and draws the beams (M33h). */
  private readonly lighting: LightingPreset;
  /** The map's baked bounce light (G6, render/light/bakedLight.ts), or null when it has none. */
  private readonly probes: ProbeGrid | null;
  /** The map's built meshes (G9: the dressing's neon flicker is a uniform on its junk mesh). */
  private mapGroup: Group;
  /** The weapon torches drawn (M33h): nothing by day, or in a match where nobody carries one. */
  private readonly torches: TorchBeams;
  /** A soft dark disc on the floor under every player (audit section 5, F5), on every preset. */
  private readonly contact: ContactShadows;
  private readonly stepper = createStepper(SIM_DT, SIM.maxTicksPerFrame);
  private readonly commands = new Map<number, PlayerCommand>();
  private readonly playerCommand = createCommand();
  /** Where your teammates hold, while they do (scratch for the HUD marker). */
  private readonly holdSpot = vec3();
  /** Reduced motion (Settings → Accessibility): the lean's roll here, the held replica's motion in `combat`. */
  private motion: MotionScale = FULL_MOTION;
  /** The lean your view shows: a wall's cut eased a little (KI1). */
  private readonly leanView = new LeanViewEase();
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
  /** Dev settings › End the round now was used (M90): it counts whenever it was pressed, played or not (BP3). */
  private devEndedRound = false;
  /**
   * Adaptive difficulty (AD1): the other team's rating through this match, or null when it plays a fixed level. Its
   * bots take the drifted skill after each round.
   */
  readonly adaptive: AdaptiveRun | null;
  /** Dev help other than adaptive difficulty itself (as devAssisted): such a match doesn't move the saved rating. */
  private otherDevHelp = false;
  /** A character's team by id, for adaptive difficulty's hit counts. */
  private readonly teamOf = (id: number): number | undefined => this.state.characters.find((c) => c.id === id)?.team;
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
    /** The HUD and accessibility preferences (settings/hudPrefs.ts), read by reference: a change shows as play runs again. */
    private readonly prefs: HudPrefs,
  ) {
    const map = setup.map;
    this.kit = kitUnderRules(setup.kit, setup.rules);
    this.loadout = this.kit.slots.map((s) => s.replica);
    this.botLoadout = LOADOUT.map((r) => replicaUnderRules(r, setup.rules));
    // The surface textures are the renderer's, shared by every session (audit L-04), and so are the last map's meshes,
    // kept between sessions (audit CORE-33): the same map again takes them back rather than building them.
    this.probes = bakedLightFor(map);
    this.mapGroup = renderer.mapMeshes.take(map, renderer.surfaceTexturesFor(map), mapLookOf(quality, this.probes));
    renderer.scene.add(this.mapGroup);
    this.build.phase('map meshes');
    if (renderer.mapMeshes.reused) this.build.notes.push('map meshes reused');
    // The map's light (M33f): its haze, exposure and environment on the renderer, set by every session so none keeps the
    // last map's; its lights, sky and light pools in the scene.
    const lighting = resolveLighting(map);
    this.lighting = lighting;
    renderer.setLighting(lighting);
    this.daylight = addLighting(renderer.scene, map, quality, lighting, () => renderer.clusteredLights);
    this.build.phase('lighting');

    this.physics = new PhysicsWorld(map, BODY, SIM_DT);
    this.build.phase('physics');
    this.nav = buildNavGrid(map, NAV);
    this.build.phase('navigation');
    // Maps without a flagpole can only be played in elimination, and those without Extraction data not in Extraction.
    this.mode = playableMode(map, setup.mode);
    this.extraction =
      this.mode === 'extraction' && map.extraction
        ? createRunContext(map.extraction, {
            squad: setup.rules.teamSize,
            seed: runSeed(seed),
            runner: PLAYER_ID,
            squadTeam: RUN_SQUAD_TEAM,
            respawnAfter: hitRulesFor(setup.rules).callTime,
            spawnLift: PHYSICS.groundRestGap,
            // The run's cases (M44), filled from pool.md's Caches table.
            cases: rollRunCases(GAME_POOL, map.extraction.cases, caseSeed(seed)),
            // The home team's waves (M45): as often as the opponents' difficulty says, out of the squad's sight.
            waveEvery: EXTRACTION.waveEvery[setup.difficulty],
            sight: { query: this.physics, body: BODY },
            deadZones: map.deadZones,
            // The home team's size by its level (Audit 2, BAL-03).
            opponents: setup.difficulty,
          })
        : undefined;
    // An Extraction run is one "round" of the map's run time (sim/round.ts); there is nothing to win twice.
    this.rounds = this.extraction && map.extraction ? { ...roundRulesFor(setup.rules), roundTime: map.extraction.runTime, winsNeeded: 1, winBy: 1 } : roundRulesFor(setup.rules);
    // With the rigged figures drawn (BD1: unless they couldn't be loaded), the legs' hit volumes follow theirs (IM8): the human's
    // legs, which the robot shares but for a couple of centimetres crouched (render/figures/riggedHitVolume.test.ts measures both),
    // with any clip the human's file lacks taken from the robot's (FigureRigs.legs).
    // Their head, chest and hips follow each figure's own upper body (HV1), the human's or the robot's (Character.figure,
    // set from the crowd below).
    const rigs = renderer.figureRigs;
    this.hits = rigs ? { ...hitRulesFor(setup.rules), figureLegs: rigs.legs, figureBodies: rigs.bodies } : hitRulesFor(setup.rules);
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
      overtimeFlag: map.overtimeFlag,
      extraction: this.extraction,
    });
    this.playerTeam = this.extraction ? RUN_SQUAD_TEAM : (setup.playerTeam ?? 0);
    this.player = this.spawnRoster(map, seed);
    this.fitPickedLoadout();
    setHopUps(this.player.armament, this.kit.hopUps);
    this.commands.set(PLAYER_ID, this.playerCommand);
    this.adaptive = setup.adaptive && !this.extraction ? new AdaptiveRun(setup.adaptive.rating, setup.adaptive.top, setup.difficulty, this.player) : null;
    this.bots = new BotController(
      this.state,
      this.state.characters.filter((c) => c !== this.player),
      this.commands,
      { query: this.physics, nav: this.nav, navSnap: NAV.snap, lanes: map.lanes, lowCover: lowCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), tallCover: tallCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), sight: sightConditionsOf(map, this.lighting.night), body: BODY, hits: this.hits, loadout: this.botLoadout, cfg: BOTS, teamCfg: teamBotConfigs(this.player.team, setup, this.adaptive), seed, insertionBerth: map.extraction?.insertionBerth, identities: this.identities },
    );
    this.callouts = new CalloutDirector(CALLOUT_LINES, seed, map.areas ?? [], !this.extraction);
    this.build.phase('simulation and bots');
    input.resetView(this.player.spawnYaw);
    // The perf harness's player (`?script=perf`) plays the script for this mode: Extraction's opens a case (M64, UI-05).
    if (input.script) input.script = perfScriptFor(this.mode);
    input.restartScript();
    // The torches (M33h), once everyone is kitted: your own takes one of the night lights on Medium and High.
    this.torches = new TorchBeams(this.state.characters, lighting, quality, this.physics, BODY, this.hits);
    renderer.scene.add(this.torches.object);
    this.daylight.reserveLights(this.torches.reserved);
    // Who the figures are drawn as (G7): humans and robots mixed from the seed when Settings › Look › Robots is on.
    const crowd = figureCrowd(seed, this.state.characters, setup.look);
    // Each character's hit volume takes the shape of the figure it is drawn as (HV1).
    this.state.characters.forEach((c, i) => (c.figure = crowd.robots[i] ? 1 : 0));
    this.combat = new CombatPresentation(renderer, container, this.state, this.player, this.loadout, MOVEMENT, this.physics, setup.teamColours.figures[this.player.team]!, SIM_DT, map, audio, (action) => input.keyName(action), prefs, quality, this.hits, bbGlowFor(this.kit, this.lighting.night), seed, kitPaint(this.kit, setup.look), playerArms(crowd, this.state.characters.indexOf(this.player), this.player.team));
    this.build.phase('replica and effects');
    // The field's own sounds (M33j): whatever New game's spare time didn't render ahead is finished here (M65, audit
    // AUD-01), so `?perf` shows what was left.
    this.combat.setLighting(lighting);
    this.combat.setMapGroup(this.mapGroup);
    this.build.phase('sound');
    this.stats = new MatchStats(this.state.characters);
    this.match = new MatchPresentation(renderer.scene, container, renderer, this.state, this.player, BODY, this.hits, this.physics, this.teamSizes(), this.rounds, this.stats, (action) => input.keyName(action), dayColours(setup.teamColours, this.lighting.night), map, renderer.figureModel, quality.figureDetail, this.extraction, crowd, renderer.replicaFiles, renderer.figureRigs);
    this.match.setHitFacts(this.bots.lastHit);
    // The "what got you" card's Auto follows the opponents' level, not your teammates' (M41).
    this.match.usePrefs(prefs, setup.difficulty);
    // A rigged figure's BBs leave its own replica's muzzle (BP4).
    this.combat.setRiggedMuzzle((c, out) => this.match.riggedMuzzle(c, out));
    this.match.setRoster(this.identities);
    const names = rosterNames(this.state.characters, this.player.id, this.identities);
    this.mags = new MagHandoff(this.player, this.bots, this.ctx, (id) => names.get(id) ?? '', () => input.keyName('askMag'));
    // Pro briefing tips on the board between rounds, when the opponents are Pro (M41).
    this.match.setProTips(difficultyAtLeast(setup.difficulty, 'pro'));
    this.match.setFigureShadows(quality.figureShadows);
    this.match.setFlagQuality(quality);
    this.match.setBakedLight(bakedLightMode(quality.bakedLight, this.probes) === 'off' ? null : this.probes);
    // Teammates only on the minimap, with no heard patches, under rules that say so (M39).
    this.match.setHeardOnMinimap(setup.rules.heardOnMinimap);
    this.contact = new ContactShadows(this.state.characters, this.hits.vanishTime);
    renderer.scene.add(this.contact.object);
    input.ordersEnabled = true;
    this.build.phase('figures, flag and HUD');
    // The scene is whole: its shaders are compiled now, not in the first frame (M63, audit REN-06), and the round waits
    // for the warm-up's draw (PF1), so nothing builds in its first moments; its first picture holds meanwhile.
    void this.combat.warmShaders(this.match.warmTargets(), this.match.warmPoses(), true).then(() => {
      this.warm = true;
    });
    this.build.phase('shaders');
  }

  /** The warm-up's draws are done (PF1): until then the round doesn't start. */
  private warm = false;

  /** The round waits for the warm-up's draws (PF1): its frames say nothing about play. */
  get warmingUp(): boolean {
    return !this.warm;
  }

  /** Dev settings › Bots hold fire (M90). */
  private botsHoldFire = false;
  /** Dev settings › Bots run low on BBs (MG1). */
  private botsRunLow = false;
  /**
   * When this round's bots run low with that switch on (simulation time, MAG_SHARE.devLowAfter after the round starts;
   * infinite once done). Round 1 starts with the match at time 0, with no roundStart event.
   */
  private runLowAt: number = MAG_SHARE.devLowAfter;
  /** A Skip to next round under way (M83): the ticks run so far and the most it may run. */
  private skip: { ticks: number; cap: number } | null = null;

  /** Extraction's run context (the insertion, the home team's starts, the exits); undefined in the other modes. */
  readonly extraction: ExtractionContext | undefined;
  /** The team you play on (M98): the pick, or Alpha in an Extraction run. Everything about "your team" reads player.team. */
  private readonly playerTeam: number;
  /** Who each bot is this match (BN1): its roster name and personality, by character id, drawn from the seed. */
  private identities: ReadonlyMap<number, BotIdentity> = new Map();
  /** Extraction: your bot teammates follow you unless you order otherwise (ai/squadFollow.ts). */
  private readonly squadFollow = new SquadFollow();

  /** The last shots, hits, rounds and bot mode changes, for a report (IM7). */
  readonly eventLog = new EventLog();

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
    // The round starts once the warm-up is done (PF1): the frames meanwhile show the field, standing still, and the view
    // stays on the spawn's, so a mouse moved during the wait doesn't turn you as the round opens (bug pass BP6a).
    if (!this.warm) {
      this.input.resetView(this.player.spawnYaw);
      return 0;
    }
    // Skipping the round (M83): clicks, inspects and orders made meanwhile are dropped; the ticks run flat out.
    if (this.skip) {
      this.input.clearLatches();
      return this.fastForward();
    }
    // A round's end (Dev 6 playtest item 33): once WON or LOST has been up a moment, a click moves on.
    if (this.match.resultContinuable && this.input.takeClick()) this.continueFromResult();
    else if (this.match.spectating && this.input.takeClick()) this.match.nextSpectateTarget();
    if (this.input.takeInspect() && p.status === 'alive') this.combat.inspect();
    const order = this.input.takeOrder();
    if (order) this.giveOrder(order);
    if (this.input.takePing()) this.placePing();
    const ticks = advanceStepper(this.stepper, dt);
    // Dev settings › Spectate any bot (M90): while you watch a bot you stand still, and your clicks change who is watched.
    const watching = this.match.watchingBots && p.status === 'alive';
    for (let i = 0; i < ticks; i++) {
      if (watching) idleCommand(this.playerCommand, this.input.yaw, this.input.pitch);
      else this.input.fillCommand(this.playerCommand);
      this.mags.fill(this.playerCommand);
      this.tick(true);
    }
    return ticks;
  }

  /**
   * One simulation tick with the player's command already filled: the bots think, the simulation steps, and what
   * follows each tick runs (`shown`: its presentation too). Watched play and a skipped round (M83) both run this, so a
   * skip plays the round exactly as watching it would have.
   */
  private tick(shown: boolean): void {
    this.bots.think(this.state, SIM_DT);
    // Dev settings › Bots hold fire (M90): every bot's trigger stays up whatever its brain decided.
    if (this.botsHoldFire) for (const b of this.bots.bots) this.commands.get(b.character.id)!.fire = false;
    stepSimulation(this.state, this.commands, this.ctx, SIM_DT);
    this.afterTick(shown);
  }

  /** Skip to next round (M83): what you can skip to now (matchFlow.ts skipOffer), or null; null while a skip runs. */
  get skipOffer(): SkipOffer {
    return this.skip ? null : skipOffer(this.state.round, this.rounds, this.player);
  }

  /** A skip is running: the rest of the round is being played out (the HUD says so). */
  get skipping(): boolean {
    return this.skip !== null;
  }

  /**
   * Skip to next round (M83): from the next frame the rest of the round is simulated at once, as watched, until the next
   * round starts or the match is decided; the records and the pay count it as any round. False where it isn't offered.
   */
  beginSkip(): boolean {
    if (this.skipOffer === null) return false;
    this.skip = { ticks: 0, cap: skipTickCap(this.rounds) };
    this.combat.skipBegins();
    return true;
  }

  /**
   * A click at a round's end (Dev 6 playtest item 33): between rounds, the pause before the next is played out at once
   * (as a skip, so the bots, the stats and the round's events run exactly as they would have); once the match is
   * decided, the result screen comes on the next frame instead of after the whistles.
   */
  private continueFromResult(): void {
    this.match.resultContinued();
    this.input.holdFireUntilReleased();
    if (this.state.round.phase === 'matchOver') {
      if (!Number.isNaN(this.matchOverAt)) this.matchOverAt = this.state.time - matchOverScreenDelay();
      return;
    }
    if (this.skip) return;
    this.skip = { ticks: 0, cap: skipTickCap(this.rounds) };
    this.combat.skipBegins();
  }

  /**
   * One frame of a skip: ticks as fast as SKIP_ROUND's slice of the frame allows, the player's command left idle (you are
   * out: nothing reads it). Ends on the tick the next round starts or the match is decided, or at the cap (a stall that
   * should never come), after which play simply carries on as watched.
   */
  private fastForward(): number {
    const skip = this.skip!;
    const until = performance.now() + SKIP_ROUND.frameBudgetMs;
    let ticks = 0;
    do {
      for (let i = 0; i < SKIP_ROUND.ticksPerCheck; i++) {
        idleCommand(this.playerCommand, this.input.yaw, this.input.pitch);
        this.tick(false);
        ticks++;
        if (skipEnds(this.state.events) || ++skip.ticks >= skip.cap) {
          this.skip = null;
          return ticks;
        }
      }
    } while (performance.now() < until);
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
      // A named ruleset has its own cells (M39); Skirmish the plain ones, as before. An Extraction run plays the map's
      // own rules whatever the ruleset, so it always goes in the plain cell (M47).
      const ruleset = this.extraction ? '' : (recordsKeyOf(this.setup.ruleset) ?? '');
      return { difficulty: this.setup.difficulty, mode: this.mode, ...(ruleset ? { ruleset } : {}), won: r.matchWinner === this.player.team, hits: mine.hits, bbsFired: mine.bbsFired, ...this.runResult() };
    });
  }

  /** An Extraction run for the records (M47): what you got out with and how long the run took; nothing in the other modes. */
  private runResult(): Pick<MatchResult, 'run'> {
    if (!this.extraction) return {};
    return { run: runResultOf(runHaul(this.state.round.run), this.rounds.roundTime - this.state.round.clock) };
  }

  /** Whether this match gives XP at all (LV1): not with Dev settings that change play (M24), nor with dev content (M35). */
  get givesXp(): boolean {
    return this.noXpReason === null;
  }

  /** Why it gives none: Dev settings that change play, dev content, or null when it gives XP. */
  get noXpReason(): NoXp | null {
    return this.standing().noXp;
  }

  /**
   * The decided match for its XP (LV1), once per match: custom rules give XP too (scaled by levels.md), but a match
   * played with Dev settings that change play (M24) gives none, so null then.
   */
  takeOutcome(): MatchOutcome | null {
    const r = this.state.round;
    return this.takes.outcome(r.phase === 'matchOver', this.givesXp, () => ({
      won: r.matchWinner === this.player.team,
      // Rounds won with you in them (audit POOL-08), and the teammates' difficulty when you have any.
      roundsWon: this.stats.roundsContributed(this.player.id),
      hits: this.stats.matchOf(this.player.id).hits,
      winsNeeded: this.rounds.winsNeeded,
      difficulty: this.setup.difficulty,
      ...(this.rounds.teamSize > 1 ? { teammateDifficulty: this.setup.teammateDifficulty } : {}),
      // Custom rules give no more than ×1.5 (M39): Pro's ×2 is for the named rulesets played as they are.
      ...(this.customRules ? { customRules: true } : {}),
      // Extraction (M44): the run gives the XP you got out with and your hits (M47).
      ...(this.extraction ? { extraction: true } : {}),
      ...this.haulOutcome(),
    }));
  }

  /** The haul for the match's outcome: present only for a run you extracted from carrying something. */
  private haulOutcome(): Pick<MatchOutcome, 'haul'> {
    if (!this.extraction) return {};
    const haul = haulTotals(runHaul(this.state.round.run));
    return haul.xp > 0 ? { haul } : {};
  }

  /**
   * Extraction's finds for the summary (M44): whether you got out, everything you found this run and what you got out
   * with; null in the other modes.
   */
  runFinds(): RunFinds | null {
    if (!this.extraction) return null;
    const run = this.state.round.run;
    return { extracted: run.outcome === 'extracted', found: haulTotals(runFinds(run)), out: haulTotals(runHaul(run)) };
  }

  /** Every player's numbers over the match, your team first, for the end-of-match summary. */
  summaryBlocks(): TeamBlock[] {
    const names = rosterNames(this.state.characters, this.player.id, this.identities);
    return statsBlocks(this.state.characters, names, (id) => this.stats.matchOf(id), this.state.round.score, this.player, false, this.extraction !== undefined, this.state.round.run.reserve, rosterTags(this.identities));
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
    this.syncPrefs();
    const alpha = stepperAlpha(this.stepper); // frozen while paused, so the view holds still
    // The camera shows where BBs actually go: view pitch plus the replica's recoil kick.
    const pitch = this.input.pitch + this.player.armament.recoil;
    const lean = this.leanView.update(this.player, BODY, this.hits, alpha, dt);
    updateFirstPersonCamera(this.renderer.camera, this.player, BODY, this.hits, alpha, this.input.yaw, pitch, this.motion.leanRoll, lean);
    this.match.setSkipLabel(this.skip ? 'skipping' : this.skipOffer);
    const spectating = this.match.frame(this.renderer.camera, alpha, dt, this.input.yaw, boardHeld);
    // Dev settings › Bot intentions (M90): a label over each bot, from where the camera is now.
    this.match.showBotIntents(this.bots.bots, this.renderer.camera, alpha);
    // The torches from where the view is (M33h): yours from your eyes, or the watched player's.
    this.torches.update(this.renderer.camera, spectating ? this.match.watchedCharacter : this.player, !spectating, alpha);
    if (this.torches.active) this.match.setTorchLift(this.torches.lit, TORCH_LIFT_COLOUR);
    this.contact.update(alpha, spectating ? -1 : PLAYER_ID);
    const holding = this.bots.holdSpot(this.player, this.holdSpot);
    const order = this.bots.orderOf(this.player);
    this.match.showSquadOrder(order, holding ? this.holdSpot : null, this.renderer.camera, dt);
    const mag = this.mags.frame(this.state.time, this.state.round.phase === 'live' && !this.match.watchingBots);
    this.match.showOrderWheel(this.input.wheelOpen, this.input.wheelPointer, order, this.input.wheelSelect, mag.wheel);
    this.match.showMagHandoff(mag);
    this.match.showMinimap(holding ? this.holdSpot : null);
    // The vault prompt (M102) only from your own eyes.
    this.combat.frame(dt, alpha, this.input.yaw, pitch, !spectating);
    // High's shadow map follows the view (REN-08), the spectator's too.
    this.daylight.follow(this.renderer.camera, dt);
    this.combat.render(!spectating);
  }

  /**
   * The HUD and accessibility preferences changed since this session last showed them (or it never has): the
   * presentations and the session take them all, before play runs again and on each frame drawn (the system's reduce
   * motion setting can change in play).
   */
  private syncPrefs(): void {
    if (this.prefsSeen === this.prefs.version) return;
    this.prefsSeen = this.prefs.version;
    this.motion = motionScale(motionReduced(this.prefs));
    this.combat.applyPrefs();
    this.match.applyPrefs();
    this.mags.setCounts(this.prefs.ammoCounter === 'on');
  }

  /**
   * New quality settings (Settings → Graphics): the sun's shadows, the surfaces' textures and relief, the figures'
   * shading, the dust in the air and the held replica's sheen follow them at once. Call after Renderer.setQuality (the
   * renderer's part, which draws a new texture size when the map asks for it here).
   */
  setQuality(quality: QualitySettings): void {
    this.daylight.setQuality(quality);
    this.torches.setQuality(quality);
    this.daylight.reserveLights(this.torches.reserved);
    this.mapGroup = this.renderer.mapMeshes.restyle(this.renderer.surfaceTexturesFor(this.setup.map), mapLookOf(quality, this.probes));
    this.combat.setMapGroup(this.mapGroup);
    this.match.setFigureShadows(quality.figureShadows);
    this.match.setBakedLight(bakedLightMode(quality.bakedLight, this.probes) === 'off' ? null : this.probes);
    this.match.setFlagQuality(quality);
    this.match.setFigureDetail(quality.figureDetail);
    this.combat.setQuality(quality);
  }

  /** The graphics context is back after a loss: what was rendered once into a render target is rendered again. */
  contextRestored(): void {
    this.combat.contextRestored();
    // A WebGL2 renderer after a lost WebGPU device draws no clustered lights: the pools drop their extra lamps (BP3).
    this.daylight.reserveLights(this.torches.reserved);
    this.torches.contextRestored();
  }

  /**
   * The Dev settings that change play (M24): applied to you at once; any of them on, now or earlier in the match, keeps
   * it out of the records.
   */
  setDevCheats(cheats: DevSettings): void {
    this.player.armament.bottomless = cheats.bottomlessMags;
    this.player.ghost = cheats.ghost;
    this.botsHoldFire = cheats.botsHoldFire;
    this.botsRunLow = cheats.botsRunLow;
    this.match.setWatchingBots(cheats.spectateBots);
    this.match.setBotIntents(cheats.botIntent);
    // Before play begins (a match built by a Play whose mouse lock was refused) only what applies now counts (bug pass).
    // A round ended from Dev settings stays counted however the switches are set afterwards (BP3).
    if (!this.played) this.devAssisted = this.devEndedRound || devCheating(cheats);
    else if (devCheating(cheats)) this.devAssisted = true;
    // The same, without adaptive difficulty itself: help that would teach it the wrong lesson (AD1).
    const others = devCheating({ ...cheats, adaptiveDifficulty: false });
    if (!this.played) this.otherDevHelp = this.devEndedRound || others;
    else if (others) this.otherDevHelp = true;
  }

  /** Dev settings › Bots run low on BBs (MG1): once a round, MAG_SHARE.devLowAfter in, one bot a team on its last magazine. */
  private runBotsLow(): void {
    if (this.state.time < this.runLowAt) return;
    this.runLowAt = Number.POSITIVE_INFINITY;
    if (this.botsRunLow && this.state.round.phase === 'live') putOnLastMag(this.bots.bots, this.state.round.number);
  }

  /**
   * Adaptive difficulty at the match's end (AD1): the rating it started at, and the next match's (null when other Dev
   * help changed this one, so it learns nothing). Null when the match plays a fixed level or isn't decided.
   */
  adaptiveResult(): { start: number; next: number | null } | null {
    const r = this.state.round;
    if (!this.adaptive || r.phase !== 'matchOver') return null;
    const helped = this.otherDevHelp || this.devEndedRound;
    return { start: this.adaptive.start, next: helped ? null : this.adaptive.next(r.matchWinner === this.player.team) };
  }

  /**
   * Dev settings › End the round now (M90): the live round's clock (and any overtime, the flag's or Elimination's overtime
   * flag) is run out, so the next tick ends it as on time, by the mode's own rule. The match stays out of the records.
   * False with no live round.
   */
  endRoundNow(): boolean {
    const r = this.state.round;
    if (r.phase !== 'live') return false;
    runOutRound(r, this.rounds);
    this.devEndedRound = true;
    this.devAssisted = true;
    return true;
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

  setPlaying(playing: boolean): void {
    if (playing) {
      this.played = true;
      this.syncPrefs();
    }
    this.combat.setPlaying(playing);
    this.match.setPlaying(playing);
  }

  dispose(): void {
    this.combat.dispose();
    this.match.dispose();
    this.contact.dispose();
    this.torches.dispose();
    // Out of the scene, kept by the renderer for the next session on this map (freed there, CORE-33).
    this.renderer.mapMeshes.release();
    this.daylight.dispose();
    this.physics.dispose();
    this.renderer.setZoom(1);
  }

  /**
   * Creates both teams at the map's spawns for round 1 (each team at its end, see placeTeams): the local player
   * plus bot teammates on the picked team, then the other team's bots (sim/roster.ts). Returns the player.
   */
  private spawnRoster(map: MapData, seed: number): Character {
    const [size, opposing] = this.rosterSizes();
    if (!this.extraction) {
      for (const [end, spawns] of map.spawns.entries()) {
        if (spawns.length < size) throw new Error(`Map ${map.name} needs ${size} spawns at end ${end}`);
      }
    }
    // You (id 0) and your teammates first, on the team you picked; then the other team (M98).
    const teams = rosterTeams(this.playerTeam, size, opposing);
    // Who the bots are (BN1): a roster name each, playing that name's personality, from the match's seed.
    this.identities = drawIdentities(seed, teams.flatMap((team, id) => (id === PLAYER_ID ? [] : [{ id, team }])));
    // Bots pick only from what is offered: dev gear only with Dev content on (M35).
    const botPool = contentPool(GAME_POOL, this.setup.devContent);
    // Under the factory kit rule (M39) nobody carries a kit: everyone carries LOADOUT as it comes.
    const kitted = !this.setup.rules.factoryKit;
    for (const [id, team] of teams.entries()) {
      // You carry your kit; your teammates carry the default loadout as it comes (M29b), and each of the other team's
      // bots picks its own kit from bot-kits.md by the difficulty's weights, leaning to the kits that suit its
      // personality (BG1), seeded so a match replays them.
      const personality = this.identities.get(id)?.personality ?? null;
      const kit = id !== PLAYER_ID && team !== this.playerTeam && kitted ? pickBotKit(GAME_BOT_KITS, this.setup.difficulty, botPool, botKitSeed(seed, id), personality) : null;
      if (id === PLAYER_ID) this.state.characters.push(createCharacter(id, vec3(), 0, this.loadout, team));
      else if (kit) this.state.characters.push(this.underRules(kittedBot(id, team, botPool, kit)));
      else this.state.characters.push(createCharacter(id, vec3(), 0, this.botLoadout, team));
    }
    // On a night field every bot carries the offered torch (M33h): by rule, never part of a kit, so seeded kits don't shift.
    // Not under the factory kit rule (M39): everyone carries LOADOUT as it comes.
    if (this.lighting.night && !this.setup.rules.factoryKit) {
      const light = botLight(botPool);
      for (const c of this.state.characters) if (c.id !== PLAYER_ID) fitBotLight(c, botPool, light);
    }
    if (this.extraction) startRun(this.state.round, this.state.characters, this.ctx.round);
    else {
      placeTeams(this.state.round, this.state.characters, this.ctx.round);
      for (const c of this.state.characters) respawnCharacter(c);
    }
    for (const c of this.state.characters) this.physics.addCharacter(c);
    return this.state.characters[0]!;
  }

  /**
   * Characters per team index (the scoreboard's pips): equal sides, or in Extraction your squad against the home team
   * with its reserve (BP3: the reserve had no pip; the scoreboard hides it until it joins).
   */
  private teamSizes(): [number, number] {
    const [mine, theirs] = this.rosterSizes();
    return byTeam(this.playerTeam, mine, theirs);
  }

  /** Players in play on your side and on theirs. */
  private sidesInPlay(): [number, number] {
    const size = this.setup.rules.teamSize;
    const x = this.setup.map.extraction;
    return this.mode === 'extraction' && x ? [size, homeTeamCap(x.baseOpponents, size, this.setup.difficulty)] : [size, size];
  }

  /** Characters on your side and on theirs: in Extraction the home team's reserve for the run's last part too (M45). */
  private rosterSizes(): [number, number] {
    const [size, opposing] = this.sidesInPlay();
    return [size, opposing + (this.extraction ? reserveSize(this.extraction) : 0)];
  }

  /**
   * A bot with a kit under the match's replica rules (M39): each replica held on semi and/or on realcap
   * magazines (the standard one fitted). Once, as the match is built; the bot itself when no rule applies.
   */
  private underRules(c: Character): Character {
    const rules = this.setup.rules;
    if (!rules.semiAutoOnly && !rules.realcap) return c;
    const a = c.armament;
    for (let i = 0; i < a.replicas.length; i++) {
      a.replicas[i] = replicaUnderRules(a.replicas[i]!, rules);
      // Semi only resets the selector; realcap alone keeps it (a kitted bot stays on auto, kittedBot).
      if (rules.semiAutoOnly) a.modes[i] = a.replicas[i]!.defaultFireMode;
    }
    if (rules.realcap) fitParts(a, a.parts.map((p) => ({ ...p, magazine: REALCAP.magazine })));
    return c;
  }

  /**
   * Fits the picked optic, BB weights, grips and magazines to the player's replicas (fresh magazines of the picked
   * kind), and the weapon light only on a night preset (M33h). A direct sim-state change, between rounds. The hop-up
   * dials are set once, as the match is built: turned in play (Dev 6 playtest item 15), they stay for the match.
   */
  private fitPickedLoadout(): void {
    const kit = this.kit;
    fitOptics(this.player.armament, kit.slots.map((s) => s.optic));
    fitParts(this.player.armament, kit.slots.map((s) => partsUnder(s.parts, this.lighting.night)));
    setBbWeights(this.player.armament, kit.bbWeights);
  }

  /**
   * A squad order key (M22) or an order picked on the wheel (M23): your bot teammates' radios answer when they take it;
   * the HUD says what's in force. Team plan (`cancel`, the wheel's) sends them back to the team plan. While you are out,
   * or between rounds, it does nothing but say so.
   */
  private giveOrder(order: SquadCommand): void {
    // The Mag key's, or the wheel's Need a Mag (MG1): its own notices, not the orders' (src/magHandoff.ts).
    if (order === 'mag') {
      this.mags.press(this.state.time, this.state.round.phase === 'live' && !this.match.watchingBots);
      return;
    }
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

  /**
   * The Ping key (PG1): marks where you look (your crosshair, recoil and all) for your team, and your bot teammates take
   * it up (BotController.ping); a contact if an enemy you can see is under it. While you are out, watch bots or between
   * rounds, nothing; nor more than one per PINGS.minGap.
   */
  private placePing(): void {
    const p = this.player;
    const time = this.state.time;
    if (!isInPlay(p) || this.state.round.phase !== 'live' || this.match.watchingBots || time - this.pingedAt < PINGS.minGap) return;
    const ping = this.playerPing;
    if (!this.bots.ping(p, this.input.yaw, this.input.pitch + p.armament.recoil, time, ping)) return;
    this.pingedAt = time;
    this.match.ping(p.id, ping.kind, ping.point);
    this.combat.pingPlaced();
  }

  /**
   * This tick's callouts (CL1): a teammate's in the feed and in your ear, an enemy's as a radio click if close by. A
   * teammate's call of a sighting the director marks (PG1) pings the enemy where they are.
   */
  private sayCallouts(): void {
    const said = this.callouts;
    for (let i = 0; i < said.saidCount; i++) {
      const call = said.said[i]!;
      const speaker = this.state.characters[call.speakerId];
      if (!speaker || speaker.id !== call.speakerId) continue;
      const mate = call.team === this.player.team;
      if (mate) this.match.callout(call.speakerId, call.team, call.text);
      this.combat.radioCall(speaker, mate);
      const marked = mate && call.markId >= 0 ? this.state.characters[call.markId] : undefined;
      if (marked && marked.id === call.markId) this.match.ping(call.speakerId, 'enemy', bodyPoint(marked, this.hits, BOT_BEHAVIOUR.aimHeightFraction, this.markPoint));
    }
  }

  /** Everything that reacts to a simulation tick's events. */
  /**
   * After each tick: the stats, what the bots saw, the round's start and end, the squad. `shown`: the presentation too
   * (puffs, sounds, the hit feed and the banner); a skipped round (M83) shows only its end and the next round's start.
   */
  private afterTick(shown: boolean): void {
    this.stats.afterTick(this.state, SIM_DT);
    this.bots.observe(this.state);
    this.mags.observe(this.state.events, this.state.time, this.state.round.phase === 'live');
    this.callouts.observe(this.state, this.bots.bots);
    // Adaptive difficulty (AD1): after a round, the other team plays the next a little sharper or gentler.
    if (this.adaptive?.observe(this.state.events, this.teamOf)) this.bots.setTeamSkill(1 - this.player.team, this.adaptive.skill());
    this.eventLog.record(this.state.tick, this.state.events, this.player.id);
    this.eventLog.watchBots(this.state.tick, this.bots.bots);
    if (shown || skipTickShown(this.state.events)) {
      this.combat.afterTick();
      this.match.afterTick(this.input.yaw);
      if (this.prefs.callouts === 'on') this.sayCallouts();
    }
    for (const e of this.state.events) {
      if (e.type === 'roundStart') {
        this.input.resetView(this.player.spawnYaw);
        this.leanView.reset();
        this.fitPickedLoadout();
        this.runLowAt = this.state.time + MAG_SHARE.devLowAfter;
      }
      if (e.type === 'matchOver') this.matchOverAt = this.state.time;
      // Back at the insertion after a hit (Extraction): looking the way its spawn faces.
      if (e.type === 'respawned' && e.characterId === this.player.id) {
        this.input.resetView(this.player.spawnYaw);
        this.leanView.reset();
      }
    }
    this.runBotsLow();
    // Extraction: your bot teammates follow you unless you order otherwise (ai/squadFollow.ts).
    if (this.extraction) this.squadFollow.update(this.bots, this.player, this.state.characters, this.state.events, this.state.round.phase === 'live');
  }

}

/**
 * Per team, the bots' tuning: your team's bots at the teammates' difficulty, the other team's at the opponents' (M20),
 * or at adaptive difficulty's skill (AD1). Your teammates never adapt.
 */
export function teamBotConfigs(playerTeam: number, setup: Pick<MatchSetup, 'difficulty' | 'teammateDifficulty'>, adaptive: AdaptiveRun | null): BotConfig[] {
  const opponents = adaptive ? { ...BOT_BEHAVIOUR, ...adaptive.skill() } : botConfig(setup.difficulty);
  return byTeam(playerTeam, botConfig(setup.teammateDifficulty), opponents);
}
