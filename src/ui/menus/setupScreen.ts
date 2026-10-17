import { MENU_TEXT, PLAY_TEXT } from '../../config/menus';
import { mapStillFile } from '../../config/menuArt';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from '../../config/modes';
import type { LightingPresetId } from '../../config/render';
import { LIGHTING_LABELS, lightingChoices } from '../../map/lightingChoice';
import { COMING_MAPS, COMING_SOON_TAG, DEFAULT_MAP, MAPS, type MapId, mapData, mapLoaded } from '../../map/maps';
import { modeOffered } from '../../map/playableMode';
import { DEFAULT_PRACTICE_PLACE, PRACTICE_PLACES, type PracticePlaceId } from '../../map/practicePlaces';
import type { LoadoutModel } from '../../pool/loadoutModel';
import type { SavedLoadouts } from '../../pool/savedLoadouts';
import { menuArt, type MenuHint, sectionHead } from './chrome';
import { ChoiceCards } from './choiceCards';
import { MENU_ICONS, MODE_ICONS } from './icons';
import { KitStrip, type PictureContext } from './kitStrip';
import { LoadoutPicker } from './loadoutPicker';
import { type MatchModel, MatchPanel, type MatchShown } from './matchPanel';
import { el, hintLine, menuButton, setHint } from './menuParts';

/** The order a map's Day | Night switch lists its sides (M34d). */
const LIGHTING_ORDER: readonly LightingPresetId[] = ['day', 'night'];

/** What the Play screen changes beyond the Match section: the map, its light and the mode. */
export interface PlayModel extends MatchModel {
  lightingOf(id: MapId): LightingPresetId;
  setMap(id: MapId): void;
  /** Where Practice is played (M94): the range or a map, picked on the Map cards while Practice is the mode. */
  practicePlace(): PracticePlaceId;
  setPracticePlace(id: PracticePlaceId): void;
  setLight(id: MapId, light: LightingPresetId): void;
  setMode(mode: MatchMode): void;
}

/** What the Play screen shows of the match as it will play (the menus work it out from the picks). */
export interface PlayView extends MatchShown {
  /** "Depot · Day". */
  mapLine: string;
  modeLabel: string;
  /** "Skirmish · 3v3 · first to 5". */
  rules: string;
  /** Your team and the bots: "Alpha · Normal bots", or "Beta · Hard / Normal bots" (an Extraction run: the bots only). */
  bots: string;
  /** The rules and why the match won't count, if it won't (setupNotes). */
  notes: string;
  /** The Loadout's line: the replicas and what is fitted. */
  loadout: { replicas: string; detail: string };
  /** What the match pays, in a line. */
  pays: string;
  /** Practice's place as it will play (M94): "Range" or "Depot · Day". */
  practice: { mapLine: string };
}

export interface SetupActions {
  onLoadout: () => void;
  onBack: () => void;
  /** Start match: the match as picked. */
  onPlay: () => void;
  /** Start practice: the Practice mode (the last card) is picked, so the same button opens the range instead. */
  onPractice: () => void;
}

/**
 * The Match screen (New game, in the G3 look; M100: Play renamed Match): the map as picture cards (Day | Night on a map
 * that has both), the mode as text cards with their signs (MR1: no pictures; only the modes the map hosts), Practice the
 * last of them, and the match's rules and bots, with "Your match" beside them: the map picked (named, not pictured: the
 * map cards show it, MR1), the rules, your kit and Start match. Everything saves as it is picked
 * except Practice, which is not a match: picked, the Map cards offer the range and every map (M94; its own pick, so the
 * match's map stays as it was), the rules go (Practice has none) and the button reads Start practice.
 */
