import { type Action, MOUSE } from '../config/controls';
import { type KeyBindings, keyLabel } from '../input/keyBindings';
import { KeySettings } from './keySettings';

const SENSITIVITY_KEY = 'airsoft.sensitivity';

/** What the start screen needs to explain the match. */
export interface MatchRulesText {
  teamSize: number;
  winsNeeded: number;
  roundTime: number;
  playerTeam: string;
  enemyTeam: string;
}

function describeRules(r: MatchRulesText): string {
  const minutes = Math.floor(r.roundTime / 60);
  const seconds = String(Math.round(r.roundTime % 60)).padStart(2, '0');
  const mates = r.teamSize - 1;
  return (
    `${r.teamSize}v${r.teamSize} with bots: you and ${mates} bot teammate${mates === 1 ? '' : 's'} (${r.playerTeam}) against ${r.enemyTeam}. ` +
    `Knock out the whole other team to win a round (${minutes}:${seconds} on the clock; if time runs out it's a draw). ` +
    `First to ${r.winsNeeded} rounds wins the match. One hit and you're out.`
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' } as Record<string, string>)[c]};`);
}

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
  private readonly result: HTMLDivElement;
  private readonly controls: HTMLDivElement;
  private readonly keySettings: KeySettings;
  private readonly keysButton: HTMLButtonElement;
  private sensitivityValue = loadSensitivity();

  constructor(
    parent: HTMLElement,
    rules: MatchRulesText,
    private readonly bindings: KeyBindings,
    onPlay: () => void,
    onSensitivity: (v: number) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'start-screen';
    this.root.innerHTML = `
      <div class="start-card">
        <h1 class="start-title">AIRSOFT<span>.</span></h1>
        <p class="start-tagline">One BB, you're hit. Call it, walk off, go again.</p>
        <div class="start-result" hidden><strong></strong><span></span></div>
        <p class="start-goal"></p>
        <button class="start-play" type="button">Click to play</button>
        <p class="start-hint" hidden></p>
        <label class="start-sens">Mouse sensitivity
          <input type="range" min="${MOUSE.minSensitivity}" max="${MOUSE.maxSensitivity}" step="${MOUSE.sensitivityStep}" />
          <output></output>
        </label>
        <div class="start-controls"></div>
        <button class="start-keys" type="button">Key bindings</button>
      </div>`;
    parent.appendChild(this.root);

    this.playButton = this.root.querySelector('.start-play') as HTMLButtonElement;
    this.hint = this.root.querySelector('.start-hint') as HTMLParagraphElement;
    this.result = this.root.querySelector('.start-result') as HTMLDivElement;
    (this.root.querySelector('.start-goal') as HTMLParagraphElement).textContent = describeRules(rules);
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

    this.controls = this.root.querySelector('.start-controls') as HTMLDivElement;
    this.keysButton = this.root.querySelector('.start-keys') as HTMLButtonElement;
    this.keySettings = new KeySettings(bindings);
    this.keysButton.before(this.keySettings.root);
    this.keysButton.addEventListener('click', () => this.showKeySettings(!this.keySettings.visible));
    bindings.onChange(() => this.renderControls());
    this.renderControls();
  }

  /** Swaps the controls summary for the key-binding settings (or back). */
  private showKeySettings(show: boolean): void {
    this.keySettings.setVisible(show);
    this.controls.hidden = show;
    this.keysButton.textContent = show ? 'Done' : 'Key bindings';
  }

  /** The controls summary, showing the player's current keys. */
  private renderControls(): void {
    const k = (a: Action): string => `<kbd>${escapeHtml(keyLabel(this.bindings.primary(a)))}</kbd>`;
    this.controls.innerHTML = `
      <div>${k('forward')}${k('left')}${k('back')}${k('right')} move</div>
      <div><kbd>Mouse</kbd> aim, <kbd>LMB</kbd> fire</div>
      <div>${k('walk')} walk (slow)</div>
      <div>${k('sprint')} sprint</div>
      <div>${k('crouch')} crouch</div>
      <div>${k('jump')} jump</div>
      <div>${k('reload')} reload</div>
      <div>${k('slot1')} ${k('slot2')} ${k('swap')} / wheel: switch</div>
      <div><kbd>Esc</kbd> pause</div>
      <div><kbd>\`</kbd> / <kbd>F3</kbd> debug info</div>`;
  }

  get sensitivity(): number {
    return this.sensitivityValue;
  }

  /** Title screen (`paused` false) or pause screen; `status` (e.g. the score) shows on the pause screen. */
  show(paused: boolean, status = ''): void {
    this.playButton.textContent = paused ? 'Click to resume' : 'Click to play';
    const showStatus = paused && status !== '';
    this.result.hidden = !showStatus;
    if (showStatus) {
      (this.result.firstElementChild as HTMLElement).textContent = 'Paused';
      (this.result.lastElementChild as HTMLElement).textContent = status;
    }
    this.root.hidden = false;
  }

  /** The match result ("You win!" and the score line), with the button offering a rematch. */
  showResult(headline: string, detail: string): void {
    (this.result.firstElementChild as HTMLElement).textContent = headline;
    (this.result.lastElementChild as HTMLElement).textContent = detail;
    this.result.hidden = false;
    this.playButton.textContent = 'Play again';
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.showKeySettings(false);
    this.showHint('');
  }

  /** Short message under the play button, e.g. when the browser refuses the mouse lock. */
  showHint(text: string): void {
    this.hint.textContent = text;
    this.hint.hidden = text.length === 0;
  }

  dispose(): void {
    this.keySettings.dispose();
    this.root.remove();
  }
}
