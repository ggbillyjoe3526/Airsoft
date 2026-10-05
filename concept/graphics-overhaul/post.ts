import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { Preset } from './quality';

/** The colour grade both presets share: a touch more saturation, cool shadows, warm highlights, a soft vignette. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.12 }, contrast: { value: 1.05 }, vignette: { value: 0.18 }, grain: { value: 0 }, fringe: { value: 0 }, shadowTint: { value: new THREE.Color(0.2, 0.35, 0.75) }, highTint: { value: new THREE.Color(1.0, 0.85, 0.6) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform float vignette; uniform float grain; uniform float fringe; uniform vec3 shadowTint; uniform vec3 highTint;
    varying vec2 vUv;
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // Lens: a trace of colour fringing that grows towards the corners (none at the centre, where you aim).
      if (fringe > 0.0) { vec2 dd = (vUv - 0.5) * dot(vUv - 0.5, vUv - 0.5) * fringe; c.r = texture2D(tDiffuse, vUv - dd).r; c.b = texture2D(tDiffuse, vUv + dd).b; }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c += shadowTint * (1.0 - l) * (1.0 - l) * 0.03 - vec3(0.008);
      c = mix(c, c * highTint * 1.08, l * l * 0.18);
      float v = smoothstep(0.9, 0.3, length((vUv - 0.5) * vec2(1.0, 0.8)));
      c *= mix(1.0 - vignette, 1.0, v);
      // Film grain, strongest in the mid-tones.
      if (grain > 0.0) c += (hash12(gl_FragCoord.xy) - 0.5) * grain * (1.0 - abs(l - 0.5) * 1.4);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/**
 * Screen-space light shafts: the sky's sun on black wherever the scene blocks it, blurred radially from the sun's place
 * on screen and added back. A stand-in for true volumetric fog on WebGPU.
 */
