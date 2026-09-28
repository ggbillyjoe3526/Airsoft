import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { type Character, createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { type CharacterMover, createMovementScratch, stepMovement } from './movement';
import { type Vec3, vec3 } from './vec';

const DT = 1 / 60;
const scratch = createMovementScratch();

/** Flat floor at y = floorY (or none) and an optional wall plane at z = wallZ blocking movement towards -Z. */
function flatMover(wallZ = -Infinity, floorY: number | null = 0): CharacterMover {
  return {
    move(c: Character, d: Vec3, out: Vec3): boolean {
      out.x = d.x;
      out.z = c.position.z + d.z < wallZ ? wallZ - c.position.z : d.z;
      const y = c.position.y + d.y;
      if (floorY !== null && y <= floorY) {
        out.y = floorY - c.position.y;
        return true;
      }
      out.y = d.y;
      return false;
    },
    probeGround(c: Character, maxDrop: number): number {
      if (floorY === null) return Number.NaN;
      const gap = c.position.y - floorY;
      return gap <= maxDrop ? -gap : Number.NaN;
    },
  };
}

function step(c: Character, cmd: PlayerCommand, ticks: number, mover = flatMover()): void {
  for (let i = 0; i < ticks; i++) stepMovement(c, cmd, MOVEMENT, DT, mover, scratch);
}

function command(setup: (cmd: PlayerCommand) => void): PlayerCommand {
  const cmd = createCommand();
  setup(cmd);
  return cmd;
}

const horizontalSpeed = (c: Character): number => Math.hypot(c.velocity.x, c.velocity.z);

describe('movement', () => {
  it('walks forward (-Z at yaw 0) and reaches walk speed quickly', () => {
    const c = createCharacter(0, vec3(), 0);
    step(c, command((k) => (k.forward = 1)), 12);
    expect(c.position.z).toBeLessThan(0);
    expect(Math.abs(c.position.x)).toBeLessThan(1e-9);
    expect(horizontalSpeed(c)).toBeCloseTo(MOVEMENT.walkSpeed, 3);
  });

  it('strafes right along +X at yaw 0 and forward along -X at yaw +90°', () => {
    const a = createCharacter(0, vec3(), 0);
    step(a, command((k) => (k.right = 1)), 30);
    expect(a.position.x).toBeGreaterThan(0);

    const b = createCharacter(1, vec3(), 0);
    step(
      b,
      command((k) => {
        k.yaw = Math.PI / 2;
        k.forward = 1;
      }),
      30,
    );
    expect(b.position.x).toBeLessThan(0);
    expect(Math.abs(b.position.z)).toBeLessThan(1e-9);
  });

  it('does not move faster diagonally', () => {
    const c = createCharacter(0, vec3(), 0);
    step(
      c,
      command((k) => {
        k.forward = 1;
        k.right = 1;
      }),
      60,
    );
    expect(horizontalSpeed(c)).toBeCloseTo(MOVEMENT.walkSpeed, 3);
  });

  it('sprints faster than walking, crouches slower', () => {
    const sprinter = createCharacter(0, vec3(), 0);
    step(
      sprinter,
      command((k) => {
        k.forward = 1;
        k.sprint = true;
      }),
      60,
    );
    expect(sprinter.sprinting).toBe(true);
    expect(horizontalSpeed(sprinter)).toBeCloseTo(MOVEMENT.sprintSpeed, 3);

    const croucher = createCharacter(1, vec3(), 0);
    step(
      croucher,
      command((k) => {
        k.forward = 1;
        k.crouch = true;
      }),
      60,
    );
    expect(croucher.crouchAmount).toBe(1);
    expect(horizontalSpeed(croucher)).toBeCloseTo(MOVEMENT.crouchSpeed, 3);
  });

  it('cannot sprint sideways, backwards or crouched', () => {
    for (const setup of [
      (k: PlayerCommand) => (k.right = 1),
      (k: PlayerCommand) => (k.forward = -1),
      (k: PlayerCommand) => {
        k.forward = 1;
        k.crouch = true;
      },
    ]) {
      const c = createCharacter(0, vec3(), 0);
      step(
        c,
        command((k) => {
          setup(k);
          k.sprint = true;
        }),
        60,
      );
      expect(c.sprinting).toBe(false);
      expect(horizontalSpeed(c)).toBeLessThanOrEqual(MOVEMENT.walkSpeed + 1e-9);
    }
  });

  it('keeps the replica down while sprinting and briefly after', () => {
    const c = createCharacter(0, vec3(), 0);
    const cmd = command((k) => {
      k.forward = 1;
      k.sprint = true;
    });
    step(c, cmd, 30);
    expect(c.sprintLockout).toBe(MOVEMENT.sprintFireLockout);
    cmd.sprint = false;
    step(c, cmd, 1);
    expect(c.sprintLockout).toBeGreaterThan(0);
    step(c, cmd, Math.ceil(MOVEMENT.sprintFireLockout / DT));
    expect(c.sprintLockout).toBe(0);
  });

  it('stops quickly when input is released', () => {
    const c = createCharacter(0, vec3(), 0);
    const cmd = command((k) => (k.forward = 1));
    step(c, cmd, 30);
    cmd.forward = 0;
    step(c, cmd, 12);
    expect(horizontalSpeed(c)).toBe(0);
  });

  it('jumps a limited height and lands', () => {
    const c = createCharacter(0, vec3(), 0);
    step(c, createCommand(), 1); // settle on the floor
    const cmd = command((k) => (k.jump = true));
    let maxY = 0;
    for (let i = 0; i < 120; i++) {
      stepMovement(c, cmd, MOVEMENT, DT, flatMover(), scratch);
      cmd.jump = false;
      maxY = Math.max(maxY, c.position.y);
    }
    const expectedApex = (MOVEMENT.jumpSpeed * MOVEMENT.jumpSpeed) / (2 * MOVEMENT.gravity);
    expect(maxY).toBeGreaterThan(expectedApex * 0.9);
    expect(maxY).toBeLessThan(1);
    expect(c.grounded).toBe(true);
    expect(c.position.y).toBe(0);
  });

  it('cannot jump while crouched or before the cooldown ends', () => {
    const crouched = createCharacter(0, vec3(), 0);
    step(crouched, command((k) => (k.crouch = true)), 30);
    step(
      crouched,
      command((k) => {
        k.crouch = true;
        k.jump = true;
      }),
      1,
    );
    expect(crouched.velocity.y).toBeLessThanOrEqual(0);

    const c = createCharacter(1, vec3(), 0);
    step(c, createCommand(), 1);
    const jump = command((k) => (k.jump = true));
    step(c, jump, 1);
    expect(c.velocity.y).toBeGreaterThan(0);
    // Pretend we're instantly grounded again: the cooldown must still block the jump.
    c.grounded = true;
    c.velocity.y = 0;
    step(c, jump, 1);
    expect(c.velocity.y).toBeLessThanOrEqual(0);
  });

  it('keeps full jump height when collision trims upward moves by a hair (sliding along a wall)', () => {
    const slidingMover: CharacterMover = {
      ...flatMover(),
      move(c, d, out) {
        const base = flatMover();
        const grounded = base.move(c, d, out);
        if (d.y > 0) out.y = d.y - 5e-5; // what Rapier does while sliding along a vertical surface
        return grounded;
      },
    };
    const c = createCharacter(0, vec3(), 0);
    step(c, createCommand(), 1, slidingMover);
    const cmd = command((k) => (k.jump = true));
    let maxY = 0;
    for (let i = 0; i < 60; i++) {
      stepMovement(c, cmd, MOVEMENT, DT, slidingMover, scratch);
      cmd.jump = false;
      maxY = Math.max(maxY, c.position.y);
    }
    const expectedApex = (MOVEMENT.jumpSpeed * MOVEMENT.jumpSpeed) / (2 * MOVEMENT.gravity);
    expect(maxY).toBeGreaterThan(expectedApex * 0.85);
  });

  it('stops rising when it really hits a ceiling', () => {
    const ceilingY = 0.3;
    const lowCeiling: CharacterMover = {
      ...flatMover(),
      move(c, d, out) {
        const grounded = flatMover().move(c, d, out);
        if (c.position.y + out.y > ceilingY) out.y = ceilingY - c.position.y;
        return grounded;
      },
    };
    const c = createCharacter(0, vec3(), 0);
    step(c, createCommand(), 1, lowCeiling);
    const cmd = command((k) => (k.jump = true));
    for (let i = 0; i < 6; i++) {
      stepMovement(c, cmd, MOVEMENT, DT, lowCeiling, scratch);
      cmd.jump = false;
    }
    expect(c.position.y).toBeLessThanOrEqual(ceilingY + 1e-9);
    expect(c.velocity.y).toBeLessThanOrEqual(0);
  });

  it('does not build up hidden fall speed while caught on an edge', () => {
    let caught = true;
    const ledge: CharacterMover = {
      ...flatMover(-Infinity, null),
      move(_c, d, out) {
        out.x = d.x;
        out.z = d.z;
        out.y = caught ? 0 : d.y; // held in place while "caught"
        return false;
      },
    };
    const c = createCharacter(0, vec3(0, 1, 0), 0);
    step(c, createCommand(), 60, ledge);
    expect(c.velocity.y).toBeGreaterThan(-MOVEMENT.gravity * DT * 1.01);
    caught = false;
    step(c, createCommand(), 1, ledge);
    expect(c.velocity.y).toBeGreaterThan(-MOVEMENT.gravity * DT * 2.01);
  });

  it('never turns a depenetration push into upward velocity', () => {
    // While falling, the collision layer pushes the character up out of a wedge (as Rapier does).
    const wedge: CharacterMover = {
      ...flatMover(-Infinity, null),
      move(_c, d, out) {
        out.x = d.x;
        out.z = d.z;
        out.y = d.y < 0 ? 0.2 : d.y;
        return false;
      },
    };
    const c = createCharacter(0, vec3(0, 1, 0), 0);
    step(c, createCommand(), 5, wedge);
    expect(c.velocity.y).toBeLessThanOrEqual(0);
  });

  it('caps fall speed', () => {
    const c = createCharacter(0, vec3(0, 100, 0), 0);
    step(c, createCommand(), 300, flatMover(-Infinity, null));
    expect(c.velocity.y).toBe(-MOVEMENT.maxFallSpeed);
  });

  it('loses velocity into a wall instead of storing it', () => {
    const c = createCharacter(0, vec3(), 0);
    step(c, command((k) => (k.forward = 1)), 60, flatMover(-1));
    expect(c.position.z).toBeCloseTo(-1, 6);
    expect(c.velocity.z).toBeCloseTo(0, 6);
  });

  it('clamps pitch', () => {
    const c = createCharacter(0, vec3(), 0);
    step(c, command((k) => (k.pitch = 10)), 1);
    expect(c.pitch).toBe(MOVEMENT.maxPitch);
  });
});
