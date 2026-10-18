import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBot } from './ai/bot';
import { botConfig } from './config/bots';
import { DEV_ACTIONS, DEV_DEFAULTS } from './config/dev';
import { BODY } from './config/movement';
import { LIGHTING_PRESETS } from './config/render';
import { DEPOT } from './map/depot';
import { lightingChoices, lightingPicked, mapUnderLighting, mapUnderPreset, playsAtNight } from './map/lightingChoice';
import { NEON_HEIGHTS } from './map/neonHeights';
import { WOODLAND } from './map/woodland';
import { MemoryStorage } from './pool/testStorage';
import { SpectatorCamera } from './render/match/spectatorCamera';
import { SETTINGS_KEY } from './settings/storage';
import { createCharacter } from './sim/character';
import { vec3 } from './sim/vec';
import { botIntentText, botRoleText } from './ui/botIntentLabels';
import { devSettings } from './ui/devSettings';
import { FakeElement } from './ui/testSupport';

/**
 * M90: the Dev tab's playtesting aids that can be checked without a browser: the map under any time of day, the
 * spectator watching others while you are in play, the bots' intent wording and the tab's rows.
 */

describe('Time of day on any map (M90)', () => {
  it('puts a day-only map (Depot) under Night, and a night-only one (Woodland) under Day', () => {
    const depotNight = mapUnderPreset(DEPOT, 'night');
    expect(lightingPicked(depotNight)).toBe('night');
    expect(playsAtNight(depotNight)).toBe(true);
    expect(depotNight.night).toBe(LIGHTING_PRESETS.night.night);
    const woodsDay = mapUnderPreset(WOODLAND, 'day');
    expect(lightingPicked(woodsDay)).toBe('day');
    expect(playsAtNight(woodsDay)).toBe(false);
    // The map's own data stays as it is.
    expect(lightingChoices(DEPOT)).toEqual(['day']);
    expect(lightingChoices(WOODLAND)).toEqual(['night']);
  });

  it('is the map itself for its own only preset, and the Day / Night pick on a map that offers both', () => {
    expect(mapUnderPreset(DEPOT, 'day')).toBe(DEPOT);
    expect(mapUnderPreset(NEON_HEIGHTS, 'day')).toBe(mapUnderLighting(NEON_HEIGHTS, 'day'));
    expect(mapUnderPreset(NEON_HEIGHTS, 'night')).toBe(mapUnderLighting(NEON_HEIGHTS, 'night'));
  });

  it('gives the same object for the same map and preset, so a replay keeps the built meshes', () => {
    expect(mapUnderPreset(DEPOT, 'night')).toBe(mapUnderPreset(DEPOT, 'night'));
  });
});

describe('Spectate any bot (M90): the camera watches others while you are in play', () => {
  it('picks a teammate over yourself, and Next cycles everyone in play but you', () => {
    const self = createCharacter(0, vec3(0, 0, 0), 0, undefined, 0);
    const mate = createCharacter(1, vec3(2, 0, 0), 0, undefined, 0);
    const foe = createCharacter(2, vec3(9, 0, 0), 0, undefined, 1);
    const cam = new SpectatorCamera([self, mate, foe], self, BODY, { raycastStatic: () => -1 } as never);
    expect(cam.ensureTarget()).toBe(mate);
    cam.next();
    expect(cam.ensureTarget()).toBe(foe);
    cam.next();
    expect(cam.ensureTarget()).toBe(mate);
    // Nobody else in play: yourself, as before.
    mate.status = 'out';
    foe.status = 'out';
    cam.reset();
    expect(cam.ensureTarget()).toBe(self);
    cam.place(new THREE.PerspectiveCamera(), self, 1, 1 / 60);
  });
});

describe('Bot intentions (M90): what each label says', () => {
  const bot = () => createBot(createCharacter(3, vec3(0, 0, 0), 0, undefined, 1), 1, botConfig('normal'), botConfig('normal'));

  it('reads the brain mode, with finer words for advancing (holding, waiting, retaking, hunting)', () => {
    const b = bot();
    expect(botIntentText(b)).toBe('Advancing');
    b.holding = true;
    expect(botIntentText(b)).toBe('Holding');
    b.holding = false;
    b.hunting = true;
    expect(botIntentText(b)).toBe('Hunting');
    for (const [mode, text] of [['fight', 'Fighting'], ['cover', 'Taking cover'], ['search', 'Searching'], ['flag', 'Working the flag'], ['order', 'Following an order']] as const) {
      b.mode = mode;
      expect(botIntentText(b), mode).toBe(text);
    }
  });

  it("names Extraction's jobs, and nothing in the other modes", () => {
    const b = bot();
    expect(botRoleText(b)).toBe('');
    b.role = 'guard';
    expect(botRoleText(b)).toBe('Guard');
  });
});

/** The fake element with the simple lookups the rows make (a tag or a class). */
class Node extends FakeElement {
  dataset: Record<string, string> = {};
  private is(sel: string): boolean {
    return sel.startsWith('.') ? this.classList.contains(sel.slice(1)) : this.tag === sel;
  }
  querySelectorAll(sel: string): Node[] {
    return (this.children as Node[]).flatMap((c) => [...(c.is(sel) ? [c] : []), ...c.querySelectorAll(sel)]);
  }
  querySelector(sel: string): Node | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}
const all = (node: FakeElement, tag: string): FakeElement[] => node.children.flatMap((c) => [...(c.tag === tag ? [c] : []), ...all(c, tag)]);

describe('the Dev tab rows for M90', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', { setTimeout: () => 0 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('builds Time of day as a picker saving dev.timeOfDay, and a button per action that runs it (each Reset asks first)', () => {
    const changed: [string, unknown][] = [];
    const ran: string[] = [];
    const asked: string[] = [];
    const rows = devSettings({
      initial: { ...DEV_DEFAULTS },
      onChange: (id, v) => changed.push([id, v]),
      actions: (id) => (ran.push(id), 'Done'),
      ask: (title, _q, _yes, run) => (asked.push(title), run()),
    }) as unknown as FakeElement[];
    const buttons = rows.flatMap((r) => all(r, 'button'));
    buttons.find((b) => b.textContent === 'Night')!.click();
    expect(changed).toEqual([['timeOfDay', 'night']]);
    expect((JSON.parse(localStorage.getItem(SETTINGS_KEY)!) as Record<string, unknown>)['dev.timeOfDay']).toBe('night');
    for (const a of DEV_ACTIONS) buttons.find((b) => b.textContent === a.button)!.click();
    expect(ran).toEqual(['giveXp', 'levelUp', 'resetLevel', 'endRound', 'resetSave']);
    expect(asked).toEqual(['Reset your level?', 'Reset the save?']);
  });

  it('never resets without a pop-up to ask with', () => {
    const ran: string[] = [];
    const rows = devSettings({ initial: { ...DEV_DEFAULTS }, onChange: () => {}, actions: (id) => (ran.push(id), 'Done') }) as unknown as FakeElement[];
    const buttons = rows.flatMap((r) => all(r, 'button'));
    buttons.find((b) => b.textContent === 'Reset save')!.click();
    buttons.find((b) => b.textContent === 'Reset level')!.click();
    expect(ran).toEqual([]);
  });
});
