import { describe, expect, it } from 'vitest';
import budget from '../../pipeline/perf-budget.json';
import { AREA_NAME_MAX_LENGTH } from '../map/areas';
import { DEPOT } from '../map/depot';
import { MAPS, mapData } from '../map/maps';
import type { MapArea, MapData } from '../map/mapTypes';
import type { CheckResult } from './checks';
import { gameMapContext, mapRules } from './mapChecks';

/** CL1 criterion 1: the content rule map.areas. */
const ctx = gameMapContext(MAPS.map((m) => m.id));
const entry = { ...MAPS.find((m) => m.id === 'depot')!, tag: 'dev' as const };
const verdict = (areas: readonly MapArea[] | undefined): CheckResult | undefined => mapRules(entry, { ...DEPOT, areas } as MapData, ctx).find((r) => r.check === 'map.areas');
/** One area over the whole of Depot, to be broken by a test. */
const WHOLE: MapArea = { name: 'Everywhere', box: [-1000, 1000, -1000, 1000] };
void budget;

describe('map.areas', () => {
  it('passes a map whose areas cover every walkable spot', () => {
    expect(verdict([WHOLE])?.verdict).toBe('pass');
  });

  it('passes the shipped Depot, Woodland and Neon Heights', () => {
    for (const m of MAPS.filter((x) => ['depot', 'woodland', 'neon'].some((id) => x.id.startsWith(id)))) {
      const r = mapRules(m, mapData(m.id), ctx).find((x) => x.check === 'map.areas');
      expect(r?.verdict, `${m.id}: ${r?.says}`).toBe('pass');
    }
  });

  it('fails a walkable spot in no area (a box covering only a corner)', () => {
    const r = verdict([{ name: 'Corner', box: [0, 1, 0, 1] }]);
    expect(r?.verdict).toBe('fail');
    expect(r?.says).toMatch(/no named area/);
  });

  it('fails an empty name and a name over the length limit', () => {
    expect(verdict([{ ...WHOLE, name: '  ' }])?.verdict).toBe('fail');
    expect(verdict([{ ...WHOLE, name: 'x'.repeat(AREA_NAME_MAX_LENGTH + 1) }])?.verdict).toBe('fail');
    expect(verdict([{ ...WHOLE, name: 'x'.repeat(AREA_NAME_MAX_LENGTH) }])?.verdict).toBe('pass');
  });

  it('fails a box the wrong way round and a floor band the wrong way round', () => {
    expect(verdict([{ ...WHOLE, box: [5, -5, -1000, 1000] }])?.verdict).toBe('fail');
    expect(verdict([{ ...WHOLE, box: [-1000, 1000, 5, -5] }])?.verdict).toBe('fail');
    expect(verdict([{ ...WHOLE, floor: [4, 1] }])?.verdict).toBe('fail');
  });

  it('warns a name nobody can stand in (shadowed by the area before it), and a map with no areas', () => {
    expect(verdict([WHOLE, { name: 'Hidden', box: [0, 5, 0, 5] }])?.verdict).toBe('warn');
    expect(verdict(undefined)?.verdict).toBe('warn');
  });
});
