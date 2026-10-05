import { beforeAll, describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { regenClear, type WaveSetup } from '../sim/extraction';
import { vec3 } from '../sim/vec';
import { MAPS } from './maps';

/**
 * Regen points (M45) on every map with an extraction block, against the map's real level (Rapier, as the game sees
 * it): wherever the squad stands (its insertion, a case spot, an exit), some regen point is far enough and out of its
 * sight, so a wave always has somewhere to come in.
 */
const CTX = { squadTeam: 0, spawnLift: PHYSICS.groundRestGap, rules: EXTRACTION };
/** From its insertion a full squad must leave this many usable: a wave of several never waits long. */
const FROM_INSERTION = 3;

describe('Extraction regen points (M45)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const { label, data: map } of MAPS) {
    const x = map.extraction;
    if (!x) continue;
    describe(label, () => {
      it('stand on walkable floor, away from the exits', () => {
        const nav = buildNavGrid(map, NAV);
        expect(x.regens.length).toBeGreaterThanOrEqual(x.baseOpponents + EXTRACTION.maxSquad);
        for (const r of x.regens) {
          expect(isWalkableAt(nav, r.position.x, r.position.y, r.position.z), JSON.stringify(r.position)).toBe(true);
          for (const e of x.exits) expect(Math.hypot(r.position.x - e.position.x, r.position.z - e.position.z), e.name).toBeGreaterThan(e.radius + 1);
        }
      });

      it('leave usable points out of sight wherever the squad stands: its insertion, any case spot, any exit', () => {
        const physics = new PhysicsWorld(map, BODY, 1 / 60);
        const waves: WaveSetup = { regens: x.regens, regenDistance: x.regenDistance, every: 75, cap: 5, lateExtra: 1, lateFrom: 0, sight: { query: physics, body: BODY } };
        const standing = (p: { x: number; y: number; z: number }, id = 0) => createCharacter(id, vec3(p.x, p.y + PHYSICS.groundRestGap, p.z), 0, LOADOUT, 0);
        const usable = (squad: ReturnType<typeof standing>[]) => x.regens.filter((r) => regenClear(r, squad, CTX, waves)).length;
        for (const ins of x.insertions) {
          expect(usable(ins.spawns.map((s, i) => standing(s.position, i))), ins.name).toBeGreaterThanOrEqual(FROM_INSERTION);
        }
        for (const c of x.cases) expect(usable([standing(c.position)]), JSON.stringify(c.position)).toBeGreaterThanOrEqual(1);
        for (const e of x.exits) expect(usable([standing(e.position)]), e.name).toBeGreaterThanOrEqual(1);
        physics.dispose();
      });

      it('are each out of sight from somewhere: none is a point no wave could use', () => {
        const physics = new PhysicsWorld(map, BODY, 1 / 60);
        const waves: WaveSetup = { regens: x.regens, regenDistance: x.regenDistance, every: 75, cap: 5, lateExtra: 1, lateFrom: 0, sight: { query: physics, body: BODY } };
        const from = [...x.insertions.flatMap((i) => i.spawns), ...x.cases];
        for (const r of x.regens) {
          const somewhere = from.some((p) => regenClear(r, [createCharacter(0, vec3(p.position.x, p.position.y + PHYSICS.groundRestGap, p.position.z), 0, LOADOUT, 0)], CTX, waves));
          expect(somewhere, JSON.stringify(r.position)).toBe(true);
        }
        physics.dispose();
      });
    });
  }
});
