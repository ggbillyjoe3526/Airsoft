import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIGURE } from '../config/characters';
import { HITS } from '../config/hits';
import { HOLSTER } from '../config/movement';
import { VIEWMODEL } from '../config/render';
import { LOADOUT } from '../config/replicas';
import { createArmament } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { CharacterRenderer } from './characterRenderer';
import { Viewmodel } from './viewmodel';

/** M92 (acceptance 2): what the holster looks like, first and third person. */

const DT = 1 / 60;

describe('the first-person replica (VIEWMODEL.holster)', () => {
  it('is hidden once put away (after putAwayTime), shown while it dips out, and shown again as the draw starts', () => {
    const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
    const arm = createArmament(LOADOUT);
    const visible = (): boolean => (vm as unknown as { slots: { model: THREE.Object3D }[] }).slots[arm.active]!.model.visible;
    const frame = (): void => vm.update(DT, 0, 0, 0, 4.2, 0, arm, false, 0);
    frame();
    expect(visible()).toBe(true);
    arm.holstered = true;
    frame();
    expect(visible(), 'still dipping out of view').toBe(true);
    for (let t = 0; t < VIEWMODEL.holster.putAwayTime + 3 * DT; t += DT) frame();
    expect(visible()).toBe(false);
    for (let i = 0; i < 30; i++) frame();
    expect(visible()).toBe(false);
    // Drawn: it comes up from out of view over the longer draw.
    arm.holstered = false;
    arm.draw = arm.drawTotal = arm.handling[0]!.drawTime * HOLSTER.drawScale;
    frame();
    expect(visible()).toBe(true);
    vm.dispose?.();
  });
});

describe('the third-person figure (FIGURE.holster)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterEach(() => void vi.unstubAllGlobals());

  function figureOf() {
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    const r = new CharacterRenderer([c], [0x3d8bff, 0xff5a3d], HITS);
    const f = (r as unknown as { figures: { figure: { aim: THREE.Object3D; holsterPose: THREE.Object3D; hitPose: THREE.Object3D } }[] }).figures[0]!.figure;
    return { c, r, f };
  }

  it('shows the holster pose and not the aim while the replica is away; the aim again past swapAt of the draw', () => {
    const { c, r, f } = figureOf();
    r.update(1, DT, -1);
    expect(f.aim.visible).toBe(true);
    expect(f.holsterPose.visible).toBe(false);

    c.armament.holstered = true;
    r.update(1, DT, -1);
    expect(f.holsterPose.visible).toBe(true);
    expect(f.aim.visible).toBe(false);

    // Drawn: still slung early in the draw, then the aim takes over past swapAt, rising to the view.
    c.armament.holstered = false;
    c.armament.draw = c.armament.drawTotal = 1;
    c.armament.draw = 1 - (FIGURE.holster.swapAt - 0.1);
    r.update(1, DT, -1);
    expect(f.holsterPose.visible).toBe(true);
    expect(f.aim.visible).toBe(false);
    c.armament.draw = 1 - (FIGURE.holster.swapAt + 0.1);
    r.update(1, DT, -1);
    expect(f.holsterPose.visible).toBe(false);
    expect(f.aim.visible).toBe(true);
    expect(f.aim.rotation.x).toBeLessThan(0); // still low, rising (drawPitch)
    c.armament.draw = 0;
    r.update(1, DT, -1);
    expect(f.aim.visible).toBe(true);
    expect(f.aim.rotation.x).toBeCloseTo(c.pitch, 6);
    r.dispose();
  });

  it('a plain switch draw shows the aim throughout, not the holster pose', () => {
    const { c, r, f } = figureOf();
    r.update(1, DT, -1);
    c.armament.draw = c.armament.drawTotal = 0.3;
    r.update(1, DT, -1);
    expect(f.holsterPose.visible).toBe(false);
    expect(f.aim.visible).toBe(true);
    r.dispose();
  });

  it('a hit character raises a hand, not the holster pose, even holstered', () => {
    const { c, r, f } = figureOf();
    c.armament.holstered = true;
    c.status = 'calling';
    r.update(1, DT, -1);
    expect(f.holsterPose.visible).toBe(false);
    expect(f.hitPose.visible).toBe(true);
    r.dispose();
  });
});
