/**
 * Warm late-afternoon light: low golden sun with shadows fitted tightly to the court, a cool
 * sky-blue / warm-bounce hemisphere fill (so shade stays light and readable), sky dome and a
 * light golden haze. Sun direction / intensity, fill, shadow darkness, exposure and fog density
 * are read live from config.look (cheap: nothing is recomputed unless they change).
 */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PCFShadowMap,
  Scene,
  Vector3,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import type { GameConfig } from '../tuning/config';
import { createSky, SKY_STYLE } from './sky';

const STYLE = {
  sunColor: 0xffcf8f,
  /** Fill from the sky (cool, so shade reads blue-ish against the golden sun) and bounce from the warm ground. */
  hemiSky: 0xa9c8f2,
  hemiGround: 0xd29a62,
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

export function createLighting(scene: Scene, renderer: WebGLRenderer, getConfig: () => GameConfig, court: CourtBounds): Lighting {
  renderer.toneMapping = ACESFilmicToneMapping;
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
  const sun = new DirectionalLight(STYLE.sunColor, 3);
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
      sun.intensity = look.sunIntensity;
      sun.shadow.intensity = look.shadowStrength;
      hemi.intensity = look.fillIntensity;
      renderer.toneMappingExposure = look.exposure;
      fog.density = look.fogDensity;
      sky.follow(camera);
    },
  };
}
