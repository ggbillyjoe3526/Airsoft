import { describe, expect, it } from 'vitest';
import { BODY, MOVEMENT } from '../config/movement';
import { PHYSICS } from '../config/physics';
import { VAULT } from '../config/vault';
import type { MapBlock } from '../map/mapTypes';
import type { WorldQuery } from './armament';
import { createCharacter } from './character';
import { createCommand } from './commands';
import type { GameEvent } from './events';
import { buildLevelRay, castLevelRay } from './levelRay';
import { type CharacterMover, createMovementScratch } from './movement';
import { cancelVault, createVaultState, findVault, planVault, stepVault, stepVaultReady, tryVault, vaultProgress, vaultWay } from './vault';
import { vec3 } from './vec';

const DT = 1 / 60;
const REST = PHYSICS.groundRestGap;
const R = BODY.radius;

/** Level rays against these blocks, as the game casts them. */
function level(blocks: readonly MapBlock[]): WorldQuery {
  const ray = buildLevelRay(blocks);
  return { raycastStatic: (o, d, max) => castLevelRay(ray, o, d, max) };
}

const FLOOR: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 40) };

/** An obstacle spanning x, `height` tall, `depth` deep (along z), its near face at z = `face` (the body walks to -z). */
function wall(height: number, depth = 0.3, face = -0.7, kind: MapBlock['kind'] = 'wall', baseY = 0): MapBlock {
  return { kind, center: vec3(0, baseY + height / 2, face - depth / 2), size: vec3(6, height, depth) };
}

/** Feet at rest on the floor at the origin, going -z (the view's way at yaw 0). */
const FEET = vec3(0, REST, 0);

function plan(blocks: readonly MapBlock[], speed = 0, feet = FEET, out = createVaultState()): boolean {
  return planVault(feet, 0, -1, speed, VAULT, BODY, level(blocks), out);
}

