import { describe, expect, it } from 'vitest';
import { READ_TIME, TUTORIAL, TUTORIAL_STEPS, tutorialSteps } from '../config/tutorial';
import { BALLISTICS } from '../config/ballistics';
import { AEG, LOADOUT } from '../config/replicas';
import { ORDER_WHEEL } from '../config/squad';
import { type BB, createBBPool, spawnBB } from '../sim/ballistics';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { hopUpReach } from '../sim/hopUp';
import { createRangeTargets } from '../sim/rangeTargets';
import { vec3 } from '../sim/vec';
import { keySegments, TutorialTracker } from './tutorial';

const DT = 1 / 60;

function setup(canAim = true) {
  const player = createCharacter(0, vec3(0, 0, 2), 0, LOADOUT, 0);
  const targets = createRangeTargets();
  const t = new TutorialTracker(TUTORIAL_STEPS, canAim);
  const tick = (events: GameEvent[] = []) => t.observe({ dt: DT, player, events, targets });
  /** Ticks until the step shown changes to the next one. */
  const finishStep = () => {
    for (let i = 0; i < (TUTORIAL.doneTime + 0.1) / DT; i++) tick();
  };
  return { player, targets, t, tick, finishStep };
}

const hit = (targetId: number, shooterId = 0): GameEvent => ({ type: 'targetHit', targetId, kind: 'steel', shooterId, position: vec3(), ricochet: false });

