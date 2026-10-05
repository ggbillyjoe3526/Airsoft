import type { HitFacts } from '../sim/hitFacts';

/**
 * The "what got you" card (M41; Settings → HUD → What got you): after a hit, a small panel says where the shot came
 * from, whether that bot was holding the angle when it first saw you, how long you were in its view and whether you
 * were moving, in plain words. Every out teaches something: a hard game feels fair when you can see why you lost.
 * The facts are recorded at hit time (sim/hitFacts.ts); this only words and shows them.
 */

const EIGHTH = Math.PI / 4;

/** Where a shot came from, in words, for a bearing `rel` radians off straight ahead (positive: to your right). */
const BEARINGS = ['ahead', 'ahead right', 'your right', 'behind right', 'behind', 'behind left', 'your left', 'ahead left'] as const;

/** `rel` (radians, -π to π, 0 straight ahead, positive to the right) as "ahead", "your left", "behind right" and so on. */
export function describeBearing(rel: number): string {
  const sector = Math.round(rel / EIGHTH);
  return BEARINGS[((sector % 8) + 8) % 8]!;
}

export interface WhatGotYouText {
  /** "Orange 2 · from your left · 14 m". */
  where: string;
  /** What the card knows about how it happened, one short sentence each (none when all it can say is where). */
  notes: string[];
}

/**
 * The card's words for `facts`: `shooter` is the hit feed's name for who fired ("Orange 2"), `viewYaw` the yaw you were
 * looking along when it hit (the direction the BB came from is worked out against it). Only where it came from for
 * friendly fire; a ricochet says so, since where it came from is then not where it was fired.
 */
export function whatGotYouText(facts: HitFacts, shooter: string, viewYaw: number): WhatGotYouText {
  const rel = wrap(viewYaw - facts.yaw);
  const where = `${shooter} · from ${describeBearing(rel)} · ${Math.max(1, Math.round(facts.distance))} m`;
  if (facts.ricochet) return { where, notes: ['It bounced off something first.'] };
  if (facts.friendly) return { where: `${where} · friendly fire`, notes: [] };
  const notes: string[] = [];
  if (facts.held !== null) notes.push(facts.held ? `${shooter} was holding that angle.` : `${shooter} was not holding an angle.`);
  const stance = facts.moving ? 'on the move' : 'standing still';
  if (facts.inView !== null) notes.push(`You were in view ${facts.inView.toFixed(1)} s, ${stance}.`);
  else if (facts.held !== null) notes.push(`You were ${stance}.`);
  return { where, notes };
}

function wrap(a: number): number {
  const t = Math.PI * 2;
  return a - t * Math.round(a / t);
}

/** The panel over the game view: shown from when you walk off until the next round (or your respawn) clears it. */
export class WhatGotYouCard {
  private readonly root: HTMLDivElement;
  private readonly where: HTMLDivElement;
  private readonly notes: HTMLDivElement;
  private has = false;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'what-got-you';
    this.root.hidden = true;
    this.root.innerHTML = '<div class="what-got-you-title">What got you</div><div class="what-got-you-where"></div><div class="what-got-you-notes"></div>';
    this.where = this.root.querySelector('.what-got-you-where') as HTMLDivElement;
    this.notes = this.root.querySelector('.what-got-you-notes') as HTMLDivElement;
    parent.appendChild(this.root);
  }

  /** The words of the last hit; shown by `setShown`. */
  set(text: WhatGotYouText): void {
    this.has = true;
    this.where.textContent = text.where;
    this.notes.replaceChildren(
      ...text.notes.map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
    );
    this.apply();
  }

  /** The card's words are old: a new round or a respawn. */
  clear(): void {
    this.has = false;
    this.apply();
  }

  /** Whether it may show now (you are out and watching, the board is not over it). */
  setShown(shown: boolean): void {
    this.visible = shown;
    this.apply();
  }

  private apply(): void {
    const hidden = !(this.has && this.visible);
    if (this.root.hidden !== hidden) this.root.hidden = hidden;
  }

  dispose(): void {
    this.root.remove();
  }
}
