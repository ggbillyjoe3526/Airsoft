import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { TEST_YARD } from '../map/testYard';
import { buildNavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import type { CharacterMover } from '../sim/movement';
import { createRng } from '../sim/rng';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState, type GameState } from '../sim/state';
import { OPEN_FIELD, OPEN_NAV } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import { aimErrorSize, createAim, stepAim } from './aim';
import { BotController } from './botController';
import { findCover } from './cover';
import { canSee } from './perception';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const noWalls: WorldQuery = { raycastStatic: () => -1 };

/** An infinite wall across x at `x = wallX` from the floor up to `height`. */
function wallAcrossX(wallX: number, height = 3): WorldQuery {
  return {
    raycastStatic(o, d, max) {
      if (Math.abs(d.x) < 1e-9) return -1;
      const t = (wallX - o.x) / d.x;
      if (t < 0 || t > max) return -1;
      return o.y + d.y * t <= height ? t : -1;
    },
  };
}

const flatFloor: CharacterMover = {
  move(c, d, out) {
    out.x = d.x;
    out.z = d.z;
    const y = c.position.y + d.y;
    out.y = y <= 0 ? -c.position.y : d.y;
    return y <= 0;
  },
  probeGround(c, maxDrop) {
    return c.position.y <= maxDrop ? -c.position.y : Number.NaN;
  },
};

/** Yaw that faces from a to b. */
const facing = (a: Vec3, b: Vec3): number => Math.atan2(-(b.x - a.x), -(b.z - a.z));

describe('perception', () => {
  const viewer = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0); // faces -Z
  it('sees someone ahead in the open', () => {
    expect(canSee(viewer, createCharacter(1, vec3(0, 0, -15), 0, LOADOUT, 1), noWalls, BOTS, BODY, HITS)).toBe(true);
  });
  it('does not see behind itself or beyond view distance, but notices someone very close', () => {
    expect(canSee(viewer, createCharacter(1, vec3(0, 0, 10), 0, LOADOUT, 1), noWalls, BOTS, BODY, HITS)).toBe(false);
    expect(canSee(viewer, createCharacter(1, vec3(0, 0, -(BOTS.viewDistance + 1)), 0, LOADOUT, 1), noWalls, BOTS, BODY, HITS)).toBe(false);
    expect(canSee(viewer, createCharacter(1, vec3(0, 0, BOTS.closeAwareness - 0.5), 0, LOADOUT, 1), noWalls, BOTS, BODY, HITS)).toBe(true);
  });
  it('does not see through a wall, and sees a head over crouch-high cover', () => {
    const v = createCharacter(0, vec3(0, 0, 0), -Math.PI / 2, LOADOUT, 0); // faces +X
    const behind = createCharacter(1, vec3(10, 0, 0), 0, LOADOUT, 1);
    expect(canSee(v, behind, wallAcrossX(5), BOTS, BODY, HITS)).toBe(false);
    expect(canSee(v, behind, wallAcrossX(5, 1.2), BOTS, BODY, HITS)).toBe(true);
    behind.crouchAmount = 1;
    v.crouchAmount = 1;
    expect(canSee(v, behind, wallAcrossX(5, 1.2), BOTS, BODY, HITS)).toBe(false);
  });
});

describe('aim', () => {
  it('turns no faster than the turn rate and then settles on the target', () => {
    const a = createAim(0);
    const rng = createRng(1);
    stepAim(a, Math.PI / 2, 0, 0, BOTS, rng, DT);
    expect(a.yaw).toBeCloseTo(BOTS.turnRate * DT, 6);
    for (let i = 0; i < 60; i++) stepAim(a, Math.PI / 2, 0, 0, BOTS, rng, DT);
    expect(a.yaw).toBeCloseTo(Math.PI / 2, 6);
  });
  it('starts with a large error that settles, and is worse on the move', () => {
    expect(aimErrorSize(0, false, BOTS)).toBeCloseTo(BOTS.aimErrorStartDeg * DEG, 9);
    expect(aimErrorSize(10, false, BOTS)).toBeCloseTo(BOTS.aimErrorSettledDeg * DEG, 9);
    expect(aimErrorSize(10, true, BOTS)).toBeGreaterThan(aimErrorSize(10, false, BOTS));
  });
  it('keeps the view within the error size of the target', () => {
    const a = createAim(0);
    const rng = createRng(3);
    const size = 2 * DEG;
    for (let i = 0; i < 600; i++) {
      stepAim(a, 0.3, -0.1, size, BOTS, rng, DT);
      if (i > 60) expect(Math.hypot(a.yaw - 0.3, a.pitch + 0.1)).toBeLessThanOrEqual(size + 1e-6);
    }
  });
});

