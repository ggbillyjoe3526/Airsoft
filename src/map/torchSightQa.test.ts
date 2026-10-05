import { describe, expect, it } from 'vitest';
import { BOTS, NIGHT_SIGHT } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { TORCHES } from '../config/torches';
import { type SightConditions, visiblePart } from '../ai/perception';
import { fitParts, type WorldQuery } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { buildNightField, type NightField } from './nightSight';
import { createTorchLight, type TorchLight, updateTorchLight } from './torchLight';
import { WOODLAND } from './woodland';

/**
 * M33h QA, acceptance 3: what the existing torch-light tests leave out. The viewer's own beam lights a target like
 * anyone's; a beam lights the target, it does not see through walls for the viewer; the lens gives a holder away out to
 * the full 40 m; and on the real Woodland night field, with every torch fitted but off (or lit by day), every sighting
 * is exactly what it was without torches. The field is worked out without making a new table each tick.
 */

const noWalls: WorldQuery = { raycastStatic: () => -1 };
const OPEN_NIGHT = buildNightField({ ...OPEN_FIELD, night: true }, NIGHT_SIGHT)!;
const WOODLAND_NIGHT = buildNightField(WOODLAND, NIGHT_SIGHT)!;
const LIT = NIGHT_SIGHT.lit;

function person(id: number, x: number, z: number, yaw: number, lit: boolean, team = id === 0 ? 0 : 1): Character {
  const c = createCharacter(id, vec3(x, 0, z), yaw, LOADOUT, team);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  c.torchOn = lit;
  return c;
}

function sightWith(night: NightField, characters: Character[], query = noWalls, time = 1, field: TorchLight = createTorchLight()): SightConditions {
  updateTorchLight(field, characters, query, BODY, HITS, BOTS.aimHeightFraction, time);
  return { foliage: [], night, torches: field };
}

describe("a bot's own beam and the lens at full reach (M33h acceptance 3)", () => {
  it("lights a target 39.5 m out in the viewer's own beam, past the moonlit open; dark with the torch off", () => {
    const d = LIT - 0.5;
    expect(d).toBeGreaterThan(NIGHT_SIGHT.open);
    for (const lit of [true, false]) {
      const viewer = person(0, 0, 0, 0, lit); // faces -Z, its torch on or off
      const target = person(1, 0, -d, 0, false); // faces away, its own torch off
      const sight = sightWith(OPEN_NIGHT, [viewer, target]);
      expect(sight.torches!.lit[target.id], `torch ${lit ? 'on' : 'off'}`).toBe(lit ? 1 : 0);
      const seen = visiblePart(viewer, target, noWalls, BOTS, BODY, HITS, sight) > 0;
      expect(seen, `torch ${lit ? 'on' : 'off'}`).toBe(lit);
    }
  });

  it('makes out a holder whose lit torch faces the viewer from the full 40 m, not a step beyond', () => {
    const viewer = person(0, 0, 0, 0, false);
    const at = person(1, 0, -LIT, Math.PI, true); // faces +Z, at the viewer
    expect(visiblePart(viewer, at, noWalls, BOTS, BODY, HITS, sightWith(OPEN_NIGHT, [viewer, at]))).toBeGreaterThan(0);
    const beyond = person(1, 0, -(LIT + 0.5), Math.PI, true);
    expect(visiblePart(viewer, beyond, noWalls, BOTS, BODY, HITS, sightWith(OPEN_NIGHT, [viewer, beyond]))).toBe(0);
    expect(TORCHES.weaponTorch.reach).toBe(LIT);
  });

  it("lights the target for everyone, yet a wall between the viewer and the target still hides it", () => {
    const viewer = person(0, 0, 0, 0, false);
    const holder = person(2, 3, 0, 0, true, 0); // 3 m to the side, shining down -Z
    const target = person(1, 3, -30, 0, false);
    // A wall in the viewer's way only (rays from near x = 0), none between the torch and the target.
    const wallForViewer: WorldQuery = { raycastStatic: (o, _d, max) => (Math.abs(o.x) < 1 ? Math.min(2, max) : -1) };
    const sight = sightWith(OPEN_NIGHT, [viewer, target, holder], wallForViewer);
    expect(sight.torches!.lit[target.id]).toBe(1);
    expect(visiblePart(viewer, target, noWalls, BOTS, BODY, HITS, sight)).toBeGreaterThan(0);
    expect(visiblePart(viewer, target, wallForViewer, BOTS, BODY, HITS, sight)).toBe(0);
  });

  it('keeps one table for the field from tick to tick (no new one per update)', () => {
    const all = [person(0, 0, 0, 0, true), person(1, 0, -20, 0, false), person(2, 2, -10, Math.PI, true)];
    const field = createTorchLight();
    sightWith(OPEN_NIGHT, all, noWalls, 1, field);
    const table = field.lit;
    expect(table.length).toBeGreaterThanOrEqual(all.length);
    for (let t = 2; t < 200; t++) {
      all[0]!.yaw = t * 0.05;
      all[0]!.torchOn = t % 3 !== 0;
      sightWith(OPEN_NIGHT, all, noWalls, t, field);
      expect(field.lit).toBe(table);
    }
  });
});