describe('planVault (M102)', () => {
  it('takes a low wall in reach, on a path that stays clear of its faces and lands past it', () => {
    const v = createVaultState();
    expect(plan([FLOOR, wall(0.85)], 0, FEET, v)).toBe(true);
    expect(v.topY).toBeCloseTo(0.85, 5);
    expect(v.overY).toBeCloseTo(0.85 + VAULT.clearance, 5);
    // The body's surface reaches the face (0.7 m away) less the controller's skin, and clears the far side (1 m) likewise.
    expect(v.front).toBeLessThan(0.7 - R);
    expect(v.front).toBeGreaterThan(0.7 - R - 0.05);
    expect(v.far).toBeGreaterThan(1.0 + R);
    expect(v.far).toBeLessThan(1.0 + R + 0.05);
    expect(v.speed).toBe(VAULT.minSpeed);
    expect(v.riseEnd).toBeGreaterThanOrEqual(VAULT.riseTime);
    expect(v.end).toBeGreaterThan(v.riseEnd);
    // Short and committed: well under half a second from a standstill.
    expect(v.end).toBeLessThan(0.45);
  });

  it('takes obstacles from 0.6 to 0.95 m and nothing lower or higher (crouch cover and railings stay peek-only)', () => {
    for (const h of [0.6, 0.7, 0.8, 0.9, 0.95]) expect(plan([FLOOR, wall(h)]), `${h} m`).toBe(true);
    for (const h of [0.3, 0.55, 1.0, 1.2, 2.4]) expect(plan([FLOOR, wall(h)]), `${h} m`).toBe(false);
    expect(plan([FLOOR, wall(1.0, 0.1, -0.7, 'barrier')]), 'a 1 m railing').toBe(false);
  });

  it('takes walls, barriers and crates up to a metre deep, never a platform', () => {
    for (const d of [0.1, 0.3, 0.6, 1.0]) expect(plan([FLOOR, wall(0.85, d, -0.7, 'crate')]), `${d} m deep`).toBe(true);
    for (const d of [1.2, 3]) expect(plan([FLOOR, wall(0.85, d, -0.7, 'crate')]), `${d} m deep`).toBe(false);
  });

  it('reaches further the faster you come in, and not at all from afar', () => {
    const reach = R + VAULT.reach;
    expect(plan([FLOOR, wall(0.85, 0.3, -(reach - 0.05))])).toBe(true);
    expect(plan([FLOOR, wall(0.85, 0.3, -(reach + 0.3))])).toBe(false);
    expect(plan([FLOOR, wall(0.85, 0.3, -(reach + 0.3))], MOVEMENT.sprintSpeed)).toBe(true);
    // Sprinting in, the move keeps your pace up to its cap.
    const v = createVaultState();
    plan([FLOOR, wall(0.85)], MOVEMENT.sprintSpeed, FEET, v);
    expect(v.speed).toBe(VAULT.maxSpeed);
  });

  it('needs a top that is flat: a sloped or stepped top is not vaulted', () => {
    const step: MapBlock = { kind: 'crate', center: vec3(0, 0.8, -1.1), size: vec3(6, 0.2, 0.3) };
    expect(plan([FLOOR, wall(0.7, 0.9), step]), 'a block standing on the top').toBe(false);
  });

  it('needs room to land: a wall right behind, a drop off a balcony, or a far floor too high', () => {
    const behind: MapBlock = { kind: 'wall', center: vec3(0, 1.5, -1.5), size: vec3(6, 3, 0.4) };
    expect(plan([FLOOR, wall(0.85), behind])).toBe(false);
    // A balcony's parapet: the floor ends at the parapet and the street is 3 m below.
    const balcony: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 5), size: vec3(40, 0.5, 11.6) };
    const street: MapBlock = { kind: 'floor', center: vec3(0, -3.25, -20), size: vec3(40, 0.5, 40) };
    expect(plan([balcony, street, wall(0.85)])).toBe(false);
    // A far floor 0.4 m higher than this one (more than maxClimb).
    const raised: MapBlock = { kind: 'floor', center: vec3(0, 0.15, -10), size: vec3(40, 0.5, 17.8) };
    expect(plan([FLOOR, raised, wall(0.85)])).toBe(false);
    // A little lower on the far side is fine while the top is still within maxLandingHeight of it, and not once it isn't
    // (crouch cover on a slope, low only from its uphill side).
    const lower: MapBlock = { kind: 'floor', center: vec3(0, -0.35, -10), size: vec3(40, 0.5, 17.8) };
    const near: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 5), size: vec3(40, 0.5, 11.7) };
    expect(plan([near, lower, wall(0.8)])).toBe(true);
    const downhill: MapBlock = { kind: 'floor', center: vec3(0, -0.55, -10), size: vec3(40, 0.5, 17.8) };
    expect(plan([near, downhill, wall(0.8)]), 'top 1.1 m over the far floor').toBe(false);
  });

  it('never takes crouch cover from a raised side (a ramp or platform beside it)', () => {
    // Standing on a 0.3 m platform up to the cover: its 1.2 m top is 0.9 m over your feet, but 1.2 m over the far floor.
    const platform: MapBlock = { kind: 'crate', center: vec3(0, 0.15, 0), size: vec3(6, 0.3, 1.8) };
    const feet = vec3(0, 0.3 + REST, 0);
    expect(plan([FLOOR, platform, wall(1.2)], 0, feet)).toBe(false);
  });

  it('needs room for the body: a low ceiling, an overhang, or a gap narrower than the body', () => {
    const ceiling: MapBlock = { kind: 'wall', center: vec3(0, 2.4, 0), size: vec3(6, 0.2, 6) };
    expect(plan([FLOOR, wall(0.85), ceiling])).toBe(false);
    const lintel: MapBlock = { kind: 'wall', center: vec3(0, 2.2, -0.85), size: vec3(6, 0.6, 0.3) };
    expect(plan([FLOOR, wall(0.85), lintel])).toBe(false);
    const post = (x: number): MapBlock => ({ kind: 'wall', center: vec3(x, 1.5, -0.85), size: vec3(0.2, 3, 0.3) });
    expect(plan([FLOOR, wall(0.85), post(-0.35), post(0.35)]), 'a gap 0.5 m wide').toBe(false);
    expect(plan([FLOOR, wall(0.85), post(-0.6), post(0.6)]), 'a gap 1 m wide').toBe(true);
  });

  it('is pure: the same answer for the same place, and nothing written when there is no vault', () => {
    const a = createVaultState();
    const b = createVaultState();
    plan([FLOOR, wall(0.85)], 2, FEET, a);
    plan([FLOOR, wall(0.85)], 2, FEET, b);
    expect(a).toEqual(b);
    const none = createVaultState();
    expect(plan([FLOOR, wall(1.2)], 0, FEET, none)).toBe(false);
    expect(none).toEqual(createVaultState());
  });
});

