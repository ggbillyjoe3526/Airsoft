import { describe, expect, it, vi } from 'vitest';
import type { FigureModel } from './externalModels';
import type { FigureRigs } from './figureRig';
import { ModelFiles } from './modelFiles';
import type { ReplicaFile, ReplicaFiles } from '../replicas/replicaFiles';

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
  const rigsDisposed = vi.fn();
  const rigs = { dispose: rigsDisposed } as unknown as FigureRigs;
  const loadRigs = vi.fn(() => Promise.resolve(rigs));
  return { models: new ModelFiles(loadFigure, loadReplicas, loadRigs), loadFigure, loadReplicas, loadRigs, rigs, rigsDisposed, figDisposed, fileDisposed, figure, files, figResolvers, gearResolvers };
}

describe('ModelFiles (BD1: the Blender models by default)', () => {
  it('draws nothing from files until they are in, then every kind', async () => {
    const r = rig();
    const loading = r.models.load();
    expect(r.models.figureRigs).toBeNull();
    expect(r.models.replicaFiles.size).toBe(0);
    r.gearResolvers[0]!();
    r.figResolvers[0]!();
    await loading;
    expect(r.models.replicaFiles).toBe(r.files);
    expect(r.models.figureRigs).toBe(r.rigs);
    expect(r.models.figureModel).toBe(r.figure);
  });

  it('loads each file once however often it is asked', async () => {
    const r = rig();
    const first = r.models.load();
    const second = r.models.load();
    expect(second).toBe(first);
    r.gearResolvers[0]!();
    r.figResolvers[0]!();
    await Promise.all([first, second, r.models.load()]);
    expect(r.loadFigure).toHaveBeenCalledTimes(1);
    expect(r.loadReplicas).toHaveBeenCalledTimes(1);
    expect(r.loadRigs).toHaveBeenCalledTimes(1);
  });

  it('frees loaded files on dispose, and a load landing after dispose is freed at once', async () => {
    const r = rig();
    const p = r.models.load();
    r.gearResolvers[0]!();
    r.figResolvers[0]!();
    await p;
    r.models.dispose();
    expect(r.figDisposed).toHaveBeenCalledTimes(1);
    expect(r.fileDisposed).toHaveBeenCalledTimes(1);
    expect(r.rigsDisposed).toHaveBeenCalledTimes(1);
    expect(r.models.figureModel).toBeNull();
    expect(r.models.figureRigs).toBeNull();
    expect(r.models.replicaFiles.size).toBe(0);

    const late = rig();
    const pending = late.models.load();
    late.models.dispose();
    late.gearResolvers[0]!();
    late.figResolvers[0]!();
    await pending;
    expect(late.figDisposed).toHaveBeenCalledTimes(1);
    expect(late.fileDisposed).toHaveBeenCalledTimes(1);
    expect(late.rigsDisposed).toHaveBeenCalledTimes(1);
    expect(late.models.anyFigure).toBeNull();
    expect(late.models.replicaFiles.size).toBe(0);
  });
});

describe('ModelFiles when files fail (BD1, QA)', () => {
  it('keeps nothing and does not reject when every loader resolves to nothing', async () => {
    const m = new ModelFiles(
      () => Promise.resolve(null),
      () => Promise.resolve(new Map() as ReplicaFiles),
      () => Promise.resolve(null),
    );
    await expect(m.load()).resolves.toBeUndefined();
    expect(m.figureRigs).toBeNull();
    expect(m.figureModel).toBeNull();
    expect(m.replicaFiles.size).toBe(0);
  });

  it('keeps the files that did load when the rigs did not', async () => {
    const r = rig();
    const m = new ModelFiles(r.loadFigure, r.loadReplicas, () => Promise.resolve(null));
    const p = m.load();
    r.gearResolvers[0]!();
    r.figResolvers[0]!();
    await p;
    expect(m.figureRigs).toBeNull();
    expect(m.replicaFiles).toBe(r.files);
  });
});
