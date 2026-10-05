import { HUD } from '../config/render';
import { GAME_POOL } from '../pool/gamePool';
import type { Pool } from '../pool/pool';
import { type CaseFind, type FoundItem, haulTotals, type RunCase, type RunState } from '../sim/extraction';
import { haulWhat } from './runStatus';
import { TimedFill } from './timedFill';

/** "Rare Red Dot", from the pool (the asset id if the pool doesn't have it). */
export function itemName(pool: Pool, item: FoundItem): string {
  const tier = pool.tiers.find((t) => t.id === item.tier)?.label ?? item.tier;
  return `${tier} ${pool.byId.get(item.asset)?.name ?? item.asset}`;
}

/** The case's name in a sentence: "the field case", "the marshal's locker". */
function theCase(k: Pick<RunCase, 'name' | 'dropped'>): string {
  return k.dropped ? 'what you dropped' : `the ${k.name.charAt(0).toLowerCase()}${k.name.slice(1)}`;
}

/** The line under the crosshair by a shut case (M44): "Hold G to open the field case". */
export function promptLine(k: Pick<RunCase, 'name' | 'dropped'>, key: string): string {
  return k.dropped ? `Hold ${key} to pick up what you dropped` : `Hold ${key} to open ${theCase(k)}`;
}

/** The line while the Use key is held: "Opening the field case". */
export function openingLine(k: Pick<RunCase, 'name' | 'dropped'>): string {
  return k.dropped ? 'Picking up what you dropped' : `Opening ${theCase(k)}`;
}

/**
 * What an opened case held, for a moment (M44): "+35 FC", "BB resupply · magazines topped up", "Rare Red Dot · +120 FC";
 * for what you dropped, "Picked up 85 FC and 1 part".
 */
export function foundLine(k: Pick<RunCase, 'dropped' | 'finds'>, pool: Pool = GAME_POOL): string {
  if (k.dropped) return `Picked up ${haulWhat(haulTotals(k.finds)) || 'nothing'}`;
  const parts: string[] = [];
  for (const f of k.finds as readonly CaseFind[]) {
    if (f.item) parts.push(itemName(pool, f.item));
    if (f.fc > 0) parts.push(`+${f.fc} FC`);
    if (f.resupply) parts.push('BB resupply · magazines topped up');
  }
  return parts.length > 0 ? parts.join(' · ') : 'Empty';
}

/** Said when you were hit carrying finds: they stay where you fell. */
export const DROPPED_LINE = 'You dropped what you carried where you were hit · go back for it';

/** What the prompt shows: nothing, a moment's line, a case being opened (with its bar), or a case you could open. */
const enum Showing {
  None,
  Line,
  Opening,
  Prompt,
}

/**
 * Extraction's case prompt under the crosshair (M44): "Hold G to open the field case" beside a shut case, then
 * "Opening the field case" with a bar while the Use key is held, then what it held for a moment, and the note when a
 * hit drops what you carry. Touches the page only when what it shows changes (the bar runs on one CSS transition, ui/timedFill.ts).
 */
export class CasePrompt {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private readonly bar: HTMLDivElement;
  private readonly fill: TimedFill;
  private line = '';
  private lineUntil = Number.NEGATIVE_INFINITY;
  private visible = false;
  /** The Use key's name is read again the next time the prompt shows (it may have been rebound while paused). */
  private keyStale = true;
  private key = '';
  private shown = { showing: Showing.None, index: -1, percent: -1, key: '', line: '' };

  constructor(
    parent: HTMLElement,
    /** The Use key's name now (it can be rebound on the pause menu). */
    private readonly useKey: () => string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'case-prompt';
    this.root.setAttribute('role', 'status');
    this.text = document.createElement('span');
    this.bar = document.createElement('div');
    this.bar.className = 'case-prompt-bar';
    const fill = document.createElement('div');
    fill.className = 'case-prompt-fill';
    this.fill = new TimedFill(fill);
    this.bar.append(fill);
    this.root.append(this.text, this.bar);
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  /** A case was opened (`time`: the sim's): what it held, for a moment. */
  opened(k: RunCase, time: number): void {
    this.say(foundLine(k), time + HUD.caseFoundTime);
  }

  /** You were hit carrying finds. */
  dropped(time: number): void {
    this.say(DROPPED_LINE, time + HUD.caseDroppedTime);
  }

  /** False while a menu is up. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.keyStale = true;
    // Hidden, the bar's transition was cut short at its end: the next frame sets it going again from the game's progress.
    if (visible) this.shown.percent = -1;
    this.root.hidden = !visible || this.shown.showing === Showing.None;
  }

  /** Once per frame, with the run and the sim's time. */
  update(run: RunState, time: number): void {
    const opening = run.opening >= 0 ? run.cases[run.opening] : undefined;
    const near = run.inReach >= 0 ? run.cases[run.inReach] : undefined;
    const showing = opening ? Showing.Opening : time < this.lineUntil ? Showing.Line : near ? Showing.Prompt : Showing.None;
    const index = opening ? run.opening : near ? run.inReach : -1;
    const percent = opening ? Math.min(100, Math.floor((run.openProgress / Math.max(1e-6, opening.openTime)) * 100)) : -1;
    const s = this.shown;
    // The key's name is looked up only when the prompt comes up, not every frame.
    if (showing === Showing.Prompt && (s.showing !== showing || s.index !== index || this.keyStale)) {
      this.keyStale = false;
      s.key = '';
      this.key = this.useKey();
    }
    const key = showing === Showing.Prompt ? this.key : '';
    if (s.showing === showing && s.index === index && s.percent === percent && s.key === key && s.line === this.line) return;
    if (s.showing !== showing || s.index !== index || s.key !== key || s.line !== this.line) {
      this.text.textContent = opening ? openingLine(opening) : showing === Showing.Line ? this.line : near ? promptLine(near, key) : '';
      this.bar.hidden = showing !== Showing.Opening;
      this.root.hidden = !this.visible || showing === Showing.None;
    }
    // One transition for the whole opening (M64, audit UI-11); the bar is hidden between openings, so it is rewound there.
    if (opening) this.fill.follow(run.openProgress / Math.max(1e-6, opening.openTime), opening.openTime - run.openProgress);
    else if (s.percent >= 0) this.fill.hold(0);
    s.showing = showing;
    s.index = index;
    s.percent = percent;
    s.key = key;
    s.line = this.line;
  }

  dispose(): void {
    this.root.remove();
  }

  private say(line: string, until: number): void {
    this.line = line;
    this.lineUntil = until;
  }
}
