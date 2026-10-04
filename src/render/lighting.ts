/**
 * Clear late-afternoon light: a low warm-white sun with shadows fitted tightly to the court, a cool
 * blue sky / warm-bounce hemisphere fill (shade reads blue against the sun, with clear contrast),
 * a deep blue sky dome and only a little haze. Tone mapping, saturation grade, sun colour
 * temperature / direction / intensity, fill, shadow darkness, exposure and fog density are read
 * live from config.look (cheap: nothing is recomputed unless they change).
 */
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  NeutralToneMapping,
  NoToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  Scene,
  Vector3,
  type PerspectiveCamera,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import type { GameConfig, ToneMappingChoice } from '../tuning/config';
import { setGradeSaturation } from './grade';
import { createSky, SKY_STYLE } from './sky';

const TONE_MAPPINGS: Record<ToneMappingChoice, ToneMapping> = {
  neutral: NeutralToneMapping,
  agx: AgXToneMapping,
  aces: ACESFilmicToneMapping,
  none: NoToneMapping,
};

const STYLE = {
  /** Fill from the sky (cool blue, so shade reads blue against the warm-white sun) and bounce from the warm ground. */
  hemiSky: 0x8fb0ff,
  hemiGround: 0xc58a52,
  /**
   * Exposure gain per tone-mapping curve, so switching curves in the panel keeps a similar mid-grey
   * (three's ACES pre-multiplies by 1/0.6; AgX darkens the mid-tones).
   */
  toneGain: { neutral: 1, agx: 1.25, aces: 0.6, none: 0.92 } as Record<ToneMappingChoice, number>,
  shadowMapSize: 2048,
  /** Distance of the sun from the court centre and the depth range of its shadow camera (m). */
  sunDistance: 40,
  shadowNearBehind: 24,
  shadowFarBeyond: 20,
  /** Extra shadow-map area around the court rectangle (m). */
  shadowMargin: 0.4,
  shadowBias: -0.0004,
  shadowNormalBias: 0.03,
  /** PCF blur radius in shadow-map texels (softer edges). */
  shadowRadius: 6,
  skyRadius: 70,
} as const;

export interface CourtBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Lighting {
  /** Call once per frame before rendering. */
  update(camera: PerspectiveCamera): void;
}

/**
 * Black-body colour temperature (K) -> sRGB colour, normalised so the brightest channel is 1
 * (Tanner Helland's fit; good from ~1000 K to 40000 K).
 */
export function kelvinToColor(kelvin: number, out: Color): Color {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp = (v: number): number => Math.min(255, Math.max(0, v)) / 255;
  return out.setRGB(clamp(r), clamp(g), clamp(b), SRGBColorSpace);
}

export function createLighting(scene: Scene, renderer: WebGLRenderer, getConfig: () => GameConfig, court: CourtBounds): Lighting {
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap; // PCFSoftShadowMap was removed in three r18x; PCF is already filtered

  const horizon = new Color(SKY_STYLE.horizon);
  scene.background = horizon;
  const fog = new FogExp2(horizon, 0.02);
  scene.fog = fog;

  const hemi = new HemisphereLight(STYLE.hemiSky, STYLE.hemiGround, 2);
  scene.add(hemi);

  const cx = (court.minX + court.maxX) / 2;
  const cz = (court.minZ + court.maxZ) / 2;
  const sun = new DirectionalLight(0xffffff, 3);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(STYLE.shadowMapSize, STYLE.shadowMapSize);
  sun.shadow.bias = STYLE.shadowBias;
  sun.shadow.normalBias = STYLE.shadowNormalBias;
  sun.shadow.radius = STYLE.shadowRadius;
  scene.add(sun, sun.target);

  const sky = createSky(STYLE.skyRadius);
  scene.add(sky.mesh);

  const dir = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const rel = new Vector3();
  const worldUp = new Vector3(0, 1, 0);
  let lastEl = NaN;
  let lastAz = NaN;
  let lastTemp = NaN;

  /** Points the sun along (elevation, azimuth) and fits its ortho shadow box around the court rectangle. */
  function aimSun(elDeg: number, azDeg: number): void {
    const el = (elDeg * Math.PI) / 180;
    const az = (azDeg * Math.PI) / 180;
    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); // toward the sun
    sun.position.set(cx, 0, cz).addScaledVector(dir, STYLE.sunDistance);
    sky.setSunDirection(dir);

    // Light-space basis: the shadow camera looks along -dir.
    right.crossVectors(dir.clone().negate(), worldUp).normalize();
    up.crossVectors(right, dir.clone().negate()).normalize();
    let minR = Infinity;
    let maxR = -Infinity;
    let minU = Infinity;
    let maxU = -Infinity;
    for (const x of [court.minX, court.maxX]) {
      for (const z of [court.minZ, court.maxZ]) {
        rel.set(x - cx, 0, z - cz);
        const r = rel.dot(right);
        const u = rel.dot(up);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
      }
    }
    const m = STYLE.shadowMargin;
    const sc = sun.shadow.camera;
    sc.left = minR - m;
    sc.right = maxR + m;
    sc.bottom = minU - m;
    sc.top = maxU + m;
    sc.near = STYLE.sunDistance - STYLE.shadowNearBehind;
    sc.far = STYLE.sunDistance + STYLE.shadowFarBeyond;
    sc.updateProjectionMatrix();
  }

  return {
    update(camera) {
      const { look } = getConfig();
      if (look.sunElevationDeg !== lastEl || look.sunAzimuthDeg !== lastAz) {
        lastEl = look.sunElevationDeg;
        lastAz = look.sunAzimuthDeg;
        aimSun(lastEl, lastAz);
      }
      if (look.sunTempK !== lastTemp) {
        lastTemp = look.sunTempK;
        kelvinToColor(lastTemp, sun.color);
      }
      sun.intensity = look.sunIntensity;
      sun.shadow.intensity = look.shadowStrength;
      hemi.intensity = look.fillIntensity;
      const curve = look.toneMapping in TONE_MAPPINGS ? look.toneMapping : 'neutral';
      renderer.toneMapping = TONE_MAPPINGS[curve]; // three recompiles the affected programs on change
      renderer.toneMappingExposure = look.exposure * STYLE.toneGain[curve];
      setGradeSaturation(look.saturation);
      fog.density = look.fogDensity;
      sky.follow(camera);
    },
  };
}
