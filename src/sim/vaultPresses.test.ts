import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import type { MapBlock, MapData } from '../map/mapTypes';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { eliminate } from './elimination';
import type { GameEvent } from './events';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { vec3 } from './vec';
import { cancelVault, createVaultState, findVault, vaultingCommand, withVaultPresses } from './vault';

/**
 * What a vault does with the controls (BP5): a trigger or aim held through one is no new pull or aim press after it,
 * and a press made during one (reload, slot, holster, fire selector, torch, magazine, hop-up) waits for its end instead of
 * being lost. And a player hit mid-vault plans the walk-off from where it lands, not back through the wall.
 */

const DT = 1 / 60;
const REST = PHYSICS.groundRestGap;
const R = BODY.radius;
const FLOOR: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 40) };
/** A low wall across the floor, its near face at z = -2 (the player walks to -z from z = 0). */
const WALL: MapBlock = { kind: 'wall', center: vec3(0, 0.425, -2.2), size: vec3(40, 0.85, 0.4) };

function setUp(blocks: MapBlock[] = [FLOOR, WALL], deadZone = vec3(-10, 0, 8)) {
  const map: MapData = { name: 'vault', blocks, killY: -20, spawns: [[], []], deadZones: [[], []], lanes: [] };
  const world = new PhysicsWorld(map, BODY, DT);
  const nav = buildNavGrid(map, NAV);
  const deadZones = [[{ position: deadZone, yaw: 0 }], [{ position: vec3(15, 0, -12), yaw: 0 }]];
  const ctx = createSimContext({ mover: world, query: world, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: map.killY, hits: HITS, deadZones, rounds: ROUNDS, nav, navSnap: NAV.snap });
  const state = createGameState(1, 16, ROUNDS);
  const player = createCharacter(0, vec3(0, REST, 0), 0, undefined, 0);
  // Someone on the other team, far off, so the round stays live.
  const other = createCharacter(1, vec3(15, REST, -12), 0, undefined, 1);
  // And a teammate, so the round goes on once the player is hit.
  const mate = createCharacter(2, vec3(-15, REST, 12), 0, undefined, 0);
  state.characters.push(player, other, mate);
  for (const c of state.characters) world.addCharacter(c);
  const events: GameEvent[] = [];
  /** The command for the next tick: held keys stay, one-shot presses are cleared after each tick. */
  const cmd = createCommand();
  const tick = (): void => {
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    events.push(...state.events);
    cmd.jump = cmd.reload = cmd.holster = cmd.cycleFireMode = cmd.toggleTorch = false;
    cmd.switchTo = cmd.tossMag = -1;
  };
  /** Walks to the wall and presses Jump there: the vault has begun when this returns. */
  const vault = (): void => {
    cmd.forward = 1;
    while (player.position.z + 2 > 0.3 + R) tick();
    cmd.jump = true;
    tick();
    expect(player.vault.active).toBe(true);
  };
  const count = (type: GameEvent['type']): number => events.filter((e) => e.type === type && 'characterId' in e && e.characterId === 0).length;
  const settle = (ticks = 60): void => {
    for (let i = 0; i < ticks; i++) tick();
  };
  return { world, state, ctx, player, cmd, events, tick, vault, count, settle };
}

