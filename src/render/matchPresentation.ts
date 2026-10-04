import * as THREE from 'three';
import type { Action } from '../config/controls';
import type { HitConfig } from '../config/hits';
import { type HitFeedMode, TEAMMATE_MARKERS } from '../config/matchInfo';
import type { BodyConfig } from '../config/movement';
import { FLAG_VISUALS, HUD } from '../config/render';
import type { ReplicaConfig } from '../config/replicas';
import { SQUAD_ORDERS, type SquadOrderKind, type WheelSelect } from '../config/squad';
import { cssColor, teamCss, type TeamColours } from '../config/teams';
import type { MapBlock } from '../map/mapTypes';
import type { WorldQuery } from '../sim/armament';
import { type Character, eyeHeight } from '../sim/character';
import type { RoundRules } from '../sim/round';
import type { GameState } from '../sim/state';
import { type Vec3, wrapAngle } from '../sim/vec';
import type { MatchStats } from '../stats/matchStats';
import { FlagMarker } from '../ui/flagMarker';
import { HitFeed } from '../ui/hitFeed';
import { HitFeedback } from '../ui/hitFeedback';
import { HoldMarker } from '../ui/holdMarker';
import { MatchBoard } from '../ui/matchBoard';
import { Minimap, type MinimapFrame } from '../ui/minimap';
import { HeardPlayers } from '../ui/minimapView';
import { OrderWheel, wheelHint } from '../ui/orderWheel';
import { roundBanner } from '../ui/roundBanner';
import { Scoreboard } from '../ui/scoreboard';
import { type HeardSound, SoundCues, soundCueOf } from '../ui/soundCues';
import { type OrderNotice, SquadOrderLine } from '../ui/squadOrderLine';
import { rosterNames, statsBlocks } from '../ui/statsRows';
import { TeammateMarkers } from '../ui/teammateMarkers';
import { CharacterRenderer } from './characterRenderer';
import type { FigureModel } from './externalModels';
import { FlagRenderer } from './flagRenderer';
import { projectMarker, type ScreenMarker } from './screenMarker';
import { SpectatorCamera } from './spectatorCamera';

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
  private readonly feed: HitFeed;
  private readonly board: MatchBoard;
  /** What the board shows now, and what its numbers were built from (redrawn only when that changes). */
  private readonly shownBoard = { view: 'none' as BoardView, version: -1, second: -1, phase: '' };
  private readonly mates: Character[];
  private readonly mateMarkers: TeammateMarkers;
  private readonly mateAnchor = new THREE.Vector3();
  private readonly mateAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  /** On-screen sound cues (Settings → Accessibility, M18b; off unless turned on). */
  private readonly soundCues: SoundCues;
  private readonly squadLine: SquadOrderLine;
  private readonly holdMarker: HoldMarker;
  private readonly holdAnchor = new THREE.Vector3();
  private readonly holdAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  private readonly heard: HeardSound = { kind: 'step', sourceId: -1, x: 0, z: 0 };
  /** The minimap (M23): the other team where last heard, from where the camera was at the last frame. */
  private readonly minimap: Minimap;
  private readonly heardPlayers = new HeardPlayers();
  private readonly minimapFrame: MinimapFrame;
  private readonly listener = { x: 0, z: 0, yaw: 0 };
  private readonly orderWheel: OrderWheel;
  /** The player the camera follows while you spectate (the middle of the minimap), as of the last frame. */
  private watched: Character | undefined;
  private readonly viewDir = new THREE.Vector3();
  /** Display names by character id ("Blue 2", "You"). */
  private readonly names: Map<number, string>;
  private roundStartedAt = 0;
  /** World yaw the BB that hit you came from (see showHit), and when. */
  private hitFromYaw = 0;
  /** What the round message on screen was built from, so its text is only rebuilt when that changes. */
  private readonly shownRound = { phase: '', winner: -2, seconds: -1, number: -1, start: false, mode: '' };
  private outLabelFor = Number.NaN;
  private outLabelText = '';
  /** False while the start/pause screen or the result screen is up: the pole marker stays hidden then. */
  private playing = false;

  constructor(
    scene: THREE.Scene,
    container: HTMLElement,
    private readonly view: { readonly width: number; readonly height: number },
    private readonly state: GameState,
    private readonly player: Character,
    private readonly body: BodyConfig,
    hits: HitConfig,
    query: WorldQuery,
    teamSize: number,
    private readonly rules: RoundRules,
    private readonly stats: MatchStats,
    /** The key or button the player has on `action` now, for hints on screen. */
    keyName: (action: Action) => string,
    /** The team colours picked on Settings → Accessibility (the HUD's follow the container's CSS, see Game.play). */
    teamColours: TeamColours,
    /** The replica in each loadout slot (the figures hold the active one). */
    loadout: readonly ReplicaConfig[],
    /** The map's blocks, for the minimap's drawing of the field. */
    blocks: readonly MapBlock[],
    /** The figure model, if the build has one (M25a); null draws the built-in figures. */
    figureModel: FigureModel | null = null,
  ) {
    this.keyName = keyName;
    this.characters = new CharacterRenderer(state.characters, teamColours.figures, hits, loadout, figureModel);
    this.flag = new FlagRenderer(teamColours.figures, rules.flag.radius);
    scene.add(this.characters.object, this.flag.object);
    this.feedback = new HitFeedback(container, () => keyName('fire'));
    this.scoreboard = new Scoreboard(container, teamSize, player.team);
    this.marker = new FlagMarker(container);
    this.spectator = new SpectatorCamera(state.characters, player, body, query);
    this.names = rosterNames(state.characters, player.id);
    this.mates = state.characters.filter((c) => c.team === player.team && c !== player);
    this.mateMarkers = new TeammateMarkers(container, this.mates.map((c) => this.names.get(c.id) ?? ''), teamCss(player.team));
    this.feed = new HitFeed(container);
    this.board = new MatchBoard(container);
    this.soundCues = new SoundCues(container);
    this.squadLine = new SquadOrderLine(container, player.team);
    this.holdMarker = new HoldMarker(container, teamCss(player.team));
    this.minimap = new Minimap(container, blocks, cssColor(teamColours.hud[player.team]!), cssColor(teamColours.hud[1 - player.team]!));
    this.minimapFrame = { x: 0, z: 0, yaw: 0, mates: this.mates.map(() => ({ x: 0, z: 0, hit: false })), count: 0, hold: null, flag: null, time: 0 };
    this.orderWheel = new OrderWheel(container, teamCss(player.team));
  }

  private readonly keyName: (action: Action) => string;
  private wheelHintSelect: WheelSelect | '' = '';
  private wheelHintOn = false;
  private wheelHintText = '';

  /** On-screen sound cues turned on or off (also called once as the match is built). */
  setSoundCues(on: boolean): void {
    this.soundCues.setEnabled(on);
  }

  /** The hit feed fades or keeps its lines (Settings → HUD, M24; also called once as the match is built). */
  setHitFeedMode(mode: HitFeedMode): void {
    this.feed.setMode(mode);
  }

  setPlaying(playing: boolean): void {
    this.feedback.setVisible(playing);
    this.scoreboard.setVisible(playing);
    this.feed.setVisible(playing);
    this.soundCues.setVisible(playing);
    this.squadLine.setVisible(playing);
    this.minimap.setVisible(playing);
    this.playing = playing;
    if (!playing) {
      this.orderWheel.hide();
      // The wheel key may be rebound on the pause menu: the hint names it afresh.
      this.wheelHintSelect = '';
      this.marker.hide();
      this.mateMarkers.hideAll();
      this.board.setVisible(false);
      this.shownBoard.view = 'none';
    }
  }

  /** True once you've called your hit and are watching someone else. */
  get spectating(): boolean {
    const s = this.player.status;
    return s === 'walkingOff' || s === 'leaving' || s === 'out';
  }

  /** Call after every simulation tick, while that tick's events are still in the state. */
  afterTick(cameraYaw: number): void {
    for (const e of this.state.events) {
      if (e.type === 'characterHit') {
        this.characters.flinch(e.victimId, e.direction);
        this.addFeedLine(e.victimId, e.shooterId, e.ricochet);
        if (e.victimId === this.player.id) {
          // It came from the opposite of the BB's flight direction.
          this.hitFromYaw = Math.atan2(e.direction.x, e.direction.z);
          this.feedback.showHit(wrapAngle(cameraYaw - this.hitFromYaw));
        } else if (e.shooterId === this.player.id) {
          const victim = this.state.characters.find((c) => c.id === e.victimId);
          this.feedback.showHitMarker(victim?.team === this.player.team);
        }
      } else if (e.type === 'roundStart') {
        this.roundStartedAt = this.state.time;
        this.spectator.reset();
        this.feed.roundStarted(e.round);
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
    if (!hold || !this.playing || this.spectating) {
      this.holdMarker.hide();
      return;
    }
    this.holdAnchor.set(hold.x, hold.y + SQUAD_ORDERS.markerHeight, hold.z);
    const m = projectMarker(this.holdAnchor, camera, this.view.width, this.view.height, SQUAD_ORDERS.markerEdge, this.holdAt);
    const p = this.player.position;
    this.holdMarker.show(m.x, m.y, Math.hypot(hold.x - p.x, hold.z - p.z), !m.onScreen);
  }

  /**
   * Once per frame, after `frame`: the order wheel (M23) while its key is held. `pointer`: the wheel's pointer and the
   * order it's on (input/playerInput.ts), `current`: the order in force, `select`: how an order is given.
   */
  showOrderWheel(open: boolean, pointer: { readonly x: number; readonly y: number; readonly pick: number }, current: SquadOrderKind | 'none', select: WheelSelect): void {
    if (!open || !this.playing) {
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
    this.orderWheel.update(true, pointer.pick, pointer.x, pointer.y, current, this.wheelHintText);
  }

  /**
   * Once per frame, after `frame`: the minimap (M23), round wherever the camera is (your eyes, or the player you
   * watch), with your teammates, where you last heard the other team, where your teammates hold (`hold`, or null) and
   * in Attack / Defend the flagpole.
   */
  showMinimap(hold: Vec3 | null): void {
    if (!this.playing) return;
    const f = this.minimapFrame;
    f.x = this.listener.x;
    f.z = this.listener.z;
    f.yaw = this.listener.yaw;
    f.time = this.state.time;
    f.count = 0;
    for (const c of this.mates) {
      if (c.status === 'out' || c === this.watched) continue;
      const m = f.mates[f.count++]!;
      m.x = c.position.x;
      m.z = c.position.z;
      m.hit = c.status !== 'alive';
    }
    f.hold = hold;
    const r = this.state.round;
    f.flag = this.flag.object.visible && r.mode === 'attackDefend' ? r.flag.position : null;
    this.heardPlayers.expire(this.state.time);
    this.minimap.update(f, this.heardPlayers.players);
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
      this.feedback.setSpectating(watched === this.player ? '' : this.names.get(watched.id) ?? '');
    } else {
      this.feedback.setSpectating('');
    }
    this.watched = watched;
    this.characters.update(alpha, dt, spectating ? -1 : this.player.id);
    this.flag.update(this.state.round, this.state.time);
    this.updateMarker(camera, spectating);
    this.updateMateMarkers(camera, alpha, watched);
    this.feed.update(this.state.time);
    // The cues are placed for wherever the camera is (your eyes, or the player you watch), as the ears are.
    camera.getWorldDirection(this.viewDir);
    this.listener.x = camera.position.x;
    this.listener.z = camera.position.z;
    this.listener.yaw = Math.atan2(-this.viewDir.x, -this.viewDir.z);
    this.soundCues.update(this.listener.x, this.listener.z, this.listener.yaw, this.state.time);
    this.updateBoard(boardHeld);

    this.feedback.setCalling(status === 'calling');
    if (status === 'calling') this.feedback.setHitDirection(wrapAngle(cameraYaw - this.hitFromYaw));
    this.feedback.setOutLabel(spectating ? this.outLabel() : '');
    this.updateRoundMessage();
    this.scoreboard.update(this.state.round, this.state.characters);
    return spectating;
  }

  dispose(): void {
    this.characters.dispose();
    this.flag.dispose();
    this.feedback.dispose();
    this.scoreboard.dispose();
    this.marker.dispose();
    this.feed.dispose();
    this.board.dispose();
    this.mateMarkers.dispose();
    this.soundCues.dispose();
    this.squadLine.dispose();
    this.holdMarker.dispose();
    this.minimap.dispose();
    this.orderWheel.dispose();
  }

  private readonly characterOf = (id: number): Character | undefined => {
    for (const c of this.state.characters) if (c.id === id) return c;
    return undefined;
  };

  /** A hit feed line for `victimId` calling a hit from `shooterId`'s BB. */
  private addFeedLine(victimId: number, shooterId: number, ricochet: boolean): void {
    const victim = this.state.characters.find((c) => c.id === victimId);
    const shooter = this.state.characters.find((c) => c.id === shooterId);
    if (!victim || !shooter) return;
    const you = victim === this.player || shooter === this.player;
    this.feed.add(
      { name: this.names.get(victim.id) ?? '', team: victim.team },
      { name: this.names.get(shooter.id) ?? '', team: shooter.team },
      victim.team === shooter.team,
      you,
      this.state.time,
      ricochet,
    );
  }

  /**
   * A marker over each teammate's head, wherever they are on screen (through walls too): in colour while they're in
   * play, grey while they call a hit and walk off. None once they're in the dead zone, over the teammate you're
   * watching, or with a menu up.
   */
  private updateMateMarkers(camera: THREE.PerspectiveCamera, alpha: number, watched: Character | undefined): void {
    for (let i = 0; i < this.mates.length; i++) {
      const c = this.mates[i]!;
      if (!this.playing || c.status === 'out' || c === watched) {
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
      if (m.onScreen) this.mateMarkers.show(i, m.x, m.y, c.status !== 'alive');
      else this.mateMarkers.hide(i);
    }
  }

  /**
   * The scoreboard over the field: the match so far while the key is held, the round just played between rounds,
   * and the whole match once it's decided (until the summary screen). Its numbers are rebuilt only when a count or the
   * phase changes (which is when the score does), or, while a round is live, each second of time alive.
   */
  private updateBoard(held: boolean): void {
    const r = this.state.round;
    const view: BoardView = r.phase === 'matchOver' || held ? 'match' : r.phase === 'over' ? 'round' : 'none';
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
    const heading = match ? (r.phase === 'matchOver' ? 'Match' : `Match so far · round ${r.number}`) : `Round ${r.number}`;
    const statsOf = match ? (id: number) => this.stats.matchOf(id) : (id: number) => this.stats.roundOf(id);
    this.board.set(heading, statsBlocks(this.state.characters, this.names, statsOf, r.score, this.player, r.phase === 'live'));
  }

  /**
   * Flag mode: the marker over the pole (pinned to the screen edge when it's out of view), in the colour
   * of the team whose flag it is. Hidden between rounds and while you are close to the pole yourself.
   */
  private updateMarker(camera: THREE.PerspectiveCamera, spectating: boolean): void {
    const r = this.state.round;
    const p = this.player.position;
    const pole = r.flag.position;
    const metres = Math.hypot(pole.x - p.x, pole.z - p.z);
    const near = !spectating && metres <= FLAG_VISUALS.markerHideWithin;
    if (!this.playing || !this.flag.object.visible || r.phase !== 'live' || near) {
      this.marker.hide();
      return;
    }
    const m = projectMarker(this.flag.markerAnchor, camera, this.view.width, this.view.height, FLAG_VISUALS.markerEdge, this.markerAt);
    const from = camera.position;
    this.marker.show(m.x, m.y, Math.hypot(pole.x - from.x, pole.z - from.z), teamCss(r.attackers), !m.onScreen);
  }

  /** "OUT · hit by Orange 2", rebuilt only when who hit you changes. */
  private outLabel(): string {
    const hitBy = this.player.hitBy;
    if (hitBy !== this.outLabelFor) {
      this.outLabelFor = hitBy;
      const by = this.names.get(hitBy);
      this.outLabelText = by && hitBy !== this.player.id ? `OUT · hit by ${by}` : 'OUT';
    }
    return this.outLabelText;
  }

  /** Rebuilds the round message only when what it says changes. */
  private updateRoundMessage(): void {
    const r = this.state.round;
    const showStart = r.phase === 'live' && this.state.time - this.roundStartedAt < HUD.roundStartMessageTime;
    const seconds = Math.max(1, Math.ceil(r.timer));
    const shown = this.shownRound;
    if (shown.phase === r.phase && shown.winner === r.winner && shown.seconds === seconds && shown.number === r.number && shown.start === showStart && shown.mode === r.mode) return;
    shown.phase = r.phase;
    shown.winner = r.winner;
    shown.seconds = seconds;
    shown.number = r.number;
    shown.start = showStart;
    shown.mode = r.mode;
    this.feedback.setRoundMessage(roundBanner(r, this.player.team, showStart, seconds, this.rules));
  }
}