describe('vaultWay', () => {
  const out = { x: 0, z: 0 };
  it('goes the way the keys push, relative to the view, or the view with none held', () => {
    const cmd = createCommand();
    cmd.yaw = Math.PI / 2; // facing -x
    expect(vaultWay(cmd, MOVEMENT, out)).toBe(true);
    expect(out.x).toBeCloseTo(-1, 6);
    expect(out.z).toBeCloseTo(0, 6);
    cmd.forward = 1;
    cmd.right = 1; // forward-right: 45° off the view
    expect(vaultWay(cmd, MOVEMENT, out)).toBe(true);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1, 6);
    expect(out.x).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(out.z).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it('never goes sideways or backwards', () => {
    const cmd = createCommand();
    cmd.right = 1;
    expect(vaultWay(cmd, MOVEMENT, out)).toBe(false);
    cmd.right = 0;
    cmd.forward = -1;
    expect(vaultWay(cmd, MOVEMENT, out)).toBe(false);
  });
});

describe('findVault and tryVault', () => {
  const query = level([FLOOR, wall(0.85)]);

  function standing() {
    const c = createCharacter(4, FEET, 0);
    c.grounded = true;
    return c;
  }

  it('starts on a Jump press facing the wall: the press, the jump cooldown and a vault footstep', () => {
    const c = standing();
    const cmd = createCommand();
    const events: GameEvent[] = [];
    expect(tryVault(c, cmd, MOVEMENT, BODY, query, events)).toBe(false); // no press
    cmd.jump = true;
    c.sprinting = true;
    expect(tryVault(c, cmd, MOVEMENT, BODY, query, events)).toBe(true);
    expect(c.vault.active).toBe(true);
    expect(c.jumpCooldown).toBe(MOVEMENT.jumpCooldown);
    expect(c.sprinting).toBe(false);
    expect(events).toEqual([{ type: 'footstep', characterId: 4, kind: 'vault' }]);
  });

  it('takes a press still buffered (pressed just before landing)', () => {
    const c = standing();
    c.jumpWanted = MOVEMENT.jumpBuffer / 2;
    expect(tryVault(c, createCommand(), MOVEMENT, BODY, query, [])).toBe(true);
    expect(c.jumpWanted).toBe(0);
  });

  it('needs the feet on the ground, standing (not crouched), the jump ready, and the wall ahead', () => {
    const cmd = createCommand();
    const out = createVaultState();
    const air = standing();
    air.grounded = false;
    expect(findVault(air, cmd, MOVEMENT, BODY, query, out)).toBe(false);
    const crouched = standing();
    crouched.crouchAmount = 1;
    expect(findVault(crouched, cmd, MOVEMENT, BODY, query, out)).toBe(false);
    const cooling = standing();
    cooling.jumpCooldown = 0.1;
    expect(findVault(cooling, cmd, MOVEMENT, BODY, query, out)).toBe(false);
    const turned = standing();
    const back = createCommand();
    back.yaw = Math.PI;
    expect(findVault(turned, back, MOVEMENT, BODY, query, out)).toBe(false);
    expect(findVault(standing(), cmd, MOVEMENT, BODY, query, out)).toBe(true);
  });

  it("answers for the tick whether a press would vault (DX6): into the character's vault, the plan into the scratch", () => {
    const c = standing();
    const cmd = createCommand();
    const scratch = createVaultState();
    stepVaultReady(c, cmd, true, MOVEMENT, BODY, query, scratch);
    expect(c.vault.ready).toBe(true);
    expect(scratch.topY).toBeGreaterThan(0);
    expect(c.vault).toEqual({ ...createVaultState(), ready: true }); // nothing planned into the character's own
    stepVaultReady(c, cmd, false, MOVEMENT, BODY, query, scratch);
    expect(c.vault.ready).toBe(false); // out of play
    const turned = createCommand();
    turned.yaw = Math.PI;
    stepVaultReady(c, cmd, true, MOVEMENT, BODY, query, scratch);
    cancelVault(c);
    expect(c.vault.ready).toBe(false); // a respawn clears it
    stepVaultReady(c, turned, true, MOVEMENT, BODY, query, scratch);
    expect(c.vault.ready).toBe(false); // facing away
  });
});

/** Moves exactly as asked: nothing in the way. */
const free: CharacterMover = {
  move(_c, d, out) {
    out.x = d.x;
    out.y = d.y;
    out.z = d.z;
    return false;
  },
  probeGround: () => Number.NaN,
};

describe('stepVault', () => {
  const scratch = createMovementScratch();

  function started() {
    const c = createCharacter(0, FEET, 0);
    c.grounded = true;
    const cmd = createCommand();
    cmd.jump = true;
    expect(tryVault(c, cmd, MOVEMENT, BODY, level([FLOOR, wall(0.85)]), [])).toBe(true);
    return c;
  }

  it('rises onto the top, crosses it, and hands over to a fall past the far side at its speed', () => {
    const c = started();
    const v = c.vault;
    const cmd = createCommand();
    cmd.fire = true; // ignored: stepSimulation hands it only the view
    let ticks = 0;
    let topReached = false;
    while (c.vault.active && ticks < 60) {
      stepVault(c, cmd, MOVEMENT, DT, free, scratch);
      ticks++;
      expect(c.grounded).toBe(false);
      expect(c.fireLockout).toBe(VAULT.fireLockout);
      // Never lower than the top once over the face (no clipping through it).
      if (-c.position.z > v.front + 0.02 && -c.position.z < v.far - 0.02) expect(c.position.y).toBeGreaterThanOrEqual(v.overY - 1e-9);
      if (c.position.y >= v.overY - 1e-9) topReached = true;
    }
    expect(topReached).toBe(true);
    expect(ticks).toBe(Math.ceil(v.end / DT - 1e-9));
    expect(-c.position.z).toBeCloseTo(v.far, 6);
    expect(c.velocity.z).toBeCloseTo(-v.speed, 6);
    expect(c.velocity.y).toBe(-VAULT.dropSpeed);
  });

  it('tucks the body over the top, and turns the view freely', () => {
    const c = started();
    const cmd = createCommand();
    cmd.yaw = 0.7;
    cmd.pitch = -0.3;
    for (let i = 0; i < 12; i++) stepVault(c, cmd, MOVEMENT, DT, free, scratch);
    expect(c.crouchAmount).toBeCloseTo(VAULT.tuck, 2);
    expect(c.yaw).toBe(0.7);
    expect(c.pitch).toBe(-0.3);
    // The way doesn't turn with the view: it was settled when the vault began.
    expect(c.vault.dirX).toBeCloseTo(0, 9);
    expect(c.vault.dirZ).toBe(-1);
  });

  it('gives up and falls where it is when something holds the body back', () => {
    const c = started();
    const stuck: CharacterMover = {
      move(_c, _d, out) {
        out.x = 0;
        out.y = 0;
        out.z = 0;
        return false;
      },
      probeGround: () => Number.NaN,
    };
    let ticks = 0;
    while (c.vault.active && ticks < 60) {
      stepVault(c, createCommand(), MOVEMENT, DT, stuck, scratch);
      ticks++;
    }
    expect(ticks).toBeLessThan(10);
    expect(c.velocity.y).toBeLessThanOrEqual(0);
  });

  it('reports its progress for drawing, 0 when not vaulting', () => {
    const c = started();
    expect(vaultProgress(c, 1, DT)).toBe(0);
    stepVault(c, createCommand(), MOVEMENT, DT, free, scratch);
    expect(vaultProgress(c, 0, DT)).toBe(0);
    expect(vaultProgress(c, 1, DT)).toBeCloseTo(DT / c.vault.end, 6);
    while (c.vault.active) stepVault(c, createCommand(), MOVEMENT, DT, free, scratch);
    expect(vaultProgress(c, 1, DT)).toBe(0);
  });
});
