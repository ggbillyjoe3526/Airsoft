import { beforeAll, describe, expect, it } from 'vitest';
import { ALLOWED_STRONGER, CONTENT_BALANCE_BAND, CONTENT_BALANCE_RUN } from '../../config/contentRules';
import { botConfig, DIFFICULTIES } from '../../config/bots';
import { MATCH_MODES, unknownMode } from '../../config/modes';
import { ROUNDS } from '../../config/hits';
import { playMatch } from '../../ai/depotMatchSupport';
import { playRun } from '../../ai/extractionRunSupport';
import { type BalanceMeasure, reportMeasure, share } from '../../ai/balance/balanceSupport';
import { lightingChoices, mapUnderLighting } from '../../map/lightingChoice';
import { mapData, MAPS } from '../../map/maps';
import { playableMode } from '../../map/playableMode';
import { initPhysics } from '../../physics/physicsWorld';
import { kittedCharacter } from '../../pool/botKit';
import { GAME_POOL } from '../../pool/gamePool';
import { kitSlot, type ReplicaFit } from '../../pool/kit';
import { type Asset, fits } from '../../pool/pool';
import type { Character } from '../../sim/character';
import { gameInputs } from '../gameContent';
import { siteClassOf } from '../replicaChecks';
import { asItComesFit, slotOf } from '../kits';
import { contentItem, ENV, envNumber } from './reportSupport';

/**
 * The content report's balance run (CT1, level 4): headless bot matches (ai/depotMatchSupport.ts playMatch) where one
 * team carries the item and the other the same kit without it, on every map AIRSOFT_CONTENT_MAP names (all of them when
 * unset), each lighting it offers, each mode it hosts and every level. Extraction (CT3) plays whole runs
 * (ai/extractionRunSupport.ts playRun): the squad with the item, then with the rival kit, seed for seed. A replica plays
 * against each ordinary public replica of its class (an item allowed stronger is no rival); a part plays on each public replica it
 * fits, against that replica as it comes. The figures go to the report as balance measures (pipeline/balanceReport.mjs judges them): on
 * public maps, modes and levels they hold the owner's band (decision 1 of the plan: 40 to 60 %), on dev ones they are
 * information (decision 5), and an item allowed stronger is shown, never judged.
 */

/** Who carries what: a loadout of one kitted replica per team (bots use their primary). */
interface Side {
  name: string;
  item: Asset;
  fit: ReplicaFit;
}

function sideCharacter(side: Side, id: number, team: number): Character {
  const slot = kitSlot(GAME_POOL, { asset: side.item.id }, side.fit);
  return kittedCharacter(id, team, [slot]);
}

