/**
 * Over the field while a round skips without the mouse (core/escSkip.ts, the owner's 0.1 Dev 5 playtest, note 10): how
 * to play on (a click takes the mouse back) and how to reach the menu. Clicks pass through it to the field.
 */
export class PlayPrompt {
  private readonly root: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly text: string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'play-prompt';
    this.root.setAttribute('role', 'status');
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  /** Shows the prompt, or `note` in its place (the browser refused the mouse: click again). */
  show(note = ''): void {
    this.root.textContent = note || this.text;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }
}
