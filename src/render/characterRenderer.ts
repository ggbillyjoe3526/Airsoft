import * as THREE from 'three';
import { FIGURE } from '../config/characters';
import type { Character } from '../sim/character';
import { buildFigure, createCalloutTexture, disposeFigure, type Figure } from './characterModels';

interface FigureState {
  figure: Figure;
  /** Walk-cycle phase (radians), advanced by distance walked. */
  phase: number;
  lastX: number;
  lastZ: number;
}

/**
 * Draws every character as a third-person figure, interpolated between ticks: walk cycle, crouch,
 * aim pitch, and the hit-calling look (hand up, replica down, "HIT!" sign while calling).
 * Reads simulation state only.
 */
export class CharacterRenderer {
  readonly object = new THREE.Group();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  private readonly calloutTexture = createCalloutTexture();
  private readonly calloutMaterial = new THREE.SpriteMaterial({ map: this.calloutTexture, transparent: true });
  private readonly figures: FigureState[] = [];

  constructor(
    private readonly characters: readonly Character[],
    teamColors: readonly number[],
  ) {
    for (const c of characters) {
      const figure = buildFigure(teamColors[c.team] ?? 0xffffff, this.material, this.calloutMaterial);
      this.object.add(figure.root);
      this.figures.push({ figure, phase: 0, lastX: c.position.x, lastZ: c.position.z });
    }
  }

  /**
   * `alpha` interpolates ticks; `hiddenId` is the character the camera is inside (drawn in first
   * person instead), or -1.
   */
  update(alpha: number, hiddenId: number): void {
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i]!;
      const s = this.figures[i]!;
      const f = s.figure;
      f.root.visible = c.id !== hiddenId;
      if (!f.root.visible) continue;

      const x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha;
      const y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha;
      const z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha;
      f.root.position.set(x, y, z);
      f.root.rotation.y = c.yaw;

      // Walk cycle from distance actually covered (teleports into the dead zone don't count).
      const moved = Math.hypot(x - s.lastX, z - s.lastZ);
      s.lastX = x;
      s.lastZ = z;
      if (moved < 1) s.phase += moved * FIGURE.stridesPerMetre * Math.PI * 2;
      const walking = Math.hypot(c.velocity.x, c.velocity.z) > 0.2;
      const swing = walking ? Math.sin(s.phase) * FIGURE.legSwing : 0;

      const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
      const hip = FIGURE.hipHeight - crouch * FIGURE.crouchDrop;
      f.upper.position.y = hip;
      f.legL.position.y = hip;
      f.legR.position.y = hip;
      const legScale = hip / FIGURE.hipHeight;
      f.legL.scale.y = legScale;
      f.legR.scale.y = legScale;
      f.legL.rotation.x = swing;
      f.legR.rotation.x = -swing;

      const inPlay = c.status === 'alive';
      f.aim.visible = inPlay;
      f.aim.rotation.x = c.pitch;
      f.hitPose.visible = !inPlay;
      f.callout.visible = c.status === 'calling';
    }
  }

  dispose(): void {
    for (const s of this.figures) disposeFigure(s.figure);
    this.material.dispose();
    this.calloutMaterial.dispose();
    this.calloutTexture.dispose();
    this.object.removeFromParent();
  }
}
