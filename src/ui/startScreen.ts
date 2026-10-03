import { DIFFICULTIES, DEFAULT_DIFFICULTY, type Difficulty } from '../config/bots';
import { type Action, CROUCH_MODES, type CrouchMode, DEFAULT_CROUCH_MODE, MOUSE } from '../config/controls';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from '../config/modes';
import { AIMING, DEFAULT_OPTIC, OPTIC_CHOICES, type OpticChoice } from '../config/optics';
import { type KeyBindings, keyLabel } from '../input/keyBindings';
import { loadSetting, numberIn, saveSetting, type SettingField } from '../settings/storage';
import { KeySettings } from './keySettings';
import { loadChoice, OptionPicker } from './optionPicker';

/** The saved bot difficulty, or the default. */
export function loadDifficulty(): Difficulty {
  return loadChoice('difficulty', DIFFICULTIES, DEFAULT_DIFFICULTY);
}

/** The saved match mode, or the default. */
export function loadMode(): MatchMode {
  return loadChoice('mode', MATCH_MODES, DEFAULT_MODE);
}

/** The saved crouch key behaviour (toggle or hold), or the default. */
export function loadCrouchMode(): CrouchMode {
  return loadChoice('crouch', CROUCH_MODES, DEFAULT_CROUCH_MODE);
}

/** The saved optic for the rifle, or the default (none). */
export function loadOptic(): OpticChoice {
  return loadChoice('optic', OPTIC_CHOICES, DEFAULT_OPTIC);
}

/** What the start screen needs to explain the match. */
export interface MatchRulesText {
  teamSize: number;
  winsNeeded: number;
  roundTime: number;
  playerTeam: string;
  enemyTeam: string;
  /** Seconds to raise the flag (flag mode), rounds before the teams swap ends (both modes), and whether your team attacks first. */
  raiseTime: number;
  halfTimeAfter: number;
  attackFirst: boolean;
}

