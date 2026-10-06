import { MENU_TEXT, PLAY_TEXT } from '../../config/menus';
import { mapStillFile, MODE_STILLS } from '../../config/menuArt';
import { DEFAULT_MODE, MATCH_MODES, type MatchMode } from '../../config/modes';
import type { LightingPresetId } from '../../config/render';
import { LIGHTING_LABELS, lightingChoices } from '../../map/lightingChoice';
import { COMING_MAPS, COMING_SOON_TAG, DEFAULT_MAP, MAPS, type MapId, mapData } from '../../map/maps';
import { modeOffered } from '../../map/playableMode';
import type { LoadoutModel } from '../../pool/loadoutModel';
import { hintsBar, menuArt, type MenuHint, sectionHead } from './chrome';
import { ChoiceCards } from './choiceCards';
import { MENU_ICONS, MODE_ICONS } from './icons';
import { KitStrip, type PictureContext } from './kitStrip';
import { type MatchModel, MatchPanel, type MatchShown } from './matchPanel';
import { el, hintLine, menuButton, setHint } from './menuParts';

/** The order a map's Day | Night switch lists its sides (M34d). */
const LIGHTING_ORDER: readonly LightingPresetId[] = ['day', 'night'];

/** What the Play screen changes beyond the Match section: the map, its light and the mode. */
export interface PlayModel extends MatchModel {
  lightingOf(id: MapId): LightingPresetId;
  setMap(id: MapId): void;
  setLight(id: MapId, light: LightingPresetId): void;
  setMode(mode: MatchMode): void;
  /** The line under Extraction for the supply event on now (M49), or null. */
  supply(): string | null;
}

/** What the Play screen shows of the match as it will play (the menus work it out from the picks). */
export interface PlayView extends MatchShown {
  /** "Depot · Day", and the still of that map in that light. */
  mapLine: string;
  still: string | null;
  modeLabel: string;
  /** "Skirmish · 3v3 · first to 5". */
  rules: string;
  /** "Normal bots", or "Hard / Normal bots". */
  bots: string;
  /** The rules and why the match won't count, if it won't (setupNotes). */
  notes: string;
  /** The Loadout's line: the replicas and what is fitted. */
  loadout: { replicas: string; detail: string };
  /** What the match pays, in a line. */
  pays: string;
}

export interface SetupActions {
  onLoadout: () => void;
  onBack: () => void;
  onPlay: () => void;
}

/**
 * The Play screen (New game, in the G3 look): the map as picture cards (Day | Night on a map that has both), the mode as
 * cards with their pictures, and the match's rules and bots, with "Your match" beside them: the map picked, the rules,
 * your kit and Play. Everything saves as it is picked.
 */
