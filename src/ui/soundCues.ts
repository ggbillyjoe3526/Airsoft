import { SOUND_CUES, type SoundCueKind } from '../config/accessibility';
import { shotHeardScale } from '../sim/armament';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { wrapAngle } from '../sim/vec';

/** A sound worth a cue: what it was, who made it and where (world x, z). */
export interface HeardSound {
  kind: SoundCueKind;
  sourceId: number;
  x: number;
  z: number;
  /** How far it carries, as a share of its kind's range (a silenced shot, M29b: below 1); 1 if left out. */
  reach?: number;
}

/**
 * The cue for a tick's event, written into `out`, or false if it gets none: your own sounds, and your teammates'
 * footsteps (you know where your team is), get none, as do sounds nobody hears as a person (impacts, the whistle).
 * Shots and hit calls come from everyone else, footsteps (and a hi-cap's rattle) from the other team.
 */
export function soundCueOf(e: GameEvent, local: Character, characterOf: (id: number) => Character | undefined, out: HeardSound): boolean {
  let source: Character | undefined;
  out.reach = 1;
  if (e.type === 'footstep') {
    source = characterOf(e.characterId);
    if (!source || source.team === local.team) return false;
    out.kind = 'step';
  } else if (e.type === 'shot') {
    source = characterOf(e.characterId);
    out.kind = 'shot';
    out.reach = source ? shotHeardScale(source) : 1;
  } else if (e.type === 'characterHit') {
    // The call comes from whoever was hit.
    source = characterOf(e.victimId);
    out.kind = 'hit';
  } else {
    return false;
  }
  if (!source || source.id === local.id) return false;
  out.sourceId = source.id;
  out.x = source.position.x;
  out.z = source.position.z;
  return true;
}

/**
 * Where a sound at (x, z) is round the crosshair for a listener at (fromX, fromZ) looking along `viewYaw` (radians,
 * the game's yaw: 0 looks down -z, positive turns left). 0 = straight ahead, positive = to the right, ±π behind.
 */
export function cueAngle(viewYaw: number, fromX: number, fromZ: number, x: number, z: number): number {
  const towards = Math.atan2(-(x - fromX), -(z - fromZ));
  return wrapAngle(viewYaw - towards);
}

/** How opaque a cue is `age` seconds after its sound, `metres` away, for `kind` (0 = not shown). */
export function cueOpacity(kind: SoundCueKind, age: number, metres: number): number {
  const range = SOUND_CUES.range[kind];
  if (age < 0 || age >= SOUND_CUES.life || metres > range) return 0;
  const fade = Math.min(1, (SOUND_CUES.life - age) / SOUND_CUES.fade);
  const near = 1 - (1 - SOUND_CUES.farOpacity) * (metres / range);
  return fade * near;
}

const roundTo = (v: number, step: number): number => Math.round(v / step) * step;

interface Marker {
  root: HTMLDivElement;
  sound: HeardSound;
  /** Simulation time the sound was made (NaN: free). */
  at: number;
  angle: number;
  opacity: number;
  kind: SoundCueKind | '';
}

/**
 * On-screen sound cues (opt-in, Settings → Accessibility, M18b): a ring of markers round the crosshair, each pointing
 * to a footstep, shot or hit call the way your ears place it, with a shape per kind so colour is never the cue. The
 * markers are pooled; a new sound from the same player and kind moves that player's marker, so a burst is one marker.
 * They turn with the view while they last. The DOM is only touched when what a marker shows changes.
 */
export class SoundCues {
  private readonly root: HTMLDivElement;
  private readonly markers: Marker[] = [];
  private enabled = false;
  private visible = false;
  /**
   * The listener at the last update (x, z), to drop sounds too far off to be heard as they arrive. NaN until the
   * first update, so nothing is dropped before the listener is known.
   */
  private listenerX = Number.NaN;
  private listenerZ = Number.NaN;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'sound-cues';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.setProperty('--cue-radius', `${SOUND_CUES.radius}px`);
    for (let i = 0; i < SOUND_CUES.markers; i++) {
      const root = document.createElement('div');
      root.className = 'sound-cue';
      root.hidden = true;
      root.append(document.createElement('b'));
      this.root.append(root);
      this.markers.push({ root, sound: { kind: 'step', sourceId: -1, x: 0, z: 0 }, at: Number.NaN, angle: Number.NaN, opacity: -1, kind: '' });
    }
    parent.appendChild(this.root);
  }

  /** Sound cues turned on or off; off clears the ring. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
    this.showRing();
  }

  /** False while a menu is up. The ring shows only while playing with cues on. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.showRing();
  }

  /**
   * A sound heard at simulation time `time` (ignored while cues are off, or beyond its range from where the listener
   * last stood, so it never takes the marker of a nearer sound still showing).
   */
  add(sound: HeardSound, time: number): void {
    if (!this.enabled) return;
    if (Math.hypot(sound.x - this.listenerX, sound.z - this.listenerZ) > SOUND_CUES.range[sound.kind] * (sound.reach ?? 1)) return;
    let same: Marker | undefined;
    let free: Marker | undefined;
    let oldest: Marker | undefined;
    for (const m of this.markers) {
      const active = !Number.isNaN(m.at);
      if (active && m.sound.sourceId === sound.sourceId && m.sound.kind === sound.kind) {
        same = m;
        break;
      }
      if (!active) free ??= m;
      else if (!oldest || m.at < oldest.at) oldest = m;
    }
    // The same player's marker for this kind, else a free one, else the oldest.
    const m = (same ?? free ?? oldest)!;
    m.sound.kind = sound.kind;
    m.sound.sourceId = sound.sourceId;
    m.sound.x = sound.x;
    m.sound.z = sound.z;
    m.at = time;
  }

  /** Once per frame: places the markers for a listener at (x, z) looking along `viewYaw`. */
  update(x: number, z: number, viewYaw: number, time: number): void {
    this.listenerX = x;
    this.listenerZ = z;
    for (const m of this.markers) {
      if (Number.isNaN(m.at)) continue;
      const s = m.sound;
      const opacity = roundTo(cueOpacity(s.kind, time - m.at, Math.hypot(s.x - x, s.z - z)), SOUND_CUES.opacityStep);
      if (opacity <= 0) {
        this.free(m);
        continue;
      }
      if (m.kind !== s.kind) {
        if (m.kind) m.root.classList.remove(`cue-${m.kind}`);
        m.root.classList.add(`cue-${(m.kind = s.kind)}`);
      }
      const angle = roundTo(cueAngle(viewYaw, x, z, s.x, s.z), SOUND_CUES.angleStep);
      if (angle !== m.angle) m.root.style.setProperty('--a', `${(m.angle = angle)}rad`);
      if (opacity !== m.opacity) m.root.style.opacity = String((m.opacity = opacity));
      if (m.root.hidden) m.root.hidden = false;
    }
  }

  /** Every marker off (a new round, cues turned off). */
  clear(): void {
    for (const m of this.markers) this.free(m);
  }

  dispose(): void {
    this.root.remove();
  }

  private showRing(): void {
    this.root.hidden = !(this.visible && this.enabled);
  }

  private free(m: Marker): void {
    m.at = Number.NaN;
    m.sound.sourceId = -1;
    if (!m.root.hidden) m.root.hidden = true;
  }
}
