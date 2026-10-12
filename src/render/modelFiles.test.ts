import { describe, expect, it, vi } from 'vitest';
import type { FigureModel } from './externalModels';
import type { FigureRigs } from './figureRig';
import { ModelFiles } from './modelFiles';
import type { ReplicaFile, ReplicaFiles } from './replicaFiles';

const NONE = { gear: false, figures: false };
const GEAR = { gear: true, figures: false };
const BOTH = { gear: true, figures: true };

/** Loaders whose files arrive when the test says so; each load counts and every made file records its disposal. */
function rig() {
  const figDisposed = vi.fn();
  const fileDisposed = vi.fn();
  const figure = { dispose: figDisposed } as unknown as FigureModel;
  const files: ReplicaFiles = new Map([['aeg', { dispose: fileDisposed } as unknown as ReplicaFile]]);
  const figResolvers: (() => void)[] = [];
  const gearResolvers: (() => void)[] = [];
  const loadFigure = vi.fn(() => new Promise<FigureModel | null>((r) => figResolvers.push(() => r(figure))));
  const loadReplicas = vi.fn(() => new Promise<ReplicaFiles>((r) => gearResolvers.push(() => r(files))));
  // The rigged figures (BF1) land at once: the figure model's resolver paces the figure switch.
  const rigsDisposed = vi.fn();
  const rigs = { dispose: rigsDisposed } as unknown as FigureRigs;
  const loadRigs = vi.fn(() => Promise.resolve(rigs));
  return { models: new ModelFiles(loadFigure, loadReplicas, loadRigs), loadFigure, loadReplicas, loadRigs, rigs, rigsDisposed, figDisposed, fileDisposed, figure, files, figResolvers, gearResolvers };
}

describe('ModelFiles (RM4)', () => {
  it('loads nothing while both kinds are locked', async () => {
    const r = rig();
    expect(await r.models.use(NONE)).toBe(false);
    expect(r.loadFigure).not.toHaveBeenCalled();
    expect(r.loadReplicas).not.toHaveBeenCalled();
    expect(r.loadRigs).not.toHaveBeenCalled();
    expect(r.models.figureModel).toBeNull();
    expect(r.models.figureRigs).toBeNull();
    expect(r.models.replicaFiles.size).toBe(0);
  });

  it('loads each kind once however often it is asked, and reports whether what is drawn changed', async () => {
    const r = rig();
    const first = r.models.use(GEAR);
    const second = r.models.use({ ...GEAR });
    r.gearResolvers[0]!();
    // The first ask was overtaken by the second (same wish): only the latest applies.
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(r.loadReplicas).toHaveBeenCalledTimes(1);
    expect(r.loadFigure).not.toHaveBeenCalled();
    expect(r.models.replicaFiles).toBe(r.files);
    expect(r.models.figureModel).toBeNull();
    expect(r.models.figureRigs).toBeNull();
    expect(r.loadRigs).not.toHaveBeenCalled();
    expect(await r.models.use(GEAR)).toBe(false);

    const both = r.models.use(BOTH);
    r.figResolvers[0]!();
    expect(await both).toBe(true);
    expect(r.models.figureModel).toBe(r.figure);
    expect(r.models.figureRigs).toBe(r.rigs);
    expect(await r.models.use(GEAR)).toBe(true);
    expect(r.models.figureRigs).toBeNull();
    expect(await r.models.use(NONE)).toBe(true);
    expect(r.models.figureModel).toBeNull();
    expect(r.models.replicaFiles.size).toBe(0);
    // Back on: kept for the visit, no second fetch.
    expect(await r.models.use(BOTH)).toBe(true);
    expect(r.loadFigure).toHaveBeenCalledTimes(1);
    expect(r.loadReplicas).toHaveBeenCalledTimes(1);
    expect(r.loadRigs).toHaveBeenCalledTimes(1);
    expect(r.models.inUse).toEqual(BOTH);
  });

  it('ignores an earlier ask that lands after a later one', async () => {
    const r = rig();
    const early = r.models.use(GEAR); // still loading
    expect(await r.models.use(NONE)).toBe(false); // nothing to load, nothing changed from NONE
    r.gearResolvers[0]!();
    expect(await early).toBe(false);
    expect(r.models.inUse).toEqual(NONE);
    expect(r.models.replicaFiles.size).toBe(0);
  });

  it('frees loaded files on dispose, and a load landing after dispose is freed at once', async () => {
    const r = rig();
    const p = r.models.use(BOTH);
    r.gearResolvers[0]!();
    r.figResolvers[0]!();
    await p;
    r.models.dispose();
    expect(r.figDisposed).toHaveBeenCalledTimes(1);
    expect(r.fileDisposed).toHaveBeenCalledTimes(1);
    expect(r.rigsDisposed).toHaveBeenCalledTimes(1);
    expect(r.models.figureModel).toBeNull();
    expect(r.models.figureRigs).toBeNull();

    const late = rig();
    const pending = late.models.use(BOTH);
    late.models.dispose();
    late.gearResolvers[0]!();
    late.figResolvers[0]!();
    expect(await pending).toBe(false);
    expect(late.figDisposed).toHaveBeenCalledTimes(1);
    expect(late.fileDisposed).toHaveBeenCalledTimes(1);
    expect(late.rigsDisposed).toHaveBeenCalledTimes(1);
    expect(late.models.anyFigure).toBeNull();
  });
});