describe('cover', () => {
  it('finds a spot behind the crate, hidden from the threat', () => {
    const nav = buildNavGrid(TEST_YARD, NAV);
    // The yard's crate spans x -0.6..0.6, z -6.6..-5.4 and is 1.2 m tall; threat north at z = 2.
    const crate: WorldQuery = {
      raycastStatic(o, d, max) {
        // Slab test against the crate box.
        let t0 = 0;
        let t1 = max;
        for (const [p, v, lo, hi] of [
          [o.x, d.x, -0.6, 0.6],
          [o.y, d.y, 0, 1.2],
          [o.z, d.z, -6.6, -5.4],
        ] as const) {
          if (Math.abs(v) < 1e-9) {
            if (p < lo || p > hi) return -1;
            continue;
          }
          let a = (lo - p) / v;
          let b = (hi - p) / v;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
          if (t0 > t1) return -1;
        }
        return t0;
      },
    };
    const threatEye = vec3(0, BODY.standEyeHeight, 2);
    const out = { position: vec3(), crouchOnly: false };
    const found = findCover(vec3(0.5, 0, -4), threatEye, nav, crate, { ...BOTS, coverCandidates: 200 }, BODY, createRng(5), out);
    expect(found).toBe(true);
    expect(out.position.z).toBeLessThan(-6.6); // on the far side of the crate
    expect(out.crouchOnly).toBe(true); // 1.2 m crate: hides a crouched player only
  });
});

/** A duel on an open floor: one Orange bot facing a Blue character `dist` metres away. */
function duel(dist: number, extra: (state: GameState) => void = () => {}, query: WorldQuery = noWalls) {
  const state = createGameState(1, 64, ROUNDS);
  const player = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  const bot = createCharacter(1, vec3(0, 0, -dist), 0, LOADOUT, 1);
  bot.yaw = facing(bot.position, player.position);
  state.characters.push(player, bot);
  extra(state);
  const ctx = createSimContext({
    mover: flatFloor,
    query,
    movement: MOVEMENT,
    body: BODY,
    ballistics: BALLISTICS,
    loadout: LOADOUT,
    killY: -10,
    hits: HITS,
    deadZones: [[{ position: vec3(-40, 0, 0), yaw: 0 }], [{ position: vec3(40, 0, 0), yaw: 0 }]],
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    rounds: ROUNDS,
  });
  const commands = new Map<number, PlayerCommand>([[0, createCommand()]]);
  const bots = new BotController(state, [bot], commands, {
    query,
    nav: OPEN_NAV,
    navSnap: NAV.snap,
    lanes: OPEN_FIELD.lanes,
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: BOTS,
    seed: 7,
  });
  // The player stands still facing the bot.
  commands.get(0)!.yaw = facing(player.position, bot.position);
  const run = (seconds: number, onTick: () => void = () => {}) => {
    for (let i = 0; i < seconds / DT; i++) {
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
      onTick();
    }
  };
  return { state, player, bot, run, commands, bots };
}

