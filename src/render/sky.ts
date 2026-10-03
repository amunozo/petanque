/**
 * Cheap sky: one big inverted sphere with per-vertex colours (zenith blue -> warm horizon haze,
 * plus a soft glow toward the sun). Follows the camera so it is always "infinitely" far.
 */
import { BackSide, BufferAttribute, Color, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, type PerspectiveCamera } from 'three';

/** sRGB colours (three converts to linear). The horizon colour is also the fog colour. */
export const SKY_STYLE = {
  zenith: 0x5f95cf,
  mid: 0x8fbbe3,
  horizon: 0xf0d3a6,
  glow: 0xffc27a,
  /** Elevation (rad) over which the horizon haze blends into the mid blue / the zenith. */
  hazeBand: 0.28,
  midBand: 0.9,
} as const;

export interface Sky {
  mesh: Mesh;
  /** Recolours for a new sun direction (unit vector toward the sun). */
  setSunDirection(dir: Vector3): void;
  follow(camera: PerspectiveCamera): void;
}

export function createSky(radius: number): Sky {
  const geo = new SphereGeometry(1, 28, 16);
  const count = geo.getAttribute('position').count;
  geo.setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false });
  const mesh = new Mesh(geo, mat);
  mesh.scale.setScalar(radius);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  const zenith = new Color(SKY_STYLE.zenith);
  const mid = new Color(SKY_STYLE.mid);
  const horizon = new Color(SKY_STYLE.horizon);
  const glow = new Color(SKY_STYLE.glow);
  const c = new Color();
  const v = new Vector3();

  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  return {
    mesh,
    setSunDirection(dir) {
      const pos = geo.getAttribute('position');
      const col = geo.getAttribute('color') as BufferAttribute;
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(pos, i).normalize();
        const elev = Math.asin(Math.max(-1, Math.min(1, v.y)));
        c.copy(horizon);
        c.lerp(mid, smooth(SKY_STYLE.hazeBand * 0.2, SKY_STYLE.hazeBand + 0.25, elev));
        c.lerp(zenith, smooth(SKY_STYLE.hazeBand, SKY_STYLE.midBand + 0.5, elev) * 0.9);
        const toSun = Math.max(0, v.dot(dir));
        c.lerp(glow, Math.min(1, Math.pow(toSun, 6) * 0.55 + Math.pow(toSun, 40) * 0.5));
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    },
    follow(camera) {
      mesh.position.copy(camera.position);
    },
  };
}
