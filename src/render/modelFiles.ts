import type { ModelFilesInUse } from '../config/dev';
import { type FigureModel, loadFigureModel } from './externalModels';
import type { FigureRigs } from './figureRig';
import { loadReplicaFiles, NO_REPLICA_FILES, type ReplicaFiles } from './replicaFiles';

/**
 * The game's model files (RM4; owner, 2026-10-11): the Blender-made replicas and parts (M101, RM1), the rigged human
 * and robot figures (BF1), the figure model (M25a) and which of them are drawn. Locked behind the Dev tab's "Disable figure models" and "Disable all models"
 * (config/dev.ts modelFilesInUse): with them on (the default) nothing is fetched and the built-in models are drawn.
 * A file is fetched the first time its switch lets it in and kept for the visit, so switching back and forth costs
 * nothing more; everything is freed with the renderer.
 */
export class ModelFiles {
  private figureLoad: Promise<FigureModel | null> | null = null;
  private rigLoad: Promise<FigureRigs | null> | null = null;
  private replicaLoad: Promise<ReplicaFiles> | null = null;
  private loadedFigure: FigureModel | null = null;
  private loadedRigs: FigureRigs | null = null;
  private loadedReplicas: ReplicaFiles = NO_REPLICA_FILES;
  /** The latest ask (use): an earlier one still loading applies nothing once it is in. */
  private asked: ModelFilesInUse = NONE;
  private shown: ModelFilesInUse = NONE;
  private disposed = false;

  constructor(
    private readonly loadFigure: () => Promise<FigureModel | null> = () => loadFigureModel(),
    private readonly loadReplicas: () => Promise<ReplicaFiles> = () => loadReplicaFiles(),
    private readonly loadRigs: () => Promise<FigureRigs | null> = () => import('./figureRig').then((m) => m.loadFigureRigs()),
  ) {}

  /** Which files are drawn now (the last `use` to finish loading). */
  get inUse(): ModelFilesInUse {
    return this.shown;
  }

  /** The figure model the next match draws its players with; null for the built-in figures. */
  get figureModel(): FigureModel | null {
    return this.shown.figures ? this.loadedFigure : null;
  }

  /**
   * The rigged figures (BF1) the next match draws its players with, ahead of the figure model; null for the others. They
   * come with the figure switch, and need the replica files (the gear switch, which the figure switch implies).
   */
  get figureRigs(): FigureRigs | null {
    return this.shown.figures && this.shown.gear ? this.loadedRigs : null;
  }

  /** The replica models from files the next viewmodel, figures and menu pictures draw from; none for the built-in ones. */
  get replicaFiles(): ReplicaFiles {
    return this.shown.gear ? this.loadedReplicas : NO_REPLICA_FILES;
  }

  /** The figure model if it was ever loaded, drawn or not (the renderer moves its GPU data to a new context). */
  get anyFigure(): FigureModel | null {
    return this.loadedFigure;
  }

  /**
   * Draws the files `want` lets in from now on, fetching any not loaded yet. Resolves true when what is drawn changed;
   * false when nothing did, or a later ask (or dispose) came while this one loaded.
   */
  async use(want: ModelFilesInUse): Promise<boolean> {
    this.asked = want;
    const loads: Promise<unknown>[] = [];
    if (want.figures && !this.figureLoad) loads.push((this.figureLoad = this.loadFigure().then((m) => this.keepFigure(m))));
    else if (want.figures) loads.push(this.figureLoad!);
    if (want.figures && !this.rigLoad) loads.push((this.rigLoad = this.loadRigs().then((r) => this.keepRigs(r))));
    else if (want.figures) loads.push(this.rigLoad!);
    if (want.gear && !this.replicaLoad) loads.push((this.replicaLoad = this.loadReplicas().then((f) => this.keepReplicas(f))));
    else if (want.gear) loads.push(this.replicaLoad!);
    await Promise.all(loads);
    if (this.disposed || this.asked !== want) return false;
    const changed = want.gear !== this.shown.gear || want.figures !== this.shown.figures;
    this.shown = want;
    return changed;
  }

  dispose(): void {
    this.disposed = true;
    this.shown = NONE;
    this.loadedFigure?.dispose();
    this.loadedFigure = null;
    this.loadedRigs?.dispose();
    this.loadedRigs = null;
    for (const file of this.loadedReplicas.values()) file.dispose();
    this.loadedReplicas = NO_REPLICA_FILES;
  }

  // A load that lands after dispose frees what it made at once.
  private keepFigure(model: FigureModel | null): FigureModel | null {
    if (this.disposed) model?.dispose();
    else this.loadedFigure = model;
    return model;
  }

  private keepRigs(rigs: FigureRigs | null): FigureRigs | null {
    if (this.disposed) rigs?.dispose();
    else this.loadedRigs = rigs;
    return rigs;
  }

  private keepReplicas(files: ReplicaFiles): ReplicaFiles {
    if (this.disposed) for (const file of files.values()) file.dispose();
    else this.loadedReplicas = files;
    return files;
  }
}

const NONE: ModelFilesInUse = { gear: false, figures: false };
