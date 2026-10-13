import { describe, expect, it } from 'vitest';
import { QUALITY, type QualityChoice, resolveQuality } from '../config/render';
import { type CaseFind, createRunState, type RunCase, type RunExit, type RunState } from '../sim/extraction';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { clockText, framesLine, type LoadedFile, loadLine, memoryLine, playerLine, qualityLine, runReportLine } from './reportFields';

describe('qualityLine (the debug overlay and the crash report, audit CORE-02)', () => {
  it('gives the choice, the render scale, the shadow map and the textures of a preset', () => {
    expect(qualityLine('high', false, QUALITY.high)).toBe('high · scale 1 · shadow map 2048 · textures 1024');
    expect(qualityLine('medium', false, QUALITY.medium)).toBe('medium · scale 1 · shadow map 1024 · textures 512');
  });

  it('marks a choice the game made itself', () => {
    expect(qualityLine('low', true, QUALITY.low)).toContain('low (auto) ·');
    expect(qualityLine('low', false, QUALITY.low)).not.toContain('(auto)');
  });

  it('says the shadow map is off when shadows are, whatever its size', () => {
    expect(qualityLine('low', true, QUALITY.low)).toBe('low (auto) · scale 0.8 · shadow map off · textures 256');
    const custom = resolveQuality('custom', { shadows: false, shadowMapSize: 2048 });
    expect(qualityLine('custom', false, custom)).toContain('shadow map off');
  });

  it('is a line of text for every choice, never an object', () => {
    for (const choice of ['low', 'medium', 'high', 'custom'] as QualityChoice[]) {
      for (const auto of [false, true]) {
        const line = qualityLine(choice, auto, resolveQuality(choice, {}));
        expect(typeof line).toBe('string');
        expect(line).not.toContain('[object');
        expect(line).toMatch(/^(low|medium|high|custom)( \(auto\))? · scale [\d.]+ · shadow map (\d+|off) · textures \d+$/);
      }
    }
  });
});

const exit = (name: string, over: Partial<RunExit> = {}): RunExit => ({ name, position: { x: 0, y: 0, z: 0 }, radius: 2, late: false, closed: false, open: true, ...over });
const find: CaseFind = { xp: 10, resupply: false };
const aCase = (over: Partial<RunCase> = {}): RunCase => ({
  kind: 'locker',
  name: 'Locker',
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
  openTime: 2,
  heard: 5,
  finds: [find],
  open: false,
  dropped: false,
  ...over,
});
const run = (over: Partial<RunState> = {}): RunState => ({ ...createRunState(), ...over });

describe('runReportLine (an Extraction run in a crash report, audit CORE-02)', () => {
  it('reads a fresh run as running with nothing open, opened, carried or released', () => {
    expect(runReportLine(createRunState())).toBe('running, exits open 0/0, cases opened 0/0, carrying 0, waves 0');
  });

  it('counts the exits that open this run: a closed one is not counted, a late one is once it is open', () => {
    const exits = [exit('East gate'), exit('North gate', { closed: true, open: false }), exit('Dock', { late: true, open: false })];
    expect(runReportLine(run({ exits }))).toContain('exits open 1/2,');
    expect(runReportLine(run({ exits }))).not.toContain('late open');
    const later = [exit('East gate'), exit('North gate', { closed: true, open: false }), exit('Dock', { late: true, open: true })];
    expect(runReportLine(run({ exits: later, lateOpened: true }))).toContain('exits open 2/2 (late open),');
  });

  it('counts the cases placed, open or shut, and leaves a dropped one out', () => {
    const cases = [aCase({ open: true }), aCase(), aCase({ open: true, dropped: true }), aCase({ dropped: true })];
    expect(runReportLine(run({ cases }))).toContain('cases opened 1/2,');
  });

  it('gives the carried finds, the waves and the outcome once it is not "none"', () => {
    expect(runReportLine(run({ carried: [find, find, find], waves: 4 }))).toContain('carrying 3, waves 4');
    expect(runReportLine(run({ outcome: 'extracted' }))).toMatch(/^extracted, /);
    expect(runReportLine(run({ outcome: 'time' }))).toMatch(/^time, /);
    expect(runReportLine(run({ outcome: 'out' }))).toMatch(/^out, /);
  });

  it('is one line with every part, for a run filled in', () => {
    const state = run({
      exits: [exit('East gate'), exit('North gate', { closed: true, open: false }), exit('Dock', { late: true, open: true })],
      lateOpened: true,
      cases: [aCase({ open: true }), aCase(), aCase({ dropped: true, open: true })],
      carried: [find, find],
      waves: 2,
      outcome: 'extracted',
    });
    expect(runReportLine(state)).toBe('extracted, exits open 2/2 (late open), cases opened 1/2, carrying 2, waves 2');
  });
});

