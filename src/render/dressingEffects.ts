import * as THREE from 'three';
import { KICKED_DUST, kickedDustShown, skylineShown } from '../config/dressing';
import type { QualitySettings } from '../config/render';
import type { MapDressing } from '../map/mapTypes';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { ImpactPuffs } from './impactPuffs';
import { SmokePlumes } from './smokePlumes';
import { smokingChimneys } from './skyline';

/**
 * A map's moving dressing (G8): its chimneys' smoke (Trees: Detailed, one instanced draw while in view) and the dust
 * sprinting and landing feet kick up (Impact grit, one instanced draw while any is in the air), both pooled with fixed
 * buffers. Each is made the first time its setting is on, and only for a map whose dressing has it, so Low (and a map
 * without dressing) adds nothing to the scene. Under Reduced motion the smoke stands still and no dust is kicked up.
 */
export class DressingEffects {
  private smoke: SmokePlumes | null = null;
  private dust: ImpactPuffs | null = null;
  private dustOn = false;
  private motion = true;
  private night = false;
  private readonly dustTint = new THREE.Color();
  private readonly dustAt = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly dressing: MapDressing | undefined,
  ) {
    if (dressing?.kickedDust) this.dustTint.setHex(dressing.kickedDust.tint);
  }

  setQuality(q: Pick<QualitySettings, 'trees' | 'impactGrit'>): void {
    const chimneys = this.dressing?.skyline ? smokingChimneys(this.dressing.skyline) : [];
    const smokeOn = skylineShown(q) && chimneys.length > 0;
    if (smokeOn && !this.smoke) {
      this.smoke = new SmokePlumes(chimneys);
      this.smoke.setMotion(this.motion);
      this.smoke.setNight(this.night);
      this.scene.add(this.smoke.object);
    }
    if (this.smoke) this.smoke.object.visible = smokeOn;
    this.dustOn = kickedDustShown(q) && this.dressing?.kickedDust !== undefined;
    if (this.dustOn && !this.dust) {
      this.dust = new ImpactPuffs(KICKED_DUST);
      this.dust.object.visible = false;
      this.scene.add(this.dust.object);
    }
  }

  /** Reduced motion on (false): the smoke stands still, and feet kick up no dust. */
  setMotion(on: boolean): void {
    this.motion = on;
    this.smoke?.setMotion(on);
  }

  setNight(night: boolean): void {
    this.night = night;
    this.smoke?.setNight(night);
  }

  /** A tick's footfalls: a sprinting step or a landing within range of `eye` kicks up dust. */
  afterTick(events: readonly GameEvent[], characters: readonly Character[], eye: { x: number; y: number; z: number }): void {
    const dust = this.dust;
    const kicked = this.dressing?.kickedDust;
    if (!dust || !kicked || !this.dustOn || !this.motion) return;
    for (const e of events) {
      if (e.type !== 'footstep' || (e.kind !== 'sprint' && e.kind !== 'land')) continue;
      let c: Character | null = null;
      for (const ch of characters) if (ch.id === e.characterId) c = ch;
      if (!c) continue;
      const p = c.position;
      if (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) > KICKED_DUST.range) continue;
      this.dustAt.x = p.x;
      this.dustAt.y = p.y + KICKED_DUST.lift;
      this.dustAt.z = p.z;
      dust.spawn(this.dustAt, this.dustTint, kicked.scale * (e.kind === 'land' ? KICKED_DUST.land : 1));
    }
  }

  /** Moves the smoke and the dust on by `dt`; the dust draws only while some is in the air. */
  update(dt: number, camera: THREE.Camera, wind: { x: number; z: number }): void {
    this.smoke?.update(dt, camera, wind);
    const dust = this.dust;
    if (dust) {
      dust.update(dt, camera);
      dust.object.visible = this.dustOn && dust.object.count > 0;
    }
  }

  dispose(): void {
    this.smoke?.dispose();
    this.dust?.dispose();
    this.smoke = null;
    this.dust = null;
  }
}
