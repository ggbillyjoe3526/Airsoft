import * as THREE from 'three';
import { dressingShown, KICKED_DUST, kickedDustShown, skylineShown } from '../config/dressing';
import type { QualitySettings } from '../config/render';
import type { MapData, MapDressing } from '../map/mapTypes';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { length3 } from '../sim/vec';
import { Fireflies } from './fireflies';
import { ImpactPuffs } from './impactPuffs';
import { neonFlicker } from './neonDressing';
import { PassingPlane } from './passingPlane';
import { SmokePlumes, STEAM_PLUME } from './smokePlumes';
import { smokingChimneys } from './skyline';

/**
 * A map's moving dressing (G8, G9): its chimneys' smoke (Trees: Detailed, one instanced draw while in view), the dust
 * sprinting and landing feet kick up (Impact grit, one instanced draw while any is in the air), and G9's steam from
 * vents and drains (Map detail, one instanced draw), fireflies by night (Map detail, one draw) and a plane crossing the
 * sky (Trees: Detailed, one draw while it is up there), each pooled with fixed buffers. Each is made the first time its
 * setting is on, and only for a map whose dressing has it, so Low (and a map without dressing) adds nothing to the
 * scene. Under Reduced motion the smoke and steam stand still, no dust is kicked up, the fireflies hold steady, no
 * plane crosses and the neon signs' flicker is off.
 */
export class DressingEffects {
  private smoke: SmokePlumes | null = null;
  private steam: SmokePlumes | null = null;
  private flies: Fireflies | null = null;
  private plane: PassingPlane | null = null;
  private dust: ImpactPuffs | null = null;
  private dustOn = false;
  private planeOn = false;
  private motion = true;
  private night = false;
  private time = 0;
  /** The junk mesh's neon flicker levels, while a built map has flickering signs (render/dressingMeshes.ts). */
  private flicker: { value: THREE.Vector3 } | null = null;
  private readonly dustTint = new THREE.Color();
  private readonly dustAt = { x: 0, y: 0, z: 0 };
  private readonly dressing: MapDressing | undefined;

  constructor(
    private readonly scene: THREE.Scene,
    /** The map, or just its dressing (G8's callers); the fireflies need its terrain and bushes. */
    private readonly map: MapData | MapDressing | undefined,
  ) {
    this.dressing = map && 'seed' in map ? (map as MapDressing) : (map as MapData | undefined)?.dressing;
    if (this.dressing?.kickedDust) this.dustTint.setHex(this.dressing.kickedDust.tint);
  }

  /** The built map's group, so the neon signs' flicker reaches their mesh (none without flickering signs). */
  setMapGroup(group: THREE.Object3D | null): void {
    const mesh = group?.getObjectByName('map-junk');
    this.flicker = (mesh?.userData.neonFlicker as { value: THREE.Vector3 } | undefined) ?? null;
    if (this.flicker) this.flicker.value.set(1, 1, 1);
  }

