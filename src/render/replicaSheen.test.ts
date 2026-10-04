import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT, QUALITY } from '../config/render';
import { skyColour } from './atmosphere';
import { defaultEnvironmentLook, disposeEnvironmentScene, ReplicaSheen, type SheenTarget, skyEnvironmentScene, sunDirection } from './replicaSheen';

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

describe('the sky-derived environment map (audit section 5, F1)', () => {
  it('is made from the game’s own sky over a concrete ground, so replicas and figures reflect what the player sees', () => {
    const scene = skyEnvironmentScene();
    const sky = scene.children.find((o) => o.name !== 'ground') as THREE.Mesh;
    const pos = sky.geometry.getAttribute('position');
    const col = sky.geometry.getAttribute('color');
    const sun = sunDirection();
    const dir = new THREE.Vector3();
    const want = new THREE.Color();
    for (const i of [0, Math.floor(pos.count / 3), pos.count - 1]) {
      skyColour(dir.fromBufferAttribute(pos, i).normalize(), sun, want);
      expect(col.getX(i)).toBeCloseTo(want.r);
      expect(col.getZ(i)).toBeCloseTo(want.b);
    }
    expect((sky.material as THREE.Material).side).toBe(THREE.BackSide);
    const ground = scene.getObjectByName('ground') as THREE.Mesh;
    expect(ground.position.y).toBeLessThan(0);
    expect((ground.material as THREE.MeshBasicMaterial).color.getHex()).toBe(ENVIRONMENT.ground);
    // Seen from the middle, the ground fills the lower half of the view almost to the horizon.
    expect(ENVIRONMENT.groundRadius / ENVIRONMENT.groundDrop).toBeGreaterThan(20);
    disposeEnvironmentScene(scene);
  });

  it('points at the sun the lighting places', () => {
    expect(sunDirection().length()).toBeCloseTo(1);
    expect(sunDirection().y).toBeGreaterThan(0);
  });
});

describe('the environment map per sky (engine-level: a map with another sky gets its own)', () => {
  it('is built from the sky values passed in, not the daytime constants', () => {
    const day = defaultEnvironmentLook();
    const night = { ...day, sky: { ...day.sky, zenith: 0x0b1530, horizon: 0x1c2a44 }, ground: 0x30302c };
    const scene = skyEnvironmentScene(night);
    const sky = scene.children.find((o) => o.name !== 'ground') as THREE.Mesh;
    const col = sky.geometry.getAttribute('color');
    const pos = sky.geometry.getAttribute('position');
    const want = skyColour(new THREE.Vector3().fromBufferAttribute(pos, 0).normalize(), sunDirection(), new THREE.Color(), night.sky);
    expect(col.getZ(0)).toBeCloseTo(want.b);
    expect(((scene.getObjectByName('ground') as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x30302c);
    disposeEnvironmentScene(scene);
  });

  it('keeps one prefiltered target per look: the same sky is shared, another sky frees the old and makes its own', () => {
    const { make, made } = fakeFactory();
    const sheen = new ReplicaSheen(make);
    const day = defaultEnvironmentLook();
    const first = sheen.texture(gl, true, day);
    expect(sheen.texture(gl, true, defaultEnvironmentLook())).toBe(first);
    expect(make).toHaveBeenCalledTimes(1);
    const night = { ...day, sky: { ...day.sky, zenith: 0x0b1530 } };
    const second = sheen.texture(gl, true, night);
    expect(second).not.toBe(first);
    expect(make).toHaveBeenCalledTimes(2);
    expect(made[0]!.dispose).toHaveBeenCalledTimes(1);
    expect((make.mock.calls[1] as unknown[])[1]).toBe(night);
  });
});
