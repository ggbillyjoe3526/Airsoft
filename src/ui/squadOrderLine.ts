import { SQUAD_ORDERS, type SquadOrderKind } from '../config/squad';
import { teamCss } from '../config/teams';

/** Why no order is in force after one was given: see SquadOrderLine.ordered. */
export type OrderNotice = 'cancelled' | 'nobody' | 'notNow' | 'onPlan';

/** What the squad line says: a notice while one lasts, else the order in force ('' hides the line). */
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
 * The HUD's squad line (M22), bottom left: the order your bot teammates are carrying out, and for a moment after you
 * give one that changes nothing they do, why. Hidden while they play the team plan. The DOM is only touched on change.
 */
export class SquadOrderLine {
  private readonly root: HTMLDivElement;
  private notice = '';
  private noticeLeft = 0;
  private shown = '';
  private visible = false;

  /** `team`: yours, whose colour marks the line. */
  constructor(parent: HTMLElement, team: number) {
    this.root = document.createElement('div');
    this.root.className = 'squad-order';
    this.root.style.setProperty('--team', teamCss(team));
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
    this.visible = visible;
    this.root.hidden = !visible || this.shown === '';
  }

  /** Once per frame, with the order in force. */
  update(order: SquadOrderKind | 'none', dt: number): void {
    this.noticeLeft = Math.max(0, this.noticeLeft - dt);
    const text = squadLineText(order, this.noticeLeft > 0 ? this.notice : '');
    if (text === this.shown) return;
    this.shown = text;
    this.root.textContent = text;
    this.root.hidden = !this.visible || text === '';
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
