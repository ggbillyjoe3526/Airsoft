import { availableChoice, type Tagged } from '../config/content';
import { MAPS, type MapId, mapLoaded } from './maps';

/** Where Practice is played (M94, playtest note 11): the range, or one of the maps. */
export type PracticePlaceId = 'range' | MapId;

/** Practice opens on the range until another place is picked. */
export const DEFAULT_PRACTICE_PLACE: PracticePlaceId = 'range';

/** One place on the Match screen's Map cards while Practice is picked. */
export interface PracticePlace extends Tagged {
  id: PracticePlaceId;
  label: string;
  blurb: string;
}

/**
 * The places Practice offers, as the Match screen lists them: the range first, then every map in MAPS' order, with its
 * tag (a dev map only while Dev content is on, M35).
 */
export const PRACTICE_PLACES: readonly PracticePlace[] = [
  { id: 'range', label: 'Range', blurb: 'Steel and figures at marked distances.', tag: 'public' },
  ...MAPS.map((m) => ({ id: m.id, label: m.label, blurb: m.blurb, tag: m.tag })),
];

/**
 * The map Practice plays for the pick `id`, or null for the range: a dev map plays as the range while Dev content is off
 * (the pick stays saved), and so does one whose data hasn't arrived yet (M50, map/maps.ts loadDevMaps).
 */
export function practiceMapId(id: PracticePlaceId, devContent: boolean): MapId | null {
  const place = availableChoice(PRACTICE_PLACES, id, devContent, DEFAULT_PRACTICE_PLACE);
  return place !== 'range' && mapLoaded(place) ? place : null;
}
