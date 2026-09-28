import * as THREE from 'three';
import { RENDER } from '../config/render';

const REFERENCE_ASPECT = 16 / 9;
const DEG = Math.PI / 180;

/** Vertical FOV (degrees) that yields the configured horizontal FOV on a 16:9 screen. */
export function verticalFovFor(horizontalFov16x9: number): number {
  return (2 * Math.atan(Math.tan((horizontalFov16x9 * DEG) / 2) / REFERENCE_ASPECT)) / DEG;
}

/** Owns the WebGL renderer, main camera and scene. Handles resizing. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: RENDER.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = RENDER.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    // Vertical FOV is fixed; horizontal grows with aspect (Hor+).
    this.camera = new THREE.PerspectiveCamera(verticalFovFor(RENDER.horizontalFov16x9), 1, RENDER.near, RENDER.far);
    this.camera.rotation.order = 'YXZ';

    this.scene.background = new THREE.Color(RENDER.skyColor);
    this.scene.fog = new THREE.Fog(RENDER.skyColor, RENDER.fogNear, RENDER.fogFar);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
