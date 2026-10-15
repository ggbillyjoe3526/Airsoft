import { describe, expect, it } from 'vitest';
import { BOT_PERSONALITIES } from '../config/botPersonalities';
import { BOT_BEHAVIOUR, BOT_SKILL } from '../config/bots';
import { NEUTRAL_STYLE } from '../config/botsFile';
import { CALLOUT_EVENTS, type CalloutEvent, loadCalloutsFile } from '../config/calloutsFile';
import { ROUNDS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import type { MapArea } from '../map/mapTypes';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { createGameState, type GameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { type Bot, createBot } from './bot';
import { CalloutDirector } from './callouts';

/**
 * CL1: the bots' callouts, read off what they do. Which call is said (the more urgent first, the right line), and the
 * pace: one at a time per team, the team's, the bot's and the same enemy's gaps, a held call dropped after its wait.
 */

const DT = 1 / 60;
const LINES: Record<CalloutEvent, string> = {
  contact: 'Contact, {area}!',
  contacts: '{count}, {area}!',
  heard: 'Movement, {area}.',
  down: '{left} left!',
  lastOne: 'Last one!',
  tagged: 'Tagged!',
  reloading: 'Reloading!',
  pushing: 'Pushing {area}!',
  flanking: 'Flanking {area}.',
  checking: 'Checking {area}.',
  holding: 'Holding {area}.',
  raising: 'Raising!',
  flag: 'Flag!',
  overtime: 'Overtime, {area}!',
  pingGoing: 'Going to {area}.',
  pingWatching: 'Watching {area}.',
  needMag: 'Need a mag!',
  magComing: 'Mag coming!',
  magThanks: 'Thanks for the mag!',
};

interface Setup {
  chance?: Partial<Record<CalloutEvent, number>>;
  gap?: Partial<Record<CalloutEvent, number>>;
  pace?: { bot?: number; team?: number; enemy?: number; wait?: number };
  talks?: { rusher?: number; careful?: number };
  /** The Marks table (PG1): no marks unless a test asks. */
  marks?: { chance?: number; gap?: number };
  extra?: string;
}

/** A callouts.md with every event (in the shipped order of urgency), always called unless `chance` says otherwise. */
function calloutsText(s: Setup = {}): string {
  const order: CalloutEvent[] = ['lastOne', 'down', 'tagged', 'pingGoing', 'pingWatching', 'needMag', 'magComing', 'overtime', 'flag', 'raising', 'contacts', 'contact', 'reloading', 'magThanks', 'heard', 'pushing', 'flanking', 'checking', 'holding'];
  const name = (id: CalloutEvent) => CALLOUT_EVENTS.find((e) => e.id === id)!.name;
  const p = { bot: 4, team: 1.5, enemy: 10, wait: 1.5, ...s.pace };
  return [
    '## When they call',
    '| Event | Chance | Team gap (s) |',
    '|---|---|---|',
    ...order.map((id) => `| ${name(id)} | ${s.chance?.[id] ?? 1} | ${s.gap?.[id] ?? 0} |`),
    '',
    '## Pace',
    '| Rule | Seconds |',
    '|---|---|',
    `| One bot's calls apart | ${p.bot} |`,
    `| The team's calls apart | ${p.team} |`,
    `| The same enemy again after | ${p.enemy} |`,
    `| A call waits at most | ${p.wait} |`,
    '',
    '## Marks',
    '| Rule | Value |',
    '|---|---|',
    `| A sighting is marked (chance) | ${s.marks?.chance ?? 0} |`,
    `| The team's marks apart (s) | ${s.marks?.gap ?? 12} |`,
    '',
    '## Personalities',
    '| Personality | Talks (×) |',
    '|---|---|',
    `| Rusher | ${s.talks?.rusher ?? 1} |`,
    `| Careful | ${s.talks?.careful ?? 1} |`,
    '',
    '## Lines',
    '| Event | Who | Line |',
    '|---|---|---|',
    ...order.map((id) => `| ${name(id)} | Any | ${LINES[id]} |`),
    ...(s.extra ? [s.extra] : []),
  ].join('\n');
}

const AREAS: MapArea[] = [
  { name: 'Dock', box: [0, 20, -20, 0] },
  { name: 'Bay', box: [0, 20, 0, 20] },
  { name: 'Yard', box: [-20, 0, -20, 20] },
];
const DOCK = vec3(10, 0, -10);
const BAY = vec3(10, 0, 10);
const YARD = vec3(-10, 0, 0);

/**
 * Two a side: team 0 are bots 0 (a rusher) and 1 (careful), team 1 bots 2 (a rusher) and 3 (careful), in that order in
 * `bots`. Everyone stands in the Yard until a test moves them.
 */
function rig(s: Setup = {}, countsLeft = true) {
  const file = loadCalloutsFile(calloutsText(s), new Set(['rusher', 'careful']));
  expect(file.errors).toEqual([]);
  const state: GameState = createGameState(1, 16, ROUNDS);
  state.time = 10;
  const people = ['rusher', 'careful', 'rusher', 'careful'];
  const bots: Bot[] = people.map((personality, id) => {
    const c = createCharacter(id, vec3(YARD.x, 0, YARD.z), 0, LOADOUT, id < 2 ? 0 : 1);
    state.characters.push(c);
    return createBot(c, id + 1, BOT_BEHAVIOUR, BOT_SKILL.normal, { name: `B${id}`, personality, style: BOT_PERSONALITIES.styles.get(personality) ?? NEUTRAL_STYLE });
  });
  const director = new CalloutDirector(file, 7, AREAS, countsLeft);
  /** One tick: time moves on, these events happen, and the director looks; what it said, as "speaker: line". */
  const tick = (...events: GameEvent[]): string[] => {
    state.time += DT;
    state.events.length = 0;
    state.events.push(...events);
    director.observe(state, bots);
    return director.said.slice(0, director.saidCount).map((c) => `${c.speakerId}: ${c.text}`);
  };
  /** Ticks for `seconds`, everything said in order. */
  const run = (seconds: number): string[] => {
    const out: string[] = [];
    for (let t = 0; t < seconds; t += DT) out.push(...tick());
    return out;
  };
  /** Bot `b` sees character `id` from now (a fresh sighting), standing at `at`. */
  const sees = (b: number, id: number, at = DOCK): void => {
    const c = state.characters[id]!;
    c.position.x = at.x;
    c.position.z = at.z;
    const t = state.time + DT; // the tick about to run
    bots[b]!.contacts.set(id, { seenAt: t, acquiredAt: t, firstSeenAt: t, held: false, reactAt: t });
  };
  /** Bot `b` loses sight of character `id`. */
  const loses = (b: number, id: number): void => {
    const c = bots[b]!.contacts.get(id);
    if (c) c.seenAt = Number.NEGATIVE_INFINITY;
  };
  const hit = (victim: number, shooter: number): GameEvent => {
    state.characters[victim]!.status = 'calling';
    return { type: 'characterHit', victimId: victim, shooterId: shooter, position: vec3(), direction: vec3(1, 0, 0), ricochet: false };
  };
  tick(); // the director's first look sizes its memory
  return { state, bots, director, tick, run, sees, loses, hit };
}

describe('CL1: what the bots call', () => {
  it('calls a fresh sighting, with where the enemy is; two at once with how many', () => {
    const r = rig();
    r.sees(0, 2, DOCK);
    expect(r.tick()).toEqual(['0: Contact, Dock!']);
    const s = rig();
    s.sees(1, 2, BAY);
    s.sees(1, 3, BAY);
    expect(s.tick()).toEqual(['1: Two, Bay!']);
  });

  it('calls a hit by the team with how many are left, then the last one; tagged in Extraction; nothing once the round is won', () => {
    const r = rig();
    expect(r.tick(r.hit(2, 0))).toEqual(['0: Last one!']);
    const s = rig({ chance: { lastOne: 0 } });
    // Three a side would say "Two left!": with two a side, the first hit leaves one (Last one, here never called).
    expect(s.tick(s.hit(2, 0))).toEqual([]);
    const x = rig({}, false);
    expect(x.tick(x.hit(2, 1))).toEqual(['1: Tagged!']);
    const w = rig();
    w.state.characters[3]!.status = 'out';
    expect(w.tick(w.hit(2, 0))).toEqual([]);
  });

  it('counts those left in words', () => {
    const r = rig();
    // A third on the other team: one hit leaves two.
    const c = createCharacter(4, vec3(YARD.x, 0, YARD.z), 0, LOADOUT, 1);
    r.state.characters.push(c);
    r.tick();
    expect(r.tick(r.hit(2, 0))).toEqual(['0: Two left!']);
  });

  it("has the hit called by the shooter, or the teammate nearest to a shooter who can't (the player)", () => {
    const r = rig();
    r.bots[0]!.character.position.x = 15; // far from where the hit comes from
    r.bots[1]!.character.position.x = -15;
    const player = createCharacter(5, vec3(-14, 0, 0), 0, LOADOUT, 0);
    r.state.characters.push(player);
    r.tick();
    expect(r.tick(r.hit(2, 5))).toEqual(['1: Last one!']);
  });

  it('calls a reload only with a threat seen or heard lately', () => {
    const r = rig();
    const reload: GameEvent = { type: 'reloadStart', characterId: 0, replicaId: 'aeg' };
    expect(r.tick(reload)).toEqual([]);
    r.bots[0]!.lastThreatAt = r.state.time;
    expect(r.tick(reload)).toEqual(['0: Reloading!']);
  });

  it('calls setting off after someone: a rusher pushes, a flank goes round, anyone else checks', () => {
    const r = rig();
    r.bots[0]!.lastKnown = vec3(BAY.x, 0, BAY.z);
    r.bots[0]!.mode = 'search';
    expect(r.tick()).toEqual(['0: Pushing Bay!']);
    const s = rig();
    s.bots[1]!.lastKnown = vec3(DOCK.x, 0, DOCK.z);
    s.bots[1]!.mode = 'search';
    s.bots[1]!.flanking = true;
    expect(s.tick()).toEqual(['1: Flanking Dock.']);
    const t = rig();
    t.bots[1]!.lastKnown = vec3(DOCK.x, 0, DOCK.z);
    t.bots[1]!.mode = 'search';
    expect(t.tick()).toEqual(['1: Checking Dock.']);
    // Still searching next tick: nothing new.
    expect(t.run(5)).toEqual([]);
  });

  it('calls a hold where it holds, once a round', () => {
    const r = rig();
    r.bots[1]!.character.position.x = BAY.x;
    r.bots[1]!.character.position.z = BAY.z;
    r.bots[1]!.atPost = true;
    expect(r.tick()).toEqual(['1: Holding Bay.']);
    r.bots[1]!.atPost = false;
    r.run(1);
    r.bots[1]!.atPost = true;
    expect(r.run(10)).toEqual([]);
    r.tick({ type: 'roundStart', round: 2 });
    r.bots[1]!.atPost = false;
    r.tick();
    r.bots[1]!.atPost = true;
    expect(r.tick()).toEqual(['1: Holding Bay.']);
  });

  it('calls a noise only while nobody on the team has anyone in sight', () => {
    const r = rig();
    const b = r.bots[0]!;
    b.hasLastKnown = true;
    b.lastKnown = vec3(DOCK.x, 0, DOCK.z);
    b.heardAt = r.state.time + DT;
    r.bots[1]!.targetVisible = true;
    expect(r.tick()).toEqual([]);
    r.bots[1]!.targetVisible = false;
    b.heardAt = r.state.time + DT;
    expect(r.tick()).toEqual(['0: Movement, Dock.']);
  });

  it('has the attackers call the flag going up, and the defenders call it too', () => {
    const r = rig();
    r.state.round.attackers = 1;
    expect(r.tick({ type: 'flagRope', position: vec3(BAY.x, 0, BAY.z), raising: true }).sort()).toEqual(['0: Flag!', '2: Raising!']);
  });

  it('says a personality\'s own lines as well as the Any ones, never another\'s', () => {
    const r = rig({ extra: '| Contact | Careful | Careful, {area}. |', pace: { bot: 0, team: 0, enemy: 0 } });
    const said = new Set<string>();
    for (let i = 0; i < 60; i++) {
      for (const b of [0, 1]) {
        r.loses(b, 2);
        r.tick();
        r.sees(b, 2, DOCK);
        said.add(r.tick()[0] ?? '');
      }
    }
    expect([...said].filter(Boolean).sort()).toEqual(['0: Contact, Dock!', '1: Careful, Dock.', '1: Contact, Dock!']);
  });

  it('never calls an event whose chance is 0, and Talks (×) raises a chance (a half, × 2, always)', () => {
    const r = rig({ chance: { contact: 0 } });
    r.sees(0, 2);
    expect(r.tick()).toEqual([]);
    const s = rig({ chance: { reloading: 0.5 }, talks: { rusher: 2 }, pace: { bot: 0, team: 0 } });
    s.bots[0]!.lastThreatAt = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 20; i++) expect(s.tick({ type: 'reloadStart', characterId: 0, replicaId: 'aeg' })).toEqual(['0: Reloading!']);
  });

  it('says nothing between rounds, and a hit player never talks', () => {
    const r = rig();
    r.state.round.phase = 'over';
    r.sees(0, 2);
    expect(r.tick()).toEqual([]);
    const s = rig();
    s.state.characters[0]!.status = 'calling';
    s.sees(0, 2);
    expect(s.tick()).toEqual([]);
  });
});

describe('CL1: the pace', () => {
  it('calls the same enemy again only after its gap, whoever sees them', () => {
    const r = rig({ pace: { bot: 0 } });
    r.sees(0, 2);
    expect(r.tick()).toEqual(['0: Contact, Dock!']);
    r.run(2);
    r.sees(1, 2);
    expect(r.tick()).toEqual([]);
    r.loses(0, 2);
    r.loses(1, 2);
    r.run(8);
    r.sees(0, 2);
    expect(r.tick()).toEqual(['0: Contact, Dock!']);
  });

  it('keeps one bot\'s calls apart, while a teammate may speak', () => {
    const r = rig();
    r.sees(0, 2);
    expect(r.tick()).toEqual(['0: Contact, Dock!']);
    r.run(2);
    r.sees(0, 3, BAY);
    expect(r.tick()).toEqual([]);
    r.loses(0, 3);
    r.sees(1, 3, BAY);
    expect(r.tick()).toEqual(['1: Contact, Bay!']);
  });

  it('says one call a team at a time: the more urgent first, the other after the team gap', () => {
    const r = rig({ pace: { team: 1.5, wait: 2 } });
    r.sees(1, 3, BAY);
    expect(r.tick(r.hit(2, 0))).toEqual(['0: Last one!']);
    const later = r.run(1.6);
    expect(later).toEqual(['1: Contact, Bay!']);
  });

  it('drops a call held back longer than its wait', () => {
    const r = rig({ pace: { team: 1.5, wait: 1 } });
    r.sees(1, 3, BAY);
    expect(r.tick(r.hit(2, 0))).toEqual(['0: Last one!']);
    expect(r.run(3)).toEqual([]);
  });

  it('drops a held call whose caller is hit before it is said', () => {
    const r = rig({ pace: { team: 1.5, wait: 2 } });
    r.sees(1, 3, BAY);
    expect(r.tick(r.hit(2, 0))).toEqual(['0: Last one!']);
    r.tick();
    r.state.characters[1]!.status = 'calling';
    expect(r.run(3)).toEqual([]);
  });

  it('drops a count still waiting once a newer hit puts it out of date', () => {
    const r = rig();
    r.sees(0, 2, DOCK);
    expect(r.tick()).toEqual(['0: Contact, Dock!']);
    expect(r.tick(r.hit(2, 1))).toEqual([]); // "Last one!" waits out the team gap...
    expect(r.tick(r.hit(3, 0))).toEqual([]); // ...and the round is won before it is said
    expect(r.run(3)).toEqual([]);
  });

  it('keeps each event its own team gap', () => {
    const r = rig({ gap: { reloading: 5 }, pace: { bot: 0, team: 0 } });
    r.bots[0]!.lastThreatAt = Number.POSITIVE_INFINITY;
    const reload: GameEvent = { type: 'reloadStart', characterId: 0, replicaId: 'aeg' };
    expect(r.tick(reload)).toEqual(['0: Reloading!']);
    r.run(4);
    expect(r.tick(reload)).toEqual([]);
    r.run(1.1);
    expect(r.tick(reload)).toEqual(['0: Reloading!']);
  });

  it('starts each round afresh: nothing waits, nothing was called', () => {
    const r = rig({ pace: { team: 1.5, wait: 2 } });
    r.sees(0, 2);
    expect(r.tick()).toEqual(['0: Contact, Dock!']);
    r.sees(1, 3, BAY);
    r.tick();
    expect(r.tick({ type: 'roundStart', round: 2 })).toEqual([]);
    r.loses(0, 2);
    r.loses(1, 3);
    r.run(0.5);
    r.sees(1, 2);
    expect(r.tick()).toEqual(['1: Contact, Dock!']);
  });
});

describe('CL1: callouts never change play', () => {
  it('reads the bots and the state and writes neither', () => {
    const r = rig();
    r.sees(0, 2);
    r.bots[1]!.mode = 'search';
    r.bots[1]!.lastKnown = vec3(BAY.x, 0, BAY.z);
    const before = JSON.stringify({ chars: r.state.characters, bots: r.bots.map((b) => ({ ...b, contacts: [...b.contacts], character: b.character.id })), round: r.state.round });
    r.director.observe(r.state, r.bots);
    const after = JSON.stringify({ chars: r.state.characters, bots: r.bots.map((b) => ({ ...b, contacts: [...b.contacts], character: b.character.id })), round: r.state.round });
    expect(after).toBe(before);
  });
});

describe('PG1: answering your ping', () => {
  /** Bots `who` of team 0 took a ping to `at` this tick (ai/pings.ts takePing), `going` ones setting off to look. */
  const pinged = (r: ReturnType<typeof rig>, who: number[], at = DOCK, going: number[] = []): void => {
    for (const i of who) {
      const b = r.bots[i]!;
      b.pingAt = r.state.time;
      b.pingSpot = vec3(at.x, 0, at.z);
      b.lastKnown = vec3(at.x, 0, at.z);
      b.hasLastKnown = true;
      b.mode = going.includes(i) ? 'search' : 'advance';
    }
  };

  it('has one teammate answer: one going to look first, nearest to the spot first; else the nearest watching', () => {
    const r = rig();
    r.bots[0]!.character.position.x = 8; // nearer the Dock, but not going
    pinged(r, [0, 1], DOCK, [1]);
    expect(r.tick()).toEqual(['1: Going to Dock.']);
    // One answer per ping, and its Checking is not called as well.
    expect(r.run(5)).toEqual([]);
    const s = rig();
    s.bots[1]!.character.position.x = 8;
    pinged(s, [0, 1], BAY);
    expect(s.tick()).toEqual(['1: Watching Bay.']);
    expect(s.run(5)).toEqual([]);
  });

  it('answers each new ping, whatever Talks (×) says, by a bot of the team that took it', () => {
    const r = rig({ talks: { rusher: 0.1, careful: 0.1 } });
    const said: string[] = [];
    for (let k = 0; k < 6; k++) {
      pinged(r, [0, 1], k % 2 ? DOCK : BAY);
      said.push(...r.run(2));
    }
    expect(said).toHaveLength(6);
    const t = rig();
    t.bots[2]!.pingAt = t.state.time;
    t.bots[2]!.pingSpot = vec3(DOCK.x, 0, DOCK.z);
    expect(t.tick()).toEqual(['2: Watching Dock.']);
  });

  it('comes after a hit\'s call, and before the rest', () => {
    const r = rig({ pace: { team: 1 } });
    pinged(r, [0, 1], DOCK);
    r.sees(0, 3, BAY);
    expect(r.tick(r.hit(2, 0))).toEqual(['0: Last one!']);
    const next = r.run(1.2);
    expect(next[0]).toMatch(/Watching Dock\.$/);
  });

  it('says nothing for a ping a hit teammate took, or between rounds', () => {
    const r = rig();
    pinged(r, [0]);
    r.state.characters[0]!.status = 'calling';
    expect(r.run(2)).toEqual([]);
    const s = rig();
    s.state.round.phase = 'over';
    pinged(s, [0, 1]);
    expect(s.run(2)).toEqual([]);
  });
});

describe('PG1: marking a sighting for your team', () => {
  const marks = (r: ReturnType<typeof rig>) => r.director.said.slice(0, r.director.saidCount).map((c) => c.markId);

  it('marks the enemy a Contact calls at the Marks chance, once in its gap, only while the caller still sees them', () => {
    const r = rig({ marks: { chance: 1, gap: 12 } });
    r.sees(0, 2, DOCK);
    expect(r.tick()).toEqual(['0: Contact, Dock!']);
    expect(marks(r)).toEqual([2]);
    r.run(5);
    r.sees(1, 3, BAY);
    expect(r.tick()).toEqual(['1: Contact, Bay!']);
    expect(marks(r)).toEqual([-1]); // within the team's gap
    const never = rig({ marks: { chance: 0 } });
    never.sees(0, 2, DOCK);
    never.tick();
    expect(marks(never)).toEqual([-1]);
  });

  it('never changes what is said', () => {
    const script = (chance: number) => {
      const r = rig({ marks: { chance, gap: 0 } });
      const out: string[] = [];
      for (let k = 0; k < 6; k++) {
        r.sees(k % 2, 2 + (k % 2), k % 3 ? DOCK : BAY);
        out.push(...r.run(3));
        r.loses(k % 2, 2 + (k % 2));
        out.push(...r.run(8));
      }
      return out;
    };
    expect(script(1)).toEqual(script(0));
    expect(script(0).length).toBeGreaterThan(3);
  });
});

describe('MG1: asking for a magazine, and answering', () => {
  it('a bot calls its ask, the one bringing it answers, and the catcher thanks them, each once', () => {
    const r = rig();
    const [asker, giver] = r.bots as [Bot, Bot];
    asker.magAskAt = r.state.time;
    asker.magFrom = giver.character;
    giver.magFor = asker.character;
    giver.magForAt = r.state.time;
    // The ask first (higher in When they call); the answer waits out the team's gap.
    expect(r.tick()).toEqual(['0: Need a mag!']);
    const later = r.run(1.6);
    expect(later).toEqual(['1: Mag coming!']);
    expect(r.run(6)).toEqual([]); // each once, though the ask and the job stand
    const caught: GameEvent = { type: 'magCaught', fromId: 1, toId: 0, bbs: 60, replicaId: 'aeg' };
    expect(r.tick(caught)).toEqual(['0: Thanks for the mag!']);
  });

  it("waits for the bot's own gap rather than dropping the ask, while it still asks", () => {
    const r = rig({ chance: { reloading: 1 } });
    const [asker, giver] = r.bots as [Bot, Bot];
    asker.lastThreatAt = r.state.time;
    expect(r.tick({ type: 'reloadStart', characterId: 0, replicaId: 'aeg' })).toEqual(['0: Reloading!']);
    asker.magAskAt = r.state.time;
    asker.magFrom = giver.character;
    const said = r.run(4.2);
    expect(said).toEqual(['0: Need a mag!']);
  });

  it('never thanks for a magazine that brought no BBs, nor from a bot out of play', () => {
    const r = rig();
    expect(r.tick({ type: 'magCaught', fromId: 1, toId: 0, bbs: 0, replicaId: 'aeg' })).toEqual([]);
    r.state.characters[0]!.status = 'calling';
    expect(r.tick({ type: 'magCaught', fromId: 1, toId: 0, bbs: 60, replicaId: 'aeg' })).toEqual([]);
  });

  it("asks and answers whatever a bot's Talks (×), which still scales the thanks", () => {
    const r = rig({ talks: { rusher: 0.01, careful: 0.01 }, chance: { magThanks: 1 } });
    const [asker, giver] = r.bots as [Bot, Bot];
    asker.magAskAt = r.state.time;
    asker.magFrom = giver.character;
    expect(r.tick()).toEqual(['0: Need a mag!']);
    r.run(5);
    const thanks = r.tick({ type: 'magCaught', fromId: 1, toId: 0, bbs: 60, replicaId: 'aeg' });
    expect(thanks).toEqual([]);
  });
});
