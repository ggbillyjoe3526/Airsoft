import { teamCss } from '../config/teams';
import { headIcon } from './headIcon';
import type { StatsRow, TeamBlock } from './statsRows';

const COLUMNS: readonly { key: Exclude<keyof StatsRow, 'name' | 'you' | 'out'>; label: string; title: string }[] = [
  { key: 'hits', label: 'Hits', title: 'Opponents hit' },
  { key: 'timesHit', label: 'Times hit', title: 'Times this player was hit' },
  { key: 'friendlyHits', label: 'Friendly hits', title: 'Teammates hit (friendly fire counts)' },
  { key: 'bbsFired', label: 'BBs', title: 'BBs fired' },
  { key: 'accuracy', label: 'Accuracy', title: 'BBs on an opponent, of those fired' },
  { key: 'timeAlive', label: 'Time alive', title: 'Time in play while rounds were live' },
];

/**
 * A stats table: a header row, then a block per team (its name and rounds won, in the team's colour) with a row per
 * player; your row stands out. Used by the hold-Tab scoreboard and the end-of-match summary. `set` only rebuilds the
 * table when its shape changes; otherwise it writes the cells whose text changed.
 */
export class StatsTable {
  readonly root: HTMLTableElement;
  private shape = '';
  private titles: HTMLTableCellElement[] = [];
  /** Each player's row: its name (beside the head drawing, G3) and its number cells. */
  private rows: { tr: HTMLTableRowElement; name: HTMLSpanElement; cells: HTMLTableCellElement[] }[][] = [];

  constructor(className = '') {
    this.root = document.createElement('table');
    this.root.className = `stats-table ${className}`.trim();
  }

  set(blocks: readonly TeamBlock[]): void {
    const shape = blocks.map((b) => `${b.team}:${b.rows.length}`).join(',');
    if (shape !== this.shape) this.build(blocks, shape);
    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b]!;
      setText(this.titles[b]!, block.title);
      for (let r = 0; r < block.rows.length; r++) {
        const row = block.rows[r]!;
        const { tr, name, cells } = this.rows[b]![r]!;
        if (tr.classList.contains('you') !== row.you) tr.classList.toggle('you', row.you);
        if (tr.classList.contains('out') !== row.out) tr.classList.toggle('out', row.out);
        setText(name, row.name);
        for (let i = 0; i < COLUMNS.length; i++) setText(cells[i]!, row[COLUMNS[i]!.key]);
      }
    }
  }

  private build(blocks: readonly TeamBlock[], shape: string): void {
    this.shape = shape;
    this.root.textContent = '';
    const head = this.root.createTHead().insertRow();
    const player = document.createElement('th');
    player.textContent = 'Player';
    head.append(player);
    for (const col of COLUMNS) {
      const th = document.createElement('th');
      th.textContent = col.label;
      th.title = col.title;
      head.append(th);
    }
    this.titles = [];
    this.rows = blocks.map((block) => {
      const body = this.root.createTBody();
      body.className = 'stats-team';
      body.style.setProperty('--team', teamCss(block.team));
      const title = document.createElement('th');
      title.colSpan = COLUMNS.length + 1;
      body.insertRow().append(title);
      this.titles.push(title);
      return block.rows.map(() => {
        const tr = body.insertRow();
        const player = tr.insertCell();
        player.className = 'stats-player';
        const name = document.createElement('span');
        player.append(headIcon(), name);
        const cells = COLUMNS.map(() => tr.insertCell());
        return { tr, name, cells };
      });
    });
  }
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
