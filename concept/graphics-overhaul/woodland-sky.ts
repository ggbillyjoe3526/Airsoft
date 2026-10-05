import * as THREE from 'three';
import { MAP } from './woodland-util';

/**
 * Woodland's night sky: a deep blue dome lightening to a teal glow at the horizon, a field of stars and the Milky Way,
 * a big pale moon low over the Knoll (where the game turns its key light, MapData.lighting.moonOver), a soft halo and,
 * on Ultra, thin silver-edged cloud. All in one shader on a sphere: no textures. The same dome, with the stars off and
 * the moon softened, lights the night environment map, so reflections are moonlit instead of daylight blue.
 */

/** The moon's height over the horizon (degrees): the game's is 18, a touch higher here so it clears the treeline. */
const MOON_ELEVATION_DEG = 21;
/** The moon disc's angular radius (rad): about seven times the real moon's, as games and BotW draw it. */
export const MOON_RADIUS = 0.034;

const over = MAP.lighting?.moonOver ?? { x: 40, z: -7 };
const el = (MOON_ELEVATION_DEG * Math.PI) / 180;
const flat = new THREE.Vector2(over.x, over.z).normalize();
/** Towards the moon from the field (unit). */
export const MOON_DIR = new THREE.Vector3(flat.x * Math.cos(el), Math.sin(el), flat.y * Math.cos(el)).normalize();

export const NIGHT = {
  zenith: 0x06132e,
  horizon: 0x1f3b62,
  glow: 0x3f6d93,
  below: 0x080d16,
  moon: 0xe6eeff,
  /** The haze the field fades into: the horizon's colour, a touch darker. */
  fog: 0x1a3152,
};

const VERT = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

