import { MOUSE } from '../config/controls';

const SENSITIVITY_KEY = 'airsoft.sensitivity';

function loadSensitivity(): number {
  try {
    const raw = localStorage.getItem(SENSITIVITY_KEY);
    const v = raw === null ? NaN : Number(raw);
    if (Number.isFinite(v) && v >= MOUSE.minSensitivity && v <= MOUSE.maxSensitivity) return v;
  } catch {
    // Storage unavailable (private mode etc.): fall back to the default.
  }
  return MOUSE.defaultSensitivity;
}

function saveSensitivity(v: number): void {
  try {
    localStorage.setItem(SENSITIVITY_KEY, String(v));
  } catch {
    // Non-critical.
  }
}

/**
 * Title / pause overlay. The play button asks the game to start (normally by locking the pointer);
 * the overlay hides while playing and returns as a pause screen when the pointer is released.
 * Only lists controls that currently do something.
 */
export class StartScreen {
  private readonly root: HTMLDivElement;
  private readonly playButton: HTMLButtonElement;
  private readonly hint: HTMLParagraphElement;
  private sensitivityValue = loadSensitivity();

  constructor(
    parent: HTMLElement,
    onPlay: () => void,
    onSensitivity: (v: number) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'start-screen';
    this.root.innerHTML = `
      <div class="start-card">
        <h1 class="start-title">AIRSOFT<span>.</span></h1>
        <p class="start-tagline">One BB, you're hit. Call it, walk off, go again.</p>
        <button class="start-play" type="button">Click to play</button>
        <p class="start-hint" hidden></p>
        <label class="start-sens">Mouse sensitivity
          <input type="range" min="${MOUSE.minSensitivity}" max="${MOUSE.maxSensitivity}" step="${MOUSE.sensitivityStep}" />
          <output></output>
        </label>
        <div class="start-controls">
          <div><kbd>WASD</kbd> move</div>
          <div><kbd>Mouse</kbd> look</div>
          <div><kbd>Shift</kbd> sprint</div>
          <div><kbd>C</kbd> crouch</div>
          <div><kbd>Space</kbd> jump</div>
          <div><kbd>Esc</kbd> pause</div>
          <div><kbd>\`</kbd> / <kbd>F3</kbd> debug info</div>
        </div>
      </div>`;
    parent.appendChild(this.root);

    this.playButton = this.root.querySelector('.start-play') as HTMLButtonElement;
    this.hint = this.root.querySelector('.start-hint') as HTMLParagraphElement;
    const slider = this.root.querySelector('input') as HTMLInputElement;
    const output = this.root.querySelector('output') as HTMLOutputElement;

    slider.value = String(this.sensitivityValue);
    output.textContent = this.sensitivityValue.toFixed(2);
    slider.addEventListener('input', () => {
      this.sensitivityValue = Number(slider.value);
      output.textContent = this.sensitivityValue.toFixed(2);
      saveSensitivity(this.sensitivityValue);
      onSensitivity(this.sensitivityValue);
    });
    this.playButton.addEventListener('click', () => {
      this.showHint('');
      onPlay();
    });
  }

  get sensitivity(): number {
    return this.sensitivityValue;
  }

  show(paused: boolean): void {
    this.playButton.textContent = paused ? 'Click to resume' : 'Click to play';
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.showHint('');
  }

  /** Short message under the play button, e.g. when the browser refuses the mouse lock. */
  showHint(text: string): void {
    this.hint.textContent = text;
    this.hint.hidden = text.length === 0;
  }

  dispose(): void {
    this.root.remove();
  }
}
