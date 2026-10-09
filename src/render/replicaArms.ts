import * as THREE from 'three';
import { FIGURE } from '../config/characters';
import type { DetailLevel } from '../config/render';
import { useSleeveCamo } from './figureCamo';
import { figurePalette, robotShell } from './figurePalette';
import { buildForearm, buildHand, type GeometrySink, type HandPose, type V3 } from './handModels';
import type { MaterialKey } from './replicaBuilder';
import { buildRobotForearm, buildRobotHand } from './robotHands';

/**
 * The arms that hold the first-person replicas (G7): the player's own, gloved, in their team's camo, as the figures wear
 * them; or, when their slot is a robot (Settings › Look › Robots), a robot's in the shell its figure wears.
 */
export interface ArmStyle {
  robot: boolean;
  shell: number;
}

/** A player's gloved arms. */
export const HUMAN_ARMS: ArmStyle = { robot: false, shell: robotShell(0) };

/**
 * The arms' three materials: dark gloves and the team's camo sleeves (figurePalette), or a robot's dark joints and satin
 * shell; the team colour on the armband (a robot's panel) either way. Gloves and sleeves were olive and grey before G7;
 * they are the same three materials, so neither style costs a draw call more. With `camo` (Hand detail High, G11) the
 * sleeves print the figures' camo pattern per pixel (figureCamo.ts), as your figure wears it; Low keeps them plain.
 */
export function armMaterials(teamColor: number, arms: ArmStyle, vertexColors: boolean, camo = false): Pick<Record<MaterialKey, THREE.Material>, 'glove' | 'sleeve' | 'armband'> {
  const fabric = (color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness, vertexColors });
  const [shellRough, shellMetal] = FIGURE.finish.robot;
  return arms.robot
    ? {
        glove: fabric(FIGURE.robot.joint, FIGURE.finish.rubber[0]),
        sleeve: fabric(arms.shell, shellRough, shellMetal),
        armband: fabric(teamColor, shellRough, shellMetal),
      }
    : {
        glove: fabric(FIGURE.colors.glove, 0.9),
        sleeve: camo ? useSleeveCamo(fabric(figurePalette(teamColor).camo, 1)) : fabric(figurePalette(teamColor).camo, 1),
        // Team tape on the sleeve, as players wear at real sites.
        armband: fabric(teamColor, 0.7),
      };
}

/** The hand and forearm builders for a style of arms. */
export interface ArmBuilders {
  hand: (sink: GeometrySink, pose: HandPose, detail: DetailLevel) => V3;
  forearm: (sink: GeometrySink, wrist: V3, elbow: V3, elbowRadius: number | undefined, detail: DetailLevel) => void;
}

const GLOVED: ArmBuilders = { hand: buildHand, forearm: buildForearm };
const ROBOT: ArmBuilders = { hand: buildRobotHand, forearm: buildRobotForearm };

/** The builders for `arms`. */
export function armBuilders(arms: ArmStyle): ArmBuilders {
  return arms.robot ? ROBOT : GLOVED;
}
