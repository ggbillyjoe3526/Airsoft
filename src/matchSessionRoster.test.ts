import { describe, expect, it } from 'vitest';
import { drawIdentities } from './ai/botRoster';
import { DIFFICULTIES, type Difficulty } from './config/bots';
import { ROUNDS } from './config/hits';
import { DEFAULT_MATCH_RULES, type MatchRules } from './config/matchRules';
import { LOADOUT, REALCAP } from './config/replicas';
import { DEPOT } from './map/depot';
import { MatchSession } from './matchSession';
import { botKitSeed, botLight, kittedBot, pickBotKit } from './pool/botKit';
import { contentPool } from './pool/contentPool';
import { GAME_BOT_KITS } from './pool/gameBotKits';
import { GAME_POOL } from './pool/gamePool';
import { createGameState } from './sim/state';
import type { Character } from './sim/character';

/**
 * BG1 QA: the match roster (matchSession.ts spawnRoster) builds the bots' kits as the task says. The real session needs
 * a GPU and physics, so spawnRoster runs on a bare object holding what it touches (as matchSessionDevAssist.test.ts does).
 */
interface Opts {
  difficulty?: Difficulty;
  rules?: Partial<MatchRules>;
  devContent?: boolean;
  night?: boolean;
  playerTeam?: number;
  seed?: number;
  owned?: Record<string, number>;
  kit?: unknown;
}

function roster(o: Opts = {}): Character[] {
  const rules: MatchRules = { ...DEFAULT_MATCH_RULES, ...o.rules };
  const s = Object.create(MatchSession.prototype) as MatchSession;
  const seed = o.seed ?? 1;
  const state = createGameState(seed, 10, ROUNDS, 'elimination');
  Object.assign(s, {
    setup: { difficulty: o.difficulty ?? 'hard', rules, devContent: o.devContent ?? false, map: DEPOT, owned: o.owned, kit: o.kit },
    playerTeam: o.playerTeam ?? 0,
    mode: 'elimination',
    extraction: undefined,
    lighting: { night: o.night ?? false },
    loadout: LOADOUT,
    botLoadout: LOADOUT,
    state,
    ctx: { round: { rules: ROUNDS, spawns: DEPOT.spawns, spawnLift: 0 } },
    physics: { addCharacter: () => {} },
  });
  (s as unknown as { spawnRoster(m: typeof DEPOT, seed: number): Character }).spawnRoster(DEPOT, seed);
  return state.characters;
}

/** What a character carries, comparable: each replica's id, optic, parts and magazine capacity. */
const carried = (c: Character) => ({
  replicas: c.armament.replicas.map((r) => r.id),
  optics: c.armament.optics,
  parts: c.armament.parts,
  mags: c.armament.ammo.map((a) => a.mag),
});
const factory = { replicas: LOADOUT.map((r) => r.id), optics: LOADOUT.map(() => null) };
const isFactory = (c: Character) => JSON.stringify([carried(c).replicas, carried(c).optics]) === JSON.stringify([factory.replicas, factory.optics]) && c.armament.parts.every((p) => !p.muzzle && !p.barrel && !p.light && !p.laser && p.grip === 'none');

