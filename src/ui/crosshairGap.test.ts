import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { DEFAULT_CROSSHAIR } from '../config/matchInfo';
import { HUD } from '../config/renderView';
import { AEG, LOADOUT } from '../config/replicas';
import { createArmament, spreadDirection } from '../sim/armament';
import { vec3 } from '../sim/vec';
import { FakeElement } from './testSupport';
import { Hud } from './hud';

/**
 * The crosshair gap's wiring (KNOWN_ISSUES: "No test checks the crosshair gap maths' wiring"): the gap the HUD draws
 * follows the spread the shot uses. The chain is sim `spreadDirection` (replica spreadDeg × the shooter's spreadScale)
 * → combatPresentation's pixels at the screen's centre (tan × focal length, pinned at the source below, as the class
 * needs a WebGL renderer) → `Hud.update` → `crosshairGap` → the `--gap` property on the crosshair element.
 */

/** A page element for the HUD that keeps what is set with style.setProperty (the crosshair's --gap). */
class GapElement extends FakeElement {
  private readonly found = new Map<string, GapElement>();
  firstElementChild: GapElement | null = null;
  constructor(tag: string) {
    super(tag);
  }
  replaceChildren(...nodes: GapElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }
  querySelector(selector: string): GapElement {
    let el = this.found.get(selector);
    if (!el) {
      el = new GapElement('div');
      if (selector === '.hud-reload') el.firstElementChild = new GapElement('div');
      this.found.set(selector, el);
    }
    return el;
  }
  querySelectorAll(): GapElement[] {
    return Array.from({ length: this.innerHTML.split('<i>').length - 1 }, () => {
      const gauge = new GapElement('i');
      gauge.firstElementChild = new GapElement('b');
      return gauge;
    });
  }
}

const SCREEN_HEIGHT = 720;
const FOV_DEG = 75;
const focalPx = SCREEN_HEIGHT / 2 / Math.tan((FOV_DEG * Math.PI) / 360);
const DEG = Math.PI / 180;

/** The shot's one-sigma deviation off the aim, as the sim throws it (spreadDirection with one standard deviation sideways). */
function shotSigma(spreadScale: number): number {
  const aim = vec3();
  const shot = spreadDirection(vec3(), 0, 0, AEG.spreadDeg * spreadScale * DEG, 1, 0);
  spreadDirection(aim, 0, 0, 0, 0, 0);
  return Math.acos(shot.x * aim.x + shot.y * aim.y + shot.z * aim.z);
}

describe('the crosshair gap follows the spread the shot uses', () => {
  let crosshair: GapElement;
  let hud: Hud;
  const armament = createArmament(LOADOUT);
  const gapAfter = (spreadPx: number): number => {
    hud.update(armament, LOADOUT, true, spreadPx, null, 1 / 60);
    return parseFloat(crosshair.style['--gap']!);
  };

  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new GapElement(tag) });
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const parent = new GapElement('div');
    hud = new Hud(parent as unknown as HTMLElement, () => 'R', { ...DEFAULT_CROSSHAIR, gap: 2, dynamic: 'on' });
    crosshair = (parent.children[0] as GapElement).children[0] as GapElement;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** What the HUD should draw for a shot spread of one sigma `sigma` (rad): HUD.crosshairSpreadSigmas of it, in steps. */
  const expectedGap = (sigma: number, minGap = 2): number => Math.round(Math.max(minGap, HUD.crosshairSpreadSigmas * Math.tan(sigma) * focalPx) / HUD.crosshairGapStep) * HUD.crosshairGapStep;

  it('draws the gap for the shot\'s own deviation: the spread the sim throws, in pixels, times the sigmas it covers', () => {
    for (const scale of [MOVEMENT.accuracy.steady, 1, MOVEMENT.accuracy.walk, MOVEMENT.accuracy.sprint]) {
      const sigma = shotSigma(scale);
      expect(sigma).toBeCloseTo(AEG.spreadDeg * scale * DEG, 9);
      expect(gapAfter(Math.tan(sigma) * focalPx), `spread scale ${scale}`).toBe(expectedGap(sigma));
    }
  });

  it('opens wider for a shakier shooter (running) than for a steady one, from the same replica', () => {
    const steady = gapAfter(Math.tan(shotSigma(MOVEMENT.accuracy.steady)) * focalPx);
    const running = gapAfter(Math.tan(shotSigma(MOVEMENT.accuracy.sprint)) * focalPx);
    expect(running).toBeGreaterThan(steady);
  });

  it('keeps the player\'s own gap for a spread tighter than it, and holds still when the crosshair is not dynamic', () => {
    expect(gapAfter(0)).toBe(2);
    const parent = new GapElement('div');
    const still = new Hud(parent as unknown as HTMLElement, () => 'R', { ...DEFAULT_CROSSHAIR, gap: 3, dynamic: 'off' });
    const el = (parent.children[0] as GapElement).children[0] as GapElement;
    still.update(armament, LOADOUT, true, 40, null, 1 / 60);
    expect(parseFloat(el.style['--gap']!)).toBe(3);
  });

  it('is pinned at the source: the pixels given to the HUD come from the same replica spread × the shooter\'s scale the sim uses', async () => {
    const files = import.meta.glob<string>(['../render/match/combatPresentation.ts', '../sim/armament.ts', '../sim/simulation.ts'], { query: '?raw', import: 'default', eager: true });
    const combat = files['../render/match/combatPresentation.ts']!;
    expect(combat).toMatch(/degToRad\(p\.armament\.replicas\[p\.armament\.active\]!\.spreadDeg \* p\.spreadScale\)/);
    expect(combat).toMatch(/focalPx = this\.renderer\.height \/ 2 \/ Math\.tan\(THREE\.MathUtils\.degToRad\(cam\.fov\) \/ 2\)/);
    expect(combat).toMatch(/this\.hud\.update\([^;]*Math\.tan\(spread\) \* focalPx/);
    // The shot: the same two factors, the scale being the character's own.
    expect(files['../sim/armament.ts']).toMatch(/replica\.spreadDeg \* muzzle\.spreadScale \* DEG/);
    expect(files['../sim/simulation.ts']).toMatch(/m\.spreadScale = c\.spreadScale/);
  });
});
