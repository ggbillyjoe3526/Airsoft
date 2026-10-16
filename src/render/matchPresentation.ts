import * as THREE from 'three';
import type { Action } from '../config/controls';
import { EXTRACTION } from '../config/extraction';
import { HUD_TEXT, type SkipLabel } from '../config/hudText';
import { DEV_BOT_INTENT } from '../config/dev';
import type { Bot } from '../ai/bot';
import type { BotIdentity } from '../ai/personality';
import { BotIntentLabels, botIntentText, botRoleText } from '../ui/botIntentLabels';
import type { HitConfig, HitMarkerSettings } from '../config/hits';
import { type HitFeedMode, TEAMMATE_MARKERS } from '../config/matchInfo';
import type { BodyConfig } from '../config/movement';
import { type DetailLevel, EXIT_VISUALS, FLAG_VISUALS, HUD, type QualitySettings } from '../config/render';
import { proTip } from '../config/tutorial';
import { SQUAD_ORDERS, type SquadOrderKind, type WheelSelect } from '../config/squad';
import { cssColor, teamCss, type TeamColours } from '../config/teams';
import { areaAt } from '../map/areas';
import type { MapArea, MapData } from '../map/mapTypes';
import type { WorldQuery } from '../sim/armament';
import { type Character, eyeHeight } from '../sim/character';
import { type ExtractionContext, respawnsLeft } from '../sim/extraction';
import type { HitFacts } from '../sim/hitFacts';
import type { RoundRules } from '../sim/round';
import type { GameState } from '../sim/state';
import { type Vec3, wrapAngle } from '../sim/vec';
import type { MatchStats } from '../stats/matchStats';
import { PINGS } from '../config/pings';
import { CasePrompt } from '../ui/casePrompt';
import { FlagMarker } from '../ui/flagMarker';
import { CalloutFeed } from '../ui/calloutFeed';
import { HitFeed } from '../ui/hitFeed';
import { HitFeedback } from '../ui/hitFeedback';
import { HoldMarker } from '../ui/holdMarker';
import { MatchBoard } from '../ui/matchBoard';
import { MINIMAP } from '../config/minimap';
import { Minimap, type MinimapFrame } from '../ui/minimap';
import { HeardPlayers } from '../ui/minimapView';
import { MagPrompt, type MagView } from '../ui/magPrompt';
import { OrderWheel, wheelHint } from '../ui/orderWheel';
import { pingAlpha, PingMarkers, type ShownPing, type ShownPingKind } from '../ui/pingMarkers';
import { restartAnimation } from '../ui/restartAnimation';
import { respawnBanner, roundBanner } from '../ui/roundBanner';
import { runNews } from '../ui/runStatus';
import { Scoreboard } from '../ui/scoreboard';
import { type HeardSound, SoundCues, soundCueOf } from '../ui/soundCues';
import { type OrderNotice, SquadOrderLine } from '../ui/squadOrderLine';
import { rosterNames, rosterTags, statsBlocks } from '../ui/statsRows';
import { TeammateMarkers } from '../ui/teammateMarkers';
import { WhatGotYouCard, whatGotYouText } from '../ui/whatGotYou';
import { CharacterRenderer } from './characterRenderer';
import { NO_REPLICA_FILES, type ReplicaFiles } from './replicaFiles';
import { CaseRenderer } from './caseRenderer';
import { ExitRenderer } from './exitRenderer';
import type { FigureModel } from './externalModels';
import { FlagRenderer } from './flagRenderer';
import type { ProbeGrid } from './probeGrid';
import { EdgePins, type EdgeStep, edgeAngle, projectMarker, type ScreenMarker } from './screenMarker';
import { SpectatorCamera } from './spectatorCamera';
import type { FigureRigs } from './figureRig';
import { type FigureCrowd, HUMAN_CROWD } from './figureMix';

/** The minimap's pings while Settings › HUD › Ping markers is off: none. */
const NO_PINGS: readonly ShownPing[] = [];

/** The exit markers' colour (EXIT_VISUALS.openColor as CSS). */
const EXIT_CSS = cssColor(EXIT_VISUALS.openColor);

/** What the scoreboard over the field shows: nothing, the round just played, or the match so far. */
type BoardView = 'none' | 'round' | 'match';

/**
 * Everything about the match that isn't your own replica: other players' figures, hit feedback (hit
 * marker, being hit), spectating once you're out, round messages, in flag mode the pole and its
 * screen marker, and the match info (M19): the hit feed, teammate markers and the scoreboard over the field.
 * Reads state, events and the match stats only.
 */