class GodRaysPass extends Pass {
  private readonly occl: THREE.WebGLRenderTarget;
  private readonly rays: THREE.WebGLRenderTarget;
  private readonly black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly blur: FullScreenQuad;
  private readonly add: FullScreenQuad;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly addMat: THREE.ShaderMaterial;

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera, private readonly sky: THREE.Mesh, private readonly sunWorld: THREE.Vector3, w: number, h: number, strength = 0.5) {
    super();
    this.occl = new THREE.WebGLRenderTarget(w / 2, h / 2, { type: THREE.HalfFloatType });
    this.rays = new THREE.WebGLRenderTarget(w / 2, h / 2, { type: THREE.HalfFloatType });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tMask: { value: null }, sun: { value: new THREE.Vector2() } },
      vertexShader: GradeShader.vertexShader,
      fragmentShader: `uniform sampler2D tMask; uniform vec2 sun; varying vec2 vUv;
        void main(){ vec2 d = (vUv - sun) / 96.0 * 0.92; vec2 uv = vUv; float decay = 1.0; vec3 s = vec3(0.0);
          for (int i = 0; i < 96; i++){ uv -= d; s += texture2D(tMask, clamp(uv, 0.0, 1.0)).rgb * decay; decay *= 0.975; }
          gl_FragColor = vec4(s / 96.0, 1.0); }`,
    });
    this.addMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRays: { value: null }, strength: { value: strength } },
      vertexShader: GradeShader.vertexShader,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tRays; uniform float strength; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb += texture2D(tRays, vUv).rgb * strength * vec3(1.0, 0.86, 0.62); gl_FragColor = c; }`,
    });
    this.blur = new FullScreenQuad(this.blurMat);
    this.add = new FullScreenQuad(this.addMat);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const skyMat = this.sky.material as THREE.ShaderMaterial;
    skyMat.uniforms.sunOnly!.value = 1;
    const prevBg = this.scene.background;
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if ((o as THREE.Sprite).isSprite && o.visible) {
        hidden.push(o);
        o.visible = false;
      }
    });
    this.scene.overrideMaterial = this.black;
    renderer.setRenderTarget(this.occl);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    // The sky first with its own material, then everything else in black over it.
    renderer.render(this.sky, this.camera);
    this.sky.visible = false;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
    this.sky.visible = true;
    this.scene.overrideMaterial = null;
    this.scene.background = prevBg;
    for (const o of hidden) o.visible = true;
    skyMat.uniforms.sunOnly!.value = 0;
    const s = this.sunWorld.clone().project(this.camera);
    this.blurMat.uniforms.sun!.value.set(s.x * 0.5 + 0.5, s.y * 0.5 + 0.5);
    this.blurMat.uniforms.tMask!.value = this.occl.texture;
    renderer.setRenderTarget(this.rays);
    this.blur.render(renderer);
    this.addMat.uniforms.tDiffuse!.value = readBuffer.texture;
    this.addMat.uniforms.tRays!.value = this.rays.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.add.render(renderer);
  }
}

export interface PostOpts {
  sky?: THREE.Mesh;
  sunWorld?: THREE.Vector3;
  reflective?: THREE.Mesh[];
  dof?: { focus: number; aperture: number };
  bloom?: number;
  aoRadius?: number;
  godRays?: number;
}

export function makeComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, p: Preset, w: number, h: number, o: PostOpts): EffectComposer {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: p.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.setSize(w, h);
  const log: string[] = [];
  if (p.ssr && o.reflective && o.reflective.length) {
    const ssr = new SSRPass({ renderer, scene, camera, width: w, height: h, selects: o.reflective, groundReflector: null });
    ssr.thickness = 0.03;
    ssr.maxDistance = 30;
    ssr.opacity = 0.9;
    ssr.infiniteThick = false;
    ssr.fresnel = true;
    ssr.distanceAttenuation = true;
    ssr.blur = true;
    composer.addPass(ssr);
    log.push('ssr');
  } else {
    composer.addPass(new RenderPass(scene, camera));
    log.push('render');
  }
  if (p.ao) {
    const ao = new GTAOPass(scene, camera, w, h);
    // The sky dome and cloud sprites are background: keep them out of the AO's depth and normals.
    const aoRender = ao.render.bind(ao);
    ao.render = (r, wb, rb, dt, mask) => {
      const hidden: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.visible && (o.name === 'sky' || (o as THREE.Sprite).isSprite)) {
          hidden.push(o);
          o.visible = false;
        }
      });
      aoRender(r, wb, rb, dt, mask);
      for (const o of hidden) o.visible = true;
    };
    ao.updateGtaoMaterial({ radius: o.aoRadius ?? 0.6, distanceExponent: 1.5, thickness: 2, scale: 1.2, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 0.95;
    composer.addPass(ao);
    log.push('gtao');
  }
  if (p.godRays && o.sky && o.sunWorld && (o.godRays ?? 0) > 0) {
    composer.addPass(new GodRaysPass(scene, camera, o.sky, o.sunWorld, w, h, o.godRays));
    log.push('godrays');
  }
  if (p.bloom) {
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), (o.bloom ?? 0.45) * 1.2, 0.7, 1.35));
    log.push('bloom');
  }
  if (p.bloom && o.dof) {
    composer.addPass(new BokehPass(scene, camera, { focus: o.dof.focus, aperture: o.dof.aperture, maxblur: 0.006 }));
    log.push('dof');
  }
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  if (p.lens) {
    grade.uniforms.grain!.value = 0.028;
    grade.uniforms.fringe!.value = 0.006;
  }
  composer.addPass(grade);
  log.push('output', p.lens ? 'grade+lens' : 'grade');
  if (p.smaa) {
    composer.addPass(new SMAAPass());
    log.push('smaa');
  }
  if (p.fxaa) {
    const fx = new ShaderPass(FXAAShader);
    fx.material.uniforms.resolution!.value.set(1 / w, 1 / h);
    composer.addPass(fx);
    log.push('fxaa');
  }
  (window as unknown as { __passes: string[] }).__passes = log;
  return composer;
}
