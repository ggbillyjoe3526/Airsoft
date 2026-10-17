import { type FigureModel, loadFigureModel } from './externalModels';
import type { FigureRigs } from './figureRig';
import { loadReplicaFiles, NO_REPLICA_FILES, type ReplicaFiles } from './replicaFiles';

/**
 * The game's model files: the Blender-made replicas and parts (M101, RM1), the rigged human and robot figures (BF1) and
 * a dropped-in figure model (M25a). Since 0.1 Beta 1 they are what the game draws (owner, 2026-10-16: "Blender models
 * default"; BD1): every one loads as the game starts, alongside the physics. The built-in models are drawn only where a
 * file is missing or can't be loaded (a dropped connection, a tab left open across a release): each loader warns and
 * resolves to nothing for it. Everything is freed with the renderer.
 */
export class ModelFiles {
  private loading: Promise<void> | null = null;
  private loadedFigure: FigureModel | null = null;
  private loadedRigs: FigureRigs | null = null;
  private loadedReplicas: ReplicaFiles = NO_REPLICA_FILES;
  private disposed = false;

  constructor(
    private readonly loadFigure: () => Promise<FigureModel | null> = () => loadFigureModel(),
    private readonly loadReplicas: () => Promise<ReplicaFiles> = () => loadReplicaFiles(),
    private readonly loadRigs: () => Promise<FigureRigs | null> = () =>
      import('./figureRig')
        .then((m) => m.loadFigureRigs())
        .catch((err: unknown) => {
          // A chunk that can't be fetched (a tab left open across a new release, a dropped connection): the built-in figures.
          console.warn('The rigged figures could not be loaded, so the built-in figures are drawn instead:', err);
          return null;
        }),
  ) {}

  /** The figure model the next match draws its players with, when there is one and no rigged figures; null otherwise. */
  get figureModel(): FigureModel | null {
    return this.loadedFigure;
  }

  /** The rigged figures (BF1) every match draws its players with; null only when they couldn't be loaded. */
  get figureRigs(): FigureRigs | null {
    return this.loadedRigs;
  }

  /** The replica models from files the viewmodel, figures and menu pictures draw from; none until they are loaded. */
  get replicaFiles(): ReplicaFiles {
    return this.loadedReplicas;
  }

  /** The figure model if it was loaded (the renderer moves its GPU data to a new context). */
  get anyFigure(): FigureModel | null {
    return this.loadedFigure;
  }

  /** Loads every file, once: the same promise however often it is asked. Never rejects (each loader falls back). */
  load(): Promise<void> {
    this.loading ??= Promise.all([
      this.loadFigure().then((m) => this.keepFigure(m)),
      this.loadRigs().then((r) => this.keepRigs(r)),
      this.loadReplicas().then((f) => this.keepReplicas(f)),
    ]).then(() => undefined);
    return this.loading;
  }

  dispose(): void {
    this.disposed = true;
    this.loadedFigure?.dispose();
    this.loadedFigure = null;
    this.loadedRigs?.dispose();
    this.loadedRigs = null;
    for (const file of this.loadedReplicas.values()) file.dispose();
    this.loadedReplicas = NO_REPLICA_FILES;
  }

  // A load that lands after dispose frees what it made at once.
  private keepFigure(model: FigureModel | null): void {
    if (this.disposed) model?.dispose();
    else this.loadedFigure = model;
  }

  private keepRigs(rigs: FigureRigs | null): void {
    if (this.disposed) rigs?.dispose();
    else this.loadedRigs = rigs;
  }

  private keepReplicas(files: ReplicaFiles): void {
    if (this.disposed) for (const file of files.values()) file.dispose();
    else this.loadedReplicas = files;
  }
}
