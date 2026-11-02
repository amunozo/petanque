/**
 * Clear sunny afternoon: a warm-white sun (~5600 K) along the venue's baked sun direction
 * (art/lib/layout.py -> bakedLayout.ts; the static scenery's shadows are baked into lightmaps,
 * src/render/bakedLight.ts), a soft sky-blue / dusty-ground hemisphere fill, a natural blue sky dome
 * and gentle aerial haze (all of it the venue's look, src/render/venues.ts).
 * The real-time shadow map only holds the boules and the jack (nothing static casts), so it is
 * fitted tightly around the court and stays crisp. Tone mapping, saturation grade, sun colour
 * temperature / intensity, fill, shadow darkness, ambient occlusion, ground grain, exposure and fog
 * density are read live from config.look. The sun direction is not tunable: it must match the bake.
 * A venue with `shade` (Derborence) turns the sun into a soft high key from the sky and drops the
 * baked sun shadows and bounce: the court lies in the valley's shade, evenly lit.
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
  type Material,
  type PerspectiveCamera,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import type { GameConfig, ToneMappingChoice } from '../tuning/config';
import { setBakedAnisotropy, setBakeStrength, setBounceStrength, setGroundDetail } from './bakedLight';
import { setGradeSaturation } from './grade';
import { createSky } from './sky';
import type { Venue } from './venues';

const TONE_MAPPINGS: Record<ToneMappingChoice, ToneMapping> = {
  neutral: NeutralToneMapping,
  agx: AgXToneMapping,
  aces: ACESFilmicToneMapping,
  none: NoToneMapping,
};

const STYLE = {
  /**
   * Exposure gain per tone-mapping curve, so switching curves in the panel keeps a similar mid-grey
   * (three's ACES pre-multiplies by 1/0.6; AgX darkens the mid-tones).
   */
  toneGain: { neutral: 1, agx: 1.25, aces: 0.6, none: 0.92 } as Record<ToneMappingChoice, number>,
  /** Only the boules / jack render into it, fitted to the court: ~1 cm texels. */
  shadowMapSize: 2048,
  /** Distance of the sun from the court centre and the depth range of its shadow camera (m). */
  sunDistance: 40,
  shadowNearBehind: 24,
  shadowFarBeyond: 20,
  /** Extra shadow-map area around the court rectangle (m). */
  shadowMargin: 0.4,
  shadowBias: -0.0004,
  shadowNormalBias: 0.03,
  /** PCF blur radius in shadow-map texels (softer edges, like the baked penumbra). */
  shadowRadius: 3,
  /** Ground grain (the venue's ground_detail texture): tile sizes of its two samples (m). */
  grainTileA: 0.55,
  grainTileB: 2.3,
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
  /** Switches the venue's sky dome (the old one is disposed), sun, fill, fog and background. */
  setVenue(venue: Venue): void;
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

export function createLighting(scene: Scene, renderer: WebGLRenderer, getConfig: () => GameConfig, court: CourtBounds,
                               bootVenue: Venue): Lighting {
  // The venue's look can change at runtime (setVenue): everything below reads this variable, never a
  // captured copy, so update() and the sun keep following the current venue.
  let venue = bootVenue;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  setBakedAnisotropy(renderer.capabilities.getMaxAnisotropy());
  renderer.shadowMap.type = PCFShadowMap; // PCFSoftShadowMap was removed in three r18x; PCF is already filtered

  const horizon = new Color(venue.sky.horizon);
  scene.background = horizon;
  const fog = new FogExp2(horizon, 0.02);
  scene.fog = fog;

  // Fill from the sky (soft, slightly hazy blue: never grey-blue shade) and the warm dusty ground.
  const hemi = new HemisphereLight(venue.fill.hemiSky, venue.fill.hemiGround, 2);
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

  let sky = createSky(venue.sky, venue.fill.skyRadius);
  scene.add(sky.mesh);

  const dir = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const rel = new Vector3();
  const worldUp = new Vector3(0, 1, 0);
  let lastTemp = NaN;

  /** Points the sun along the baked direction and fits its ortho shadow box around the court rectangle. */
  function aimSun(): void {
    dir.set(...venue.sun.dir); // toward the sun
    sky.setSunDirection(dir);
    const shade = venue.shade;
    if (shade) {
      // valley shade: the directional light is a soft high key from the sky, not the sun
      const el = (shade.keyElevationDeg * Math.PI) / 180;
      const az = (shade.keyAzimuthDeg * Math.PI) / 180;
      dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    }
    sun.position.set(cx, 0, cz).addScaledVector(dir, STYLE.sunDistance);

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

  aimSun();

  /** Swaps the venue's look in place: sky dome, sun aim, fill colours, fog and background. */
  function setVenue(next: Venue): void {
    if (next === venue) return;
    venue = next;
    horizon.set(next.sky.horizon); // also the scene background (this object)
    fog.color.copy(horizon);
    hemi.color.set(next.fill.hemiSky);
    hemi.groundColor.set(next.fill.hemiGround);
    scene.remove(sky.mesh);
    sky.mesh.geometry.dispose();
    (sky.mesh.material as Material).dispose();
    sky = createSky(next.sky, next.fill.skyRadius);
    scene.add(sky.mesh);
    aimSun();
  }

  return {
    update(camera) {
      const { look } = getConfig();
      if (look.sunTempK !== lastTemp) {
        lastTemp = look.sunTempK;
        kelvinToColor(lastTemp, sun.color);
      }
      const shade = venue.shade;
      sun.intensity = look.sunIntensity * (shade ? shade.key : 1);
      sun.shadow.intensity = look.shadowStrength * (shade ? shade.bouleShadow : 1);
      // valley shade: no baked sun shadows / bounce (the sun does not reach the clearing), AO stays
      setBakeStrength(shade ? 0 : look.shadowStrength, look.aoStrength * (shade ? shade.ao : 1));
      setBounceStrength(shade ? 0 : look.bounceStrength);
      setGroundDetail(STYLE.grainTileA, STYLE.grainTileB, look.groundGrain);
      hemi.intensity = look.fillIntensity * (shade ? shade.fill : 1);
      const curve = look.toneMapping in TONE_MAPPINGS ? look.toneMapping : 'neutral';
      renderer.toneMapping = TONE_MAPPINGS[curve]; // three recompiles the affected programs on change
      renderer.toneMappingExposure = look.exposure * (venue.shade ? venue.shade.exposure : 1) * STYLE.toneGain[curve];
      setGradeSaturation(look.saturation);
      fog.density = look.fogDensity;
      sky.follow(camera);
    },
    setVenue,
  };
}