describe('the tutorial (M16)', () => {
  it('walks through every step in order, each finished by doing what it asks', () => {
    const { player, targets, t, tick, finishStep } = setup();
    const ids: string[] = [];
    const expectStep = (id: string) => {
      expect(t.step?.id).toBe(id);
      ids.push(id);
    };

    expectStep('look');
    tick();
    for (let i = 0; i < 20; i++) {
      player.yaw += 0.1;
      tick();
    }
    expect(t.showingDone).toBe(true);
    finishStep();

    expectStep('walk');
    tick();
    expect(t.showingDone).toBe(false);
    player.position.z = 0.2;
    tick();
    finishStep();

    expectStep('steel');
    const figure = targets.find((x) => x.kind === 'figure' && x.distance === 10)!;
    const steel = targets.find((x) => x.kind === 'steel')!;
    tick([hit(figure.id)]); // not steel
    tick([hit(steel.id, 5)]); // not yours
    expect(t.showingDone).toBe(false);
    tick([hit(steel.id)]);
    finishStep();

    expectStep('far');
    tick([hit(figure.id)]); // only 10 m
    tick([hit(targets.find((x) => x.kind === 'figure' && x.distance === 40)!.id)]); // inside the stock hop-up's reach
    expect(t.showingDone).toBe(false);
    tick([hit(targets.find((x) => x.kind === 'figure' && x.distance === 50)!.id)]);
    finishStep();

    expectStep('reload');
    tick([{ type: 'reloadEnd', characterId: 0, replicaId: 'aeg' }]);
    finishStep();

    expectStep('selector');
    tick([{ type: 'fireMode', characterId: 3, replicaId: 'aeg', mode: 'semi' }]); // not yours
    expect(t.showingDone).toBe(false);
    tick([{ type: 'fireMode', characterId: 0, replicaId: 'aeg', mode: 'semi' }]);
    finishStep();

    expectStep('aim');
    player.aiming = true;
    for (let i = 0; i < 1.1 / DT; i++) tick();
    player.aiming = false;
    finishStep();

    expectStep('crouch');
    player.crouchAmount = 1;
    tick();
    finishStep();
    player.crouchAmount = 0;

    expectStep('lean');
    player.lean = -0.5; // not far enough out
    tick();
    player.lean = -1;
    tick();
    player.lean = 0;
    tick();
    expect(t.showingDone).toBe(false); // left only: the right is still to do
    player.lean = 0.9;
    tick();
    expect(t.showingDone).toBe(true);
    player.lean = 0;
    finishStep();

    expectStep('sprint');
    const fired: GameEvent = { type: 'shot', characterId: 0, replicaId: 'aeg', position: vec3() };
    tick([fired]); // no sprint yet
    player.sprinting = true;
    tick();
    player.sprinting = false;
    for (let i = 0; i < 1.6 / DT; i++) tick();
    tick([fired]); // too long after the sprint
    expect(t.showingDone).toBe(false);
    player.sprinting = true;
    tick();
    player.sprinting = false;
    for (let i = 0; i < 0.3 / DT; i++) tick();
    tick([fired]);
    expect(t.showingDone).toBe(true);
    finishStep();

    expectStep('vault');
    tick([{ type: 'footstep', characterId: 0, kind: 'land' }]); // a jump's landing is no vault
    tick([{ type: 'footstep', characterId: 3, kind: 'vault' }]); // not yours
    expect(t.showingDone).toBe(false);
    tick([{ type: 'footstep', characterId: 0, kind: 'vault' }]);
    expect(t.showingDone).toBe(true);
    finishStep();

    expectStep('secondary');
    const shot: GameEvent = { type: 'shot', characterId: 0, replicaId: 'x', position: vec3() };
    tick([shot, hit(steel.id)]); // still on the first replica
    player.armament.active = 1;
    tick([hit(steel.id)]); // switched, but that BB came from the first one
    expect(t.showingDone).toBe(false);
    tick([shot]);
    player.armament.active = 0; // switched back while the second replica's BB flies
    tick([hit(steel.id)]);
    finishStep();

    /** A step that is read: done after its seconds, not before. */
    const readStep = (id: string) => {
      expectStep(id);
      const goal = t.step!.goal;
      if (goal.kind !== 'read') throw new Error(`${id} is read`);
      for (let i = 0; i < (goal.seconds - 0.3) / DT; i++) tick();
      expect(t.showingDone).toBe(false);
      for (let i = 0; i < 0.4 / DT && !t.showingDone; i++) tick();
      expect(t.showingDone).toBe(true);
      finishStep();
    };
    readStep('hits');
    readStep('scoreboard');
    readStep('orderWheel');
    readStep('match');
    expect(t.finished).toBe(true);
    expect(t.step).toBeNull();
    expect(ids).toEqual(TUTORIAL_STEPS.map((s) => s.id));
  });

  it('keeps checking the next step while the last one shows its tick, so nothing done then is lost', () => {
    const { player, t, tick, finishStep } = setup();
    for (let i = 0; i < 20; i++) {
      player.yaw += 0.1;
      tick();
    }
    expect(t.showingDone).toBe(true);
    expect(t.step?.id).toBe('look');
    player.position.z = 0; // at the line straight away
    tick();
    expect(t.step?.id).toBe('walk'); // its tick shows now
    expect(t.showingDone).toBe(true);
    finishStep();
    expect(t.step?.id).toBe('steel');
    expect(t.goalIndex).toBe(2);
  });

  it('points the player to the optics on the Loadout from the aiming step, which every replica plays (BP5)', () => {
    const aim = TUTORIAL_STEPS.find((s) => s.id === 'aim')!;
    expect(aim.text).toContain('Fit a red dot or scope on the Loadout (Esc, then Loadout).');
    // Still no longer than the longest card the coach already shows.
    expect(aim.text.length).toBeLessThanOrEqual(Math.max(...TUTORIAL_STEPS.filter((s) => s.id !== 'aim').map((s) => s.text.length)));
  });

  it('swaps aiming down the sight for how to fit an optic when the replica has none, and can start part way', () => {
    const ids = new TutorialTracker(TUTORIAL_STEPS, false).steps.map((s) => s.id);
    expect(ids).not.toContain('aim');
    expect(ids.indexOf('optics')).toBe(TUTORIAL_STEPS.findIndex((s) => s.id === 'aim'));
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 4);
    expect(t.step?.id).toBe(TUTORIAL_STEPS[4]!.id);
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 99).finished).toBe(true);
  });

  it('counts turning the view across the wrap from +π to -π as a small turn', () => {
    const { player, t, tick } = setup();
    player.yaw = Math.PI - 0.01;
    tick();
    player.yaw = -Math.PI + 0.01;
    tick();
    expect(t.showingDone).toBe(false);
  });

  it('jumps to a step part done for the smoke test (debug hook, audit L-09)', () => {
    const { t, tick } = setup();
    const last = t.steps.length - 1;
    const goal = t.steps[last]!.goal;
    if (goal.kind !== 'read') throw new Error('the last step is read to its end');
    t.debugJumpTo(last, goal.seconds - 1.5 * DT); // two ticks from its end
    expect(t.stepIndex).toBe(last);
    expect(t.finished).toBe(false);
    expect(tick()).toBe(true); // the jump is reported, so the coach redraws the step
    tick();
    expect(t.goalIndex).toBe(t.steps.length);
    for (let i = 0; i < (TUTORIAL.doneTime + 0.1) / DT; i++) tick();
    expect(t.finished).toBe(true);
  });

  it('shows the keys a step names as the player has them bound', () => {
    const names: Record<string, string> = { fire: 'Left mouse', reload: 'R' };
    expect(keySegments('Press {fire}, then {reload}.', (a) => names[a] ?? '')).toEqual([
      { text: 'Press ', key: false },
      { text: 'Left mouse', key: true },
      { text: ', then ', key: false },
      { text: 'R', key: true },
      { text: '.', key: false },
    ]);
    expect(keySegments('{jump}', () => '')).toEqual([{ text: '(unbound)', key: true }]);
  });

  it("gives the stock rifle's hop-up reach as the game works it out, short of the far step's figure (audit L-35)", () => {
    const far = TUTORIAL_STEPS.find((x) => x.id === 'far')!;
    const reach = hopUpReach(AEG, AEG.hopUpDial, BALLISTICS).onTargetTo;
    // A retune of the ballistics or the hop-up that moves the reach has to update the text.
    expect(far.text).toContain(`flying flat to about ${Math.round(reach)} m`);
    // The step asks for a hit beyond it, so it teaches aiming high or turning the hop-up up.
    if (far.goal.kind !== 'hit') throw new Error('the far step asks for a hit');
    expect(far.goal.minDistance).toBeGreaterThan(reach);
  });

  it('opens the scoreboard and the order wheel on the steps that teach them, each naming its key (M80)', () => {
    const shows = TUTORIAL_STEPS.filter((s) => s.shows).map((s) => [s.id, s.shows]);
    expect(shows).toEqual([
      ['scoreboard', 'scoreboard'],
      ['orderWheel', 'orderWheel'],
    ]);
    expect(TUTORIAL_STEPS.find((s) => s.id === 'scoreboard')!.text).toContain('hold {scoreboard}');
    expect(TUTORIAL_STEPS.find((s) => s.id === 'orderWheel')!.text).toContain('hold {orderWheel}');
  });

  it('keeps every card short, and every read card lasts 10 s (TT1, owner note 2: less wordy; TT2: read cards 10 s)', () => {
    const words = (text = '') => text.split(/\s+/).filter(Boolean).length;
    for (const s of TUTORIAL_STEPS.flatMap((x) => (x.withoutOptic ? [x, x.withoutOptic] : [x]))) {
      expect(words(s.text), s.id).toBeLessThanOrEqual(25);
      expect(words(s.countHidden), s.id).toBeLessThanOrEqual(25);
      expect(words(s.levelling), s.id).toBeLessThanOrEqual(10);
      if (s.goal.kind === 'read') expect(s.goal.seconds, s.id).toBe(10);
    }
    expect(READ_TIME).toBe(10);
  });

  it('teaches peeking with both lean keys, in the movement part after crouching (TT2, owner 2026-10-17)', () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(ids.indexOf('lean')).toBe(ids.indexOf('crouch') + 1);
    const lean = TUTORIAL_STEPS.find((s) => s.id === 'lean')!;
    expect(lean.text).toContain('{leanLeft}');
    expect(lean.text).toContain('{leanRight}');
    // Leaning is peeking with Q and E, never resting on cover (owner note 30, MV1).
    expect(lean.text).not.toMatch(/\brest/i);
  });

  it('ticks the lean step only once both sides are leaned, in either order, and starts afresh after a skip', () => {
    const { player, t, tick } = setup();
    const at = t.steps.findIndex((s) => s.id === 'lean');
    t.debugJumpTo(at);
    player.lean = 1;
    tick();
    player.lean = 0;
    tick();
    expect(t.showingDone).toBe(false);
    // Jumping back to the step forgets the right lean already done.
    t.debugJumpTo(at);
    player.lean = -1;
    tick();
    expect(t.showingDone).toBe(false);
    player.lean = 1;
    tick();
    expect(t.showingDone).toBe(true);
  });

  it("names no order the wheel doesn't have: the card shows the wheel itself (TT1)", () => {
    const text = TUTORIAL_STEPS.find((s) => s.id === 'orderWheel')!.text;
    const named = ORDER_WHEEL.items.map((i) => i.label).filter((l) => text.includes(l));
    expect(named).toEqual([]);
  });

  it("fills the coach's bar as a read card reads, and has none on a step that asks for something (TT1)", () => {
    const { t, tick } = setup();
    expect(t.readProgress).toBe(-1); // looking around
    const hits = t.steps.findIndex((s) => s.id === 'hits');
    const goal = t.steps[hits]!.goal;
    if (goal.kind !== 'read') throw new Error('hits is read');
    t.debugJumpTo(hits);
    tick();
    expect(t.readProgress).toBeGreaterThan(0);
    for (let i = 0; i < goal.seconds / 2 / DT; i++) tick();
    expect(t.readProgress).toBeCloseTo(0.5, 1);
    for (let i = 0; i < goal.seconds / DT && !t.showingDone; i++) tick();
    expect(t.showingDone).toBe(true);
    expect(t.readProgress).toBe(-1); // the tick shows, then the next card
  });

  it('names keys only through the bindings, never a key itself (M80: a rebound key reads right)', () => {
    for (const s of TUTORIAL_STEPS.flatMap((x) => (x.withoutOptic ? [x, x.withoutOptic] : [x]))) {
      // Esc can't be rebound (it pauses), so it's the one key named outright.
      expect(s.text.replace(/\{\w+\}/g, ''), s.id).not.toMatch(/\b(Tab|Shift|Ctrl|Alt|Space|Enter|WASD|[Ll]eft mouse|[Rr]ight mouse|hold [A-Z])\b/);
    }
  });

  it('gives every step a heading and enough to read (M80: plain but complete)', () => {
    for (const s of TUTORIAL_STEPS.flatMap((x) => (x.withoutOptic ? [x, x.withoutOptic] : [x]))) {
      expect(s.title.length, s.id).toBeGreaterThan(0);
      // A sentence that says how, not only a name.
      expect(s.text.split(/[.!?:;]\s/).length, s.id).toBeGreaterThanOrEqual(2);
      // A read step gives time for its words: at least a second per 4 words, about half a slow reader's pace.
      if (s.goal.kind === 'read') expect(s.goal.seconds, s.id).toBeGreaterThanOrEqual(s.text.split(/\s+/).length / 4);
    }
  });

  it('names only real key bindings in its text', async () => {
    const { DEFAULT_BINDINGS } = await import('../config/controls');
    for (const s of TUTORIAL_STEPS.flatMap((x) => (x.withoutOptic ? [x, x.withoutOptic] : [x]))) {
      for (const m of s.text.matchAll(/\{(\w+)\}/g)) expect(Object.keys(DEFAULT_BINDINGS), s.id).toContain(m[1]);
    }
  });
});

