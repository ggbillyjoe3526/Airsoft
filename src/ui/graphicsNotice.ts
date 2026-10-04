/** A notice over everything, menus included, while the graphics context is lost (M18b). */
export class GraphicsNotice {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, text: string) {
    this.root = document.createElement('div');
    this.root.className = 'graphics-notice';
    this.root.setAttribute('role', 'alert');
    this.root.textContent = text;
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  dispose(): void {
    this.root.remove();
  }
}