describe('the controls through a vault (BP5)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a semi-auto pull held through a vault fires once, not again on landing', () => {
    const run = setUp();
    run.cmd.switchTo = 1;
    run.settle();
    expect(run.player.armament.modes[run.player.armament.active]).toBe('semi');
    run.cmd.fire = true;
    run.tick();
    run.vault();
    while (run.player.vault.active) run.tick();
    run.settle(90);
    expect(run.count('shot')).toBe(1);
    // Let go and pull again: that one fires.
    run.cmd.fire = false;
    run.tick();
    run.cmd.fire = true;
    run.settle(10);
    expect(run.count('shot')).toBe(2);
    run.world.dispose();
  });

  it('a trigger or aim held while holstered, through a vault, does not draw the replica on landing', () => {
    for (const key of ['fire', 'aim'] as const) {
      const run = setUp();
      run.cmd[key] = true;
      run.tick();
      run.cmd.holster = true;
      run.settle(10);
      expect(run.player.armament.holstered).toBe(true);
      run.vault();
      while (run.player.vault.active) run.tick();
      run.settle(60);
      expect(run.player.armament.holstered).toBe(true);
      expect(run.count('draw')).toBe(0);
      run.world.dispose();
    }
  });

  it('an aim held through a vault drops the sight during it and raises it again after', () => {
    const run = setUp();
    run.cmd.aim = true;
    run.settle(40);
    expect(run.player.aiming).toBe(true);
    run.vault();
    run.tick();
    expect(run.player.aiming).toBe(false);
    while (run.player.vault.active) run.tick();
    run.settle(30);
    expect(run.player.aiming).toBe(true);
    run.world.dispose();
  });

  it('R pressed mid-vault reloads once it is over', () => {
    const run = setUp();
    run.cmd.fire = true;
    run.settle(20);
    run.cmd.fire = false;
    run.settle(10);
    expect(run.count('shot')).toBeGreaterThan(0);
    run.vault();
    run.tick();
    run.cmd.reload = true;
    run.tick();
    expect(run.count('reloadStart')).toBe(0);
    while (run.player.vault.active) run.tick();
    run.settle(2);
    expect(run.count('reloadStart')).toBe(1);
    run.world.dispose();
  });

  it('a slot, holster or fire selector press mid-vault takes effect once it is over', () => {
    const slot = setUp();
    slot.vault();
    slot.tick();
    slot.cmd.switchTo = 1;
    slot.tick();
    expect(slot.player.armament.active).toBe(0);
    while (slot.player.vault.active) slot.tick();
    slot.settle(2);
    expect(slot.player.armament.active).toBe(1);
    slot.world.dispose();

    const holster = setUp();
    holster.vault();
    holster.cmd.holster = true;
    holster.tick();
    expect(holster.player.armament.holstered).toBe(false);
    while (holster.player.vault.active) holster.tick();
    holster.settle(2);
    expect(holster.player.armament.holstered).toBe(true);
    holster.world.dispose();

    // The AEG starts on auto: two selector presses step it twice (auto, semi, burst), one per tick after the vault.
    const selector = setUp();
    selector.vault();
    selector.cmd.cycleFireMode = true;
    selector.tick();
    selector.cmd.cycleFireMode = true;
    selector.tick();
    expect(selector.player.armament.modes[0]).toBe('auto');
    while (selector.player.vault.active) selector.tick();
    selector.settle(3);
    expect(selector.player.armament.modes[0]).toBe('burst');
    selector.world.dispose();
  });

  it('a player hit mid-vault plans the walk-off from the far side: round the wall, not back through it', () => {
    // Tall walls either side of a short low stretch, the way round them 12 m off to the east.
    const low: MapBlock = { kind: 'wall', center: vec3(0, 0.45, -2.2), size: vec3(8, 0.9, 0.4) };
    const west: MapBlock = { kind: 'wall', center: vec3(-12, 1.5, -2.2), size: vec3(16, 3, 0.4) };
    const east: MapBlock = { kind: 'wall', center: vec3(8, 1.5, -2.2), size: vec3(8, 3, 0.4) };
    const run = setUp([FLOOR, low, west, east], vec3(0, 0, 8));
    run.vault();
    run.settle(4);
    expect(run.player.vault.active).toBe(true);
    eliminate(run.player, 1, run.state.characters, run.ctx.targets.elimination);
    let stuckAt: number | null = null;
    for (let i = 0; i < 60 * 25 && run.player.status !== 'out'; i++) {
      run.tick();
      if (run.player.status === 'leaving' && stuckAt === null) stuckAt = run.player.position.z;
    }
    // The route starts from the landing (past the wall) and goes round it by the east gap.
    const route = run.player.walkOffRoute;
    expect(route.some((w) => w.x > 12)).toBe(true);
    // It walked all the way there: never given up against the wall.
    expect(stuckAt).toBeNull();
    expect(run.player.status).toBe('out');
    expect(Math.hypot(run.player.position.x, run.player.position.z - 8)).toBeLessThan(0.5);
    run.world.dispose();
  });
});

describe("the tick's vault answer, for the prompt (DX6)", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('is what asking after the tick with its command gives, true in reach of the wall, false through the vault', () => {
    const run = setUp();
    const check = createVaultState();
    run.settle(10);
    expect(run.player.vault.ready).toBe(false); // too far from the wall
    run.cmd.forward = 1;
    let readyTicks = 0;
    while (run.player.position.z + 2 > 0.3 + R) {
      run.tick();
      expect(run.player.vault.ready).toBe(findVault(run.player, run.cmd, MOVEMENT, BODY, run.world, check));
      if (run.player.vault.ready) readyTicks++;
    }
    expect(readyTicks).toBeGreaterThan(0);
    expect(run.player.vault.ready).toBe(true);
    run.cmd.jump = true;
    run.tick();
    expect(run.player.vault.active).toBe(true);
    expect(run.player.vault.ready).toBe(false);
    // Bots and everyone else get the same answer: the one standing in the open has none.
    expect(run.state.characters[1]!.vault.ready).toBe(false);
    run.world.dispose();
  });

  it('is false once you are hit', () => {
    const run = setUp();
    run.cmd.forward = 1;
    while (!run.player.vault.ready) run.tick();
    eliminate(run.player, 1, run.state.characters, run.ctx.targets.elimination);
    run.tick();
    expect(run.player.vault.ready).toBe(false);
    run.world.dispose();
  });
});

