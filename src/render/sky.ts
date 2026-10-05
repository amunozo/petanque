/**
 * Cheap sky: one big inverted sphere with per-vertex colours (natural clear-day gradient: mid blue
 * zenith -> softer blue -> hazy pale horizon, plus a faint warm-white glow toward the sun). Follows
 * the camera so it is always "infinitely" far.
 */
import { BackSide, BufferAttribute, Color, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, type PerspectiveCamera } from 'three';
import { gradeMaterial } from './grade';

/**
 * sRGB display colours (the sky is not tone-mapped, so these are what you see; keep the horizon in
 * sync with art/lib/palette.py "sky_horizon"). The horizon colour is also the fog colour.
 */
export const SKY_STYLE = {
  zenith: 0x3d70b8,
  mid: 0x6f9ed4,
  horizon: 0xc6d6e4,
  glow: 0xfff3dc,
  /** Elevation (rad) over which the pale horizon blends into the mid blue / the zenith. */
  hazeBand: 0.16,
  midBand: 0.7,
} as const;

export interface Sky {
  mesh: Mesh;
  /** Recolours for a new sun direction (unit vector toward the sun). */
  setSunDirection(dir: Vector3): void;
  follow(camera: PerspectiveCamera): void;
}

export function createSky(radius: number): Sky {
  const geo = new SphereGeometry(1, 32, 48); // fine rows so the narrow horizon gradient is resolved
  const count = geo.getAttribute('position').count;
  geo.setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3));
  const mat = gradeMaterial(
    new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false, toneMapped: false }),
  );
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
        c.lerp(mid, smooth(SKY_STYLE.hazeBand * 0.1, SKY_STYLE.hazeBand + 0.2, elev));
        c.lerp(zenith, smooth(SKY_STYLE.hazeBand, SKY_STYLE.midBand + 0.5, elev) * 0.9);
        const toSun = Math.max(0, v.dot(dir));
        c.lerp(glow, Math.min(1, Math.pow(toSun, 8) * 0.35 + Math.pow(toSun, 60) * 0.5));
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    },
    follow(camera) {
      mesh.position.copy(camera.position);
    },
  };
}