export class MatchPresentation {
  private readonly characters: CharacterRenderer;
  private readonly feedback: HitFeedback;
  private readonly spectator: SpectatorCamera;
  private readonly scoreboard: Scoreboard;
  private readonly flag: FlagRenderer;
  private readonly marker: FlagMarker;
  private readonly markerAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  /** This frame's edge-pinned markers (pings, the flag, exits, the hold marker), laid out a label apart (BP6). */
  private readonly edgePins = new EdgePins();
  private readonly edgeStep: EdgeStep = { down: 0, across: 0 };
  private readonly feed: HitFeed;
  /** Your bot teammates' callouts (CL1), bottom left. */
  private readonly calloutFeed: CalloutFeed;
  private readonly board: MatchBoard;
  /** The "what got you" card (M41), whether it is on, and the record of the hit it words (the bots' controller fills it). */
  private readonly whatGotYou: WhatGotYouCard;
  private whatGotYouOn = false;
  /** Skip to next round (M83): how to skip, that a skip is under way, or nothing. */
  private skipLabel: SkipLabel = null;
  private hitFacts: HitFacts | null = null;
  /** Pro briefing tips for the board (M41): none unless the opponents are Pro. */
  private proTips = false;
  /** What the board shows now, and what its numbers were built from (redrawn only when that changes). */
  private readonly shownBoard = { view: 'none' as BoardView, version: -1, second: -1, phase: '' };
  /** The board over the field is up this frame: the markers over the field hide under it (audit UI-13). */
  private boardUp = false;
  private readonly mates: Character[];
  private readonly mateMarkers: TeammateMarkers;
  private readonly mateAnchor = new THREE.Vector3();
  private readonly mateAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  /** Dev settings › Spectate any bot and Bot intentions (M90). */
  private watchBots = false;
  private intentsOn = false;
  private readonly intents: BotIntentLabels;
  private readonly intentAnchor = new THREE.Vector3();
  private readonly intentAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  /** On-screen sound cues (Settings → Accessibility, M18b; off unless turned on). */
  private readonly soundCues: SoundCues;
  /** The squad order line (M22): read out by a screen reader only, since G4 (the order wheel shows the orders). */
  private readonly squadLine: SquadOrderLine;
  private readonly holdMarker: HoldMarker;
  private readonly holdAnchor = new THREE.Vector3();
  private readonly holdAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  /** Pings (PG1): yours and your teammates' marks, over the field and on the minimap. */
  private readonly pingMarkers: PingMarkers;
  private readonly pingAnchor = new THREE.Vector3();
  private readonly pingAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  private readonly heard: HeardSound = { kind: 'step', sourceId: -1, x: 0, z: 0, reach: 1 };
  /** The minimap (M23): the other team where last heard, from where the camera was at the last frame. */
  private readonly minimap: Minimap;
  private readonly heardPlayers = new HeardPlayers();
  private readonly minimapFrame: MinimapFrame;
  private readonly listener = { x: 0, z: 0, yaw: 0 };
  private readonly orderWheel: OrderWheel;
  /** The magazine hand-off's line under the crosshair (MG1, src/magHandoff.ts). */
  private readonly magPrompt: MagPrompt;
  /** The player the camera follows while you spectate (the middle of the minimap), as of the last frame. */
  private watched: Character | undefined;
  private readonly viewDir = new THREE.Vector3();
  /** Display names by character id ("Rook", "You"; "Alpha 2" for a bot without a roster name, BN1). */
  private names: Map<number, string>;
  /** Each bot's personality, by character id (BN1): its tag on the board and its card note ("{name} anchors: …"). */
  private tags: ReadonlyMap<number, string> = new Map();
  private cardNotes: ReadonlyMap<number, string> = new Map();
  private roundStartedAt = 0;
  /** World yaw the BB that hit you came from (see showHit), and when. */
  private hitFromYaw = 0;
  /** What the round message on screen was built from, so its text is only rebuilt when that changes. */
  private readonly shownRound = { phase: '', winner: -2, seconds: -1, number: -1, start: false, overtime: false, mode: '', respawned: false, newsAt: -1, calling: false };
  private outLabelFor = Number.NaN;
  private outLabelText = '';
  /** False while the start/pause screen or the result screen is up: the pole marker stays hidden then. */
  private playing = false;
  /** Extraction (M43): the exits in the world and their screen markers (null for an exit closed this run). */
  private readonly exits: ExitRenderer | null = null;
  private readonly exitMarkers: (FlagMarker | null)[] = [];
  private readonly exitAnchor = new THREE.Vector3();
  private readonly exitAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  /** The respawn's fade from black, and when you were last back in (the banner says so for a moment). */
  private readonly respawnFade: HTMLDivElement | null = null;
  private respawnedAt = Number.NEGATIVE_INFINITY;
  /** The run's news (M53, audit UI-02: late exits opened, a minute left), when it came, and the exits named in a tick. */
  private runNewsText = '';
  private runNewsAt = Number.NEGATIVE_INFINITY;
  private readonly exitsOpened: string[] = [];
  private readonly runInfo = { rules: EXTRACTION, respawnsLeft: 0 };
  /** Extraction (M44): the cases in the world, and the prompt under the crosshair for opening one. */
  private readonly cases: CaseRenderer | null = null;
  private readonly casePrompt: CasePrompt | null = null;