describe('the match roster carries kits (BG1 criterion 2)', () => {
  const size = ROUNDS.teamSize;

  it('gives each opponent the kit pickBotKit draws for the match seed, its id and its personality, and everyone else the replicas as they come', () => {
    const seed = 7;
    const chars = roster({ difficulty: 'pro', seed });
    const botPool = contentPool(GAME_POOL, false);
    // The personalities spawnRoster drew (BN1): the same draw over the same bots.
    const identities = drawIdentities(seed, chars.filter((c) => c.id !== 0).map((c) => ({ id: c.id, team: c.team })));
    expect(chars.length).toBe(size * 2);
    for (const c of chars) {
      if (c.team === 0) {
        expect(carried(c).replicas, `friend ${c.id}`).toEqual(factory.replicas);
        expect(isFactory(c), `friend ${c.id}`).toBe(true);
      } else {
        const kit = pickBotKit(GAME_BOT_KITS, 'pro', botPool, botKitSeed(seed, c.id), identities.get(c.id)!.personality)!;
        expect(kit, `opponent ${c.id}`).not.toBeNull();
        expect(carried(c), `opponent ${c.id}`).toEqual(carried(kittedBot(c.id, 1, botPool, kit)));
      }
    }
  });

  it('never leaves a Pro opponent on the factory replicas, over many match seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const c of roster({ difficulty: 'pro', seed }).filter((x) => x.team === 1)) expect(isFactory(c), `seed ${seed} bot ${c.id}`).toBe(false);
    }
  });

  it('seeds by the match: a replay carries the same kits, other seeds do not all carry the same', () => {
    const a = roster({ seed: 3 }).map(carried);
    expect(roster({ seed: 3 }).map(carried)).toEqual(a);
    const others = [4, 5, 6, 7, 8].map((seed) => JSON.stringify(roster({ seed }).map(carried)));
    expect(others.some((x) => x !== JSON.stringify(a))).toBe(true);
  });

  it('picks per bot: opponents of one match do not all carry one kit', () => {
    const kits = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) for (const c of roster({ difficulty: 'pro', seed }).filter((x) => x.team === 1)) kits.add(JSON.stringify(carried(c)));
    expect(kits.size).toBeGreaterThan(2);
  });

  it('kits the team that is not yours, whichever team you picked', () => {
    const chars = roster({ difficulty: 'pro', playerTeam: 1 });
    for (const c of chars.filter((x) => x.team === 1)) expect(isFactory(c), `friend ${c.id}`).toBe(true);
    for (const c of chars.filter((x) => x.team === 0)) expect(isFactory(c), `opponent ${c.id}`).toBe(false);
  });

  it('is the same whatever the player owns or carries', () => {
    const base = roster({ difficulty: 'hard', seed: 9 }).map(carried);
    const rich = roster({ difficulty: 'hard', seed: 9, owned: { 'aeg-rifle': 9, cyber: 5, scope2x: 4 }, kit: { slots: [], hopUps: [], bbWeights: [] } }).map(carried);
    expect(rich).toEqual(base);
  });

  it('gives everyone the replicas as they come under the Factory kit house rule, even at Pro', () => {
    for (const c of roster({ difficulty: 'pro', rules: { factoryKit: true } })) expect(isFactory(c), `bot ${c.id}`).toBe(true);
  });

  it('keeps bots honest about dev gear: no bot carries an asset the offered pool tags dev with Dev content off', () => {
    const dev = new Set(GAME_POOL.assets.filter((a) => a.tag === 'dev').map((a) => a.id));
    for (const d of DIFFICULTIES) {
      for (const c of roster({ difficulty: d.id, devContent: false }).filter((x) => x.team === 1)) {
        expect(c.armament.replicas.some((r) => dev.has(r.id)), `${d.id} bot ${c.id}`).toBe(false);
      }
    }
  });
});

describe('the night torch is still fitted by rule (BG1 criterion 2)', () => {
  const light = botLight(GAME_POOL);
  const lit = (c: Character) => c.armament.parts.some((p) => p.light === light);

  it('is fitted to every bot, kitted or not, only at night and not under the Factory kit rule; the player is left alone', () => {
    expect(light).not.toBeNull();
    // The torch is a dev asset: bots fit it only with Dev content on.
    const night = roster({ difficulty: 'pro', night: true, devContent: true });
    for (const c of night) expect(lit(c), `bot ${c.id}`).toBe(c.id !== 0);
    for (const c of roster({ difficulty: 'pro', night: false, devContent: true })) expect(lit(c), `day bot ${c.id}`).toBe(false);
    for (const c of roster({ difficulty: 'pro', night: true, devContent: true, rules: { factoryKit: true } })) expect(lit(c), `factory bot ${c.id}`).toBe(false);
  });

  it('does not shift the kits the seed picks', () => {
    const day = roster({ difficulty: 'hard', seed: 5, devContent: true }).map((c) => c.armament.replicas.map((r) => r.id));
    const dark = roster({ difficulty: 'hard', seed: 5, devContent: true, night: true }).map((c) => c.armament.replicas.map((r) => r.id));
    expect(dark).toEqual(day);
  });
});

describe('the replica rules reach kitted bots (BG1 criterion 2, M39)', () => {
  it('holds a kitted opponent on semi under Semi only, with the kit and its optic kept', () => {
    const chars = roster({ difficulty: 'pro', rules: { semiAutoOnly: true } });
    for (const c of chars.filter((x) => x.team === 1)) {
      c.armament.replicas.forEach((r, i) => expect(c.armament.modes[i], `bot ${c.id} replica ${i}`).toBe(r.defaultFireMode));
      expect(c.armament.replicas.every((r) => r.fireModes.length === 1 || c.armament.modes[0] === 'semi')).toBe(true);
    }
    expect(chars.some((c) => c.team === 1 && c.armament.optics.some((o) => o !== null))).toBe(true);
  });

  it('leaves a kitted opponent on full auto under Realcap alone, with magazines no larger than the realcap size', () => {
    const chars = roster({ difficulty: 'pro', rules: { realcap: true } });
    for (const c of chars.filter((x) => x.team === 1)) {
      expect(c.armament.modes[0], `bot ${c.id}`).toBe('auto');
      for (const a of c.armament.ammo) {
        expect(a.mag).toBeLessThanOrEqual(REALCAP.magSize);
        expect(a.pouch.length).toBeLessThanOrEqual(REALCAP.mags);
      }
      for (const p of c.armament.parts) expect(p.magazine).toBe(REALCAP.magazine);
    }
  });
});
