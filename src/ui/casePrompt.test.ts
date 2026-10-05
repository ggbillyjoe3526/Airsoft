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
    expect(bar().children[0]!.style.width).toBe('25%');
    prompt.update(runWith({ inReach: 1, opening: 1, openProgress: 3.5 }), 3);
    expect(text()).toBe("Opening the marshal's locker");
    expect(bar().children[0]!.style.width).toBe('50%');
    prompt.update(runWith({}), 4);
    expect(root.hidden).toBe(true);
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
