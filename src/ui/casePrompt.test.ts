import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS, REBINDABLE } from '../config/controls';
import { HUD } from '../config/render';
import { GAME_POOL } from '../pool/gamePool';
import { type CaseFind, createRunState, type RunCase, type RunState } from '../sim/extraction';
import { vec3 } from '../sim/vec';
import { FakeElement, fakeDocument } from './testSupport';
import { CasePrompt, DROPPED_LINE, foundLine, itemName, openingLine, promptLine } from './casePrompt';
import { carriedNote, haulWhat } from './runStatus';

const grip = GAME_POOL.assets.find((a) => a.category === 'grip')!;
const part: CaseFind = { fc: 120, resupply: false, item: { asset: grip.id, tier: 'epic' } };

describe("Extraction's case prompt (M44)", () => {
  it('says which key opens the case beside you, and what is being opened', () => {
    expect(promptLine({ name: 'Field case', dropped: false }, 'G')).toBe('Hold G to open the field case');
    expect(promptLine({ name: "Marshal's locker", dropped: false }, 'G')).toBe("Hold G to open the marshal's locker");
    expect(promptLine({ name: 'Dropped case', dropped: true }, 'H')).toBe('Hold H to pick up what you dropped');
    expect(openingLine({ name: 'Ammo can', dropped: false })).toBe('Opening the ammo can');
    expect(openingLine({ name: 'Dropped case', dropped: true })).toBe('Picking up what you dropped');
  });

  it('says what a case held: its part by tier and name, its FC, a resupply', () => {
    expect(itemName(GAME_POOL, part.item!)).toBe(`Epic ${grip.name}`);
    expect(foundLine({ dropped: false, finds: [part] })).toBe(`Epic ${grip.name} · +120 FC`);
    expect(foundLine({ dropped: false, finds: [{ fc: 0, resupply: true, item: null }] })).toBe('BB resupply · magazines topped up');
    expect(foundLine({ dropped: true, finds: [part, { fc: 30, resupply: false, item: null }] })).toBe('Picked up 150 FC and 1 part');
    expect(DROPPED_LINE).toMatch(/go back for it/);
  });

  it('shows what you carry beside the respawn note, and nothing when your hands are empty', () => {
    expect(carriedNote([])).toBe('');
    expect(carriedNote([part, { fc: 25, resupply: false, item: null }])).toBe('Carrying 145 FC and 1 part');
    expect(haulWhat({ fc: 0, items: [1, 2] })).toBe('2 parts');
    expect(haulWhat({ fc: 1600, items: [] })).toBe('1,600 FC');
  });

  it('opens cases on a key of its own, G by default, rebindable on Key Bindings', () => {
    expect(DEFAULT_BINDINGS.use).toEqual(['KeyG']);
    expect(REBINDABLE.some((r) => r.action === 'use')).toBe(true);
    const taken = Object.entries(DEFAULT_BINDINGS).filter(([a, keys]) => a !== 'use' && (keys as readonly string[]).includes('KeyG'));
    expect(taken).toEqual([]);
  });
});

