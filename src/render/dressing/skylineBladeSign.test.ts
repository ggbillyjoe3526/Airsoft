import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DRESSING } from '../../config/dressing';
import type { SkylinePiece } from '../../map/mapTypes';
import { skylineGeometries } from './skyline';

/** BP3b QA: a tower's blade sign stands out from its facade (thin along the face, wide away from it). */

const S = DRESSING.tower.sign;
const sizes = (piece: SkylinePiece): THREE.Vector3[] =>
  skylineGeometries([piece], { x: 0, z: 0 }).map((g) => {
    g.computeBoundingBox();
    return g.boundingBox!.getSize(new THREE.Vector3());
  });
const isSign = (v: THREE.Vector3, x: number, z: number): boolean => Math.abs(v.y - S.height) < 1e-4 && Math.abs(v.x - x) < 1e-4 && Math.abs(v.z - z) < 1e-4;

describe('a blade sign stands out from its tower facade', () => {
  it('on a facade facing along z (tower north of the middle) the plate is 0.25 thin in x and the sign width deep in z', () => {
    const all = sizes({ kind: 'tower', x: 0, z: -40, width: 14, depth: 11, height: 40, base: 10, sign: 0xff00ff });
    expect(all.some((v) => isSign(v, 0.25, S.width))).toBe(true);
    expect(all.some((v) => isSign(v, S.width, 0.25)), 'not lying flat on the face').toBe(false);
  });

  it('on a facade facing along x (tower east of the middle) the plate is thin in z and the sign width deep in x', () => {
    const all = sizes({ kind: 'tower', x: 40, z: 0, width: 14, depth: 11, height: 40, base: 10, sign: 0xff00ff });
    expect(all.some((v) => isSign(v, S.width, 0.25))).toBe(true);
    expect(all.some((v) => isSign(v, 0.25, S.width)), 'not lying flat on the face').toBe(false);
  });
});