export class SetupScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly maps: ChoiceCards<MapId>;
  /** The Map cards while Practice is picked (M94): the range, then the maps. */
  private readonly places: ChoiceCards<PracticePlaceId>;
  private readonly modes: ChoiceCards<MatchMode>;
  private readonly match: MatchPanel;
  private readonly mapLine: HTMLHeadingElement;
  private readonly facts: { mode: HTMLElement; rules: HTMLElement; teams: HTMLElement };
  private readonly loadoutLine: HTMLParagraphElement;
  private readonly kit: KitStrip;
  /** The pick of a saved loadout beside Change (SL1); none when the screen is given no saved loadouts (a test). */
  private readonly picker: LoadoutPicker | null;
  private readonly rules: HTMLParagraphElement;
  private readonly pays: HTMLParagraphElement;
  private readonly start: HTMLButtonElement;
  private readonly sections: { map: HTMLElement; rules: HTMLElement };
  private readonly startLabel = el('span', '', MENU_TEXT.hints.startMatch);
  private readonly hint = hintLine();
  /** Practice, the last mode card, is the pick (not saved: the saved mode stays as it was). */
  private practice = false;
  /** The last view drawn: leaving Practice for the saved mode redraws "Your match" from it. */
  private view: PlayView | null = null;

  constructor(
    model: PlayModel,
    loadout: LoadoutModel,
    context: PictureContext,
    actions: SetupActions,
    saved?: { loadouts: SavedLoadouts; onPick: () => void },
  ) {
    this.root = el('div', 'menu-screen menu-page menu-setup menu-hub');
    this.root.hidden = true;
    this.maps = new ChoiceCards(PLAY_TEXT.map, MAPS, model.picks().map, 'map', (m) => model.setMap(m), {
      soon: COMING_MAPS,
      soonTag: COMING_SOON_TAG,
      fallback: DEFAULT_MAP,
      devTag: MENU_TEXT.dev,
      picture: (id) => {
        const file = mapStillFile(id, model.lightingOf(id));
        return file ? menuArt(file) : null;
      },
      // A map played in one light only says so when it is night (M33: Woodland).
      sideTag: (id) => {
        const choices = lightingChoices(mapData(id));
        return choices.length === 1 && choices[0] === 'night' ? PLAY_TEXT.night : '';
      },
      // Day | Night on a map that offers both (M34d): picking a side picks the map with that light.
      variants: {
        label: PLAY_TEXT.light,
        of: (id) => LIGHTING_ORDER.filter((l) => lightingChoices(mapData(id)).includes(l)).map((l) => ({ id: l, label: LIGHTING_LABELS[l] })),
        picked: (id) => model.lightingOf(id),
        onPick: (id, light) => model.setLight(id, light as LightingPresetId),
      },
    });
    this.maps.root.classList.add('map-cards');
    // Practice's places (M94): the range (its still, or the Practice drawing) and every map, each in its picked light.
    this.places = new ChoiceCards(PLAY_TEXT.map, PRACTICE_PLACES, model.practicePlace(), 'practicePlace', (p) => model.setPracticePlace(p), {
      fallback: DEFAULT_PRACTICE_PLACE,
      devTag: MENU_TEXT.dev,
      picture: (id) => {
        const file = id === 'range' ? mapStillFile(id, 'day') : mapStillFile(id, model.lightingOf(id));
        return file ? menuArt(file) : null;
      },
      sideTag: (id) => {
        if (id === 'range' || !mapLoaded(id)) return '';
        const choices = lightingChoices(mapData(id));
        return choices.length === 1 && choices[0] === 'night' ? PLAY_TEXT.night : '';
      },
      variants: {
        label: PLAY_TEXT.light,
        of: (id) => (id === 'range' || !mapLoaded(id) ? [] : LIGHTING_ORDER.filter((l) => lightingChoices(mapData(id)).includes(l)).map((l) => ({ id: l, label: LIGHTING_LABELS[l] }))),
        picked: (id) => (id === 'range' ? 'day' : model.lightingOf(id)),
        onPick: (id, light) => {
          if (id !== 'range') model.setLight(id, light as LightingPresetId);
        },
      },
    });
    this.places.root.classList.add('practice-places');
    this.places.root.hidden = true;
    this.modes = new ChoiceCards(PLAY_TEXT.mode, MATCH_MODES, model.picks().mode, 'mode', (m) => model.setMode(m), {
      fallback: DEFAULT_MODE,
      devTag: MENU_TEXT.dev,
      icon: (id) => MODE_ICONS[id],
      extra: { label: PLAY_TEXT.practice.label, blurb: PLAY_TEXT.practice.blurb, icon: MODE_ICONS.practice, onToggle: (on) => this.setPractice(on) },
    });
    this.modes.root.classList.add('mode-cards');
    this.match = new MatchPanel(model);

    const main = el('div', 'play-main menu-scroll');
    const section = (n: string, title: string, body: HTMLElement, extra?: string): HTMLElement => {
      const s = el('section', 'play-section');
      s.append(sectionHead(n, title, extra), body);
      return s;
    };
    const mapCards = el('div', 'play-map-choice');
    mapCards.append(this.maps.root, this.places.root);
    this.sections = {
      map: section('01', PLAY_TEXT.map, mapCards),
      rules: section('03', PLAY_TEXT.match, this.match.root),
    };
    main.append(this.sections.map, section('02', PLAY_TEXT.mode, this.modes.root), this.sections.rules);

    const aside = el('aside', 'play-aside menu-card');
    aside.setAttribute('aria-label', PLAY_TEXT.yourMatch);
    this.mapLine = el('h2', 'play-map-line');
    // The facts (MR1, the approved concept): the mode under the map, the rules as chips, then the teams and their bots.
    const facts = el('div', 'play-facts');
    const fact = (tag: 'p' | 'div', cls: string, label: string): HTMLElement => {
      const node = el(tag, cls);
      node.setAttribute('aria-label', label);
      facts.append(node);
      return node;
    };
    this.facts = {
      mode: fact('p', 'play-mode-line', PLAY_TEXT.modeRow),
      rules: fact('div', 'play-chips', PLAY_TEXT.rulesRow),
      teams: fact('p', 'play-teams', PLAY_TEXT.teamsRow),
    };
    const loadoutHead = el('div', 'play-loadout-head');
    const change = menuButton(PLAY_TEXT.change, 'ghost', actions.onLoadout);
    change.setAttribute('aria-label', `${PLAY_TEXT.change} ${PLAY_TEXT.loadout}`);
    this.picker = saved ? new LoadoutPicker(saved.loadouts, saved.onPick, actions.onLoadout) : null;
    loadoutHead.append(el('p', 'menu-kicker', PLAY_TEXT.loadout), change);
    this.kit = new KitStrip(loadout, context);
    this.loadoutLine = el('p', 'play-loadout-line');
    this.rules = el('p', 'setup-rules');
    this.pays = el('p', 'play-pays');
    this.start = menuButton('', 'primary', () => (this.practice ? actions.onPractice() : actions.onPlay()));
    this.start.classList.add('menu-button-big', 'play-button');
    this.start.append(this.startLabel);
    this.start.insertAdjacentHTML('beforeend', MENU_ICONS.arrowRight);
    this.start.dataset.autofocus = '';
    aside.append(el('p', 'menu-kicker', PLAY_TEXT.yourMatch), this.mapLine, facts, loadoutHead, ...(this.picker ? [this.picker.root] : []), this.kit.root, this.loadoutLine, this.rules, this.pays, this.hint, this.start);

    const layout = el('div', 'play-layout');
    layout.append(main, aside);
    // Esc is Back (the top bar's wordmark does it for the mouse).
    this.hints = [{ keys: ['Esc'], label: MENU_TEXT.hints.back, run: actions.onBack }];
    this.root.append(el('h1', 'menu-heading sr-only', PLAY_TEXT.heading), layout);
    if (this.picker) this.root.append(this.picker.menu.root);
  }

  /**
   * Practice picked (true) or another mode (false): the Map cards become Practice's places (M94), the rules go, the
   * button and the summary follow.
   */
  private setPractice(on: boolean): void {
    this.practice = on;
    this.root.classList.toggle('is-practice', on);
    this.maps.root.hidden = on;
    this.places.root.hidden = !on;
    this.sections.rules.hidden = on;
    this.startLabel.textContent = on ? MENU_TEXT.hints.startPractice : MENU_TEXT.hints.startMatch;
    // Leaving the range for the saved mode is not a change the model reports (so no refresh follows): draw "Your match" again.
    if (!on && this.view) this.showMatch(this.view);
    this.showPracticeFacts();
  }

  private showPracticeFacts(): void {
    const on = this.practice;
    this.rules.hidden = on || this.rules.textContent === '';
    if (!on) return;
    this.mapLine.textContent = this.view?.practice.mapLine ?? PLAY_TEXT.practice.mapLine;
    this.facts.mode.textContent = PLAY_TEXT.practice.label;
    this.showChips(PLAY_TEXT.practice.rules);
    this.facts.teams.textContent = PLAY_TEXT.practice.teams;
    this.pays.hidden = true;
  }

  /** Shows the match as it will play. */
  refresh(view: PlayView): void {
    this.maps.setDevContent(view.devContent);
    this.places.setDevContent(view.devContent);
    this.modes.setDevContent(view.devContent);
    const offeredOn = mapData(this.maps.value);
    this.modes.limit((id) => modeOffered(offeredOn, id));
    this.maps.refresh();
    this.places.refresh();
    this.modes.refresh();
    this.match.refresh(view);
    this.view = view;
    this.showMatch(view);
  }

  /** "Your match": the map, the facts, the kit and the pays line, from the last view (the range's own facts replace them while Practice is picked). */
  private showMatch(view: PlayView): void {
    this.mapLine.textContent = view.mapLine;
    this.facts.mode.textContent = view.modeLabel;
    this.showChips(view.rules);
    this.facts.teams.textContent = view.bots;
    // The kit's cards name the replicas; the line says what is fitted (or names them, with nothing to add).
    this.loadoutLine.textContent = view.loadout.detail || view.loadout.replicas;
    this.kit.update();
    this.picker?.update();
    this.rules.textContent = view.notes;
    this.pays.textContent = view.pays;
    this.pays.hidden = view.pays === '';
    this.showPracticeFacts();
  }

  /** The rules line ("Skirmish · 3v3 · first to 5") as chips, the ruleset's first; rebuilt only when it changes. */
  private showChips(line: string): void {
    const chips = this.facts.rules;
    if (chips.dataset.line === line) return;
    chips.dataset.line = line;
    chips.replaceChildren(...line.split(' · ').map((part) => el('span', 'play-chip', part)));
  }

  showHint(text: string): void {
    setHint(this.hint, text);
  }
}
