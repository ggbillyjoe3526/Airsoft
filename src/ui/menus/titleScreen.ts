import { ARMORY_TEXT, MENU_TEXT, TITLE_TEXT } from '../../config/menus';
import { hintsBar, type MenuHint, tagPill } from './chrome';
import { MENU_ICONS, NAV_ICONS, WARNING_ICON } from './icons';
import { KitStrip, type PictureContext } from './kitStrip';
import { el, hintLine, menuButton, setHint, withIcon } from './menuParts';
import type { LoadoutModel } from '../../pool/loadoutModel';

export interface TitleActions {
  onPlay: () => void;
  onTutorial: () => void;
  onRange: () => void;
  onLoadout: () => void;
  onArmory: () => void;
  onSettings: () => void;
}

/** The title's "Your next match" panel: the map's still and name, the mode and bots, the rules. */
export interface NextMatch {
  still: string | null;
  mapLine: string;
  modeLine: string;
  rulesLine: string;
}

/**
 * The first thing a player sees (G3): the wordmark over the field, Play, then the tutorial (tagged for new players until
 * it's been played through, M16), the practice range (M21), the Loadout, the Armory and Settings; beside them a tip and
 * the next match as picked, with the kit you carry.
 */
export class TitleScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly warning: HTMLParagraphElement;
  private readonly warningText: HTMLSpanElement;
  private readonly tutorialTag: HTMLElement;
  private readonly armoryTag: HTMLElement;
  private readonly armory: HTMLButtonElement;
  private readonly fc: HTMLSpanElement;
  private readonly tokens: HTMLSpanElement;
  private readonly still: HTMLImageElement;
  private readonly next: { map: HTMLElement; mode: HTMLElement; rules: HTMLElement };
  private readonly kit: KitStrip;
  /** Over the buttons: e.g. the browser refused the mouse lock for the range or the tutorial (audit L-29). */
  private readonly hint = hintLine();

  constructor(actions: TitleActions, tutorialDone: boolean, loadout: LoadoutModel, context: PictureContext) {
    this.root = el('div', 'menu-screen menu-title');
    this.root.hidden = true;

    const hero = el('div', 'title-hero');
    // Which build this is, worked out from git as the game is built (config/buildVersion.ts).
    const kicker = el('p', 'title-kicker', `// ${__BUILD_VERSION__.label} · ${TITLE_TEXT.kicker}`);
    kicker.title = __BUILD_VERSION__.title;
    const wordmark = el('h1', 'menu-title-wordmark', MENU_TEXT.wordmark);
    wordmark.prepend(el('i'));
    hero.append(kicker, wordmark, el('p', 'menu-title-tagline', TITLE_TEXT.tagline));

    const actions_ = el('div', 'title-actions');
    const play = menuButton(MENU_TEXT.hints.play, 'primary', actions.onPlay);
    play.classList.add('menu-title-start', 'menu-button-big');
    play.insertAdjacentHTML('beforeend', MENU_ICONS.arrowRight);
    play.dataset.autofocus = '';
    const tutorial = withIcon(menuButton('Tutorial', 'secondary', actions.onTutorial), NAV_ICONS.tutorial);
    // The tags are visual nudges; the buttons' names stay "Tutorial" and "Armory".
    this.tutorialTag = tagPill(TITLE_TEXT.newTag);
    this.tutorialTag.classList.add('menu-title-new');
    this.tutorialTag.setAttribute('aria-hidden', 'true');
    tutorial.append(this.tutorialTag);
    this.armory = withIcon(menuButton('Armory', 'secondary', actions.onArmory), NAV_ICONS.armory);
    this.armoryTag = tagPill('', 'orange');
    this.armoryTag.setAttribute('aria-hidden', 'true');
    this.armory.append(this.armoryTag);
    const list = el('div', 'title-list');
    list.append(
      tutorial,
      withIcon(menuButton('Practice range', 'secondary', actions.onRange), NAV_ICONS.range),
      withIcon(menuButton('Loadout', 'secondary', actions.onLoadout), NAV_ICONS.loadout),
      this.armory,
      withIcon(menuButton('Settings', 'secondary', actions.onSettings), NAV_ICONS.settings),
    );
    actions_.append(this.hint, play, list);
    this.setTutorialDone(tutorialDone);

    const side = el('div', 'title-side');
    const tip = el('p', 'title-tip menu-card');
    tip.insertAdjacentHTML('afterbegin', MENU_ICONS.hand);
    const tips = TITLE_TEXT.tips;
    tip.append(el('span', 'sr-only', `${TITLE_TEXT.tip}: `), tips[Math.floor(Math.random() * tips.length)]!);
    const next = el('section', 'title-next menu-card');
    next.setAttribute('aria-label', TITLE_TEXT.nextMatch);
    const row = el('div', 'title-next-row');
    const frame = el('span', 'title-next-still');
    this.still = el('img');
    this.still.alt = '';
    this.still.decoding = 'async';
    frame.append(this.still);
    const words = el('div', 'title-next-words');
    this.next = { map: el('p', 'title-next-map'), mode: el('p', 'title-next-line'), rules: el('p', 'title-next-line') };
    words.append(this.next.map, this.next.mode, this.next.rules);
    row.append(frame, words);
    this.kit = new KitStrip(loadout, context);
    next.append(el('p', 'menu-kicker', TITLE_TEXT.nextMatch), row, el('p', 'menu-kicker', TITLE_TEXT.kit), this.kit.root);
    side.append(tip, next);

    const wallet = el('div', 'title-wallet');
    this.fc = el('span', 'menu-chip menu-chip-fc');
    this.tokens = el('span', 'menu-chip menu-chip-tokens');
    wallet.append(this.fc, this.tokens);

    this.warning = el('p', 'menu-title-warning');
    this.warning.setAttribute('role', 'alert');
    this.warning.hidden = true;
    // A slim banner with a warning sign (audit section 6, item 12); the text beside it is what's read out.
    this.warning.insertAdjacentHTML('afterbegin', WARNING_ICON);
    this.warningText = el('span');
    this.warning.append(this.warningText);

    this.hints = [
      { keys: ['Enter'], label: MENU_TEXT.hints.play, run: actions.onPlay, echo: true },
      { keys: ['T'], label: MENU_TEXT.hints.tutorial, run: actions.onTutorial, code: 'KeyT', echo: true },
      { keys: ['Esc'], label: MENU_TEXT.hints.settings, run: actions.onSettings, echo: true },
    ];
    const body = el('div', 'title-body');
    body.append(hero, actions_, side);
    this.root.append(wallet, this.warning, body, hintsBar(this.hints, MENU_TEXT.free));
  }

  /** A warning over the field, e.g. that the browser runs without hardware acceleration ('' hides it). */
  setWarning(text: string): void {
    this.warningText.textContent = text;
    this.warning.hidden = text === '';
  }

  /** A short message over the buttons ('' hides it). */
  showHint(text: string): void {
    setHint(this.hint, text);
  }

  /** Once the tutorial has been played through, it stops calling for new players. */
  setTutorialDone(done: boolean): void {
    this.tutorialTag.hidden = done;
  }

  /** The wallet, and the Armory's tag when Tokens wait to be spent (null: the Armory is off, and so is its button). */
  setWallet(wallet: { fc: number; tokens: number } | null): void {
    this.fc.hidden = this.tokens.hidden = wallet === null;
    this.armory.disabled = wallet === null;
    this.armory.title = wallet === null ? ARMORY_TEXT.off : '';
    this.armoryTag.hidden = !wallet || wallet.tokens === 0;
    if (!wallet) return;
    this.fc.textContent = MENU_TEXT.fc(wallet.fc);
    this.tokens.textContent = MENU_TEXT.tokens(wallet.tokens);
    this.armoryTag.textContent = TITLE_TEXT.tokensToSpend(wallet.tokens);
  }

  /** The next match as picked, and the kit carried. */
  setNext(next: NextMatch): void {
    if (next.still && this.still.getAttribute('src') !== next.still) this.still.src = next.still;
    this.next.map.textContent = next.mapLine;
    this.next.mode.textContent = next.modeLine;
    this.next.rules.textContent = next.rulesLine;
    this.kit.update();
  }
}