/** The goal paragraph for `mode`. */
export function describeRules(r: MatchRulesText, mode: MatchMode): string {
  const minutes = Math.floor(r.roundTime / 60);
  const seconds = String(Math.round(r.roundTime % 60)).padStart(2, '0');
  const mates = r.teamSize - 1;
  const teams = `${r.teamSize}v${r.teamSize} with bots: you and ${mates} bot teammate${mates === 1 ? '' : 's'} (${r.playerTeam}) against ${r.enemyTeam}. `;
  const end = `First to ${r.winsNeeded} rounds wins the match. One hit and you're out.`;
  if (mode === 'attackDefend') {
    return (
      teams +
      `Each round one team attacks the other's flagpole: stand by it for ${r.raiseTime} s to raise your flag and win the round. ` +
      `Defenders by the pole pull it back down, and win if the clock (${minutes}:${seconds}) runs out. Knocking out the whole other team also wins. ` +
      `Your team ${r.attackFirst ? 'attacks' : 'defends'} first; sides swap after round ${r.halfTimeAfter}. ` +
      end
    );
  }
  return (
    teams +
    `Knock out the whole other team to win a round (${minutes}:${seconds} on the clock; if time runs out it's a draw). ` +
    `Teams swap ends after round ${r.halfTimeAfter}. ` +
    end
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' } as Record<string, string>)[c]};`);
}

function loadSensitivity(): number {
  return loadSetting('sensitivity', numberIn(MOUSE.minSensitivity, MOUSE.maxSensitivity), MOUSE.defaultSensitivity);
}

function loadAimSensitivity(): number {
  return loadSetting('aimSensitivity', numberIn(AIMING.minSensitivity, AIMING.maxSensitivity), AIMING.defaultSensitivity);
}

/** A labelled slider for a number setting, saved as `field` on every change. */
function settingSlider(
  label: string,
  range: { min: number; max: number; step: number },
  initial: number,
  format: (v: number) => string,
  field: SettingField,
  onChange: (v: number) => void,
): HTMLLabelElement {
  const root = document.createElement('label');
  root.className = 'start-sens';
  root.append(label);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(range.min);
  slider.max = String(range.max);
  slider.step = String(range.step);
  slider.value = String(initial);
  const output = document.createElement('output');
  output.textContent = format(initial);
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    output.textContent = format(v);
    saveSetting(field, v);
    onChange(v);
  });
  root.append(slider, output);
  return root;
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
  private readonly difficultyPicker: OptionPicker<Difficulty>;
  private readonly modePicker: OptionPicker<MatchMode>;
  private readonly crouchPicker: OptionPicker<CrouchMode>;
  private readonly opticPicker: OptionPicker<OpticChoice>;
  private readonly goal: HTMLParagraphElement;
  private sensitivityValue = loadSensitivity();
  private aimSensitivityValue = loadAimSensitivity();
  private crouchMode: CrouchMode;

  constructor(
    parent: HTMLElement,
    private readonly rules: MatchRulesText,
    private readonly bindings: KeyBindings,
    onPlay: () => void,
    onSensitivity: (v: number) => void,
    difficulty: { initial: Difficulty; onChange: (d: Difficulty) => void },
    mode: { initial: MatchMode; onChange: (m: MatchMode) => void },
    crouch: { initial: CrouchMode; onChange: (m: CrouchMode) => void },
    optic: { initial: OpticChoice; onChange: (o: OpticChoice) => void },
    onAimSensitivity: (v: number) => void,
  ) {
    this.crouchMode = crouch.initial;
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
        <div class="start-controls"></div>
        <button class="start-keys" type="button">Key bindings</button>
      </div>`;
    parent.appendChild(this.root);

    this.playButton = this.root.querySelector('.start-play') as HTMLButtonElement;
    this.hint = this.root.querySelector('.start-hint') as HTMLParagraphElement;
    this.result = this.root.querySelector('.start-result') as HTMLDivElement;
    this.goal = this.root.querySelector('.start-goal') as HTMLParagraphElement;
    this.goal.textContent = describeRules(rules, mode.initial);
    this.modePicker = new OptionPicker('Mode', MATCH_MODES, mode.initial, 'mode', mode.onChange);
    this.difficultyPicker = new OptionPicker('Bots', DIFFICULTIES, difficulty.initial, 'difficulty', difficulty.onChange);
    this.opticPicker = new OptionPicker('Optic', OPTIC_CHOICES, optic.initial, 'optic', optic.onChange);
    this.goal.after(this.modePicker.root, this.difficultyPicker.root, this.opticPicker.root);
    const sensitivity = settingSlider(
      'Mouse sensitivity',
      { min: MOUSE.minSensitivity, max: MOUSE.maxSensitivity, step: MOUSE.sensitivityStep },
      this.sensitivityValue,
      (v) => v.toFixed(2),
      'sensitivity',
      (v) => {
        this.sensitivityValue = v;
        onSensitivity(v);
      },
    );
    // A multiple of the mouse sensitivity, so it follows when that changes.
    const aimSensitivity = settingSlider(
      'Aiming sensitivity',
      { min: AIMING.minSensitivity, max: AIMING.maxSensitivity, step: AIMING.sensitivityStep },
      this.aimSensitivityValue,
      (v) => `×${v.toFixed(2)}`,
      'aimSensitivity',
      (v) => {
        this.aimSensitivityValue = v;
        onAimSensitivity(v);
      },
    );
    aimSensitivity.classList.add('start-aim-sens');
    this.crouchPicker = new OptionPicker('Crouch', CROUCH_MODES, crouch.initial, 'crouch', (m) => {
      this.crouchMode = m;
      this.renderControls();
      crouch.onChange(m);
    });
    this.hint.after(sensitivity, aimSensitivity, this.crouchPicker.root);
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
      <div><kbd>RMB</kbd> aim down sights (hold, needs an optic)</div>
      <div>${k('walk')} walk (quiet)</div>
      <div>${k('sprint')} sprint</div>
      <div>${k('crouch')} crouch (${this.crouchMode === 'toggle' ? 'toggle' : 'hold'})</div>
      <div>${k('leanLeft')} ${k('leanRight')} lean (hold)</div>
      <div>${k('jump')} jump</div>
      <div>${k('reload')} reload</div>
      <div>${k('fireMode')} fire mode</div>
      <div>${k('slot1')} ${k('slot2')} / wheel: switch</div>
      <div><kbd>Esc</kbd> pause</div>
      <div><kbd>\`</kbd> / <kbd>F3</kbd> debug info</div>`;
  }

  get sensitivity(): number {
    return this.sensitivityValue;
  }

  get aimSensitivity(): number {
    return this.aimSensitivityValue;
  }

  /** A note shown with the optic, e.g. when a change waits for the next round. */
  setOpticNote(text: string): void {
    this.opticPicker.setNote(text);
  }

  /** A note shown with the difficulty, e.g. when a change waits for the next round. */
  setDifficultyNote(text: string): void {
    this.difficultyPicker.setNote(text);
  }

  /** A note shown with the mode, e.g. when a change waits for the next match. */
  setModeNote(text: string): void {
    this.modePicker.setNote(text);
  }

  /** Explains the rules of `mode`: the match in progress, or the one about to start (the game decides). */
  describeMode(mode: MatchMode): void {
    this.goal.textContent = describeRules(this.rules, mode);
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
