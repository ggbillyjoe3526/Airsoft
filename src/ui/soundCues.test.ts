import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SOUND_CUES } from '../config/accessibility';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { cueAngle, cueOpacity, type HeardSound, SoundCues, soundCueOf } from './soundCues';

const person = (id: number, team: number, x = 0, z = 0): Character => ({ id, team, position: vec3(x, 0, z) }) as Character;

describe('soundCueOf (M18b)', () => {
  const you = person(0, 0);
  const mate = person(1, 0, 3, 0);
  const enemy = person(3, 1, -4, 9);
  const all = [you, mate, enemy];
  const of = (id: number) => all.find((c) => c.id === id);
  const out: HeardSound = { kind: 'step', sourceId: -1, x: 0, z: 0 };
  const cue = (e: GameEvent) => (soundCueOf(e, you, of, out) ? { ...out } : null);

  it("gives enemies' footsteps a cue at where they stand, and not your team's or your own", () => {
    expect(cue({ type: 'footstep', characterId: 3, kind: 'run' } as GameEvent)).toEqual({ kind: 'step', sourceId: 3, x: -4, z: 9 });
    expect(cue({ type: 'footstep', characterId: 1, kind: 'run' } as GameEvent)).toBeNull();
    expect(cue({ type: 'footstep', characterId: 0, kind: 'run' } as GameEvent)).toBeNull();
  });

  it("gives everyone else's shots a cue, but not yours", () => {
    expect(cue({ type: 'shot', characterId: 1, replicaId: 'aeg', position: vec3() })?.kind).toBe('shot');
    expect(cue({ type: 'shot', characterId: 3, replicaId: 'aeg', position: vec3() })?.sourceId).toBe(3);
    expect(cue({ type: 'shot', characterId: 0, replicaId: 'aeg', position: vec3() })).toBeNull();
  });

  it('puts a hit call where the hit player is, and none for your own', () => {
    const hit = (victimId: number, shooterId: number): GameEvent => ({ type: 'characterHit', victimId, shooterId, position: vec3(9, 1, 9), direction: vec3(0, 0, 1), ricochet: false });
    expect(cue(hit(3, 0))).toEqual({ kind: 'hit', sourceId: 3, x: -4, z: 9 });
    expect(cue(hit(0, 3))).toBeNull();
  });

  it('ignores sounds that are not a person (impacts, the whistle)', () => {
    expect(cue({ type: 'bbImpact', position: vec3(), ownerId: 3 })).toBeNull();
    expect(cue({ type: 'roundStart', round: 2 })).toBeNull();
  });
});