  constructor(
    scene: THREE.Scene,
    container: HTMLElement,
    private readonly view: { readonly width: number; readonly height: number },
    private readonly state: GameState,
    private readonly player: Character,
    private readonly body: BodyConfig,
    hits: HitConfig,
    query: WorldQuery,
    /** Players per team (Extraction's sides differ). */
    teamSizes: readonly number[],
    private readonly rules: RoundRules,
    private readonly stats: MatchStats,
    /** The key or button the player has on `action` now, for hints on screen. */
    keyName: (action: Action) => string,
    /** The team colours picked on Settings → Accessibility (the HUD's follow the container's CSS, see Game.play). */
    teamColours: TeamColours,
    /** The map's blocks, sloping ground, bushes and storeys, for the minimap's drawing of the field. */
    field: Pick<MapData, 'blocks' | 'terrain' | 'foliage' | 'storeys' | 'areas'> & { name?: string },
    /** The figure model, if the build has one (M25a); null draws the built-in figures. */
    figureModel: FigureModel | null = null,
    /** Player detail (QualitySettings.figureDetail, FA8); setFigureDetail changes it. */
    figureDetail: DetailLevel = 'low',
    /** Extraction's run context (M43): its exits are drawn and marked; undefined in the other modes. */
    private readonly extraction?: ExtractionContext,
    /** Which figures are robots this match and whether replicas are in Realistic colours (G7, Settings › Look). */
    crowd: FigureCrowd = HUMAN_CROWD,
    /** Replica models from files (M101, render/replicaFiles.ts), owned by the renderer: the figures' pistols take their shape. */
    replicaFiles: ReplicaFiles = NO_REPLICA_FILES,
    /** The rigged figures (BF1, render/figureRig.ts), owned by the renderer, or null: drawn ahead of the figure model. */
    figureRigs: FigureRigs | null = null,
  ) {
    this.keyName = keyName;
    // Each figure holds its own active replica (Armament.replicas): rifle or pistol pose.
    this.characters = new CharacterRenderer(state.characters, teamColours.figures, hits, figureModel, figureDetail, crowd, replicaFiles, figureRigs);
    this.flag = new FlagRenderer(teamColours.figures, rules.flag.radius, rules.overtime.reach);
    scene.add(this.characters.object, this.flag.object);
    this.feedback = new HitFeedback(container, () => keyName('fire'));
    this.scoreboard = new Scoreboard(container, teamSizes, player.team);
    this.scoreboard.setAim(extraction ? HUD_TEXT.run : HUD_TEXT.firstTo(rules.winsNeeded, rules.winBy));
    this.scoreboard.setOvertime(rules.overtime.time);
    this.marker = new FlagMarker(container);
    this.spectator = new SpectatorCamera(state.characters, player, body, query, hits);
    this.names = rosterNames(state.characters, player.id);
    this.mates = state.characters.filter((c) => c.team === player.team && c !== player);
    this.intents = new BotIntentLabels(container);
    this.mateMarkers = new TeammateMarkers(container, this.mates.map((c) => this.names.get(c.id) ?? ''), teamCss(player.team));
    this.feed = new HitFeed(container);
    this.calloutFeed = new CalloutFeed(container);
    this.board = new MatchBoard(container, true);
    this.whatGotYou = new WhatGotYouCard(container);
    this.soundCues = new SoundCues(container);
    this.squadLine = new SquadOrderLine(container);
    this.holdMarker = new HoldMarker(container, teamCss(player.team));
    this.pingMarkers = new PingMarkers(container, [player.id, ...this.mates.map((c) => c.id)], teamCss(player.team), teamCss(1 - player.team));
    this.minimap = new Minimap(container, field.blocks, cssColor(teamColours.hud[player.team]!), cssColor(teamColours.hud[1 - player.team]!), field.terrain ?? null, field.foliage ?? [], field.storeys);
    this.mapName = field.name ?? '';
    this.areas = field.areas ?? [];
    // The map and round under the minimap (G4); an Extraction run is one long round, so only the map.
    this.minimap.setCaption(HUD_TEXT.where(this.mapName, extraction ? 0 : state.round.number));
    const run = state.round.run;
    this.minimapFrame = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      mates: this.mates.map(() => ({ x: 0, y: 0, z: 0, hit: false })),
      count: 0,
      hold: null,
      flag: null,
      exits: run.exits.map((e) => ({ x: e.position.x, z: e.position.z, open: false })),
      exitCount: 0,
      time: 0,
    };
    this.orderWheel = new OrderWheel(container, teamCss(player.team), keyName);
    this.magPrompt = new MagPrompt(container, teamCss(player.team));
    if (extraction) {
      this.exits = new ExitRenderer(run, field.terrain ?? null);
      scene.add(this.exits.object);
      this.exitMarkers = run.exits.map((e) => (e.closed ? null : new FlagMarker(container, 'exit-marker')));
      this.respawnFade = document.createElement('div');
      this.respawnFade.className = 'respawn-fade';
      container.appendChild(this.respawnFade);
      this.runInfo.rules = extraction.rules;
      this.cases = new CaseRenderer(run, teamColours.figures[player.team]!);
      scene.add(this.cases.object);
      this.casePrompt = new CasePrompt(container, () => keyName('use'));
    }
  }

  private readonly keyName: (action: Action) => string;
  /** The map's name, for the minimap's caption (G4). */
  private readonly mapName: string;
  /** The map's named areas (CL1): the one you stand in shows on the minimap. */
  private readonly areas: readonly MapArea[];
  private wheelHintSelect: WheelSelect | '' = '';
  private wheelHintOn = false;
  /** The order wheel is open this frame: the hand-off's line gives way to it (its Mag item says the same). */
  private wheelOpen = false;
  private wheelHintText = '';

  /** Figures and the flag's cloth shaded by walls and containers (QualitySettings.figureShadows, REN-07). */
  setFigureShadows(on: boolean): void {
    this.characters.setReceiveShadows(on);
    this.flag.setReceiveShadows(on);
  }

  /**
   * The flagpole's look for the quality settings: its finer detail (mapDetail; audit section 5, "Flagpole and cloth")
   * and its brushed metal while the sky lights it (environment).
   */
  setFlagQuality(quality: Pick<QualitySettings, 'mapDetail' | 'environment'>): void {
    this.flag.setDetail(quality.mapDetail);
    this.flag.setEnvironmentLit(quality.environment);
  }

  /** Player detail (QualitySettings.figureDetail, FA8): the figures are built again at the new level. */
  setFigureDetail(level: DetailLevel): void {
    this.characters.setDetail(level);
  }

  /** The map's baked bounce light on the figures as they move (G6, render/bakedLight.ts), or null for none. */
  setBakedLight(grid: ProbeGrid | null): void {
    this.characters.setBakedLight(grid);
  }

  /** On-screen sound cues turned on or off (also called once as the match is built). */
  setSoundCues(on: boolean): void {
    this.soundCues.setEnabled(on);
  }

  /** The hit feed fades or keeps its lines (Settings → HUD, M24; also called once as the match is built). */
  setHitFeedMode(mode: HitFeedMode): void {
    this.feed.setMode(mode);
  }

  /** The record the bots' controller keeps of the last hit on you, which the "what got you" card words (M41). */
  setHitFacts(facts: HitFacts): void {
    this.hitFacts = facts;
  }

  /** The "what got you" card on or off (Settings → HUD, M41; also called once as the match is built). */
  setWhatGotYou(on: boolean): void {
    this.whatGotYouOn = on;
    if (!on) this.whatGotYou.clear();
  }

  /** Skip to next round (M83): what the spectating line says about skipping, set by the session each frame. */
  setSkipLabel(label: SkipLabel): void {
    this.skipLabel = label;
  }

  /** Settings › HUD › Minimap (M83; also called once as the match is built): turning with the view, or fixed north up. */
  setMinimapRotating(on: boolean): void {
    this.minimap.setRotating(on);
  }

  /** Settings › Gameplay › Hit marker (M97) and its look (also called once as the match is built). */
  setHitMarker(settings: HitMarkerSettings): void {
    this.feedback.setHitMarker(settings);
  }

  /** Pro briefing tips on the board between rounds (M41): on when the opponents are Pro. */
  setProTips(on: boolean): void {
    this.proTips = on;
  }

  /**
   * Who the bots are (BN1, as the match drew them): their roster names wherever a name shows (the hit feed, the board,
   * teammates' tags, spectating, the "what got you" card), and their personality on the board and the card. Called
   * once as the match is built.
   */
  setRoster(identities: ReadonlyMap<number, BotIdentity>): void {
    this.names = rosterNames(this.state.characters, this.player.id, identities);
    this.tags = rosterTags(identities);
    this.cardNotes = new Map([...identities].map(([id, who]) => [id, who.style.cardNote]));
    this.mates.forEach((c, i) => this.mateMarkers.rename(i, this.names.get(c.id) ?? ''));
  }

  setPlaying(playing: boolean): void {
    this.feedback.setVisible(playing);
    this.scoreboard.setVisible(playing);
    this.feed.setVisible(playing);
    this.calloutFeed.setVisible(playing);
    this.soundCues.setVisible(playing);
    this.squadLine.setVisible(playing);
    this.minimap.setVisible(playing);
    this.casePrompt?.setVisible(playing);
    this.playing = playing;
    if (!playing) {
      this.orderWheel.hide();
      this.magPrompt.show('', false);
      // The wheel key may be rebound on the pause menu: the hint names it afresh.
      this.wheelHintSelect = '';
      this.marker.hide();
      for (const m of this.exitMarkers) m?.hide();
      this.mateMarkers.hideAll();
      this.pingMarkers.hideAll();
      this.board.setVisible(false);
      this.whatGotYou.setShown(false);
      this.shownBoard.view = 'none';
    }
  }

  /** True once you've called your hit and are watching someone else. */
  get spectating(): boolean {
    return this.out || (this.watchBots && this.player.status === 'alive');
  }

  /** You've called your hit and are out of the round (spectating for real, not by Dev settings › Spectate any bot). */
  private get out(): boolean {
    const s = this.player.status;
    return s === 'walkingOff' || s === 'leaving' || s === 'out';
  }

  /** Dev settings › Spectate any bot (M90): the camera follows a bot while you are still in play. */
  get watchingBots(): boolean {
    return this.watchBots;
  }

  setWatchingBots(on: boolean): void {
    if (on === this.watchBots) return;
    this.watchBots = on;
    this.spectator.reset();
  }

  /** Dev settings › Bot intentions (M90): a label over each bot in play. */
  setBotIntents(on: boolean): void {
    this.intentsOn = on;
    if (!on) this.intents.hideFrom();
  }

  /**
   * Once per frame, after `frame` (the camera placed): each bot in play, on screen and not the one you watch, gets its
   * label (botIntentLabels.ts); the rest are hidden. Nothing while the labels are off.
   */
  showBotIntents(bots: readonly Bot[], camera: THREE.PerspectiveCamera, alpha: number): void {
    if (!this.intentsOn) return;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i]!;
      const c = b.character;
      if (!this.playing || this.boardUp || c.status !== 'alive' || c === this.watched) {
        this.intents.hide(i);
        continue;
      }
      const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
      this.intentAnchor.set(
        c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha,
        c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha + eyeHeight(crouch, this.body) + DEV_BOT_INTENT.aboveEyes,
        c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha,
      );
      const m = projectMarker(this.intentAnchor, camera, this.view.width, this.view.height, 0, this.intentAt);
      if (m.onScreen) this.intents.show(i, m.x, m.y, botRoleText(b), botIntentText(b));
      else this.intents.hide(i);
    }
    this.intents.hideFrom(bots.length);
  }

  /** Where `c`'s replica muzzle is drawn on their rigged figure (BP4), or false: CharacterRenderer.riggedMuzzle. */
  riggedMuzzle(c: Character, out: THREE.Vector3): boolean {
    return this.characters.riggedMuzzle(c, out);
  }

  /** Call after every simulation tick, while that tick's events are still in the state. */
  afterTick(cameraYaw: number): void {
    let warned = false;
    for (const e of this.state.events) {
      if (e.type === 'shot') this.characters.fired(e.characterId);
      else if (e.type === 'characterHit') {
        this.characters.flinch(e.victimId, e.direction);
        this.addFeedLine(e.victimId, e.shooterId, e.ricochet);
        if (e.victimId === this.player.id) {
          // It came from the opposite of the BB's flight direction.
          this.hitFromYaw = Math.atan2(e.direction.x, e.direction.z);
          this.feedback.showHit(wrapAngle(cameraYaw - this.hitFromYaw));
          const facts = this.hitFacts;
          if (this.whatGotYouOn && facts && facts.victimId === e.victimId && facts.time === this.state.time) {
            this.whatGotYou.set(whatGotYouText(facts, this.names.get(e.shooterId) ?? 'Someone', cameraYaw, this.cardNotes.get(e.shooterId)));
          }
        } else if (e.shooterId === this.player.id) {
          const victim = this.state.characters.find((c) => c.id === e.victimId);
          this.feedback.showHitMarker(victim?.team === this.player.team);
        }
      } else if (e.type === 'respawned' && e.characterId === this.player.id) {
        this.respawnedAt = this.state.time;
        this.whatGotYou.clear();
        this.feedback.setCalling(false);
        const fade = this.respawnFade;
        // Restarted each time, with no forced layout on the frame the camera jumps (audit UI-08).
        if (fade) restartAnimation(fade, 'on');
      } else if (e.type === 'caseOpened' && e.characterId === this.player.id) {
        const k = this.state.round.run.cases[e.case];
        if (k) this.casePrompt?.opened(k, this.state.time);
      } else if (e.type === 'caseDropped' && e.characterId === this.player.id) {
        this.casePrompt?.dropped(this.state.time);
      } else if (e.type === 'exitOpened') {
        const exit = this.state.round.run.exits[e.exit];
        if (exit) this.exitsOpened.push(exit.name);
      } else if (e.type === 'runWarning') {
        warned = true;
      } else if (e.type === 'roundStart') {
        this.roundStartedAt = this.state.time;
        this.characters.roundStarted();
        this.minimap.setCaption(HUD_TEXT.where(this.mapName, this.extraction ? 0 : e.round));
        this.whatGotYou.clear();
        this.spectator.reset();
        this.feed.roundStarted(e.round);
        this.calloutFeed.clear();
        this.pingMarkers.clear();
        this.soundCues.clear();
        this.squadLine.clear();
        this.heardPlayers.clear();
      }
      if (e.type === 'characterHit') this.heardPlayers.forget(e.victimId);
      if (soundCueOf(e, this.player, this.characterOf, this.heard)) {
        this.soundCues.add(this.heard, this.state.time);
        if (this.characterOf(this.heard.sourceId)?.team !== this.player.team) this.heardPlayers.add(this.heard, this.listener.x, this.listener.z, this.state.time);
      }
    }
    // The run's turns are said, and shown for a moment, not only written into the strip (M53, audit UI-02).
    if (this.exitsOpened.length > 0 || warned) {
      this.runNewsText = runNews(this.exitsOpened, warned);
      this.runNewsAt = this.state.time;
      this.exitsOpened.length = 0;
      this.feedback.announce(this.runNewsText);
    }
  }

  /** You pressed a squad order key and `result` is now in force (`why`: the reason if none is); see SquadOrderLine. */
  orderGiven(result: SquadOrderKind | 'none', why: OrderNotice): void {
    this.squadLine.ordered(result, why);
  }

  /**
   * Once per frame, after `frame`: the squad order your bot teammates are carrying out, and where they hold (null if
   * they don't), marked while you play.
   */
  showSquadOrder(order: SquadOrderKind | 'none', hold: Vec3 | null, camera: THREE.PerspectiveCamera, dt: number): void {
    this.squadLine.update(order, dt);
    if (!hold || !this.playing || this.spectating || this.boardUp) {
      this.holdMarker.hide();
      return;
    }
    this.holdAnchor.set(hold.x, hold.y + SQUAD_ORDERS.markerHeight, hold.z);
    const m = this.pinned(projectMarker(this.holdAnchor, camera, this.view.width, this.view.height, SQUAD_ORDERS.markerEdge, this.holdAt), SQUAD_ORDERS.markerEdge);
    const p = this.player.position;
    this.holdMarker.show(m.x, m.y, Math.hypot(hold.x - p.x, hold.z - p.z), !m.onScreen);
  }

  /**
   * Once per frame, after `frame`: the order wheel (M23) while its key is held. `pointer`: the wheel's pointer and the
   * order it's on (input/playerInput.ts), `current`: the order in force, `select`: how an order is given.
   */
  showOrderWheel(open: boolean, pointer: { readonly x: number; readonly y: number; readonly pick: number }, current: SquadOrderKind | 'none', select: WheelSelect, mag: string): void {
    this.wheelOpen = open && this.playing;
    if (!this.wheelOpen) {
      this.orderWheel.hide();
      return;
    }
    // The hint is rebuilt only when what it says changes (the way of picking, or pointing at an order or not).
    const on = pointer.pick >= 0;
    if (select !== this.wheelHintSelect || on !== this.wheelHintOn) {
      this.wheelHintSelect = select;
      this.wheelHintOn = on;
      this.wheelHintText = wheelHint(select, pointer.pick, this.keyName('orderWheel'));
    }
    this.orderWheel.update(true, pointer.pick, pointer.x, pointer.y, current, this.wheelHintText, mag);
  }

  /**
   * Once per frame, after `frame`: the magazine hand-off (MG1) as `view` says, its line under the crosshair and the mag
   * tag on the teammates asking you or bringing you one. Neither while you spectate or a menu or the scoreboard is up,
   * nor with Settings › HUD › Mag hand-off off; the line not while the order wheel is open (call showOrderWheel first).
   */
  showMagHandoff(view: Readonly<MagView>): void {
    const on = this.playing && !this.spectating && !this.boardUp;
    const line = on && !this.wheelOpen;
    this.magPrompt.show(line ? view.line : '', line && view.toss);
    const tags = on && this.magPrompt.enabled;
    for (let i = 0; i < this.mates.length; i++) this.mateMarkers.setMag(i, tags && view.mates.includes(this.mates[i]!.id));
  }

  /** Settings › HUD › Mag hand-off: false hides its line and tags (the hand-off goes on; the callouts still say it). */
  setMagPrompts(on: boolean): void {
    this.magPrompt.setShown(on);
  }

  /** The other team where heard on the minimap (M23), or teammates only (the Rules picker's minimap switch, M39). */
  setHeardOnMinimap(shown: boolean): void {
    this.minimap.setHeardShown(shown);
  }

  /**
   * Once per frame, after `frame`: the minimap (M23), round wherever the camera is (your eyes, or the player you
   * watch), with your teammates, where you last heard the other team, where your teammates hold (`hold`, or null) and
   * in Attack / Defend the flagpole (in Elimination, the overtime flag while it is up).
   */
  showMinimap(hold: Vec3 | null): void {
    if (!this.playing) return;
    const f = this.minimapFrame;
    f.x = this.listener.x;
    // The storey drawn: that of whoever's eyes the camera is at (yours, or the player you watch), and the area named.
    const at = (this.watched ?? this.player).position;
    f.y = at.y;
    this.minimap.setArea(areaAt(this.areas, at.x, at.y, at.z));
    f.z = this.listener.z;
    f.yaw = this.listener.yaw;
    f.time = this.state.time;
    f.count = 0;
    for (const c of this.mates) {
      if (c.status === 'out' || c === this.watched) continue;
      const m = f.mates[f.count++]!;
      m.x = c.position.x;
      m.y = c.position.y;
      m.z = c.position.z;
      m.hit = c.status !== 'alive';
    }
    f.hold = hold;
    f.pings = this.pingMarkers.markersShown ? this.pingMarkers.pings : NO_PINGS;
    const r = this.state.round;
    f.flag = !this.flag.object.visible ? null : r.mode === 'attackDefend' ? r.flag.position : r.overtimeFlag.up ? r.overtimeFlag.position : null;
    f.exitCount = 0;
    if (this.extraction) {
      for (const e of r.run.exits) {
        if (e.closed) continue;
        const m = f.exits[f.exitCount++]!;
        m.x = e.position.x;
        m.z = e.position.z;
        m.open = e.open;
      }
    }
    this.heardPlayers.expire(this.state.time);
    this.minimap.update(f, this.heardPlayers.players);
  }

  /** The player the camera follows while you spectate, as of the last frame (null while you play; M33h: whose torch is real). */
  get watchedCharacter(): Character | null {
    return this.watched ?? null;
  }

  /** Others' torch beams on the figures (M33h, render/torchBeams.ts): each glows by its share of `colour`. */
  setTorchLift(lit: Float32Array, colour: number): void {
    this.characters.setTorchLift(lit, colour);
  }

  /** Clicking while spectating watches the next player. */
  nextSpectateTarget(): void {
    this.spectator.next();
  }

  /**
   * Once per frame. Places the camera when spectating and returns true; otherwise leaves the camera
   * alone. `cameraYaw` is the first-person view yaw; `boardHeld`: the scoreboard key is held.
   */
  frame(camera: THREE.PerspectiveCamera, alpha: number, dt: number, cameraYaw: number, boardHeld: boolean): boolean {
    const spectating = this.spectating;
    const status = this.player.status;
    let watched: Character | undefined;
    if (spectating) {
      watched = this.spectator.ensureTarget();
      this.spectator.place(camera, watched, alpha, dt);
      this.feedback.setSpectating(watched === this.player ? '' : this.names.get(watched.id) ?? '', this.skipLabel);
    } else {
      this.feedback.setSpectating('', this.skipLabel === 'skipping' ? 'skipping' : null);
    }
    this.watched = watched;
    // The camera is placed now (by the session, or the spectator above): its matrices are made once for every marker below.
    camera.updateMatrixWorld();
    this.boardUp = this.boardView(boardHeld) !== 'none';
    this.characters.update(alpha, dt, spectating ? -1 : this.player.id, camera.position);
    this.flag.update(this.state.round, this.state.time);
    this.minimap.beginPins();
    this.edgePins.begin();
    const pinScale = this.minimap.hudScale;
    this.edgeStep.down = MINIMAP.pinStep.down * pinScale;
    this.edgeStep.across = MINIMAP.pinStep.across * pinScale;
    this.updateMarker(camera, spectating);
    this.exits?.update(this.state.round.run);
    this.cases?.update(this.state.round.run);
    this.casePrompt?.update(this.state.round.run, this.state.time);
    this.updateExitMarkers(camera, spectating);
    this.updateMateMarkers(camera, alpha, watched);
    this.updatePingMarkers(camera, spectating);
    this.feed.update(this.state.time);
    this.calloutFeed.update(this.state.time);
    this.calloutFeed.setCovered(this.boardUp);
    // The cues are placed for wherever the camera is (your eyes, or the player you watch), as the ears are.
    camera.getWorldDirection(this.viewDir);
    this.listener.x = camera.position.x;
    this.listener.z = camera.position.z;
    this.listener.yaw = Math.atan2(-this.viewDir.x, -this.viewDir.z);
    this.soundCues.update(this.listener.x, this.listener.z, this.listener.yaw, this.state.time);
    this.updateBoard(boardHeld);
    this.whatGotYou.setShown(this.playing && this.out && !this.boardUp);

    this.feedback.setCalling(status === 'calling');
    if (status === 'calling') this.feedback.setHitDirection(wrapAngle(cameraYaw - this.hitFromYaw));
    this.feedback.setOutLabel(this.out ? this.outLabel() : '');
    // Extraction: respawns left first, as the banner says them on the frame you're back.
    if (this.extraction) this.runInfo.respawnsLeft = respawnsLeft(this.state.round.run, this.player, this.extraction);
    this.updateRoundMessage(status === 'calling');
    if (this.extraction) {
      this.scoreboard.update(this.state.round, this.state.characters, this.runInfo);
    } else this.scoreboard.update(this.state.round, this.state.characters);
    return spectating;
  }

  dispose(): void {
    this.intents.dispose();
    this.characters.dispose();
    this.flag.dispose();
    this.exits?.dispose();
    this.cases?.dispose();
    this.casePrompt?.dispose();
    for (const m of this.exitMarkers) m?.dispose();
    this.respawnFade?.remove();
    this.feedback.dispose();
    this.scoreboard.dispose();
    this.marker.dispose();
    this.feed.dispose();
    this.calloutFeed.dispose();
    this.board.dispose();
    this.whatGotYou.dispose();
    this.mateMarkers.dispose();
    this.soundCues.dispose();
    this.squadLine.dispose();
    this.holdMarker.dispose();
    this.pingMarkers.dispose();
    this.magPrompt.dispose();
    this.minimap.dispose();
    this.orderWheel.dispose();
  }

  private readonly characterOf = (id: number): Character | undefined => {
    for (const c of this.state.characters) if (c.id === id) return c;
    return undefined;
  };

  /** A teammate's callout (CL1): `speakerId`'s line in the callout feed, under their name. */
  callout(speakerId: number, team: number, text: string): void {
    this.calloutFeed.add(this.names.get(speakerId) ?? '', team, text, this.state.time);
  }

  /**
   * A ping (PG1): `owner` (you, or a teammate marking a sighting) marked `kind` at `point`, in place of their last one.
   * Shown while Settings › HUD › Ping markers is on; the minimap shows it too.
   */
  ping(owner: number, kind: ShownPingKind, point: Vec3): void {
    this.pingMarkers.place(owner, kind, point, this.state.time);
  }

  /** Settings › HUD › Ping markers: false hides them, over the field and on the minimap (the pings themselves go on). */
  setPingMarkers(on: boolean): void {
    this.pingMarkers.setShown(on);
  }

  /** Callouts turned off (Settings › HUD): the lines up now go. */
  clearCallouts(): void {
    this.calloutFeed.clear();
  }

  /** A hit feed line for `victimId` calling a hit from `shooterId`'s BB. */
  private addFeedLine(victimId: number, shooterId: number, ricochet: boolean): void {
    const victim = this.state.characters.find((c) => c.id === victimId);
    const shooter = this.state.characters.find((c) => c.id === shooterId);
    if (!victim || !shooter) return;
    const you = victim === this.player || shooter === this.player;
    this.feed.add(
      { name: this.names.get(victim.id) ?? '', team: victim.team },
      { name: this.names.get(shooter.id) ?? '', team: shooter.team },
      // Your own ricochet (audit SIM-07) is no friendly hit: the line names you twice, tagged "ricochet".
      victim.team === shooter.team && victim !== shooter,
      you,
      this.state.time,
      ricochet,
    );
  }

  /**
   * Each ping over the field: a ring over its point (a little above a spot, so it clears the floor) with what it marks
   * and how far it is from the camera, pinned to the screen's edge while out of view, fading at the end of its time.
   * None with a menu or the scoreboard up, or while you spectate (the hold marker's rules); none under the minimap.
   */
  private updatePingMarkers(camera: THREE.PerspectiveCamera, spectating: boolean): void {
    const markers = this.pingMarkers;
    if (!markers.markersShown) return;
    const pings = markers.pings;
    for (let i = 0; i < pings.length; i++) {
      const p = pings[i]!;
      const alpha = Number.isNaN(p.at) ? 0 : pingAlpha(this.state.time - p.at);
      if (!this.playing || spectating || this.boardUp || alpha <= 0) {
        markers.hide(i);
        continue;
      }
      this.pingAnchor.set(p.x, p.y + (p.kind === 'spot' ? PINGS.markerHeight : 0), p.z);
      const m = this.pinned(projectMarker(this.pingAnchor, camera, this.view.width, this.view.height, PINGS.markerEdge, this.pingAt), PINGS.markerEdge);
      if (this.minimap.covers(m.x, m.y)) markers.hide(i);
      else markers.show(i, m.x, m.y, camera.position.distanceTo(this.pingAnchor), !m.onScreen, alpha);
    }
  }

  /**
   * A marker over each teammate's head, wherever they are on screen (through walls too): in colour while they're in
   * play, grey while they call a hit and walk off. None once they're in the dead zone, over the teammate you're
   * watching, or with a menu up.
   */
  private updateMateMarkers(camera: THREE.PerspectiveCamera, alpha: number, watched: Character | undefined): void {
    for (let i = 0; i < this.mates.length; i++) {
      const c = this.mates[i]!;
      if (!this.playing || c.status === 'out' || c === watched || this.boardUp) {
        this.mateMarkers.hide(i);
        continue;
      }
      const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
      this.mateAnchor.set(
        c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha,
        c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha + eyeHeight(crouch, this.body) + TEAMMATE_MARKERS.aboveEyes,
        c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha,
      );
      const m = projectMarker(this.mateAnchor, camera, this.view.width, this.view.height, 0, this.mateAt);
      // Not under the minimap either, where the label would read through its translucent field (audit UI-13).
      if (m.onScreen && !this.minimap.covers(m.x, m.y)) this.mateMarkers.show(i, m.x, m.y, c.status !== 'alive');
      else this.mateMarkers.hide(i);
    }
    this.mateMarkers.commit();
  }

  /**
   * The scoreboard over the field: the match so far while the key is held, the round just played between rounds,
   * and the whole match once it's decided (until the summary screen). Its numbers are rebuilt only when a count or the
   * phase changes (which is when the score does), or, while a round is live, each second of time alive.
   */
  private updateBoard(held: boolean): void {
    const r = this.state.round;
    const view = this.boardView(held);
    this.board.setVisible(view !== 'none');
    const shown = this.shownBoard;
    const second = r.phase === 'live' ? Math.floor(this.state.time) : -1;
    if (view === 'none' || (view === shown.view && this.stats.version === shown.version && second === shown.second && r.phase === shown.phase)) {
      shown.view = view;
      return;
    }
    shown.view = view;
    shown.version = this.stats.version;
    shown.second = second;
    shown.phase = r.phase;
    const match = view === 'match';
    this.board.setTip(this.proTips ? proTip(r.number) : '');
    const heading = match ? (r.phase === 'matchOver' ? 'Match' : `Match so far · round ${r.number}`) : `Round ${r.number}`;
    const statsOf = match ? (id: number) => this.stats.matchOf(id) : (id: number) => this.stats.roundOf(id);
    this.board.set(heading, statsBlocks(this.state.characters, this.names, statsOf, r.score, this.player, r.phase === 'live', this.extraction !== undefined, r.run.reserve, this.tags));
  }

  /** What the board over the field shows: the match while the key is held or once decided, the round between rounds. */
  private boardView(held: boolean): BoardView {
    const phase = this.state.round.phase;
    return phase === 'matchOver' || held ? 'match' : phase === 'over' ? 'round' : 'none';
  }

  /**
   * Flag mode: the marker over the pole (pinned to the screen edge when it's out of view), in the colour
   * of the team whose flag it is. In Elimination, over the overtime flag while it is up (Dev 6 item 45), in its cloth's
   * white. Hidden between rounds and while you are close to the pole yourself.
   */
  private updateMarker(camera: THREE.PerspectiveCamera, spectating: boolean): void {
    const r = this.state.round;
    const p = this.player.position;
    const overtime = r.mode !== 'attackDefend';
    const pole = overtime ? r.overtimeFlag.position : r.flag.position;
    const metres = Math.hypot(pole.x - p.x, pole.z - p.z);
    const near = !spectating && metres <= FLAG_VISUALS.markerHideWithin;
    if (!this.playing || !this.flag.object.visible || r.phase !== 'live' || near || this.boardUp) {
      this.marker.hide();
      return;
    }
    const at = projectMarker(this.flag.markerAnchor, camera, this.view.width, this.view.height, FLAG_VISUALS.markerEdge, this.markerAt);
    // The way to turn, taken before the marker is moved along the edge clear of the others (BP6).
    const towards = edgeAngle(at, this.view.width, this.view.height);
    const m = this.pinned(at, FLAG_VISUALS.markerEdge);
    const from = camera.position;
    this.marker.show(m.x, m.y, Math.hypot(pole.x - from.x, pole.z - from.z), overtime ? FLAG_VISUALS.overtimeCss : teamCss(r.attackers), !m.onScreen, towards);
  }

  /**
   * Extraction: a marker over each open exit (pinned to the screen edge when it's out of view) with the distance to it,
   * in green; hidden while the run isn't live, while you stand at that exit and under the board.
   */
  private updateExitMarkers(camera: THREE.PerspectiveCamera, spectating: boolean): void {
    if (this.exitMarkers.length === 0) return;
    const r = this.state.round;
    const p = this.player.position;
    const from = camera.position;
    for (let i = 0; i < this.exitMarkers.length; i++) {
      const marker = this.exitMarkers[i];
      const e = r.run.exits[i];
      if (!marker || !e) continue;
      const near = !spectating && Math.hypot(e.position.x - p.x, e.position.z - p.z) <= EXIT_VISUALS.markerHideWithin;
      if (!this.playing || !e.open || r.phase !== 'live' || near || this.boardUp) {
        marker.hide();
        continue;
      }
      this.exitAnchor.set(e.position.x, e.position.y + EXIT_VISUALS.markerHeight, e.position.z);
      const at = projectMarker(this.exitAnchor, camera, this.view.width, this.view.height, EXIT_VISUALS.markerEdge, this.exitAt);
      const towards = edgeAngle(at, this.view.width, this.view.height);
      const m = this.pinned(at, EXIT_VISUALS.markerEdge);
      marker.show(m.x, m.y, Math.hypot(e.position.x - from.x, e.position.z - from.z), EXIT_CSS, !m.onScreen, towards);
    }
  }

  /**
   * A projected marker, if pinned to the screen's edge, moved off the minimap's panel (`gap` px clear) and then along
   * its edge clear of this frame's other edge markers (BP6: two in almost the same direction overlapped).
   */
  private pinned(m: ScreenMarker, gap: number): ScreenMarker {
    return this.edgePins.place(this.minimap.clearPinned(m, gap), this.view.width, this.view.height, this.edgeStep);
  }

  /** "OUT · hit by Beta 2", rebuilt only when who hit you changes. */
  private outLabel(): string {
    const hitBy = this.player.hitBy;
    if (hitBy !== this.outLabelFor) {
      this.outLabelFor = hitBy;
      const by = this.names.get(hitBy);
      this.outLabelText = by && hitBy !== this.player.id ? `OUT · hit by ${by}` : 'OUT';
    }
    return this.outLabelText;
  }

  /**
   * Rebuilds the round message only when what it says changes. While you call your hit (`calling`) it waits: the hit
   * that ends a round would otherwise put the result under the "HIT!" stamp, both unreadable (BP3); the result follows
   * once the call ends, still inside the countdown.
   */
  private updateRoundMessage(calling: boolean): void {
    const r = this.state.round;
    const showStart = r.phase === 'live' && this.state.time - this.roundStartedAt < HUD.roundStartMessageTime;
    // Elimination's overtime flag just went up (Dev 6 item 45): how long it has been up is its time gone.
    const showOvertime = r.phase === 'live' && r.overtimeFlag.up && this.rules.overtime.time - r.overtimeFlag.left < HUD.overtimeMessageTime;
    // Extraction: for a moment after you're back from a hit, the banner says how many respawns you have left.
    const respawned = r.phase === 'live' && this.state.time - this.respawnedAt < HUD.respawnMessageTime;
    // And for a moment after the run's news (M53, audit UI-02), unless it is saying you're back in.
    const newsAt = r.phase === 'live' && this.state.time - this.runNewsAt < HUD.runNewsTime ? this.runNewsAt : -1;
    const seconds = Math.max(1, Math.ceil(r.timer));
    const shown = this.shownRound;
    if (shown.phase === r.phase && shown.winner === r.winner && shown.seconds === seconds && shown.number === r.number && shown.start === showStart && shown.overtime === showOvertime && shown.mode === r.mode && shown.respawned === respawned && shown.newsAt === newsAt && shown.calling === calling) return;
    shown.calling = calling;
    shown.respawned = respawned;
    shown.newsAt = newsAt;
    shown.phase = r.phase;
    shown.winner = r.winner;
    shown.seconds = seconds;
    shown.number = r.number;
    shown.start = showStart;
    shown.overtime = showOvertime;
    shown.mode = r.mode;
    if (calling) this.feedback.setRoundMessage('');
    else this.feedback.setRoundMessage(respawned ? respawnBanner(this.runInfo.respawnsLeft) : newsAt >= 0 ? this.runNewsText : roundBanner(r, this.player.team, showStart, seconds, this.rules, showOvertime));
  }
}
