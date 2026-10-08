import { SQUAD_ORDERS, type SquadOrderKind } from '../config/squad';

/** Why no order is in force after one was given: see SquadOrderLine.ordered. */
export type OrderNotice = 'cancelled' | 'nobody' | 'notNow' | 'onPlan';

/** What the squad line says: a notice while one lasts, else the order in force ('' when there is nothing to say). */
export function squadLineText(order: SquadOrderKind | 'none', notice: string): string {
  if (notice) return notice;
  return order === 'none' ? '' : LINES[order];
}

const LINES: Readonly<Record<SquadOrderKind, string>> = {
  follow: `Squad · ${SQUAD_ORDERS.labels.follow}`,
  hold: `Squad · ${SQUAD_ORDERS.labels.hold}`,
  regroup: `Squad · ${SQUAD_ORDERS.labels.regroup}`,
};

/**
 * The squad line (M22): the order your bot teammates are carrying out, and for a moment after you give one that changes
 * nothing they do, why. Since G4 (owner, 2026-10-08) it is not on screen: the orders show only on the order wheel, and
 * this is a status region off the screen (`.sr-only`) that a screen reader reads out as the line changes (audit UI-15).
 * It stays in the page while you play, empty while they play the team plan, so each change is heard; it goes only while
 * a menu is up. The DOM is only touched on change.
 */
export class SquadOrderLine {
  private readonly root: HTMLDivElement;
  private notice = '';
  private noticeLeft = 0;
  private shown = '';
  private visible = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'squad-order sr-only';
    // Read out as an order is given or refused (audit UI-15); it changes only on those.
    this.root.setAttribute('role', 'status');
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  /**
   * You pressed an order key and `result` is now in force: an order that leaves none in force gets a notice saying why
   * (`why`: it cancelled the one in force, nobody was left to take it, orders wait for the next round, or the wheel's
   * Team plan was picked with none in force).
   */
  ordered(result: SquadOrderKind | 'none', why: OrderNotice): void {
    this.noticeLeft = result === 'none' ? SQUAD_ORDERS.noticeTime : 0;
    this.notice = SQUAD_ORDERS[why];
  }

  /** False while a menu is up. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
  }

  /** Once per frame, with the order in force. */
  update(order: SquadOrderKind | 'none', dt: number): void {
    this.noticeLeft = Math.max(0, this.noticeLeft - dt);
    const text = squadLineText(order, this.noticeLeft > 0 ? this.notice : '');
    if (text === this.shown) return;
    this.shown = text;
    this.root.textContent = text;
  }

  /** A new round: no order, no notice. */
  clear(): void {
    this.noticeLeft = 0;
    this.update('none', 0);
  }

  dispose(): void {
    this.root.remove();
  }
}