describe('skipping and resuming the tutorial (audit POOL-14, POOL-16)', () => {
  it('skips the step under way straight to the next, and past the last ends it', () => {
    const t = new TutorialTracker(TUTORIAL_STEPS, true);
    t.skip();
    expect(t.step?.id).toBe('walk');
    expect(t.showingDone).toBe(false);
    expect(t.goalIndex).toBe(1);
    for (let i = 1; i < TUTORIAL_STEPS.length; i++) t.skip();
    expect(t.finished).toBe(true);
    t.skip();
    expect(t.goalIndex).toBe(TUTORIAL_STEPS.length);
  });

  it('resumes at a saved step by its id, whatever steps a later build adds before it', () => {
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 'far');
    expect(t.step?.id).toBe('far');
    expect(t.goalId).toBe('far');
    // A build with a new first step still resumes at the same lesson.
    const added = [{ ...TUTORIAL_STEPS[0]!, id: 'newFirst' }, ...TUTORIAL_STEPS];
    expect(new TutorialTracker(added, true, 'far').step?.id).toBe('far');
    // The aiming step keeps its listed id when played as "fit an optic".
    const noOptic = new TutorialTracker(TUTORIAL_STEPS, false, 'aim');
    expect([noOptic.step?.id, noOptic.goalId]).toEqual(['optics', 'aim']);
    // An id no longer listed starts from the beginning; an old saved index still works; done reads ''.
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 'gone').goalIndex).toBe(0);
    // A save made on the lean step before TT1 removed it resumes there again (TT2), and one made on a step after it in
    // a TT1 build still finds its lesson by id.
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 'lean').step?.id).toBe('lean');
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 'sprint').step?.id).toBe('sprint');
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 3).step?.id).toBe(TUTORIAL_STEPS[3]!.id);
    expect(new TutorialTracker(TUTORIAL_STEPS, true, TUTORIAL_STEPS.length).goalId).toBe('');
  });

  it("doesn't skip the next step, unseen, when Skip is pressed while a finished step still shows its tick", () => {
    const { player, t, tick } = setup();
    for (let i = 0; i < 20; i++) {
      player.yaw += 0.1;
      tick();
    }
    expect([t.step?.id, t.showingDone]).toEqual(['look', true]);
    t.skip();
    expect([t.step?.id, t.showingDone]).toEqual(['walk', false]);
    t.skip();
    expect(t.step?.id).toBe('steel');
  });

  it('leaves out the switch-replica step for a player carrying one replica', () => {
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 0, 1).steps.map((s) => s.id)).not.toContain('secondary');
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 0, 2).steps.map((s) => s.id)).toContain('secondary');
  });
});