/** The pairings the item plays: its side against a rival side, and whether its figures are judged. */
function pairings(item: Asset): { ours: Side; theirs: Side; judged: boolean; against: string }[] {
  const inputs = gameInputs();
  if (item.category === 'replica') {
    const cls = siteClassOf(inputs, item);
    const rivals = GAME_POOL.assets.filter((a) => a.category === 'replica' && a.id !== item.id && a.tag === 'public' && !ALLOWED_STRONGER[a.id] && siteClassOf(inputs, a) === cls);
    const ours: Side = { name: item.name, item, fit: asItComesFit(GAME_POOL, item) };
    return rivals.map((r) => ({ ours, theirs: { name: r.name, item: r, fit: asItComesFit(GAME_POOL, r) }, judged: !ALLOWED_STRONGER[item.id], against: `the ${r.name}` }));
  }
  const slot = slotOf(item);
  if (!slot) return [];
  return GAME_POOL.assets
    .filter((a) => a.category === 'replica' && a.tag === 'public' && fits(item, a))
    .map((r) => {
      const base = asItComesFit(GAME_POOL, r);
      const fit = { ...base, [slot]: { asset: item.id } };
      return { ours: { name: `${r.name} with the ${item.name}`, item: r, fit }, theirs: { name: `${r.name} without it`, item: r, fit: base }, judged: !ALLOWED_STRONGER[item.id], against: `the ${r.name} without it` };
    });
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const item = contentItem(GAME_POOL);
const seeds = envNumber('AIRSOFT_CONTENT_SEEDS', CONTENT_BALANCE_RUN.seeds);
const seconds = envNumber('AIRSOFT_CONTENT_SECONDS', CONTENT_BALANCE_RUN.seconds);
const maps = MAPS.filter((m) => !ENV.AIRSOFT_CONTENT_MAP || m.id === ENV.AIRSOFT_CONTENT_MAP);

describe('content report: the balance run', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('names an item', () => {
    expect(item, `no pool item is called "${ENV.AIRSOFT_CONTENT_ITEM}"`).toBeTruthy();
  });

  for (const pair of item ? pairings(item) : []) {
    for (const entry of maps) {
      const data = mapData(entry.id);
      for (const lighting of lightingChoices(data)) {
        const map = mapUnderLighting(data, lighting);
        const where = lightingChoices(data).length > 1 ? `${entry.label} (${lighting})` : entry.label;
        for (const mode of MATCH_MODES.filter((m) => playableMode(data, m.id) === m.id)) {
          for (const level of DIFFICULTIES) {
            const judged = pair.judged && entry.tag === 'public' && mode.tag === 'public' && level.tag === 'public';
            const shown = judged ? '' : `; ${pair.judged ? 'dev content: shown, not judged' : 'allowed stronger: shown, not judged'}`;
            switch (mode.id) {
              case 'elimination':
              case 'attackDefend':
                break;
              case 'extraction':
                // A run (CT3): the squad carries the item, then the rival kit, over the same seeds; of the seeds where
                // only one of the two got out, the item's share holds the band as a round mode's decided rounds do.
                it(`plays ${pair.ours.name} against ${pair.theirs.name} on ${where}, ${mode.label}, ${level.label}: whole runs`, { timeout: 1_800_000 }, (ctx) => {
                  const squad = (side: Side) => (id: number, team: number) => (team === 0 ? sideCharacter(side, id, team) : undefined);
                  let ours = 0;
                  let theirs = 0;
                  let both = 0;
                  for (let seed = 1; seed <= seeds; seed++) {
                    const a = playRun({ seed, map, opponents: level.id, teammates: 'normal', carry: squad(pair.ours) }).reason === 'extracted';
                    const b = playRun({ seed, map, opponents: level.id, teammates: 'normal', carry: squad(pair.theirs) }).reason === 'extracted';
                    if (a && b) both++;
                    else if (a) ours++;
                    else if (b) theirs++;
                  }
                  reportMeasure(ctx, {
                    label: `${where}, ${mode.label}, ${level.label}: ${pair.ours.name}, share of the runs only one kit got out of, against ${pair.against}`,
                    value: share(ours, ours + theirs),
                    of: ours + theirs,
                    band: judged ? CONTENT_BALANCE_BAND : {},
                    detail: `out with it alone ${ours}, with ${pair.against} alone ${theirs}, both ${both}, of ${seeds} seeds${shown}`,
                  });
                });
                continue;
              default:
                unknownMode(mode.id);
            }
            it(`plays ${pair.ours.name} against ${pair.theirs.name} on ${where}, ${mode.label}, ${level.label}`, { timeout: 1_800_000 }, (ctx) => {
              const teamSize = entry.teamSize.standard;
              let decided = 0;
              let won = 0;
              let onTime = 0;
              let rounds = 0;
              const hitDistances: number[][] = [[], []];
              for (let seed = 1; seed <= seeds; seed++) {
                const stats = playMatch(seconds, seed, undefined, botConfig(level.id), mode.id, ROUNDS, map, teamSize, undefined, (state) => {
                  for (const e of state.events) {
                    if (e.type !== 'characterHit') continue;
                    const s = state.characters.find((c) => c.id === e.shooterId);
                    const v = state.characters.find((c) => c.id === e.victimId);
                    if (s && v && s.team !== v.team) hitDistances[s.team]!.push(Math.hypot(s.position.x - v.position.x, s.position.z - v.position.z));
                  }
                }, (id, team) => sideCharacter(team === 0 ? pair.ours : pair.theirs, id, team));
                for (const r of stats.results) {
                  rounds++;
                  if (r.reason === 'time') onTime++;
                  if (r.winner < 0) continue;
                  decided++;
                  if (r.winner === 0) won++;
                }
              }
              const label = `${where}, ${mode.label}, ${level.label}: ${pair.ours.name}`;
              const measure: BalanceMeasure = {
                label: `${label}, share of decided rounds against ${pair.against}`,
                value: share(won, decided),
                of: decided,
                band: judged ? CONTENT_BALANCE_BAND : {},
                detail: `${won} of ${decided} decided, ${rounds - onTime} of ${rounds} ended before time, ${seeds} seeds × ${seconds} s${shown}`,
              };
              reportMeasure(ctx, measure);
              const [ours, theirs] = hitDistances as [number[], number[]];
              reportMeasure(ctx, {
                label: `${label}: hits it landed for each hit ${pair.against} landed`,
                value: theirs.length > 0 ? ours.length / theirs.length : Number.NaN,
                band: judged ? { min: 0.5 } : {},
                unit: '×',
                detail: `${ours.length} against ${theirs.length}; median distance ${median(ours).toFixed(1)} m against ${median(theirs).toFixed(1)} m`,
              });
            });
          }
        }
      }
    }
  }
});

