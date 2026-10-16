import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS, WIND } from '../config/ballistics';
import { BOTS, botConfig } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS } from '../config/hits';
import { DEFAULT_MATCH_RULES, roundRulesFor } from '../config/matchRules';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { TEAMS } from '../config/teams';
import { DEPOT } from '../map/depot';
import { mapEntry } from '../map/maps';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter, respawnCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { attackersInRound, placeTeams, teamEnd } from '../sim/round';
import { byTeam, rosterTeams } from '../sim/roster';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { createWind } from '../sim/wind';
import { MatchStats } from '../stats/matchStats';
import { resultText } from '../ui/matchStopText';
import { roundBanner } from '../ui/roundBanner';
import { rosterNames, statsBlocks } from '../ui/statsRows';
import { BotController } from './botController';
import { lowCoverBlocks, tallCoverBlocks } from './cover';
import { DT } from './depotMatchSupport';
import { sightConditionsOf } from './perception';

/**
 * Your team (M98): a full match on Depot in each team mode with you on Alpha and one with you on Beta (and since KI1 the
 * same on Woodland and Neon Heights, at each map's standard team size), built as the
 * match build builds it (matchSession.ts: sim/roster.ts's roster, you character 0 and not one of the match's bots, your
 * bot teammates at the teammates' level). Checked every round: your team's end (and in Attack / Defend its job)
 * swapping at half-time, your squad order reaching your teammates only, and at the end the result, the summary and the
 * stats read from your side. You are played by a bot controller of your own, apart from the match's, so you count as
 * the player the match's bots take orders from. Real physics, headless.
 */

type TeamMode = 'elimination' | 'attackDefend';
type Rules = ReturnType<typeof roundRulesFor>;

/** The maps a match is played on here, each at its standard team size (Depot's is the standard match's). */
const MAPS: readonly { map: MapData; label: string; rules: Rules }[] = (
  [
    ['depot', DEPOT],
    ['woodland', WOODLAND],
    ['neonHeights', NEON_HEIGHTS],
  ] as const
).map(([id, map]) => {
  const entry = mapEntry(id);
  return { map, label: entry.label, rules: roundRulesFor({ ...DEFAULT_MATCH_RULES, teamSize: entry.teamSize.standard }) };
});

function playAs(team: number, mode: TeamMode, seed: number, map: MapData, RULES: Rules) {
  const size = RULES.teamSize;
  const physics = new PhysicsWorld(map, BODY, DT);
  const nav = buildNavGrid(map, NAV);
  const state = createGameState(seed, BALLISTICS.maxBBs, RULES, mode, map.flag);
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    wind: createWind(seed, WIND),
    killY: map.killY,
    hits: HITS,
    deadZones: map.deadZones,
    spawns: map.spawns,
    spawnLift: PHYSICS.groundRestGap,
    nav,
    navSnap: NAV.snap,
    rounds: RULES,
    pole: map.flag,
    overtimeFlag: map.overtimeFlag,
  });
  for (const [id, t] of rosterTeams(team, size, size).entries()) state.characters.push(createCharacter(id, vec3(), 0, LOADOUT, t));
  placeTeams(state.round, state.characters, ctx.round);
  for (const c of state.characters) {
    respawnCharacter(c);
    physics.addCharacter(c);
  }
  const player = state.characters[0]!;
  const commands = new Map<number, PlayerCommand>();
  const mates = botConfig('easy');
  const opts = {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: map.lanes,
    lowCover: lowCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    tallCover: tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    sight: sightConditionsOf(map),
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: BOTS,
    teamCfg: byTeam(team, mates, botConfig('normal')),
    seed,
  };
  // As in the game the match's bots are everyone but you; you are played by a controller of one, so the rounds are
  // fought rather than waited out.
  const bots = new BotController(state, state.characters.filter((c) => c !== player), commands, opts);
  const you = new BotController(state, [player], commands, { ...opts, seed: seed + 1 });
  const stats = new MatchStats(state.characters);
  const rounds: { number: number; end: number; attackers: number; mateEnds: number[]; banner: string }[] = [];
  const noteRound = (): void => {
    rounds.push({
      number: state.round.number,
      end: player.end,
      attackers: state.round.attackers,
      mateEnds: state.characters.filter((c) => c.team === team).map((c) => c.end),
      banner: roundBanner(state.round, player.team, true, 0, RULES),
    });
  };
  noteRound();
  const order = { given: '', takers: [] as number[] };
  const maxTicks = ((RULES.winsNeeded * 2 + 2) * (RULES.roundTime + 60)) / DT;
  for (let tick = 0; tick < maxTicks && state.round.phase !== 'matchOver'; tick++) {
    if (tick === 30) {
      // Half a second in: you order your squad to follow (the order keys or the wheel), then put them back on the plan.
      order.given = bots.giveOrder(player, 'follow');
      order.takers = bots.bots.filter((b) => b.orderLeader === player).map((b) => b.character.id);
      bots.cancelOrder(player);
    }
    bots.think(state, DT);
    you.think(state, DT);
    stepSimulation(state, commands, ctx, DT);
    stats.afterTick(state, DT);
    bots.observe(state);
    you.observe(state);
    for (const e of state.events) if (e.type === 'roundStart') noteRound();
  }
  physics.dispose();
  return { state, player, stats, rounds, order, bots, mates };
}