describe('the switch-replica step tells BBs apart by the replica that fired them (KI1)', () => {
  it("doesn't count the first replica's BB landing after the switch, and counts the second's", () => {
    const player = createCharacter(0, vec3(0, 0, 2), 0, LOADOUT, 0);
    const targets = createRangeTargets();
    const steel = targets.find((x) => x.kind === 'steel')!;
    const pool = createBBPool(8);
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 'secondary');
    expect(t.step?.id).toBe('secondary');
    const tick = (events: GameEvent[] = []) => t.observe({ dt: DT, player, events, targets, bbs: pool.bbs });
    const shot: GameEvent = { type: 'shot', characterId: 0, replicaId: 'x', position: vec3() };
    const fire = () => {
      const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 90, 0, 0.0002);
      tick([shot]);
      return bb;
    };
    /** `bb` stops on the steel plate at `z`, as the simulation leaves a BB that hit a target. */
    const lands = (bb: BB, z: number) => {
      bb.active = false;
      bb.position.x = 0;
      bb.position.y = 1;
      bb.position.z = z;
      tick([{ type: 'targetHit', targetId: steel.id, kind: 'steel', shooterId: 0, position: vec3(0, 1, z), ricochet: false }]);
    };
    player.armament.active = 0;
    const first = fire();
    player.armament.active = 1;
    const second = fire();
    lands(first, -20); // still in flight from the first replica when the second fired
    expect(t.showingDone).toBe(false);
    player.armament.active = 0; // switched back while the second replica's BB flies: it still counts
    lands(second, -20.5);
    expect(t.showingDone).toBe(true);
  });
});

describe('M83, LV1: the tutorial names levelling only while it is on', () => {
  it('drops every levelling line with Disable levelling on and keeps the steps otherwise the same', () => {
    const off = tutorialSteps(false);
    const on = tutorialSteps(true);
    expect(off.map((s) => s.id)).toEqual(TUTORIAL_STEPS.map((s) => s.id));
    expect(off.some((s) => /Armory|XP|level/.test(s.text))).toBe(false);
    expect(on.some((s) => /Armory/.test(s.text))).toBe(true);
    const match = on.find((s) => s.id === 'match')!;
    expect(match.text).toContain('Matches give XP');
    expect(match.text.endsWith('the Armory shows what comes next.')).toBe(true);
    // The gacha's words are gone from every step, on or off (LV1).
    expect(on.some((s) => /Field Credits|Tokens|\bFC\b/.test(s.text))).toBe(false);
  });
});