describe('the case prompt on screen (M44)', () => {
  const field: RunCase = { kind: 'field-case', name: 'Field case', position: vec3(), yaw: 0, openTime: 4, heard: 14, finds: [part], open: false, dropped: false };
  const locker: RunCase = { ...field, kind: 'locker', name: "Marshal's locker", openTime: 7 };
  const runWith = (over: Partial<RunState>): RunState => ({ ...createRunState(), cases: [field, locker], ...over });
  let key = 'G';
  let prompt: CasePrompt;
  let root: FakeElement;
  const text = (): string => root.children[0]!.textContent;
  const bar = (): FakeElement => root.children[1]!;

  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    key = 'G';
    const parent = new FakeElement('div');
    prompt = new CasePrompt(parent as unknown as HTMLElement, () => key);
    root = parent.children[0]!;
    prompt.setVisible(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is hidden with no case in reach, asks for the Use key beside a shut one, and shows a bar while it is held', () => {
    prompt.update(runWith({}), 0);
    expect(root.hidden).toBe(true);
    prompt.update(runWith({ inReach: 0 }), 1);
    expect(root.hidden).toBe(false);
    expect(text()).toBe('Hold G to open the field case');
    expect(bar().hidden).toBe(true);
    prompt.update(runWith({ inReach: 0, opening: 0, openProgress: 1 }), 2);
    expect(text()).toBe('Opening the field case');
    expect(bar().hidden).toBe(false);
    // One transition for the rest of the opening: full in the 3 s left of the field case's 4.
    expect(bar().children[0]!.style.transitionDuration).toBe('3s');
    expect(bar().children[0]!.style.transform).toBe('scaleX(1)');
    prompt.update(runWith({ inReach: 1, opening: 1, openProgress: 3.5 }), 3);
    expect(text()).toBe("Opening the marshal's locker");
    expect(bar().children[0]!.style.transitionDuration).toBe('3.5s'); // another case: the bar runs again from where it is
    prompt.update(runWith({}), 4);
    expect(root.hidden).toBe(true);
  });

  it('writes the bar once or twice for a whole opening, not once per percent (audit UI-11)', () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const fill = bar().children[0]!;
    let writes = 0;
    fill.style = new Proxy({} as Record<string, string>, {
      set(target, property: string, value: string) {
        writes++;
        target[property] = value;
        return true;
      },
    });
    for (let tick = 0; tick <= 240; tick++) {
      clock = (tick / 60) * 1000;
      prompt.update(runWith({ inReach: 0, opening: 0, openProgress: tick / 60 }), tick / 60);
    }
    expect(writes).toBeLessThanOrEqual(4);
    expect(fill.style.transitionDuration).toBe('4s');
    prompt.update(runWith({}), 5);
    expect(fill.style.transform).toBe('scaleX(0)'); // let go: the bar is rewound for the next try
    vi.restoreAllMocks();
  });

  it('says what a case held for a moment, then goes back to the prompt or away; and the drop note the same way', () => {
    prompt.opened({ ...field, open: true }, 10);
    prompt.update(runWith({}), 10.1);
    expect(root.hidden).toBe(false);
    expect(text()).toBe(`Epic ${grip.name} · +120 FC`);
    prompt.update(runWith({ inReach: 1 }), 10 + HUD.caseFoundTime - 0.1);
    expect(text()).toContain('Epic');
    prompt.update(runWith({ inReach: 1 }), 10 + HUD.caseFoundTime + 0.1);
    expect(text()).toBe("Hold G to open the marshal's locker");
    prompt.dropped(20);
    prompt.update(runWith({}), 20.5);
    expect(text()).toBe(DROPPED_LINE);
    prompt.update(runWith({}), 20 + HUD.caseDroppedTime + 0.1);
    expect(root.hidden).toBe(true);
  });

  it('follows a rebound Use key the next time it shows, and hides under a menu', () => {
    prompt.update(runWith({ inReach: 0 }), 0);
    expect(text()).toBe('Hold G to open the field case');
    key = 'V';
    prompt.setVisible(false);
    expect(root.hidden).toBe(true);
    prompt.setVisible(true);
    prompt.update(runWith({ inReach: 0 }), 1);
    expect(text()).toBe('Hold V to open the field case');
  });

  it('names a dropped case as what you dropped', () => {
    const dropped: RunCase = { ...field, kind: 'dropped', name: 'Dropped case', dropped: true, openTime: 0 };
    prompt.update(runWith({ cases: [dropped], inReach: 0 }), 0);
    expect(text()).toBe('Hold G to pick up what you dropped');
  });
});