describe('a full match on either team (M98)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const { map, label, rules: RULES, mode } of MAPS.flatMap((m) => (['attackDefend', 'elimination'] as const).map((mode) => ({ ...m, mode })))) {
    for (const team of [0, 1]) {
      it(`plays a whole ${mode} match on ${label} with you on ${TEAMS[team]!.name}`, { timeout: 180_000 }, () => {
        const { state, player, stats, rounds, order, bots, mates } = playAs(team, mode, 8, map, RULES);
        const r = state.round;
        expect(r.phase, 'the match is decided').toBe('matchOver');
        expect(player.team).toBe(team);
        // Your bot teammates play at the teammates' level, the other team at the opponents'.
        expect(bots.cfgOf(team)).toBe(mates);
        expect(bots.cfgOf(1 - team)).not.toBe(mates);

        // Every round: your team at its end together. Attack / Defend: the attackers start at end 0, and Alpha attacks
        // first, so on Beta you defend first. Elimination: Alpha starts in the east, so on Beta you start in the west.
        // Either way ends (and sides) swap after half-time.
        for (const round of rounds) {
          expect(round.end, `round ${round.number}`).toBe(teamEnd(team, mode, round.number, RULES));
          expect(new Set(round.mateEnds), `round ${round.number}`).toEqual(new Set([round.end]));
          if (mode === 'elimination') {
            expect(round.banner).toBe(`Round ${round.number}`);
            continue;
          }
          const attackers = attackersInRound(round.number, RULES);
          expect(round.attackers, `round ${round.number}`).toBe(attackers);
          expect(round.end === 0, `round ${round.number}`).toBe(attackers === team);
          expect(round.banner).toBe(`Round ${round.number} · ${attackers === team ? 'Attack' : 'Defend'}`);
        }
        if (mode === 'attackDefend') expect(rounds[0]!.banner).toBe(team === 0 ? 'Round 1 · Attack' : 'Round 1 · Defend');
        else expect(rounds[0]!.end).toBe(team === 0 ? RULES.eliminationFirstEnd : 1 - RULES.eliminationFirstEnd);
        const afterHalf = rounds.filter((x) => x.number > RULES.halfTimeAfter);
        expect(afterHalf.length, 'the match went past half-time').toBeGreaterThan(0);
        for (const x of afterHalf) expect(x.end).toBe(1 - rounds[0]!.end);

        // Your squad order reached your teammates, every one of them, and nobody on the other team.
        expect(order.given).toBe('follow');
        const mateIds = state.characters.filter((c) => c.team === team && c !== player).map((c) => c.id);
        expect(order.takers.sort()).toEqual(mateIds.sort());
        expect(bots.orderOf(player)).toBe('none');

        // The result and the records read from your side.
        const won = r.matchWinner === team;
        expect(r.score[r.matchWinner]).toBe(RULES.winsNeeded);
        const result = resultText(r, player.team);
        expect(result.headline).toBe(won ? 'You win!' : 'You lose');
        expect(result.scoreLine).toMatch(new RegExp(`^${TEAMS[team]!.name} \\(you\\) ${r.score[team]} – ${r.score[1 - team]} ${TEAMS[1 - team]!.name}`));
        const names = rosterNames(state.characters, player.id);
        const blocks = statsBlocks(state.characters, names, (id) => stats.matchOf(id), r.score, player, false);
        expect(blocks.map((b) => b.team)).toEqual([team, 1 - team]);
        expect(blocks[0]!.title).toMatch(new RegExp(`^${TEAMS[team]!.name} \\(you\\) · ${r.score[team]} round`));
        expect(blocks[0]!.rows.map((x) => x.name)).toContain('You');
        expect(blocks[1]!.rows.every((x) => x.name.startsWith(`${TEAMS[1 - team]!.name} `))).toBe(true);
        // Rounds you count towards are rounds your team won.
        expect(stats.roundsContributed(player.id)).toBeLessThanOrEqual(r.score[team]!);
        const teamHits = (t: number) => state.characters.filter((c) => c.team === t).reduce((n, c) => n + stats.matchOf(c.id).hits, 0);
        expect(teamHits(0) + teamHits(1), 'BBs found their marks on both sides').toBeGreaterThan(0);
      });
    }
  }
});