describe('cueAngle', () => {
  // The game's yaw: 0 looks down -z, positive turns left.
  it('is 0 straight ahead, positive to the right, ±π behind', () => {
    expect(cueAngle(0, 0, 0, 0, -10)).toBeCloseTo(0);
    expect(cueAngle(0, 0, 0, 10, 0)).toBeCloseTo(Math.PI / 2);
    expect(cueAngle(0, 0, 0, -10, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(cueAngle(0, 0, 0, 0, 10))).toBeCloseTo(Math.PI);
  });

  it('turns with the view: facing the sound puts it ahead', () => {
    // A sound to the left (-x); turning left a quarter turn faces it.
    expect(cueAngle(Math.PI / 2, 0, 0, -10, 0)).toBeCloseTo(0);
    // And from a listener elsewhere it is measured from there.
    expect(cueAngle(0, 5, 5, 5, -5)).toBeCloseTo(0);
  });
});

describe('cueOpacity', () => {
  it('shows a cue fully close by and fainter at the edge of its range, then fades out', () => {
    expect(cueOpacity('shot', 0, 0)).toBeCloseTo(1);
    expect(cueOpacity('shot', 0, SOUND_CUES.range.shot)).toBeCloseTo(SOUND_CUES.farOpacity);
    expect(cueOpacity('shot', SOUND_CUES.life - SOUND_CUES.fade / 2, 0)).toBeCloseTo(0.5);
    expect(cueOpacity('shot', SOUND_CUES.life, 0)).toBe(0);
  });

  it('shows nothing beyond the range the sound is played to', () => {
    expect(cueOpacity('step', 0, SOUND_CUES.range.step + 0.1)).toBe(0);
    expect(cueOpacity('shot', 0, SOUND_CUES.range.step + 0.1)).toBeGreaterThan(0);
  });
});

/** Just enough of an element for SoundCues (the tests run without a browser). */
class FakeElement {
  className = '';
  hidden = false;
  readonly children: FakeElement[] = [];
  readonly props = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly style = {
    opacity: '',
    setProperty: (name: string, value: string) => void this.props.set(name, value),
  };
  readonly classList = {
    add: (c: string) => void this.classes.add(c),
    remove: (c: string) => void this.classes.delete(c),
  };
  setAttribute(): void {}
  append(...els: FakeElement[]): void {
    this.children.push(...els);
  }
  appendChild(el: FakeElement): void {
    this.children.push(el);
  }
  remove(): void {}
}

describe('SoundCues (the ring)', () => {
  const realDocument = globalThis.document;
  beforeEach(() => {
    (globalThis as { document: unknown }).document = { createElement: () => new FakeElement() };
  });
  afterEach(() => {
    (globalThis as { document: unknown }).document = realDocument;
  });

  const make = () => {
    const parent = new FakeElement();
    const cues = new SoundCues(parent as unknown as HTMLElement);
    const ring = parent.children[0]!;
    const shown = () => ring.children.filter((m) => !m.hidden);
    return { cues, ring, shown };
  };
  const shot = (sourceId: number, x: number, z: number): HeardSound => ({ kind: 'shot', sourceId, x, z });

  it('shows the ring only while playing with cues on', () => {
    const { cues, ring } = make();
    expect(ring.hidden).toBe(true);
    cues.setVisible(true);
    expect(ring.hidden).toBe(true);
    cues.setEnabled(true);
    expect(ring.hidden).toBe(false);
    cues.setVisible(false);
    expect(ring.hidden).toBe(true);
    cues.setVisible(true);
    cues.setEnabled(false);
    expect(ring.hidden).toBe(true);
  });

  it('places a heard sound, turns it with the view and lets it fade out', () => {
    const { cues, shown } = make();
    cues.setEnabled(true);
    cues.setVisible(true);
    cues.add(shot(3, 10, 0), 0);
    cues.update(0, 0, 0, 0.1);
    expect(shown()).toHaveLength(1);
    const marker = shown()[0]!;
    expect(marker.classes.has('cue-shot')).toBe(true);
    // Straight to the right of a listener looking down -z.
    expect(parseFloat(marker.props.get('--a')!)).toBeCloseTo(Math.PI / 2, 1);
    // Turning right a quarter turn faces it.
    cues.update(0, 0, -Math.PI / 2, 0.2);
    expect(parseFloat(marker.props.get('--a')!)).toBeCloseTo(0, 1);
    cues.update(0, 0, 0, SOUND_CUES.life + 0.1);
    expect(shown()).toHaveLength(0);
  });

  it('ignores sounds while cues are off', () => {
    const { cues, shown } = make();
    cues.add(shot(3, 10, 0), 0);
    cues.update(0, 0, 0, 0.1);
    expect(shown()).toHaveLength(0);
  });

  it('drops a sound beyond its range from the listener, so it never takes a nearer cue\'s marker', () => {
    const { cues, shown } = make();
    cues.setEnabled(true);
    cues.update(0, 0, 0, 0);
    for (let id = 1; id <= SOUND_CUES.markers; id++) cues.add(shot(id, id, 0), 0);
    cues.add({ kind: 'step', sourceId: 99, x: SOUND_CUES.range.step + 1, z: 0 }, 0.05);
    cues.update(0, 0, 0, 0.1);
    expect(shown()).toHaveLength(SOUND_CUES.markers);
    expect(shown().every((m) => m.classes.has('cue-shot'))).toBe(true);
  });

  it('moves the same player\'s marker for a burst, and measures from the first listener spot it is given', () => {
    const { cues, shown } = make();
    cues.setEnabled(true);
    // Before any update nothing is dropped (the listener is not known yet).
    cues.add(shot(3, 500, 0), 0);
    cues.add(shot(3, 10, 0), 0.05);
    cues.add(shot(3, 0, -10), 0.1);
    cues.update(0, 0, 0, 0.15);
    expect(shown()).toHaveLength(1);
    expect(parseFloat(shown()[0]!.props.get('--a')!)).toBeCloseTo(0, 1);
  });
});