describe('the case-opening bar when the opening stops, resumes, is paused or runs calm (QA, M64 UI-11)', () => {
  // The sim restarts an opening from nothing when the Use key is let go or the runner steps out of reach (stopOpening in
  // sim/extraction.ts), so the bar must too.
  const field: RunCase = { kind: 'field-case', name: 'Field case', position: vec3(), yaw: 0, openTime: 4, heard: 14, finds: [part], open: false, dropped: false };
  const runWith = (over: Partial<RunState>): RunState => ({ ...createRunState(), cases: [field], ...over });
  let prompt: CasePrompt;
  let root: FakeElement;
  let fill: FakeElement;
  let log: string[];
  let clock = 0;
  let reduced = false;
  /** One frame of an opening at `progress` s; the clock (ms) follows it unless `at` says otherwise. */
  const opening = (progress: number, time = progress, at = progress * 1000): void => {
    clock = at;
    prompt.update(runWith({ inReach: 0, opening: 0, openProgress: progress }), time);
  };

  beforeEach(() => {
    clock = 0;
    reduced = false;
    log = [];
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('getComputedStyle', () => {
      log.push('flush');
      return { transitionProperty: reduced ? 'none' : 'transform' };
    });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const parent = new FakeElement('div');
    prompt = new CasePrompt(parent as unknown as HTMLElement, () => 'G');
    root = parent.children[0]!;
    fill = root.children[1]!.children[0]!;
    fill.style = new Proxy({} as Record<string, string>, {
      set(target, property: string, value: string) {
        log.push(`${property}=${value}`);
        target[property] = value;
        return true;
      },
    });
    prompt.setVisible(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rewinds when the key is let go half way and restarts from the sim\'s new progress when it is held again', () => {
    for (let tick = 0; tick <= 120; tick++) opening(tick / 60); // 2 s of the 4
    log.length = 0;
    prompt.update(runWith({ inReach: 0 }), 2.1); // let go, still beside the case
    expect(root.children[1]!.hidden).toBe(true);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)']);
    log.length = 0;
    opening(1 / 60, 2.5, 3000); // held again: the sim began over, and so does the bar
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${1 / 60 / 4})`, 'flush', `transitionDuration=${4 - 1 / 60}s`, 'transform=scaleX(1)']);
    expect(root.children[1]!.hidden).toBe(false);
  });

  it('rewinds when the runner walks out of reach, and when the case finishes opening', () => {
    for (let tick = 0; tick <= 60; tick++) opening(tick / 60);
    log.length = 0;
    prompt.update(runWith({}), 1.1); // out of reach: nothing in reach, nothing opening
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)']);
    expect(root.hidden).toBe(true);
    for (let tick = 0; tick <= 239; tick++) opening(tick / 60);
    log.length = 0;
    prompt.update(runWith({ cases: [{ ...field, open: true }] }), 4); // opened: the sim's opening has ended
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)']);
  });

  it('starts a second opening, straight after the first with no frame between them, from the sim\'s progress', () => {
    for (let tick = 0; tick <= 200; tick++) opening(tick / 60); // 3.3 s in
    log.length = 0;
    opening(0.05, 3.4, 200 * (1000 / 60) + 16); // let go and held again between two frames: the progress is back at the start
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${0.05 / 4})`, 'flush', `transitionDuration=${4 - 0.05}s`, 'transform=scaleX(1)']);
  });

  it('runs again from the sim\'s progress when the match was paused mid-opening (the prompt hidden under the menu)', () => {
    for (let tick = 0; tick <= 60; tick++) opening(tick / 60);
    prompt.setVisible(false);
    log.length = 0;
    prompt.setVisible(true);
    // Twenty seconds in the menu; the first frame back whose whole percent has moved (it moves every 40 ms of a 4 s opening).
    opening(1.05, 1.1, 21_000);
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${1.05 / 4})`, 'flush', `transitionDuration=${4 - 1.05}s`, 'transform=scaleX(1)']);
  });

  it('steps the bar per percent and starts no transition under Reduced motion', () => {
    reduced = true;
    for (let tick = 0; tick <= 240; tick++) opening(tick / 60);
    expect(log.some((entry) => entry.startsWith('transitionDuration=') && entry !== 'transitionDuration=0s')).toBe(false);
    const steps = log.filter((entry) => entry.startsWith('transform=')).length;
    expect(steps).toBeGreaterThan(50);
    expect(steps).toBeLessThanOrEqual(102);
    expect(fill.style.transform).toBe('scaleX(1)');
  });
});