describe('bots in a duel', () => {
  it('wait out their reaction time before firing, then hit a standing target at 12 m within a few seconds', () => {
    const { state, run } = duel(12);
    let firstShot = -1;
    let hitAt = -1;
    run(6, () => {
      for (const e of state.events) {
        if (e.type === 'shot' && e.characterId === 1 && firstShot < 0) firstShot = state.time;
        if (e.type === 'characterHit' && e.victimId === 0 && hitAt < 0) hitAt = state.time;
      }
    });
    expect(firstShot).toBeGreaterThanOrEqual(BOTS.reactionTime[0]);
    expect(hitAt).toBeGreaterThan(0);
    expect(hitAt).toBeLessThan(4);
  });

  it('do not fire while a teammate is in the line of fire, and never hit them', () => {
    const { state, bot, player, run } = duel(12, (s) => {
      // An Orange teammate (not a bot: it stays put) half-way, right in the line.
      s.characters.push(createCharacter(2, vec3(0, 0, -6), 0, LOADOUT, 1));
    });
    const mate = state.characters[2]!;
    let blockedShots = 0;
    let friendlyHits = 0;
    run(4, () => {
      for (const e of state.events) {
        if (e.type === 'characterHit' && e.victimId === 2) friendlyHits++;
        if (e.type !== 'shot' || e.characterId !== 1) continue;
        // Distance from the teammate to the bot→player line (top view).
        const ax = bot.position.x;
        const az = bot.position.z;
        const dx = player.position.x - ax;
        const dz = player.position.z - az;
        const t = ((mate.position.x - ax) * dx + (mate.position.z - az) * dz) / (dx * dx + dz * dz);
        const off = Math.hypot(ax + dx * t - mate.position.x, az + dz * t - mate.position.z);
        if (t > 0 && t < 1 && off < HITS.bodyRadius) blockedShots++;
      }
    });
    expect(blockedShots).toBe(0);
    expect(friendlyHits).toBe(0);
  });

  it('play out identically from the same seed', () => {
    const trace = () => {
      const { state, bot, run } = duel(15);
      const shots: string[] = [];
      run(3, () => {
        for (const e of state.events) if (e.type === 'shot') shots.push(`${state.tick}:${bot.yaw.toFixed(6)}`);
      });
      return shots.join(',');
    };
    const a = trace();
    expect(a.length).toBeGreaterThan(0);
    expect(trace()).toBe(a);
  });

  it('go after someone they only heard shooting', () => {
    // The bot faces away; the player fires from behind it, 15 m away.
    const { state, bot, player, run, commands } = duel(15);
    bot.yaw += Math.PI;
    const playerCmd = commands.get(0)!;
    const fire = createCommand();
    fire.fire = true;
    fire.pitch = 0.6; // firing into the air, not at the bot
    fire.yaw = facing(player.position, bot.position) + Math.PI;
    let turned = false;
    run(2, () => {
      // Player shoots for the first half second.
      Object.assign(playerCmd, state.time < 0.5 ? fire : createCommand());
      const toPlayer = facing(bot.position, player.position);
      if (Math.abs(Math.atan2(Math.sin(bot.yaw - toPlayer), Math.cos(bot.yaw - toPlayer))) < 0.35) turned = true;
    });
    expect(turned).toBe(true);
  });

  it('still need their full reaction time on re-sighting someone after only hearing them', () => {
    // Line of sight can be switched off, like the target stepping behind a wall.
    let blocked = false;
    const blinds: WorldQuery = { raycastStatic: (_o, _d, max) => (blocked ? max * 0.5 : -1) };
    const { state, player, run, commands } = duel(12, () => {}, blinds);
    const playerCmd = commands.get(0)!;
    run(0.2); // sees the player (reaction under way)
    blocked = true;
    run(BOTS.contactGrace + 1); // loses them for longer than the grace period
    // The player fires into the air: the bot hears it.
    Object.assign(playerCmd, { fire: true, pitch: 1.2 });
    run(0.3);
    Object.assign(playerCmd, { fire: false, pitch: 0 });
    player.armament.recoil = 0;
    blocked = false;
    const unblockedAt = state.time;
    let firstShot = -1;
    run(3, () => {
      for (const e of state.events) if (e.type === 'shot' && e.characterId === 1 && firstShot < 0) firstShot = state.time;
    });
    expect(firstShot).toBeGreaterThan(0);
    expect(firstShot - unblockedAt).toBeGreaterThanOrEqual(BOTS.reactionTime[0]);
  });
});

