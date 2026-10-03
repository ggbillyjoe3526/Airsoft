import type { OpticChoice } from '../config/optics';

/**
 * When an optic picked on the start screen is fitted. Optics go on before you walk on (roadmap M12b): before
 * the first match and on the result screen it is fitted at once; mid-match it waits for the next round, so a
 * round in progress is never changed (the same rule as the bot difficulty).
 */
export function opticTakesEffect(started: boolean, matchOver: boolean): 'now' | 'nextRound' {
  return started && !matchOver ? 'nextRound' : 'now';
}

/** The note shown with the optic picker: only while a picked optic waits for the next round. */
export function opticNote(picked: OpticChoice, fitted: OpticChoice, matchOver: boolean): string {
  return picked !== fitted && !matchOver ? 'Fitted from the next round.' : '';
}
