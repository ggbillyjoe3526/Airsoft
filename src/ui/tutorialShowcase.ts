import { BOT_PERSONALITIES } from '../config/botPersonalities';
import type { BotsFile } from '../config/botsFile';
import type { Action } from '../config/controls';
import { ORDER_WHEEL, type WheelSelect } from '../config/squad';
import { TEAMS } from '../config/teams';
import { TUTORIAL, type TutorialShowcase as ShowcaseKind } from '../config/tutorial';
import { MatchBoard } from './matchBoard';
import { OrderWheel, wheelHint } from './orderWheel';
import { formatAccuracy, formatTime, type TeamBlock } from './statsRows';

/**
 * The sample's `k`th bot as a match names it (BN1): a roster name from `file`, the personalities taken in turn so each
 * team is a mix, with its personality's tag; the team's name and number when the roster has none.
 */
export function sampleBot(k: number, team: number, n: number, file: BotsFile = BOT_PERSONALITIES): { name: string; tag: string } {
  const kinds = [...file.styles.keys()].filter((p) => file.roster.some((e) => e.personality === p));
  if (kinds.length === 0) return { name: `${TEAMS[team]!.name} ${n}`, tag: '' };
  const kind = kinds[k % kinds.length]!;
  const names = file.roster.filter((e) => e.personality === kind);
  const entry = names[Math.floor(k / kinds.length) % names.length]!;
  return { name: entry.name, tag: file.styles.get(kind)!.label };
}

/**
 * The sample match the tutorial's scoreboard step shows (TUTORIAL.sampleBoard), in the blocks a match's board is drawn
 * from: your team first with you on top, players named as in a match ("You", then each bot's roster name and
 * personality, BN1). Pure.
 */
export function sampleBoardBlocks(playerTeam: number): TeamBlock[] {
  const sample = TUTORIAL.sampleBoard;
  let k = 0;
  return [playerTeam, 1 - playerTeam].map((team, b) => {
    const won = sample.score[b] ?? 0;
    const rows = sample.rows[b] ?? [];
    return {
      team,
      title: `${TEAMS[team]!.name}${b === 0 ? ' (you)' : ''} · ${won} ${won === 1 ? 'round' : 'rounds'} won`,
      rows: rows.map(([hits, timesHit, bbsFired, timeAlive, out], i) => {
        const you = b === 0 && i === 0;
        const bot = you ? { name: 'You', tag: '' } : sampleBot(k++, team, i + 1);
        return {
          name: bot.name,
          tag: bot.tag,
          you,
          out,
          hits: String(hits),
          timesHit: String(timesHit),
          friendlyHits: '0',
          bbsFired: String(bbsFired),
          accuracy: formatAccuracy({ hits, timesHit, friendlyHits: 0, bbsFired, timeAlive }),
          timeAlive: formatTime(timeAlive),
        };
      }),
    };
  });
}

/** Which order the demo wheel points at `time` seconds into its step: the middle first (-1), then each order clockwise. */
export function demoPick(time: number): number {
  const phases = ORDER_WHEEL.items.length + 1;
  return (Math.floor(Math.max(0, time) / TUTORIAL.wheelDemoStep) % phases) - 1;
}

/**
 * What the tutorial opens on screen for the player to see (M80): the hold-key scoreboard over a sample match, or the
 * order wheel with its pointer moving from order to order, each built the first time a step asks for it, open while
 * that step shows and play runs, closed when the next step comes up. The same pieces a match draws (MatchBoard,
 * OrderWheel), so it looks the same; it only shows them, nothing here takes input. The DOM is touched only on a change.
 */
export class TutorialShowcase {
  private board: MatchBoard | null = null;
  private wheel: OrderWheel | null = null;
  private kind: ShowcaseKind | null = null;
  private visible = false;
  /** Seconds the current showcase has been up while playing (drives the wheel's pointer). */
  private time = 0;
  private pick = -2;
  private hint = '';

  /**
   * `team`: your team's CSS colour (the wheel's lit order); `wheelSelect`: how orders are picked now (Settings), read
   * as the wheel's hint is written, like the key names.
   */
  constructor(
    private readonly parent: HTMLElement,
    private readonly playerTeam: number,
    private readonly team: string,
    private readonly keyName: (action: Action) => string,
    private readonly wheelSelect: () => WheelSelect,
  ) {}

  /** What the step shown opens (null: nothing). Call when the step changes. */
  set(kind: ShowcaseKind | null): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.time = 0;
    this.pick = -2;
    this.apply();
  }

  /** Only while play runs (the pause menu covers the field). */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    // A rebind or a new way of picking on the pause menu shows when play resumes.
    this.pick = -2;
    this.apply();
  }

  /** Once per drawn frame: moves the demo wheel's pointer on. */
  frame(dt: number): void {
    if (!this.visible || this.kind !== 'orderWheel') return;
    this.time += dt;
    this.drawWheel();
  }

  dispose(): void {
    this.board?.dispose();
    this.wheel?.dispose();
  }

  private apply(): void {
    const on = this.visible ? this.kind : null;
    if (on === 'scoreboard' && !this.board) {
      this.board = new MatchBoard(this.parent);
      const s = TUTORIAL.sampleBoard;
      this.board.set(`Match so far · round ${s.round}`, sampleBoardBlocks(this.playerTeam));
    }
    this.board?.setVisible(on === 'scoreboard');
    if (on === 'orderWheel') {
      this.wheel ??= new OrderWheel(this.parent, this.team, this.keyName);
      this.drawWheel();
    } else this.wheel?.hide();
  }

  private drawWheel(): void {
    const pick = demoPick(this.time);
    if (pick === this.pick || !this.wheel) return;
    this.pick = pick;
    this.hint = wheelHint(this.wheelSelect(), pick, this.keyName('orderWheel'));
    // On an order: the pointer as far out as it goes, the way the player's would be; else in the middle.
    const angle = (pick / ORDER_WHEEL.items.length) * Math.PI * 2;
    const x = pick < 0 ? 0 : Math.sin(angle) * ORDER_WHEEL.pointerReach;
    const y = pick < 0 ? 0 : -Math.cos(angle) * ORDER_WHEEL.pointerReach;
    this.wheel.update(true, pick, x, y, 'none', this.hint);
  }
}
