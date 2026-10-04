import { describe, expect, it } from 'vitest';
import { SOUND_CUES } from '../config/accessibility';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { cueAngle, cueOpacity, type HeardSound, soundCueOf } from './soundCues';

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
    const hit = (victimId: number, shooterId: number): GameEvent => ({ type: 'characterHit', victimId, shooterId, position: vec3(9, 1, 9), direction: vec3(0, 0, 1) });
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