  setQuality(q: Pick<QualitySettings, 'trees' | 'impactGrit' | 'mapDetail'>): void {
    const d = this.dressing;
    const chimneys = d?.skyline ? smokingChimneys(d.skyline) : [];
    const smokeOn = skylineShown(q) && chimneys.length > 0;
    if (smokeOn && !this.smoke) this.smoke = this.addPlume(new SmokePlumes(chimneys));
    if (this.smoke) this.smoke.object.visible = smokeOn;
    // G9: steam (map detail), the fireflies (map detail, by night) and the plane (Trees: Detailed).
    const vents = d?.steam ?? [];
    const steamOn = dressingShown(q) && vents.length > 0;
    if (steamOn && !this.steam) this.steam = this.addPlume(new SmokePlumes(vents.map((v) => ({ ...v, radius: STEAM_PLUME.spread })), STEAM_PLUME, 'steamPlumes'));
    if (this.steam) this.steam.object.visible = steamOn;
    const fliesOn = dressingShown(q) && this.night && d?.fireflies !== undefined;
    if (fliesOn && !this.flies) {
      const field = this.map && 'blocks' in this.map ? (this.map as MapData) : null;
      if (field?.terrain) {
        const bounds = new THREE.Box3(new THREE.Vector3(field.terrain.minX, 0, field.terrain.minZ), new THREE.Vector3(field.terrain.minX + field.terrain.cols * field.terrain.cell, 0, field.terrain.minZ + field.terrain.rows * field.terrain.cell));
        this.flies = new Fireflies(d!.fireflies!.count, field.terrain, field.foliage ?? [], bounds);
        this.flies.setMotion(this.motion);
        this.scene.add(this.flies.object);
      }
    }
    if (this.flies) this.flies.object.visible = fliesOn;
    this.planeOn = skylineShown(q) && d?.plane !== undefined;
    if (this.planeOn && !this.plane) {
      // Over the middle of the world, which is every map's own middle.
      this.plane = new PassingPlane({ x: 0, z: 0 }, d!.plane!.height, d!.plane!.every, this.night);
      this.plane.setMotion(this.motion);
      this.scene.add(this.plane.object);
    }
    if (this.plane && !this.planeOn) this.plane.object.visible = false;
    this.dustOn = kickedDustShown(q) && d?.kickedDust !== undefined;
    if (this.dustOn && !this.dust) {
      this.dust = new ImpactPuffs(KICKED_DUST);
      this.dust.object.name = 'kickedDust';
      this.dust.object.visible = false;
      this.scene.add(this.dust.object);
    }
  }

  /** A plume pool in the scene, with the motion and night it should already have. */
  private addPlume(plume: SmokePlumes): SmokePlumes {
    plume.setMotion(this.motion);
    plume.setNight(this.night);
    this.scene.add(plume.object);
    return plume;
  }

  /** Reduced motion on (false): the smoke and steam stand still, feet kick up no dust, the flies and signs hold steady. */
  setMotion(on: boolean): void {
    this.motion = on;
    this.smoke?.setMotion(on);
    this.steam?.setMotion(on);
    this.flies?.setMotion(on);
    this.plane?.setMotion(on);
    if (!on && this.flicker) this.flicker.value.set(1, 1, 1);
  }

  setNight(night: boolean): void {
    this.night = night;
    this.smoke?.setNight(night);
    this.steam?.setNight(night);
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
      if (length3(p.x - eye.x, p.y - eye.y, p.z - eye.z) > KICKED_DUST.range) continue;
      this.dustAt.x = p.x;
      this.dustAt.y = p.y + KICKED_DUST.lift;
      this.dustAt.z = p.z;
      dust.spawn(this.dustAt, this.dustTint, kicked.scale * (e.kind === 'land' ? KICKED_DUST.land : 1));
    }
  }

  /** Moves the smoke, steam, flies, plane, signs and dust on by `dt`; the dust draws only while some is in the air. */
  update(dt: number, camera: THREE.Camera, wind: { x: number; z: number }): void {
    this.smoke?.update(dt, camera, wind);
    this.steam?.update(dt, camera, wind);
    this.flies?.update(dt);
    if (this.plane && this.planeOn) this.plane.update(dt);
    if (this.motion) {
      this.time += dt;
      if (this.flicker) this.flicker.value.set(neonFlicker(1, this.time), neonFlicker(2, this.time), neonFlicker(3, this.time));
    }
    const dust = this.dust;
    if (dust) {
      dust.update(dt, camera);
      dust.object.visible = this.dustOn && dust.object.count > 0;
    }
  }

  dispose(): void {
    this.smoke?.dispose();
    this.steam?.dispose();
    this.flies?.dispose();
    this.plane?.dispose();
    this.dust?.dispose();
    this.smoke = null;
    this.steam = null;
    this.flies = null;
    this.plane = null;
    this.dust = null;
    this.flicker = null;
  }
}
