import type * as THREE from 'three';
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
  private roundStartedAt = 0;

  constructor(
    scene: THREE.Scene,
    container: HTMLElement,
    private readonly state: GameState,
    private readonly player: Character,
    body: BodyConfig,
    query: WorldQuery,
  ) {
    this.characters = new CharacterRenderer(state.characters, TEAM_COLORS);
    scene.add(this.characters.object);
    this.feedback = new HitFeedback(container);
    this.spectator = new SpectatorCamera(state.characters, body, query);
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
          // The BB came from the opposite of its flight direction; express that relative to the view.
          const fromYaw = Math.atan2(e.direction.x, e.direction.z);
          this.feedback.showHit(wrap(cameraYaw - fromYaw));
        } else if (e.shooterId === this.player.id) {
          const victim = this.state.characters.find((c) => c.id === e.victimId);
          this.feedback.showHitMarker(victim?.team === this.player.team);
        }
      } else if (e.type === 'roundStart') {
        this.roundStartedAt = this.state.time;
        this.feedback.clearHit();
        this.spectator.reset();
      }
    }
  }

  /** Clicking while spectating watches the next player. */
  nextSpectateTarget(): void {
    this.spectator.next();
  }

  /** Once per frame. Places the camera when spectating (returns true), otherwise leaves it alone. */
  frame(camera: THREE.PerspectiveCamera, alpha: number, dt: number): boolean {
    const spectating = this.spectating;
    let watched: Character | undefined;
    if (spectating) {
      watched = this.spectator.ensureTarget(this.player.team);
      if (watched) this.spectator.place(camera, alpha, dt);
    }
    const firstPerson = !spectating || !watched;
    this.characters.update(alpha, firstPerson ? this.player.id : -1);
    this.feedback.setSpectating(spectating && watched ? this.nameOf(watched) : '');
    this.feedback.setRoundMessage(this.roundMessage());
    return !firstPerson;
  }

  dispose(): void {
    this.characters.dispose();
    this.feedback.dispose();
  }

  private roundMessage(): string {
    const r = this.state.round;
    if (r.phase === 'over') {
      const result = r.winner < 0 ? 'Draw' : `${TEAMS[r.winner]!.name} wins the round`;
      return `${result} · next round in ${Math.max(1, Math.ceil(r.timer))}`;
    }
    if (this.state.time - this.roundStartedAt < HUD.roundStartMessageTime) return `Round ${r.number}`;
    return '';
  }

  /** "Blue 2", "Orange 1"... numbered within the team in roster order; you are "you". */
  private nameOf(c: Character): string {
    if (c === this.player) return 'you';
    let n = 0;
    for (const o of this.state.characters) {
      if (o.team === c.team) n++;
      if (o === c) break;
    }
    return `${TEAMS[c.team]!.name} ${n}`;
  }
}

function wrap(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  else if (r > Math.PI) r -= twoPi;
  return r;
}
