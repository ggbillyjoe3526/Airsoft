import type { BotConfig } from '../config/bots';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import { createNavSearch, findPath, type NavGrid, type NavSearch } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import type { GameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { type Bot, type BotWorld, createBot, resetBot, thinkBot } from './botBrain';
import { bodyPoint } from './perception';

export interface BotControllerOptions {
  query: WorldQuery;
  nav: NavGrid;
  /** Route ends snap to the nearest walkable cell within this distance. */
  navSnap: number;
  lanes: readonly (readonly Vec3[])[];
  body: BodyConfig;
  hits: HitConfig;
  loadout: readonly ReplicaConfig[];
  cfg: BotConfig;
  seed: number;
}

/**
 * Runs every bot: before each simulation tick it writes each bot's PlayerCommand (bots are just
 * another controller); after each tick it lets bots hear what happened (gunfire, near misses,
 * teammates being hit). Route searches are rationed per tick and handed out round-robin.
 */
export class BotController {
  readonly bots: Bot[] = [];
  private readonly world: BotWorld;
  private readonly search: NavSearch;
  private readonly chest = vec3();
  private plannerCursor = 0;

  constructor(
    state: GameState,
    botCharacters: readonly Character[],
    commands: Map<number, PlayerCommand>,
    private readonly opts: BotControllerOptions,
  ) {
    this.world = {
      characters: state.characters,
      query: opts.query,
      nav: opts.nav,
      lanes: opts.lanes,
      body: opts.body,
      hits: opts.hits,
      loadout: opts.loadout,
      cfg: opts.cfg,
      time: 0,
      live: true,
    };
    this.search = createNavSearch(opts.nav);
    for (const c of botCharacters) {
      this.bots.push(createBot(c, (opts.seed * 7919 + c.id * 104729) >>> 0, opts.lanes.length));
      commands.set(c.id, this.commandFor(c.id));
    }
  }

  private readonly commandsById = new Map<number, PlayerCommand>();

  private commandFor(id: number): PlayerCommand {
    let cmd = this.commandsById.get(id);
    if (!cmd) {
      cmd = createCommand();
      this.commandsById.set(id, cmd);
    }
    return cmd;
  }

  /** Before a simulation tick: plan routes (rationed) and decide every bot's command. */
  think(state: GameState, dt: number): void {
    const w = this.world;
    w.time = state.time;
    w.live = state.round.phase === 'live';
    this.planRoutes();
    for (const b of this.bots) thinkBot(b, w, this.commandFor(b.character.id), dt);
  }

  /** After a simulation tick, while its events are still in the state. */
  observe(state: GameState): void {
    const cfg = this.opts.cfg;
    const time = state.time;
    for (const e of state.events) {
      if (e.type === 'roundStart') {
        for (const b of this.bots) resetBot(b, this.opts.lanes.length);
        continue;
      }
      if (e.type === 'shot') {
        const shooter = this.character(state, e.characterId);
        if (shooter) this.hear(shooter.team, e.position, time, cfg.hearingDistance);
      } else if (e.type === 'characterHit') {
        const victim = this.character(state, e.victimId);
        const shooter = this.character(state, e.shooterId);
        // Teammates nearby hear the hit called and turn towards where it came from.
        if (victim && shooter && victim.team !== shooter.team) this.hear(shooter.team, shooter.position, time, cfg.hearingDistance, victim.position);
      } else if (e.type === 'bbImpact') {
        for (const b of this.bots) {
          const p = bodyPoint(b.character, this.opts.hits, cfg.aimHeightFraction, this.chest);
          if (Math.hypot(e.position.x - p.x, e.position.y - p.y, e.position.z - p.z) <= cfg.suppressionRadius) {
            b.suppressedAt = time;
            b.lastThreatAt = time;
          }
        }
      }
    }
  }

  /**
   * Bots of the other team than `shooterTeam` within `range` of `heardAt` (default: the shooter)
   * learn roughly where the shooter is, unless they can already see someone.
   */
  private hear(shooterTeam: number, shooterPos: Vec3, time: number, range: number, heardAt: Vec3 = shooterPos): void {
    for (const b of this.bots) {
      const c = b.character;
      if (c.team === shooterTeam || !isInPlay(c) || b.targetVisible) continue;
      if (Math.hypot(heardAt.x - c.position.x, heardAt.z - c.position.z) > range) continue;
      b.lastKnown.x = shooterPos.x;
      b.lastKnown.y = c.position.y;
      b.lastKnown.z = shooterPos.z;
      b.hasLastKnown = true;
      b.lastSeenAt = time;
      b.lastThreatAt = time;
    }
  }

  private character(state: GameState, id: number): Character | undefined {
    for (const c of state.characters) if (c.id === id) return c;
    return undefined;
  }

  /** Serves at most cfg.pathsPerTick route requests, round-robin across bots. */
  private planRoutes(): void {
    let budget = this.opts.cfg.pathsPerTick;
    const n = this.bots.length;
    for (let k = 0; k < n && budget > 0; k++) {
      const b = this.bots[(this.plannerCursor + k) % n]!;
      if (b.routeState !== 'wanted') continue;
      budget--;
      this.plannerCursor = (this.plannerCursor + k + 1) % n;
      const ok = findPath(this.opts.nav, this.search, b.character.position, b.routeGoal, this.opts.navSnap, b.route);
      b.routeLeg = 0;
      b.stuckFor = 0;
      b.routeState = ok ? 'ok' : 'failed';
    }
  }
}
