import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundState } from '../sim/round';
import { FlagRenderer } from './flagRenderer';

/** Just the fields FlagRenderer.update reads. */
function round(attackers: number, status: string, progress = 0.3): RoundState {
  return { mode: 'attackDefend', attackers, phase: 'live', flag: { position: { x: 1, y: 0, z: 2 }, progress, status } } as unknown as RoundState;
}

describe('FlagRenderer colours (M77 acceptance 3, REN-10)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sets a cloth and ring colour only when it changes, not every frame', () => {
    const flag = new FlagRenderer([0x2f6fd6, 0xf07a22], 2);
    const set = vi.spyOn(THREE.Color.prototype, 'setHex');
    flag.update(round(0, 'idle'), 0);
    const first = set.mock.calls.length;
    expect(first).toBe(2); // the cloth and the ring, once each
    for (let t = 1; t < 20; t++) flag.update(round(0, 'idle', 0.3 + t * 0.01), t / 60);
    expect(set.mock.calls.length).toBe(first);

    flag.update(round(1, 'idle'), 1); // attackers swap: the cloth takes the other team's colour
    expect(set.mock.calls.length).toBe(first + 1);
    expect(set.mock.calls.at(-1)![0]).toBe(0xf07a22);
    flag.update(round(1, 'idle'), 1.1);
    expect(set.mock.calls.length).toBe(first + 1);

    flag.update(round(1, 'contested'), 1.2); // the ring changes, the cloth doesn't
    expect(set.mock.calls.length).toBe(first + 2);
    flag.update(round(1, 'contested'), 1.3);
    expect(set.mock.calls.length).toBe(first + 2);
    flag.dispose();
  });

  it('really paints the colour it was given (the skip loses nothing)', () => {
    const flag = new FlagRenderer([0x2f6fd6, 0xf07a22], 2);
    const colours = (): number[] => {
      const out: number[] = [];
      flag.object.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) out.push(o.material.color.getHex());
      });
      return out;
    };
    flag.update(round(0, 'idle'), 0);
    flag.update(round(0, 'idle'), 1);
    expect(colours()).toContain(new THREE.Color().setHex(0x2f6fd6).getHex());
    flag.update(round(1, 'idle'), 2);
    expect(colours()).toContain(new THREE.Color().setHex(0xf07a22).getHex());
    flag.dispose();
  });
});
