import type * as THREE from 'three';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import { HUD } from '../config/render';
import { TEAM_COLORS, TEAMS } from '../config/teams';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import type { GameState } from '../sim/state';
import { HitFeedback } from '../ui/hitFeedback';
import { CharacterRenderer } from './characterRenderer';
import { SpectatorCamera } from './spectatorCamera';

/**
 * Everything about the match that isn't your own replica: other players' figures, hit feedback (hit
 * marker, being hit), spectating once you're out, and round messages. Reads state and events only.
 */
export class MatchPresentation {
  private readonly characters: CharacterRenderer;
  private readonly feedback: HitFeedback;
  private readonly spectator: SpectatorCamera;
  /** Display names by character id ("Blue 2", "you"). */
  private readonly names = new Map<number, string>();
  private roundStartedAt = 0;
  /** World yaw the BB that hit you came from (see showHit), and when. */
  private hitFromYaw = 0;
  /** Identifies the round message on screen, so its text is only rebuilt when it changes. */
  private roundKey = 0;

  constructor(
    scene: THREE.Scene,
    container: HTMLElement,
    private readonly state: GameState,
    private readonly player: Character,
    body: BodyConfig,
    hits: HitConfig,
    query: WorldQuery,
  ) {
    this.characters = new CharacterRenderer(state.characters, TEAM_COLORS, hits);
    scene.add(this.characters.object);
    this.feedback = new HitFeedback(container);
    this.spectator = new SpectatorCamera(state.characters, player, body, query);
    const perTeam = [0, 0];
    for (const c of state.characters) {
      const n = ++perTeam[c.team]!;
      this.names.set(c.id, c === player ? 'you' : `${TEAMS[c.team]!.name} ${n}`);
    }
  }

  setPlaying(playing: boolean): void {
    this.feedback.setVisible(playing);
  }

  /** True once you've called your hit and are watching someone else. */
  get spectating(): boolean {
    return this.player.status === 'walkingOff' || this.player.status === 'out';
  }

  /** Call after every simulation tick, while that tick's events are still in the state. */
  afterTick(cameraYaw: number): void {
    for (const e of this.state.events) {
      if (e.type === 'characterHit') {
        if (e.victimId === this.player.id) {
          // It came from the opposite of the BB's flight direction.
          this.hitFromYaw = Math.atan2(e.direction.x, e.direction.z);
          this.feedback.showHit(wrap(cameraYaw - this.hitFromYaw));
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
    this.characters.update(alpha, spectating ? -1 : this.player.id);

    this.feedback.setCalling(status === 'calling');
    if (status === 'calling') this.feedback.setHitDirection(wrap(cameraYaw - this.hitFromYaw));
    this.feedback.setOutLabel(spectating ? this.outLabel() : '');
    this.updateRoundMessage();
    return spectating;
  }

  dispose(): void {
    this.characters.dispose();
    this.feedback.dispose();
  }

  private outLabel(): string {
    const by = this.names.get(this.player.hitBy);
    return by && this.player.hitBy !== this.player.id ? `OUT · hit by ${by}` : 'OUT';
  }

  /** Rebuilds the round message only when what it says changes. */
  private updateRoundMessage(): void {
    const r = this.state.round;
    const showStart = r.phase === 'live' && this.state.time - this.roundStartedAt < HUD.roundStartMessageTime;
    const seconds = Math.max(1, Math.ceil(r.timer));
    const key = r.phase === 'over' ? 1 + (r.winner + 1) * 1000 + seconds : showStart ? -r.number : 0;
    if (key === this.roundKey) return;
    this.roundKey = key;
    let text = '';
    if (r.phase === 'over') {
      const result = r.winner < 0 ? 'Draw' : `${TEAMS[r.winner]!.name} wins the round`;
      text = `${result} · next round in ${seconds}`;
    } else if (showStart) {
      text = `Round ${r.number}`;
    }
    this.feedback.setRoundMessage(text);
  }
}

function wrap(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  else if (r > Math.PI) r -= twoPi;
  return r;
}
