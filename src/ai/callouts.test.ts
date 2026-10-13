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
};

interface Setup {
  chance?: Partial<Record<CalloutEvent, number>>;
  gap?: Partial<Record<CalloutEvent, number>>;
  pace?: { bot?: number; team?: number; enemy?: number; wait?: number };
  talks?: { rusher?: number; careful?: number };
  extra?: string;
}

/** A callouts.md with every event (in the shipped order of urgency), always called unless `chance` says otherwise. */
function calloutsText(s: Setup = {}): string {
  const order: CalloutEvent[] = ['lastOne', 'down', 'tagged', 'flag', 'raising', 'contacts', 'contact', 'reloading', 'heard', 'pushing', 'flanking', 'checking', 'holding'];
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
