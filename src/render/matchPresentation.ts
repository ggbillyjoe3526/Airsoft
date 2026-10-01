import type * as THREE from 'three';
import type { HitConfig } from '../config/hits';
import type { FlagRules } from '../config/modes';
import type { BodyConfig } from '../config/movement';
import { FLAG_VISUALS, HUD } from '../config/render';
import { TEAM_COLORS, TEAMS } from '../config/teams';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import type { GameState } from '../sim/state';
import { wrapAngle } from '../sim/vec';
import { FlagMarker } from '../ui/flagMarker';
import { HitFeedback } from '../ui/hitFeedback';
import { roundBanner } from '../ui/roundBanner';
import { Scoreboard } from '../ui/scoreboard';
import { CharacterRenderer } from './characterRenderer';
import { FlagRenderer } from './flagRenderer';
import { projectMarker, type ScreenMarker } from './screenMarker';
import { SpectatorCamera } from './spectatorCamera';

const TEAM_CSS = TEAM_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);

/**
 * Everything about the match that isn't your own replica: other players' figures, hit feedback (hit
 * marker, being hit), spectating once you're out, round messages, and in flag mode the pole and its
 * screen marker. Reads state and events only.
 */
export class MatchPresentation {
  private readonly characters: CharacterRenderer;
  private readonly feedback: HitFeedback;
  private readonly spectator: SpectatorCamera;
  private readonly scoreboard: Scoreboard;
  private readonly flag: FlagRenderer;
  private readonly marker: FlagMarker;
  private readonly markerAt: ScreenMarker = { x: 0, y: 0, onScreen: false };
  /** Display names by character id ("Blue 2", "you"). */
  private readonly names = new Map<number, string>();
  private roundStartedAt = 0;
  /** World yaw the BB that hit you came from (see showHit), and when. */
  private hitFromYaw = 0;
  /** What the round message on screen was built from, so its text is only rebuilt when that changes. */
  private readonly shownRound = { phase: '', winner: -2, seconds: -1, number: -1, start: false, mode: '' };
  private outLabelFor = Number.NaN;
  private outLabelText = '';

  constructor(
    scene: THREE.Scene,
    container: HTMLElement,
    private readonly view: { readonly width: number; readonly height: number },
    private readonly state: GameState,
    private readonly player: Character,
    body: BodyConfig,
    hits: HitConfig,
    query: WorldQuery,
    teamSize: number,
    private readonly flagRules: FlagRules,
  ) {
    this.characters = new CharacterRenderer(state.characters, TEAM_COLORS, hits);
    this.flag = new FlagRenderer(TEAM_COLORS, flagRules.radius);
    scene.add(this.characters.object, this.flag.object);
    this.feedback = new HitFeedback(container);
    this.scoreboard = new Scoreboard(container, teamSize, player.team);
    this.marker = new FlagMarker(container);
    this.spectator = new SpectatorCamera(state.characters, player, body, query);
    const perTeam = [0, 0];
    for (const c of state.characters) {
      const n = ++perTeam[c.team]!;
      this.names.set(c.id, c === player ? 'you' : `${TEAMS[c.team]!.name} ${n}`);
    }
  }

  setPlaying(playing: boolean): void {
    this.feedback.setVisible(playing);
    this.scoreboard.setVisible(playing);
    if (!playing) this.marker.hide();
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
      }
    }
  }

  /** Clicking while spectating watches the next player. */
  nextSpectateTarget(): void {
    this.spectator.next();
  }

  /**
   * Once per frame. Places the camera when spectating and returns true; otherwise leaves the camera
   * alone. `cameraYaw` is the first-person view yaw.
   */
  frame(camera: THREE.PerspectiveCamera, alpha: number, dt: number, cameraYaw: number): boolean {
    const spectating = this.spectating;
    const status = this.player.status;
    if (spectating) {
      const watched = this.spectator.ensureTarget();
      this.spectator.place(camera, watched, alpha, dt);
      this.feedback.setSpectating(watched === this.player ? '' : this.names.get(watched.id) ?? '');
    } else {
      this.feedback.setSpectating('');
    }
    this.characters.update(alpha, dt, spectating ? -1 : this.player.id);
    this.flag.update(this.state.round, this.state.time);
    this.updateMarker(camera, spectating);

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
    if (!this.flag.object.visible || r.phase !== 'live' || near) {
      this.marker.hide();
      return;
    }
    const m = projectMarker(this.flag.markerAnchor, camera, this.view.width, this.view.height, FLAG_VISUALS.markerEdge, this.markerAt);
    const from = camera.position;
    this.marker.show(m.x, m.y, Math.hypot(pole.x - from.x, pole.z - from.z), TEAM_CSS[r.attackers]!, !m.onScreen);
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
    this.feedback.setRoundMessage(roundBanner(r, this.player.team, showStart, seconds, this.flagRules));
  }
}
