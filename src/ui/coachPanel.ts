import type { Action } from '../config/controls';
import { coachText } from '../config/tutorial';
import { keySegments, type TutorialTracker } from '../tutorial/tutorial';

/**
 * The tutorial's coach (M16), top centre where a match shows its clock: the step's number and heading, what to do with
 * the keys named as the player has them bound, and a tick when it's done; on a step that asks for a hit, where your
 * last BB landed (the readout's line, as the range readout is hidden meanwhile). Redrawn only when the step changes.
 */
export class CoachPanel {
  private readonly root: HTMLDivElement;
  private readonly head: HTMLDivElement;
  private readonly body: HTMLParagraphElement;
  /** Where your last BB landed (the range readout's line), shown on the steps that ask for a hit. */
  private readonly shot: HTMLParagraphElement;
  /** A read step's time (TT1): a thin bar that fills as the card reads, so the player sees it moves on by itself. */
  private readonly timer: HTMLDivElement;
  private readonly timerFill: HTMLDivElement;
  /** The bar's fill last drawn, in hundredths (-1: hidden), so a tick that changes nothing visible writes nothing. */
  private timerShown = -1;
  private shownKey = '';
  /** Settings › HUD › Ammo counter (AC1): off, a step with words for it says them instead (config/tutorial.ts coachText). */
  private ammoCounter = true;

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
    this.shot = document.createElement('p');
    this.shot.className = 'coach-shot';
    this.shot.hidden = true;
    this.timer = document.createElement('div');
    this.timer.className = 'coach-timer';
    this.timer.hidden = true;
    this.timerFill = document.createElement('div');
    this.timerFill.className = 'coach-timer-fill';
    this.timer.appendChild(this.timerFill);
    this.root.append(this.head, this.body, this.shot, this.timer);
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** The ammo counter shown or not (AC1); the next show redraws the step if its words change with it. */
  setAmmoCounter(shown: boolean): void {
    this.ammoCounter = shown;
  }

  /** The last BB's line ('' for none yet); shown only while a step asks for a hit. */
  setShot(text: string): void {
    if (this.shot.textContent !== text) this.shot.textContent = text;
  }

  /** A read step's progress (0..1), or below 0 to hide the bar (TutorialTracker.readProgress). */
  setReadProgress(progress: number): void {
    const shown = progress < 0 ? -1 : Math.round(progress * 100);
    if (shown === this.timerShown) return;
    this.timerShown = shown;
    this.timer.hidden = shown < 0;
    if (shown >= 0) this.timerFill.style.transform = `scaleX(${shown / 100})`;
  }

  /** Shows the tracker's step (call when it changes, and when play resumes: a key may have been rebound). */
  show(t: TutorialTracker): void {
    const step = t.step;
    const text = step ? coachText(step, this.ammoCounter) : '';
    // The key names are part of what's shown: a rebind on the pause menu redraws the text (and so does the ammo counter).
    const key = step ? `${step.id}:${t.showingDone}:${text.replace(/\{(\w+)\}/g, (_, a: string) => this.keyName(a as Action))}` : '';
    if (key === this.shownKey) return;
    this.shownKey = key;
    if (!step) {
      this.root.classList.remove('done');
      return;
    }
    this.root.classList.toggle('done', t.showingDone);
    this.shot.hidden = step.goal.kind !== 'hit';
    this.head.textContent = `Tutorial · ${t.stepIndex + 1} of ${t.steps.length} · ${step.title}${t.showingDone ? ' ✓' : ''}`;
    this.body.replaceChildren(
      ...keySegments(text, this.keyName).map((s) => {
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