describe('vaultingCommand and withVaultPresses (BP5)', () => {
  /** A character stand-in: the vault state and the armament's trigger and aim. */
  const holder = (trigger = false, aim = false) => ({ vault: createVaultState(), armament: { triggerWasDown: trigger, aimWasDown: aim } });

  it('follows the view only, keeping the trigger and aim as the vault found them', () => {
    const c = holder(true, false);
    const cmd = createCommand();
    cmd.yaw = 1.2;
    cmd.pitch = -0.3;
    cmd.fire = false;
    cmd.aim = true;
    cmd.forward = 1;
    cmd.jump = true;
    const out = vaultingCommand(c as never, cmd, createCommand());
    expect(out).toMatchObject({ yaw: 1.2, pitch: -0.3, fire: true, aim: false, forward: 0, jump: false, reload: false, switchTo: -1 });
  });

  it('keeps each press made during the vault and plays it into the first command after, once', () => {
    const c = holder();
    const during = createCommand();
    during.reload = true;
    during.switchTo = 1;
    during.toggleTorch = true;
    during.tossMag = 3;
    vaultingCommand(c as never, during, createCommand());
    const next = createCommand();
    next.forward = 1;
    const out = withVaultPresses(c.vault, next, createCommand());
    expect(out).not.toBe(next);
    expect(out).toMatchObject({ forward: 1, reload: true, switchTo: 1, toggleTorch: true, tossMag: 3, holster: false });
    // Played once: the tick after has none of them.
    expect(withVaultPresses(c.vault, next, createCommand())).toBe(next);
    expect(next).toMatchObject({ reload: false, switchTo: -1, toggleTorch: false, tossMag: -1 });
  });

  it('a slot pressed after the vault wins over one pressed during it', () => {
    const c = holder();
    const during = createCommand();
    during.switchTo = 1;
    vaultingCommand(c as never, during, createCommand());
    const next = createCommand();
    next.switchTo = 0;
    expect(withVaultPresses(c.vault, next, createCommand()).switchTo).toBe(0);
  });

  it('plays two torch presses as two, one per tick', () => {
    const c = holder();
    const during = createCommand();
    during.toggleTorch = true;
    vaultingCommand(c as never, during, createCommand());
    vaultingCommand(c as never, during, createCommand());
    const next = createCommand();
    expect(withVaultPresses(c.vault, next, createCommand()).toggleTorch).toBe(true);
    expect(withVaultPresses(c.vault, next, createCommand()).toggleTorch).toBe(true);
    expect(withVaultPresses(c.vault, next, createCommand())).toBe(next);
  });

  it('sums the hop-up notches turned mid-vault and adds them to the first command after, once (HD1)', () => {
    const c = holder();
    const during = createCommand();
    during.hopUpSteps = 1;
    vaultingCommand(c as never, during, createCommand());
    vaultingCommand(c as never, during, createCommand());
    during.hopUpSteps = -1;
    expect(vaultingCommand(c as never, during, createCommand()).hopUpSteps).toBe(0);
    const next = createCommand();
    next.hopUpSteps = 1;
    expect(withVaultPresses(c.vault, next, createCommand()).hopUpSteps).toBe(2);
    expect(withVaultPresses(c.vault, createCommand(), createCommand()).hopUpSteps).toBe(0);
    during.hopUpSteps = 1;
    vaultingCommand(c as never, during, createCommand());
    cancelVault(c as never);
    const after = createCommand();
    expect(withVaultPresses(c.vault, after, createCommand())).toBe(after);
  });

  it('drops what was kept when the vault is cancelled (a respawn)', () => {
    const c = holder();
    const during = createCommand();
    during.reload = true;
    during.holster = true;
    during.cycleFireMode = true;
    vaultingCommand(c as never, during, createCommand());
    cancelVault(c as never);
    const next: PlayerCommand = createCommand();
    expect(withVaultPresses(c.vault, next, createCommand())).toBe(next);
  });
});
