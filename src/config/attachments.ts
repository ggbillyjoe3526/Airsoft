import type { ReplicaConfig } from './replicas';

/**
 * Attachments (M17b): the grip and magazine fitted to a replica on the Loadout screen. Each is a trade-off, never a
 * straight upgrade (ROADMAP M17): one hit is still one hit. Bots keep each replica's factory parts (no grip, the
 * standard magazine). The optics are in config/optics.ts. All numbers are first guesses for the owner's playtest;
 * how many magazines each carries is final-tuned in beta.
 */

export type GripId = 'none' | 'vertical' | 'angled';

export interface GripConfig {
  label: string;
  blurb: string;
  /**
   * Handling: multiplies the time to bring the replica up after switching to it and to raise a fitted optic to your
   * eye (below 1 is quicker).
   */
  handlingScale: number;
  /**
   * Steadiness: multiplies how long the shake of a sprint or a landing carries into your aim afterwards
   * (MOVEMENT.accuracy carryTime and settleTime; below 1 settles sooner).
   */
  shakeScale: number;
}

/** Small, opposite strengths: the vertical grip steadies, the angled grip handles quicker. */
export const GRIPS: Readonly<Record<GripId, GripConfig>> = {
  none: { label: 'No grip', blurb: 'Hand on the handguard, as it comes.', handlingScale: 1, shakeScale: 1 },
  vertical: {
    label: 'Vertical grip',
    blurb: 'Steadier: the shake of a sprint or a jump leaves your aim sooner. A little slower to bring up and to aim.',
    handlingScale: 1.15,
    shakeScale: 0.6,
  },
  angled: {
    label: 'Angled grip',
    blurb: 'Quicker: brings the rifle up and raises the sight faster. The shake of a sprint or a jump lasts a little longer.',
    handlingScale: 0.8,
    shakeScale: 1.3,
  },
};

export const GRIP_CHOICES: readonly { id: GripId; label: string; blurb: string }[] = (Object.keys(GRIPS) as GripId[]).map((id) => ({
  id,
  label: GRIPS[id].label,
  blurb: GRIPS[id].blurb,
}));

export type MagazineId = 'standard' | 'hiCap' | 'lowCap' | 'extended';

export interface MagazineConfig {
  label: string;
  blurb: string;
  /** BBs it holds, as a multiple of the replica's magSize (rounded). */
  capacity: number;
  /** Magazines carried, added to the replica's `mags` (at least one is always carried). */
  carried: number;
  /** Multiplies the reload time. */
  reloadScale: number;
  /** Multiplies the time to bring the replica up after a switch. */
  drawScale: number;
  /**
   * The BBs rattle in it as you move: walking and moving crouched are no longer silent to bots close by
   * (BOT_BEHAVIOUR.footstepHearingRattle), and you hear it too.
   */
  rattles: boolean;
}

export const MAGAZINES: Readonly<Record<MagazineId, MagazineConfig>> = {
  standard: { label: 'Standard', blurb: 'As it comes.', capacity: 1, carried: 0, reloadScale: 1, drawScale: 1, rattles: false },
  // Rifle: 120 BBs but two carried (the same 240), fewer reloads, and it gives you away when you sneak.
  hiCap: {
    label: 'Hi-cap',
    blurb: 'Twice the BBs in each, but only two carried, and the loose BBs rattle: bots close by hear you even walking.',
    capacity: 2,
    carried: -2,
    reloadScale: 1,
    drawScale: 1,
    rattles: true,
  },
  // Rifle: 30 BBs, one more carried (150 in all), and a quicker change.
  lowCap: {
    label: 'Low-cap',
    blurb: 'Half the BBs in each and one more carried: fewer BBs in all, but quicker to change. Silent.',
    capacity: 0.5,
    carried: 1,
    reloadScale: 0.8,
    drawScale: 1,
    rattles: false,
  },
  // Pistol: 27 BBs; the longer magazine snags as you draw.
  extended: {
    label: 'Extended',
    blurb: 'Half as many BBs again in each, but it sticks out of the grip: slower to draw.',
    capacity: 1.5,
    carried: 0,
    reloadScale: 1,
    drawScale: 1.35,
    rattles: false,
  },
};

/** The parts fitted to one replica. */
export interface ReplicaParts {
  grip: GripId;
  magazine: MagazineId;
}

/** How a replica comes: no grip, its first (standard) magazine. Bots always carry this. */
export function factoryParts(r: ReplicaConfig): ReplicaParts {
  return { grip: 'none', magazine: r.magazines[0]! };
}

/** `parts` as `r` can take them: a grip only on a replica with a grip mount, only magazines made for it. */
export function partsFor(r: ReplicaConfig, parts: Partial<ReplicaParts>): ReplicaParts {
  const factory = factoryParts(r);
  return {
    grip: r.gripMount && parts.grip && parts.grip in GRIPS ? parts.grip : factory.grip,
    magazine: parts.magazine && r.magazines.includes(parts.magazine) ? parts.magazine : factory.magazine,
  };
}

/** What a replica's parts make of it: the numbers the armament, HUD and viewmodel read instead of the replica's own. */
export interface Handling {
  magSize: number;
  /** Magazines carried, the loaded one included. */
  mags: number;
  reloadTime: number;
  drawTime: number;
  /** Multiplies AIMING.raiseTime (with the optic's own). */
  raiseScale: number;
  /** Multiplies how long a sprint's or landing's shake carries into the aim. */
  shakeScale: number;
  /** Its magazines rattle as you move (MagazineConfig.rattles). */
  rattles: boolean;
}

export function handlingOf(r: ReplicaConfig, parts: ReplicaParts): Handling {
  const grip = GRIPS[parts.grip];
  const mag = MAGAZINES[parts.magazine];
  return {
    magSize: Math.max(1, Math.round(r.magSize * mag.capacity)),
    mags: Math.max(1, r.mags + mag.carried),
    reloadTime: r.reloadTime * mag.reloadScale,
    drawTime: r.drawTime * mag.drawScale * grip.handlingScale,
    raiseScale: grip.handlingScale,
    shakeScale: grip.shakeScale,
    rattles: mag.rattles,
  };
}