describe('nothing changes with every torch off, or by day (M33h acceptance 3), on the real Woodland field', () => {
  /** Viewers at each end's first spawn, facing down the field, and one between; targets on a 6 m grid in every heading. */
  const spots = WOODLAND.spawns.flat();
  const xs = spots.map((s) => s.position.x);
  const zs = spots.map((s) => s.position.z);
  const [x0, x1, z0, z1] = [Math.min(...xs) - 20, Math.max(...xs) + 20, Math.min(...zs) - 10, Math.max(...zs) + 10];
  const viewers = [
    ...WOODLAND.spawns.map((end) => person(0, end[0]!.position.x, end[0]!.position.z, end[0]!.yaw, false)),
    person(0, (x0 + x1) / 2, (z0 + z1) / 2, Math.PI / 2, false),
  ];

  function sweep(check: (viewer: Character, target: Character) => void): number {
    let n = 0;
    for (const v of viewers) {
      for (let x = x0; x <= x1; x += 6) {
        for (let z = z0; z <= z1; z += 6) {
          for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            check(v, person(1, x, z, yaw, false));
            n++;
          }
        }
      }
    }
    return n;
  }

  it('sees exactly as without torches when every torch is fitted but off', () => {
    let seen = 0;
    let dark = 0;
    const n = sweep((viewer, target) => {
      const withTorches = sightWith(WOODLAND_NIGHT, [viewer, target]);
      const before: SightConditions = { foliage: [], night: WOODLAND_NIGHT };
      const a = visiblePart(viewer, target, noWalls, BOTS, BODY, HITS, withTorches);
      expect(a).toBe(visiblePart(viewer, target, noWalls, BOTS, BODY, HITS, before));
      const dist = Math.hypot(target.position.x - viewer.position.x, target.position.z - viewer.position.z);
      if (a > 0) seen++;
      else if (dist > NIGHT_SIGHT.open && dist < BOTS.viewDistance) dark++;
    });
    expect(n).toBeGreaterThan(500);
    // The sweep has people seen, and people the dark hides who a torch facing the viewer would give away.
    expect(seen).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0);
  });

  it('sees by day exactly as without torches, every torch lit', () => {
    const day: SightConditions = { foliage: WOODLAND.foliage ?? [], night: null };
    sweep((viewer, target) => {
      const unlit = visiblePart(viewer, target, noWalls, BOTS, BODY, HITS, day);
      viewer.torchOn = true;
      target.torchOn = true;
      // The day's conditions carry no field; a field worked out anyway (lit beams) changes nothing without a night.
      const lit = visiblePart(viewer, target, noWalls, BOTS, BODY, HITS, { ...day, torches: sightWith(OPEN_NIGHT, [viewer, target]).torches ?? null });
      viewer.torchOn = false;
      expect(lit).toBe(unlit);
    });
  });
});
