import { describe, expect, it } from 'vitest';
import { QUALITY, type QualityChoice, resolveQuality } from '../config/render';
import { type CaseFind, createRunState, type RunCase, type RunExit, type RunState } from '../sim/extraction';
import { qualityLine, runReportLine } from './reportFields';

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
const find: CaseFind = { fc: 10, resupply: false, item: null };
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
