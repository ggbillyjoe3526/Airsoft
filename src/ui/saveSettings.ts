import { DOWNLOAD_URL_LIFETIME_MS, SAVE_FILE_MAX_BYTES, SAVE_TEXT } from '../config/save';
import { parseSaveText, type SaveData, saveFileName, saveFileText, summarize } from '../save/saveFile';
import type { SaveManager } from '../save/saveManager';
import { el, menuButton, menuRow } from './menus/menuParts';
import { SaveDialog } from './saveDialog';

/**
 * Settings → Save (M31): when the game last saved, Download, Load (or a file dropped on the tab), Undo, the restore
 * points, Protect from automatic clearing and Delete. Loading, restoring, Undo and Delete ask first (ui/saveDialog.ts),
 * are refused mid-match (Settings opened from the pause menu) and reload the game; Download works anywhere.
 */
export class SaveSettings {
  readonly rows: HTMLElement[];
  /** The pop-up; the Settings screen puts it in its page (a dialog in a hidden tab panel can't show). */
  readonly dialog = new SaveDialog();
  private readonly problem = el('p', 'save-problem');
  private readonly status = el('span', 'save-status');
  private readonly downloadedLine = el('span', 'save-line');
  private readonly loadMessage = el('span', 'save-line save-message');
  private readonly undoHelp = el('span', 'save-line');
  private readonly restoreList = el('div', 'menu-row-control save-restore-list');
  private readonly protectButton: HTMLButtonElement;
  private readonly protectLine = el('span', 'save-line');
  private readonly fileInput = el('input');
  private readonly replaceButtons: HTMLButtonElement[] = [];
  private readonly undoButton: HTMLButtonElement;
  private inMatch = false;
  /** Ends the page-wide drop listeners. */
  private readonly listening = new AbortController();