const FRAG = `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 glow; uniform vec3 below; uniform vec3 moonDir; uniform vec3 moonCol;
uniform float pxAngle; uniform float stars; uniform float clouds; uniform float moonSize; uniform float envMode;
varying vec3 vDir;
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 h33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float n3(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fb3(vec3 p){ return n3(p) * 0.5 + n3(p * 2.03) * 0.25 + n3(p * 4.07) * 0.125 + n3(p * 8.1) * 0.0625; }
/** One layer of stars: a point in each lattice cell (kept off its walls), lit if the cell's draw says so. */
vec3 starLayer(vec3 d, float scale, float chance, float gain){
  vec3 p = d * scale;
  vec3 c = floor(p);
  vec3 r = h33(c);
  if (r.x > chance) return vec3(0.0);
  vec3 sp = normalize(c + 0.3 + h33(c + 17.0) * 0.4);
  float ang = acos(clamp(dot(d, sp), -1.0, 1.0));
  float b = pow(r.y, 6.0);
  float rad = pxAngle * (0.55 + 1.6 * b);
  float core = 1.0 - smoothstep(rad * 0.25, rad, ang);
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.88, 0.7), r.z);
  // Most stars stay under the bloom's threshold; only the brightest few glow.
  return tint * core * min(0.3 + b * 2.4, 1.9) * gain;
}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.8, h), 0.55));
  float md = max(dot(d, moonDir), 0.0);
  // A teal-blue glow along the horizon, brighter on the moon's side.
  vec3 hd = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
  float side = max(dot(hd, normalize(vec3(moonDir.x, 0.0, moonDir.z))), 0.0);
  col += glow * exp(-max(h, 0.0) * 9.0) * (0.35 + 0.65 * side * side);
  // The moon's halo.
  col += moonCol * (pow(md, 8.0) * 0.07 + pow(md, 60.0) * 0.24 + pow(md, 900.0) * (envMode > 0.5 ? 2.5 : 0.9));
  float above = smoothstep(-0.01, 0.12, h);
  if (stars > 0.0 && envMode < 0.5) {
    // The Milky Way: a soft band across the sky, mottled with dust lanes.
    vec3 mwN = normalize(vec3(0.35, 0.45, 0.82));
    float band = exp(-pow(dot(d, mwN) / 0.2, 2.0));
    float mot = fb3(d * 7.0) * 1.2 - fb3(d * 22.0 + 3.0) * 0.5;
    col += vec3(0.42, 0.5, 0.78) * band * max(mot, 0.0) * 0.045 * stars * above * (1.0 - md * md);
    vec3 s = starLayer(d, 150.0, 0.13, 0.9) + starLayer(d, 70.0, 0.1, 1.3) + starLayer(d, 300.0, 0.22, 0.35) * band;
    // Fewer near the horizon (haze) and by the moon (its glare).
    col += s * stars * smoothstep(0.03, 0.35, h) * (1.0 - smoothstep(0.9, 0.995, md));
  }
  if (clouds > 0.0 && h > 0.0) {
    // Thin high cloud in streaks, its edges silvered by the moon (projected on a plane above, so only above the horizon).
    vec2 cp = d.xz / (h + 0.16) * 1.4;
    float c = fb3(vec3(cp.x * 0.7, cp.y * 2.2, 1.7)) * 1.15 + fb3(vec3(cp * 3.1, 5.3)) * 0.25;
    float cl = smoothstep(0.62, 0.86, c) * smoothstep(0.02, 0.14, h) * (1.0 - smoothstep(0.45, 0.85, h));
    vec3 cc = mix(vec3(0.06, 0.085, 0.14), vec3(0.32, 0.38, 0.52), pow(md, 3.0)) + moonCol * pow(md, 30.0) * 0.6 * smoothstep(0.62, 0.7, c);
    col = mix(col, cc, cl * 0.82 * clouds);
  }
  // The moon: a crisp disc with soft maria and a darker limb.
  float ang = acos(clamp(dot(d, moonDir), -1.0, 1.0));
  if (ang < moonSize * 1.3 && envMode < 0.5) {
    vec3 rt = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)));
    vec3 upv = cross(rt, moonDir);
    vec2 q = vec2(dot(d, rt), dot(d, upv)) / sin(moonSize);
    float r2 = dot(q, q);
    float mare = smoothstep(0.48, 0.66, fb3(vec3(q * 2.2, 4.0)) + q.x * 0.08);
    float crater = smoothstep(0.7, 0.9, fb3(vec3(q * 9.0, 9.0))) * 0.25;
    float limb = pow(max(1.0 - r2, 0.0), 0.25);
    vec3 disc = moonCol * (2.6 - mare * 0.9 - crater) * (0.6 + 0.4 * limb);
    col = mix(col, disc, 1.0 - smoothstep(moonSize - pxAngle * 1.2, moonSize + pxAngle * 1.2, ang));
  }
  col = mix(col, below, 1.0 - smoothstep(-0.08, 0.0, h));
  // Never hand the post chain a NaN (bloom would spread one pixel's NaN over the whole frame).
  if (any(isnan(col)) || any(isinf(col))) col = horizon;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface SkyOpts {
  stars: number;
  clouds: number;
  env?: boolean;
}

export function nightSky(o: SkyOpts): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      zenith: { value: new THREE.Color(NIGHT.zenith) },
      horizon: { value: new THREE.Color(NIGHT.horizon) },
      glow: { value: new THREE.Color(NIGHT.glow) },
      below: { value: new THREE.Color(NIGHT.below) },
      moonDir: { value: MOON_DIR.clone() },
      moonCol: { value: new THREE.Color(NIGHT.moon) },
      pxAngle: { value: 0.001 },
      stars: { value: o.stars },
      clouds: { value: o.clouds },
      moonSize: { value: MOON_RADIUS },
      envMode: { value: o.env ? 1 : 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  m.name = 'sky';
  return m;
}

/** Stars and the moon's edge are drawn a pixel or two wide whatever the resolution and field of view. */
export function fitSkyToCamera(sky: THREE.Mesh, camera: THREE.PerspectiveCamera, heightPx: number): void {
  (sky.material as THREE.ShaderMaterial).uniforms.pxAngle!.value = THREE.MathUtils.degToRad(camera.fov) / heightPx;
}

/**
 * The night environment map: the dome without stars, the moon a soft bright glow, the ground a dark blue-grey, warm
 * specks low on the horizon where camp fires would catch a glossy surface. PMREM-filtered, for the PBR materials.
 */
export function nightEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  s.add(nightSky({ stars: 0, clouds: 0, env: true }));
  const g = new THREE.Mesh(new THREE.CircleGeometry(800, 32), new THREE.MeshBasicMaterial({ color: 0x0d1118 }));
  g.rotation.x = -Math.PI / 2;
  g.position.y = -3;
  s.add(g);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.03, 1, 1000);
  pm.dispose();
  return rt.texture;
}
