import type * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { QUALITY } from '../config/render';
import { ReplicaSheen, type SheenTarget } from './replicaSheen';

/** A stand-in for the prefiltered target: no WebGL needed. */
function fakeFactory() {
  const made: { texture: THREE.Texture; dispose: ReturnType<typeof vi.fn> }[] = [];
  const make = vi.fn((): SheenTarget => {
    const t = { texture: { id: made.length } as unknown as THREE.Texture, dispose: vi.fn() };
    made.push(t);
    return t;
  });
  return { make, made };
}

const gl = {} as THREE.WebGLRenderer;

describe('ReplicaSheen (REN-06)', () => {
  it('prefilters once and shares the target between sessions while the setting is on', () => {
    const { make, made } = fakeFactory();
    const sheen = new ReplicaSheen(make);
    const first = sheen.texture(gl, QUALITY.high.replicaSheen);
    const again = sheen.texture(gl, QUALITY.high.replicaSheen);
    expect(first).toBe(made[0]!.texture);
    expect(again).toBe(first);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('frees the target when the setting goes off (Low) and does not make it again while off', () => {
    const { make, made } = fakeFactory();
    const sheen = new ReplicaSheen(make);
    sheen.texture(gl, true);
    sheen.trim(QUALITY.low.replicaSheen);
    expect(made[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(sheen.texture(gl, QUALITY.low.replicaSheen)).toBeNull();
    sheen.trim(QUALITY.low.replicaSheen);
    expect(make).toHaveBeenCalledTimes(1);
    expect(made[0]!.dispose).toHaveBeenCalledTimes(1);
    // Back on: made afresh.
    expect(sheen.texture(gl, true)).toBe(made[1]!.texture);
  });

  it('keeps the target when the setting stays on', () => {
    const { make, made } = fakeFactory();
    const sheen = new ReplicaSheen(make);
    sheen.texture(gl, true);
    sheen.trim(true);
    expect(made[0]!.dispose).not.toHaveBeenCalled();
    expect(sheen.texture(gl, true)).toBe(made[0]!.texture);
  });

  it('after a lost context drops the target without freeing it on the new context, and makes it again', () => {
    const { make, made } = fakeFactory();
    const sheen = new ReplicaSheen(make);
    sheen.texture(gl, true);
    sheen.forget();
    expect(made[0]!.dispose).not.toHaveBeenCalled();
    expect(sheen.texture(gl, true)).toBe(made[1]!.texture);
    sheen.dispose();
    expect(made[1]!.dispose).toHaveBeenCalledTimes(1);
  });
});