  constructor(private readonly manager: SaveManager) {
    this.problem.setAttribute('role', 'status');
    this.loadMessage.setAttribute('aria-live', 'polite');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,application/json';
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.load(file);
    });

    const download = menuButton(SAVE_TEXT.downloadButton, 'secondary', () => this.download());
    const load = this.replaceButton(SAVE_TEXT.loadButton, () => this.fileInput.click());
    const undo = this.replaceButton(SAVE_TEXT.undoButton, () => void this.undo());
    this.undoButton = undo;
    const del = this.replaceButton(SAVE_TEXT.deleteButton, () => void this.deleteSave());
    del.classList.add('save-danger');
    this.protectButton = menuButton(SAVE_TEXT.protectButton, 'secondary', () => void this.protect());

    this.rows = [
      this.problem,
      menuRow(SAVE_TEXT.statusLabel, `${SAVE_TEXT.statusHelp} ${SAVE_TEXT.privateHint}`, control(this.status)),
      menuRow(SAVE_TEXT.downloadLabel, SAVE_TEXT.downloadHelp, control(download, this.downloadedLine)),
      menuRow(SAVE_TEXT.loadLabel, SAVE_TEXT.loadHelp, control(load, this.fileInput, this.loadMessage)),
      menuRow(SAVE_TEXT.undoLabel, SAVE_TEXT.undoNote, control(undo, this.undoHelp)),
      menuRow(SAVE_TEXT.restoreLabel, SAVE_TEXT.restoreHelp, this.restoreList),
      menuRow(SAVE_TEXT.protectLabel, SAVE_TEXT.protectHelp, control(this.protectButton, this.protectLine)),
      menuRow(SAVE_TEXT.deleteLabel, SAVE_TEXT.deleteHelp, control(del)),
    ];
    // Every save the game makes can change what the tab shows; worked out only while it is on screen (and as it opens).
    manager.onChange(() => {
      if (this.shown()) this.refresh();
    });
    this.refresh();
  }

  /** Settings opened from the pause menu (true) or from New game: a save can't be loaded mid-match. */
  setInMatch(on: boolean): void {
    this.inMatch = on;
    this.refresh();
  }

  /**
   * While the Save tab shows, a file dropped anywhere on the page is loaded as a save (and `area`, its panel, lights up
   * as one is dragged over), rather than the browser opening the file in place of the game.
   */
  acceptDrops(area: HTMLElement): void {
    const files = (e: DragEvent) => this.shown() && e.dataTransfer?.types.includes('Files') === true;
    const { signal } = this.listening;
    window.addEventListener('dragover', (e) => {
      if (!files(e)) return;
      e.preventDefault();
      area.classList.add('save-drop');
    }, { signal });
    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null) area.classList.remove('save-drop');
    }, { signal });
    window.addEventListener('drop', (e) => {
      if (!files(e)) return;
      e.preventDefault();
      area.classList.remove('save-drop');
      const file = e.dataTransfer?.files[0];
      if (file) void this.load(file);
    }, { signal });
  }

  /** Stops listening for dropped files (the Settings screen is going). */
  dispose(): void {
    this.listening.abort();
  }

  /** The tab is on screen (its panel shown, Settings open). */
  private shown(): boolean {
    return this.status.isConnected && this.status.offsetParent !== null;
  }

  /** Brings the tab up to date (times, Undo, the restore points, the browser's protection). */
  refresh(): void {
    const m = this.manager;
    const now = new Date();
    this.problem.textContent = m.newerBuild ? SAVE_TEXT.newer(m.newerBuild) : m.otherTab ? SAVE_TEXT.otherTab : m.blocked ? SAVE_TEXT.blocked : '';
    this.problem.hidden = this.problem.textContent === '';
    const saved = m.lastSaved;
    this.status.textContent = saved ? SAVE_TEXT.savedAgo(timeAgo(saved, now)) : SAVE_TEXT.savedNever;
    const downloaded = m.lastDownloaded;
    this.downloadedLine.textContent = downloaded ? SAVE_TEXT.downloadedAgo(timeAgo(downloaded, now)) : SAVE_TEXT.downloadedNever;
    const can = m.canReplace && !this.inMatch;
    for (const b of this.replaceButtons) b.disabled = !can;
    if (this.inMatch) this.loadMessage.textContent = SAVE_TEXT.loadInMatch;
    else if (this.loadMessage.textContent === SAVE_TEXT.loadInMatch) this.loadMessage.textContent = '';
    const undo = m.undoable();
    this.undoButton.disabled = !can || !undo;
    this.undoHelp.textContent = undo ? SAVE_TEXT.undoHelp(SAVE_TEXT.undoWhat[undo.what]) : SAVE_TEXT.undoNone;
    this.fillRestorePoints(can, now);
    void m.protectedNow().then((on) => this.showProtection(on === true ? 'on' : on === null ? 'unsupported' : 'off'));
  }

  private replaceButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = menuButton(label, 'secondary', onClick);
    this.replaceButtons.push(b);
    return b;
  }

  private fillRestorePoints(can: boolean, now: Date): void {
    const points = this.manager.restorePoints();
    this.restoreList.replaceChildren();
    if (points.length === 0) this.restoreList.append(el('span', 'save-line', SAVE_TEXT.restoreNone));
    for (const point of points) {
      const s = summarize(point.stores);
      const item = el('div', 'save-restore');
      const text = `${dayText(point.savedAt, now)} · ${s.fc} FC · ${s.tokens} ${s.tokens === 1 ? 'Token' : 'Tokens'} · ${s.items} ${s.items === 1 ? 'item' : 'items'} · ${s.matches} ${s.matches === 1 ? 'match' : 'matches'}`;
      const button = menuButton(SAVE_TEXT.restoreButton, 'secondary', () => void this.restore(point));
      button.disabled = !can;
      button.setAttribute('aria-label', `${SAVE_TEXT.restoreButton}: ${text}`);
      item.append(el('span', 'save-line', text), button);
      this.restoreList.append(item);
    }
  }

  private download(): void {
    const now = new Date();
    const save = this.manager.current();
    const url = URL.createObjectURL(new Blob([saveFileText(save)], { type: 'application/json' }));
    const a = el('a');
    a.href = url;
    a.download = saveFileName(now);
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    // Firefox reads the link after the click has returned.
    window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
    this.manager.downloaded();
  }

  private async load(file: File): Promise<void> {
    if (this.inMatch || !this.manager.canReplace) return;
    const errors = SAVE_TEXT.errors;
    if (file.size > SAVE_FILE_MAX_BYTES) return this.say(errors.tooBig);
    let text: string;
    try {
      text = await file.text();
    } catch {
      return this.say(errors.unreadable);
    }
    const parsed = parseSaveText(text);
    if (!parsed.ok) return this.say(parsed.error === 'newer' ? errors.newer(parsed.build || '?') : errors[parsed.error]);
    this.say('');
    const notes = parsed.checksumOk ? [] : [{ text: SAVE_TEXT.checksumBad, warn: true }];
    const yes = await this.ask(SAVE_TEXT.confirmLoadTitle, parsed.save, 'file', notes, parsed.checksumOk ? SAVE_TEXT.replaceButton : SAVE_TEXT.loadAnywayButton);
    if (yes) this.done(this.manager.replace(parsed.save, 'load'));
  }

  private async restore(point: SaveData): Promise<void> {
    if (await this.ask(SAVE_TEXT.confirmRestoreTitle, point, 'restore', [], SAVE_TEXT.replaceButton)) this.done(this.manager.replace(point, 'restore'));
  }

  private async undo(): Promise<void> {
    const slot = this.manager.undoable();
    if (slot && (await this.ask(SAVE_TEXT.confirmUndoTitle, slot.save, 'undo', [], SAVE_TEXT.undoButton))) this.done(this.manager.undo());
  }

  private async deleteSave(): Promise<void> {
    const yes = await this.dialog.ask(
      {
        title: SAVE_TEXT.confirmDeleteTitle,
        notes: [{ text: SAVE_TEXT.confirmDeleteBody }, { text: SAVE_TEXT.reloadNote }],
        confirmLabel: SAVE_TEXT.deleteConfirmButton,
        extra: { label: SAVE_TEXT.downloadFirstButton, onClick: () => this.download() },
      },
      new Date(),
    );
    if (yes && !this.inMatch) this.done(this.manager.deleteSave());
  }

  /** The pop-up with this browser's save beside `incoming`. */
  private ask(title: string, incoming: SaveData, from: 'file' | 'restore' | 'undo', notes: { text: string; warn?: boolean }[], confirmLabel: string): Promise<boolean> {
    const current = { ...this.manager.current(), savedAt: this.manager.lastSaved?.toISOString() ?? '' };
    return this.dialog.ask({ title, compare: { current, incoming, from }, notes: [...notes, { text: SAVE_TEXT.reloadNote }], confirmLabel }, new Date());
  }

  private async protect(): Promise<void> {
    const answer = await this.manager.protect();
    this.showProtection(answer === true ? 'on' : answer === null ? 'unsupported' : 'refused');
  }

  private showProtection(state: 'on' | 'off' | 'refused' | 'unsupported'): void {
    this.protectButton.disabled = state === 'on' || state === 'unsupported';
    this.protectButton.textContent = state === 'on' ? SAVE_TEXT.protectOn : SAVE_TEXT.protectButton;
    this.protectLine.textContent = state === 'refused' ? SAVE_TEXT.protectRefused : state === 'unsupported' ? SAVE_TEXT.protectUnsupported : '';
  }

  /** After a load, restore, Undo or delete: the game reloads, or (false) the browser had no room and nothing changed. */
  private done(reloading: boolean): void {
    if (!reloading) this.say(SAVE_TEXT.errors.noRoom);
  }

  private say(text: string): void {
    this.loadMessage.textContent = text;
  }
}

/** A row's control: its button and the lines of status beside it. */
function control(...parts: HTMLElement[]): HTMLDivElement {
  const box = el('div', 'menu-row-control');
  box.append(...parts);
  return box;
}

/** How long ago, in words: "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", or the date. */
export function timeAgo(then: Date, now: Date): string {
  const s = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(s / 86400);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** A restore point's day ("Sat 4 Oct"), '?' when unknown. */
function dayText(iso: string, now: Date): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '?';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
