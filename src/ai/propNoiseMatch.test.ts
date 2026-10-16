import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import type { MapBlock, MapData } from '../map/mapTypes';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import type { GameEvent } from '../sim/events';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { BotController } from './botController';
import { playMatch } from './depotMatchSupport';

/**
 * NP1 end to end (headless, real Rapier): a runner knocks a crate and an enemy bot facing away, further than a run's
 * steps carry, comes to know of it through BotController.observe after stepSimulation; and the same seed gives the same
 * noise events on a real map (GameState.propQuiet adds no randomness or hidden state).
 */

const DT = 1 / 60;
const REST = PHYSICS.groundRestGap;
const FLOOR: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(60, 0.5, 60) };
const CRATE: MapBlock = { kind: 'crate', center: vec3(0, 0.6, -3.2), size: vec3(1.2, 1.2, 1.2) };

/** The runner (Blue, id 0) at the origin facing -z; an Orange bot at z = `botZ` with its back to the runner. */
function scene(botX: number, pace: 'run' | 'walk') {
  const map: MapData = { name: 'noise', blocks: [FLOOR, CRATE], killY: -20, spawns: [[], []], deadZones: [[], []], lanes: [] };
  const world = new PhysicsWorld(map, BODY, DT);
  const nav = buildNavGrid(map, NAV);
  const deadZones = [[{ position: vec3(-40, 0, 0), yaw: 0 }], [{ position: vec3(40, 0, 0), yaw: 0 }]];
  const ctx = createSimContext({ mover: world, query: world, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: map.killY, hits: HITS, deadZones, rounds: ROUNDS, nav, navSnap: NAV.snap });
  const state = createGameState(5, 16, ROUNDS);
  const runner = createCharacter(0, vec3(0, REST, 0), 0, LOADOUT, 0);
  const bot = createCharacter(1, vec3(botX, REST, -2.6), 0, LOADOUT, 1);
  bot.yaw = -Math.PI / 2; // faces +x, its back to the runner (who is at x = 0)
  state.characters.push(runner, bot);
  world.addCharacter(runner);
  world.addCharacter(bot);
  const cmd = createCommand();
  cmd.forward = 1;
  cmd.walk = pace === 'walk';
  const commands = new Map([[0, cmd]]);
  const bots = new BotController(state, [bot], commands, { query: world, nav, navSnap: NAV.snap, lanes: OPEN_FIELD.lanes, lowCover: [], tallCover: [], body: BODY, hits: HITS, loadout: LOADOUT, cfg: BOTS, seed: 5 });
  return { world, state, ctx, bot, bots, commands };
}

describe('a bot hears a runner knock a noisy prop (NP1 AC1 and AC3, end to end)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('an enemy 12.2 m off to the side, facing away, learns of a run into a crate (13 m) that its steps (11 m) never carried; a walk into it tells it nothing', () => {
    for (const [pace, heard, knocks] of [['run', true, 1], ['walk', false, 0]] as const) {
      const s = scene(12.2, pace);
      expect(s.bot.yaw).toBeCloseTo(-Math.PI / 2);
      let seen = 0;
      for (let i = 0; i < 4 * 60; i++) {
        stepSimulation(s.state, s.commands, s.ctx, DT);
        seen += s.state.events.filter((e) => e.type === 'propNoise').length;
        s.bots.observe(s.state);
      }
      expect(seen, pace).toBe(knocks);
      expect(s.bots.bots[0]!.hasLastKnown, pace).toBe(heard);
      s.world.dispose();
    }
  });

  it('places the guess on the runner, near the crate, not on the bot', () => {
    const s = scene(12.2, 'run');
    for (let i = 0; i < 4 * 60 && !s.bots.bots[0]!.hasLastKnown; i++) {
      stepSimulation(s.state, s.commands, s.ctx, DT);
      s.bots.observe(s.state);
    }
    const k = s.bots.bots[0]!.lastKnown;
    // On the runner (at x = 0), within the usual guess, not at the bot's own spot (x = 12.2).
    expect(Math.hypot(k.x - s.state.characters[0]!.position.x, k.z - s.state.characters[0]!.position.z)).toBeLessThanOrEqual(12.5 * BOTS.hearingError + 1e-6);
    s.world.dispose();
  });
});

describe('the simulation stays deterministic with propQuiet (NP1 AC6)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  /** A signature of every footstep surface and prop noise over 25 s of a Depot match. */
  function signature(seed: number) {
    const sig: string[] = [];
    let quietLength = -1;
    let quiet: number[] | undefined;
    let surfaced = 0;
    let steps = 0;
    playMatch(25, seed, undefined, BOTS, 'elimination', ROUNDS, DEPOT, 3, undefined, (state) => {
      // Grown once, then the same array of the same length every tick (nothing allocated per tick).
      quiet ??= state.propQuiet;
      if (quietLength >= 0) expect(state.propQuiet.length).toBe(quietLength);
      expect(state.propQuiet).toBe(quiet);
      quietLength = state.propQuiet.length;
      for (const e of state.events as GameEvent[]) {
        if (e.type === 'propNoise') sig.push(`${state.time.toFixed(3)}:${e.characterId}:${e.prop}:${e.shot}:${e.position.x.toFixed(3)},${e.position.z.toFixed(3)}`);
        if (e.type === 'footstep') {
          if (e.kind === 'run' || e.kind === 'sprint' || e.kind === 'land') {
            steps++;
            if (e.surface !== undefined) surfaced++;
          } else expect(e.surface, e.kind).toBeUndefined();
          sig.push(`${state.time.toFixed(3)}:${e.characterId}:${e.kind}:${e.surface}`);
        }
      }
    });
    return { sig, quietLength, surfaced, steps };
  }

  it('gives two runs of one seed the same noise and step events, and a propQuiet slot per Depot prop', () => {
    const a = signature(3);
    const b = signature(3);
    expect(a.sig.length).toBeGreaterThan(0);
    expect(b.sig).toEqual(a.sig);
    expect(a.quietLength).toBeGreaterThan(0);
    // On a real map every run, sprint and landing carries the ground it came down on.
    expect(a.steps).toBeGreaterThan(0);
    expect(a.surfaced).toBe(a.steps);
  });
});
