import type { Action } from '../config/controls';
import { keySegments, type TutorialTracker } from '../tutorial/tutorial';

/**
 * The tutorial's coach (M16), top centre where a match shows its clock: the step's number and heading, what to do with
 * the keys named as the player has them bound, and a tick when it's done. Redrawn only when the step changes.
 */
export class CoachPanel {
  private readonly root: HTMLDivElement;
  private readonly head: HTMLDivElement;
  private readonly body: HTMLParagraphElement;
  private shownKey = '';

  constructor(
    parent: HTMLElement,
    private readonly keyName: (action: Action) => string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'coach';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.head = document.createElement('div');
    this.head.className = 'coach-head';
    this.body = document.createElement('p');
    this.body.className = 'coach-body';
    this.root.append(this.head, this.body);
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** Shows the tracker's step (call when it changes, and when play resumes: a key may have been rebound). */
  show(t: TutorialTracker): void {
    const step = t.step;
    // The key names are part of what's shown: a rebind on the pause menu redraws the text.
    const key = step ? `${step.id}:${t.showingDone}:${step.text.replace(/\{(\w+)\}/g, (_, a: string) => this.keyName(a as Action))}` : '';
    if (key === this.shownKey) return;
    this.shownKey = key;
    if (!step) {
      this.root.classList.remove('done');
      return;
    }
    this.root.classList.toggle('done', t.showingDone);
    this.head.textContent = `Tutorial · ${t.stepIndex + 1} of ${t.steps.length} · ${step.title}${t.showingDone ? ' ✓' : ''}`;
    this.body.replaceChildren(
      ...keySegments(step.text, this.keyName).map((s) => {
        if (!s.key) return document.createTextNode(s.text);
        const k = document.createElement('kbd');
        k.textContent = s.text;
        return k;
      }),
    );
  }

  dispose(): void {
    this.root.remove();
  }
}