export class SetupScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly maps: ChoiceCards<MapId>;
  private readonly modes: ChoiceCards<MatchMode>;
  private readonly match: MatchPanel;
  private readonly still: HTMLImageElement;
  private readonly mapLine: HTMLHeadingElement;
  private readonly facts: { mode: HTMLElement; rules: HTMLElement; teams: HTMLElement };
  private readonly loadoutLine: HTMLParagraphElement;
  private readonly kit: KitStrip;
  private readonly rules: HTMLParagraphElement;
  private readonly pays: HTMLParagraphElement;
  private readonly hint = hintLine();

  constructor(
    private readonly model: PlayModel,
    loadout: LoadoutModel,
    context: PictureContext,
    actions: SetupActions,
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
    this.modes = new ChoiceCards(PLAY_TEXT.mode, MATCH_MODES, model.picks().mode, 'mode', (m) => model.setMode(m), {
      fallback: DEFAULT_MODE,
      devTag: MENU_TEXT.dev,
      picture: (id) => (MODE_STILLS[id] ? menuArt(MODE_STILLS[id]!.file) : null),
      icon: (id) => MODE_ICONS[id],
    });
    this.modes.root.classList.add('mode-cards');
    this.match = new MatchPanel(model);

    const main = el('div', 'play-main');
    const section = (n: string, title: string, body: HTMLElement, extra?: string): HTMLElement => {
      const s = el('section', 'play-section');
      s.append(sectionHead(n, title, extra), body);
      return s;
    };
    main.append(section('01', PLAY_TEXT.map, this.maps.root), section('02', PLAY_TEXT.mode, this.modes.root), section('03', PLAY_TEXT.match, this.match.root, PLAY_TEXT.matchNote));

    const aside = el('aside', 'play-aside menu-card');
    aside.setAttribute('aria-label', PLAY_TEXT.yourMatch);
    const frame = el('div', 'play-still brackets');
    this.still = el('img');
    this.still.alt = '';
    this.still.decoding = 'async';
    frame.append(this.still);
    this.mapLine = el('h2', 'play-map-line');
    const facts = el('dl', 'play-facts');
    const fact = (label: string): HTMLElement => {
      const dd = el('dd');
      facts.append(el('dt', 'menu-kicker', label), dd);
      return dd;
    };
    this.facts = { mode: fact(PLAY_TEXT.modeRow), rules: fact(PLAY_TEXT.rulesRow), teams: fact(PLAY_TEXT.teamsRow) };
    const loadoutHead = el('div', 'play-loadout-head');
    const change = menuButton(PLAY_TEXT.change, 'ghost', actions.onLoadout);
    change.setAttribute('aria-label', `${PLAY_TEXT.change} ${PLAY_TEXT.loadout}`);
    loadoutHead.append(el('p', 'menu-kicker', PLAY_TEXT.loadout), change);
    this.kit = new KitStrip(loadout, context);
    this.loadoutLine = el('p', 'play-loadout-line');
    this.rules = el('p', 'setup-rules');
    this.pays = el('p', 'play-pays');
    const play = menuButton(MENU_TEXT.hints.play, 'primary', actions.onPlay);
    play.classList.add('menu-button-big', 'play-button');
    play.insertAdjacentHTML('beforeend', MENU_ICONS.arrowRight);
    play.dataset.autofocus = '';
    aside.append(el('p', 'menu-kicker', PLAY_TEXT.yourMatch), frame, this.mapLine, facts, loadoutHead, this.kit.root, this.loadoutLine, this.rules, this.pays, this.hint, play);

    const layout = el('div', 'play-layout');
    layout.append(main, aside);
    this.hints = [
      { keys: ['Esc'], label: MENU_TEXT.hints.back, run: actions.onBack },
      { keys: ['Tab'], label: MENU_TEXT.hints.next },
    ];
    this.root.append(el('h1', 'menu-heading sr-only', PLAY_TEXT.heading), layout, hintsBar(this.hints, MENU_TEXT.free));
  }

  /** Shows the match as it will play. */
  refresh(view: PlayView): void {
    this.maps.setDevContent(view.devContent);
    this.modes.setDevContent(view.devContent);
    const offeredOn = mapData(this.maps.value);
    this.modes.limit((id) => modeOffered(offeredOn, id));
    this.maps.refresh();
    this.modes.refresh();
    this.match.refresh(view);
    if (view.still && this.still.getAttribute('src') !== view.still) this.still.src = view.still;
    this.mapLine.textContent = view.mapLine;
    this.facts.mode.textContent = view.modeLabel;
    this.facts.rules.textContent = view.rules;
    this.facts.teams.textContent = view.bots;
    // The kit's cards name the replicas; the line says what is fitted (or names them, with nothing to add).
    this.loadoutLine.textContent = view.loadout.detail || view.loadout.replicas;
    this.kit.update();
    this.rules.textContent = view.notes;
    this.pays.textContent = view.pays;
    this.pays.hidden = view.pays === '';
  }

  /** The line under Extraction for the supply event on now (M49): read as the screen opens. */
  opened(): void {
    this.modes.setNote('extraction', this.model.supply());
  }

  showHint(text: string): void {
    setHint(this.hint, text);
  }
}