describe('bot modes', () => {
  it('leave cover when the route there fails or takes too long, and give up searching unreachable spots', () => {
    const { bot, bots, run } = duel(30);
    bot.yaw += Math.PI; // facing away: nothing in sight
    const b = bots.bots[0]!;
    run(0.1);
    b.mode = 'cover';
    b.coverLeft = 2;
    b.coverGiveUp = BOTS.coverMaxTime;
    b.routeState = 'failed';
    run(DT);
    expect(b.mode).not.toBe('cover');

    b.mode = 'cover';
    b.coverLeft = 99;
    b.coverGiveUp = BOTS.coverMaxTime;
    b.cover.position.x = 1000; // never reachable
    b.routeState = 'none';
    run(BOTS.coverMaxTime + 0.2);
    expect(b.mode).not.toBe('cover');

    b.mode = 'search';
    b.hasLastKnown = true;
    b.heardAt = 0;
    b.lastKnown.x = 1000; // off the map: no route
    run(0.5);
    expect(b.hasLastKnown).toBe(false);
    expect(b.mode).toBe('advance');
  });

  it('fight back from cover that turns out not to hide them', () => {
    const { state, bot, bots, run } = duel(12);
    const b = bots.bots[0]!;
    run(0.3); // in contact (not yet firing)
    expect(b.targetVisible).toBe(true);
    // Pretend it just settled into "cover" right where it stands, in the open.
    b.mode = 'cover';
    b.cover.position.x = bot.position.x;
    b.cover.position.z = bot.position.z;
    b.coverLeft = 10;
    b.coverGiveUp = 10;
    b.coverHeld = 0;
    b.routeState = 'none';
    let shots = 0;
    let fought = false;
    run(BOTS.coverSettle + 0.5, () => {
      fought ||= b.mode === 'fight';
      for (const e of state.events) if (e.type === 'shot' && e.characterId === 1) shots++;
    });
    expect(fought).toBe(true);
    expect(shots).toBeGreaterThan(0);
  });
});

describe('bot hearing and targets', () => {
  it('keep one steady guess of an unseen shooter during a long burst', () => {
    const walls: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 }; // can't see anyone
    const { state, bots, run, commands } = duel(18, () => {}, walls);
    const b = bots.bots[0]!;
    Object.assign(commands.get(0)!, { fire: true, pitch: 1.2 }); // a long burst into the air
    let jumps = 0;
    let last: { x: number; z: number } | undefined;
    let turned = 0;
    let prevYaw = b.aim.yaw;
    run(3, () => {
      if (b.hasLastKnown) {
        if (last && Math.hypot(b.lastKnown.x - last.x, b.lastKnown.z - last.z) > 0.5) jumps++;
        last = { x: b.lastKnown.x, z: b.lastKnown.z };
      }
      turned += Math.abs(Math.atan2(Math.sin(b.aim.yaw - prevYaw), Math.cos(b.aim.yaw - prevYaw)));
      prevYaw = b.aim.yaw;
    });
    expect(state.events).toBeDefined();
    expect(last).toBeDefined();
    // At most one re-guess: when the bot gets to its guess and the noise is clearly elsewhere.
    expect(jumps).toBeLessThanOrEqual(1);
    expect(turned).toBeLessThan(Math.PI); // turns towards the noise; no swinging back and forth
  });

  it('keep one steady guess when two unseen enemies near each other take turns firing', () => {
    const walls: WorldQuery = { raycastStatic: (_o, _d, max) => max * 0.5 };
    const { state, bots, run, commands } = duel(18, (s) => s.characters.push(createCharacter(2, vec3(4, 0, 0), 0, LOADOUT, 0)), walls);
    const b = bots.bots[0]!;
    const second = createCommand();
    commands.set(2, second);
    let jumps = 0;
    let last: { x: number; z: number } | undefined;
    run(3, () => {
      // Alternate bursts between the two shooters every few ticks.
      const turn = Math.floor(state.tick / 5) % 2 === 0;
      Object.assign(commands.get(0)!, { fire: turn, pitch: 1.2 });
      Object.assign(second, { fire: !turn, pitch: 1.2 });
      if (b.hasLastKnown) {
        if (last && Math.hypot(b.lastKnown.x - last.x, b.lastKnown.z - last.z) > 0.5) jumps++;
        last = { x: b.lastKnown.x, z: b.lastKnown.z };
      }
    });
    expect(last).toBeDefined();
    expect(jumps).toBeLessThanOrEqual(1); // (was dozens when each shooter reset the guess)
  });

  it('stay on one target rather than flip between two enemies side by side', () => {
    const { bots, run } = duel(14, (s) => {
      s.characters.push(createCharacter(2, vec3(1.2, 0, 0), 0, LOADOUT, 0));
    });
    const b = bots.bots[0]!;
    let switches = 0;
    let prev = -1;
    run(3, () => {
      if (b.targetId >= 0 && prev >= 0 && b.targetId !== prev) switches++;
      if (b.targetId >= 0) prev = b.targetId;
    });
    // A switch is fine once someone is hit (they're out); flip-flopping isn't.
    expect(switches).toBeLessThanOrEqual(1);
  });
});

