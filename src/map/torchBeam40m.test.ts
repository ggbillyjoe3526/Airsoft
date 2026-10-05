// M33h QA: a target 40 m (across the ground) down a lit beam is lit, as perception measures range on the flat.
import { expect, it } from 'vitest';
import { BOTS, NIGHT_SIGHT } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { visiblePart } from '../ai/perception';
import { fitParts } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { buildNightField } from './nightSight';
import { createTorchLight, updateTorchLight } from './torchLight';

it('sees a target 40 m away standing in the viewer\'s own lit beam', () => {
  const night = buildNightField({ ...OPEN_FIELD, night: true }, NIGHT_SIGHT)!;
  const viewer = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  fitParts(viewer.armament, viewer.armament.parts.map((p) => ({ ...p, light: 'weaponTorch' as const })));
  viewer.torchOn = true;
  const target = createCharacter(1, vec3(0, 0, -40), 0, LOADOUT, 1);
  const torches = createTorchLight();
  updateTorchLight(torches, [viewer, target], { raycastStatic: () => -1 }, BODY, HITS, BOTS.aimHeightFraction, 1);
  expect(torches.lit[1]).toBe(1); // fails: 0
  expect(visiblePart(viewer, target, { raycastStatic: () => -1 }, BOTS, BODY, HITS, { foliage: [], night, torches })).toBeGreaterThan(0);
});
