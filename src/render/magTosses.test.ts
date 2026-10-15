import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { MAG_SHARE } from '../config/magShare';
import { BODY } from '../config/movement';
import { GAS_PISTOL, LOADOUT } from '../config/replicas';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { catchPoint, createMagTosses, tossMag } from '../sim/magShare';
import { vec3 } from '../sim/vec';
import { MagTossRenderer, tossArc } from './magTosses';

/** MG1: the tossed magazine on screen: where its flight has it, how high its arc, and which box. */

const DT = 1 / 60;
const world = { query: { raycastStatic: () => -1 } as unknown as WorldQuery, body: BODY, hits: HITS };

function scene(d: number, kit = LOADOUT) {
  const cs = [createCharacter(0, vec3(0, 0, 0), 0, kit, 0), createCharacter(1, vec3(d, 0, 0), 0, kit, 0)];
  cs[1]!.armament.ammo[0]!.pouch.fill(0);
  const tosses = createMagTosses();
  const events: GameEvent[] = [];
  tossMag(cs[0]!, 1, cs, tosses, world, events);
  const r = new MagTossRenderer(tosses, cs, world, DT);
  return { cs, tosses, r, mesh: r.object.children[0]! };
}

describe('the tossed magazine (MG1)', () => {
  it('arcs higher the longer the toss, up to arcHeight, and is on the line at both ends', () => {
    expect(tossArc(0, 6)).toBe(0);
    expect(tossArc(1, 6)).toBe(0);
    expect(tossArc(0.5, 1)).toBeCloseTo(MAG_SHARE.arcPerMetre, 6);
    expect(tossArc(0.5, 3)).toBeCloseTo(3 * MAG_SHARE.arcPerMetre, 6);
    expect(tossArc(0.5, 50)).toBeCloseTo(MAG_SHARE.arcHeight, 6);
  });

  it('leaves the hand, peaks midway and lands on the catcher’s chest; hidden once caught', () => {
    const { cs, tosses, r, mesh } = scene(4);
    const t = tosses[0]!;
    r.update(0);
    expect(mesh.visible).toBe(true);
    expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([t.from.x, t.from.y, t.from.z]);
    t.age = t.flight / 2;
    r.update(0);
    const chest = catchPoint(cs[1]!, world, vec3());
    const d = Math.hypot(chest.x - t.from.x, chest.z - t.from.z);
    expect(mesh.position.y).toBeCloseTo((t.from.y + chest.y) / 2 + tossArc(0.5, d), 6);
    t.age = t.flight;
    r.update(0);
    expect(mesh.position.x).toBeCloseTo(chest.x, 6);
    expect(mesh.position.y).toBeCloseTo(chest.y, 6);
    t.active = false;
    r.update(0);
    expect(mesh.visible).toBe(false);
    r.dispose();
  });

  it('is a pistol’s smaller box from a pistol, a rifle’s from a rifle', () => {
    const rifle = scene(3);
    rifle.r.update(0);
    const pistol = scene(3, [GAS_PISTOL]);
    pistol.r.update(0);
    const height = (m: typeof rifle.mesh) => ((m as unknown as { geometry: { parameters: { height: number } } }).geometry.parameters.height);
    expect(height(rifle.mesh)).toBe(MAG_SHARE.look.rifle[1]);
    expect(height(pistol.mesh)).toBe(MAG_SHARE.look.pistol[1]);
    rifle.r.dispose();
    pistol.r.dispose();
  });
});
