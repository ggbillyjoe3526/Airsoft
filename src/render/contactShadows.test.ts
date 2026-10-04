import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONTACT_SHADOWS } from '../config/render';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { contactDiscGeometry, contactRadius, ContactShadows } from './contactShadows';

describe('contactDiscGeometry (F5)', () => {
  it('is a flat disc facing up, dark in the middle and clear at the rim, with no texture', () => {
    const geo = contactDiscGeometry();
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    expect(col.itemSize).toBe(4);
    const idx = geo.getIndex()!;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)].map((i) => new THREE.Vector3().fromBufferAttribute(pos, i));
      expect(b!.clone().sub(a!).cross(c!.clone().sub(a!)).y).toBeGreaterThan(0);
    }
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBe(0);
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(col.getW(i)).toBeCloseTo(r === 0 ? 1 : r < 0.99 ? CONTACT_SHADOWS.middleShade : 0);
    }
    geo.dispose();
  });
});

describe('contactRadius', () => {
  it('draws tighter as a figure crouches, clamped', () => {
    expect(contactRadius(0)).toBe(CONTACT_SHADOWS.radius);
    expect(contactRadius(1)).toBe(CONTACT_SHADOWS.crouchedRadius);
    expect(contactRadius(2)).toBe(CONTACT_SHADOWS.crouchedRadius);
    expect(contactRadius(0.5)).toBeLessThan(CONTACT_SHADOWS.radius);
  });
});

describe('ContactShadows', () => {
  it('puts a disc under every figure but the one the camera is in, sized by crouch, fading with a figure leaving play', () => {
    const chars = [0, 1, 2].map((id) => createCharacter(id, vec3(id * 3, 0, 0), 0));
    chars[1]!.crouchAmount = chars[1]!.prevCrouchAmount = 1;
    const shadows = new ContactShadows(chars, 2);
    shadows.update(1, 0);
    expect(shadows.object.count).toBe(2);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    shadows.object.getMatrixAt(0, m);
    m.decompose(p, new THREE.Quaternion(), s);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(CONTACT_SHADOWS.lift);
    expect(s.x).toBeCloseTo(CONTACT_SHADOWS.crouchedRadius);

    chars[2]!.status = 'leaving';
    chars[2]!.statusTime = 1;
    shadows.update(1, 0);
    shadows.object.getMatrixAt(1, m);
    m.decompose(p, new THREE.Quaternion(), s);
    expect(s.x).toBeCloseTo(CONTACT_SHADOWS.radius / 2);
    chars[2]!.statusTime = 2;
    shadows.update(1, 0);
    expect(shadows.object.count).toBe(1);
    shadows.dispose();
  });
});
