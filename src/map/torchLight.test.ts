import { describe, expect, it } from 'vitest';
import { BOTS, NIGHT_SIGHT } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { TORCHES } from '../config/torches';
import { OPEN_SIGHT, type SightConditions, sightConditionsOf, visiblePart } from '../ai/perception';
import { fitParts, type WorldQuery } from '../sim/armament';
import { type Character, createCharacter } from '../sim/character';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { playsAtNight } from '../render/lightingPreset';
import { DEPOT } from './depot';
import { buildNightField } from './nightSight';
import { createTorchLight, torchSightRange, updateTorchLight } from './torchLight';
import { WOODLAND } from './woodland';

const noWalls: WorldQuery = { raycastStatic: () => -1 };
const wall: WorldQuery = { raycastStatic: (_o, _d, max) => Math.min(5, max) };
const NIGHT = buildNightField({ ...OPEN_FIELD, night: true }, NIGHT_SIGHT)!;

/** A character at (x, z) facing `yaw` (0: -Z), with a weapon torch on every replica, `lit` or not. */
function person(id: number, x: number, z: number, yaw: number, lit: boolean, team = id === 0 ? 0 : 1): Character {
  const c = createCharacter(id, vec3(x, 0, z), yaw, LOADOUT, team);
  fitParts(c.armament, c.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  c.torchOn = lit;
  return c;
}

/** Night sight with the torch light worked out for `characters` at time 1. */
function nightWith(characters: Character[], query = noWalls): SightConditions {
  const torches = createTorchLight();
  updateTorchLight(torches, characters, query, BODY, HITS, BOTS.aimHeightFraction, 1);
  return { foliage: [], night: NIGHT, torches };
}

describe('bots see by torchlight on a night field (M33h)', () => {
  const viewer = person(0, 0, 0, 0, false); // faces -Z
  const FAR = -35; // beyond the moonlit open, within a torch's reach and NIGHT_SIGHT.lit

  it('makes a target out at 35 m when its own lit torch faces the viewer, not when it points away', () => {
    expect(-FAR).toBeGreaterThan(NIGHT_SIGHT.open);
    expect(-FAR).toBeLessThan(NIGHT_SIGHT.lit);
    const dark = person(1, 0, FAR, Math.PI, false);
    expect(visiblePart(viewer, dark, noWalls, BOTS, BODY, HITS, nightWith([viewer, dark]))).toBe(0);
    const facing = person(1, 0, FAR, Math.PI, true); // faces +Z, at the viewer
    expect(torchSightRange(nightWith([viewer, facing]).torches!, NIGHT, viewer, facing)).toBe(NIGHT_SIGHT.lit);
    expect(visiblePart(viewer, facing, noWalls, BOTS, BODY, HITS, nightWith([viewer, facing]))).toBeGreaterThan(0);
    const away = person(1, 0, FAR, 0, true);
    expect(visiblePart(viewer, away, noWalls, BOTS, BODY, HITS, nightWith([viewer, away]))).toBe(0);
    // Turned past torchSeenFromDeg: its lens no longer shows.
    const aside = person(1, 0, FAR, Math.PI + ((NIGHT_SIGHT.torchSeenFromDeg + 10) * Math.PI) / 180, true);
    expect(visiblePart(viewer, aside, noWalls, BOTS, BODY, HITS, nightWith([viewer, aside]))).toBe(0);
  });

  it('makes a target out at 35 m when a lit beam falls on it, not outside the cone or past a wall', () => {
    const target = person(1, 1, FAR, 0, false);
    const holder = person(2, 1, 0, 0, true, 0); // beside the viewer, shining down -Z
    const lit = nightWith([viewer, target, holder]);
    expect(lit.torches!.lit[target.id]).toBe(1);
    expect(visiblePart(viewer, target, noWalls, BOTS, BODY, HITS, lit)).toBeGreaterThan(0);

    // Out of the spill: 25 degrees off the beam's line.
    const off = person(1, 1 + 35 * Math.tan((25 * Math.PI) / 180), FAR, 0, false);
    expect(25).toBeGreaterThan(TORCHES.weaponTorch.spillDeg / 2);
    expect(visiblePart(viewer, off, noWalls, BOTS, BODY, HITS, nightWith([viewer, off, holder]))).toBe(0);

    // A wall between the torch and the target: no light on them.
    expect(nightWith([viewer, target, holder], wall).torches!.lit[target.id]).toBe(0);
    // Beyond the torch's reach: unlit.
    const beyond = person(1, 1, -(TORCHES.weaponTorch.reach + 2), 0, false);
    expect(nightWith([viewer, beyond, holder]).torches!.lit[beyond.id]).toBe(0);
  });

  it('works the field out once per time, and the holder never lights itself', () => {
    const target = person(1, 1, FAR, 0, false);
    const holder = person(2, 1, 0, 0, true, 0);
    const torches = createTorchLight();
    updateTorchLight(torches, [viewer, target, holder], noWalls, BODY, HITS, BOTS.aimHeightFraction, 1);
    expect(torches.lit[holder.id]).toBe(0);
    holder.torchOn = false;
    updateTorchLight(torches, [viewer, target, holder], noWalls, BODY, HITS, BOTS.aimHeightFraction, 1);
    expect(torches.lit[target.id]).toBe(1); // the same time: kept
    updateTorchLight(torches, [viewer, target, holder], noWalls, BODY, HITS, BOTS.aimHeightFraction, 2);
    expect(torches.lit[target.id]).toBe(0);
  });

  it('changes nothing by day or with the torch off', () => {
    expect(OPEN_SIGHT.torches).toBeUndefined();
    expect(sightConditionsOf(DEPOT).torches).toBeNull();
    expect(sightConditionsOf(WOODLAND).torches).not.toBeNull();
    // The match passes its resolved lighting preset's night (render/lightingPreset.ts playsAtNight), so a Day/Night pick
    // turns the night systems on or off with it, whatever the map's own flag.
    expect(playsAtNight(WOODLAND)).toBe(true);
    expect(playsAtNight(WOODLAND, 'day')).toBe(true); // Woodland offers only night: a pick it doesn't offer is ignored
    expect(playsAtNight(DEPOT)).toBe(false);
    expect(sightConditionsOf(WOODLAND, false)).toMatchObject({ night: null, torches: null });
    expect(sightConditionsOf(DEPOT, true).torches).not.toBeNull();
    const target = person(1, 0, FAR, Math.PI, true);
    // By day the torch makes no difference to who is seen.
    expect(visiblePart(viewer, target, noWalls, BOTS, BODY, HITS, OPEN_SIGHT)).toBe(visiblePart(viewer, person(1, 0, FAR, Math.PI, false), noWalls, BOTS, BODY, HITS, OPEN_SIGHT));
    // At night with every torch off: moonlight only, as before M33h.
    const off = person(1, 0, FAR, Math.PI, false);
    expect(visiblePart(viewer, off, noWalls, BOTS, BODY, HITS, nightWith([viewer, off]))).toBe(visiblePart(viewer, off, noWalls, BOTS, BODY, HITS, { foliage: [], night: NIGHT }));
  });
});