describe('the report lines added for bug reports (IM7)', () => {
  it('playerLine: where the player stands and looks, what they are doing and what they hold', () => {
    const p = createCharacter(0, vec3(1.234, 0, -5.5), -Math.PI / 2, LOADOUT);
    p.pitch = -0.1;
    p.sprinting = true;
    expect(playerLine(p)).toBe(`at 1.23, 0.00, -5.50 · looking 270° yaw, -6° pitch · alive, standing, sprinting · ${LOADOUT[0]!.id} ${p.armament.ammo[0]!.mag} in the magazine, ${p.armament.ammo[0]!.pouch.length} spare`);
    p.sprinting = false;
    p.crouchAmount = 1;
    p.aiming = true;
    p.armament.reload = 0.5;
    p.status = 'calling';
    expect(playerLine(p)).toContain('· calling, crouched, aiming, reloading ·');
  });

  it('clockText: minutes and seconds, hours past an hour', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(222.9)).toBe('3:42');
    expect(clockText(3725)).toBe('1:02:05');
  });

  it('framesLine: the window, the frames, average (as fps too), worst and hitches, and the sim and draw costs', () => {
    expect(framesLine({ seconds: 10, frames: 1200, avgMs: 8.33, worstMs: 41.25, hitches: 2 }, 1.234, 4.5)).toBe(
      'last 10 s of play: 1200 frames, avg 8.3 ms (120 fps), worst 41.3 ms, 2 over 50 ms · sim 1.23 ms, draw 4.50 ms a frame',
    );
    expect(framesLine({ seconds: 0, frames: 0, avgMs: 0, worstMs: 0, hitches: 0 }, 0, 0)).toBe('no frames in play yet');
  });

  it("memoryLine: the JS heap where the browser gives it, and what the renderer holds", () => {
    const held = { textures: 12, geometries: 340, programs: 25 };
    expect(memoryLine({ usedJSHeapSize: 123_400_000, jsHeapSizeLimit: 4_294_000_000 }, held)).toBe('JS heap 123 MB of 4294 MB · 12 textures, 340 geometries, 25 shader programs');
    expect(memoryLine(undefined, held)).toContain('JS heap not given by this browser');
  });

  it('loadLine: when the page and the game were ready, the main file, and per kind what came cached or fresh', () => {
    const file = (name: string, transferSize: number, encodedBodySize: number, responseEnd: number): LoadedFile => ({ name, transferSize, encodedBodySize, responseEnd });
    const main = 'https://x.test/assets/index-abc.js';
    const files = [
      file(main, 0, 340_000, 400),
      file('https://x.test/assets/rapier-def.js', 1_500_300, 1_500_000, 900),
      file('https://x.test/models/aeg.glb', 0, 200_000, 1200),
      file('https://x.test/models/gbb.glb', 300, 150_000, 1300), // revalidated: headers only
      file('https://x.test/models/robot.glb', 120_400, 120_000, 2500),
      file('https://x.test/sounds/x.ogg', 10_000, 9_000, 100),
    ];
    expect(loadLine(files, main, 1500, 4200)).toBe(
      'page 1.5 s, game 4.2 s · main file cached · code: 2 files, 1 cached, 1 fresh (1500 kB), last at 0.9 s · models: 3 files, 2 cached, 1 fresh (120 kB), last at 2.5 s · pictures: none',
    );
    expect(loadLine([file(main, 340_300, 340_000, 400)], main, 0, 0)).toContain('page -, game - · main file fresh (340 kB)');
  });
});
