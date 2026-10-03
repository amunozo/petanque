/**
 * Camera controller. Three modes, all numbers read live from config.camera
 * every frame:
 *  - 'aim'    : behind the throwing circle, looking down the pitch.
 *  - 'flight' : follows the thrown ball from behind/above (if camera.follow).
 *  - 'rest'   : close look at the jack once everything stopped (if camera.closeUpAfterRest).
 * Position and look-at target are smoothed with camera.followLerp, which is
 * defined per 60 Hz frame and converted so it behaves the same at any frame rate.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import type { GameConfig } from '../tuning/config';

export type CameraMode = 'aim' | 'flight' | 'rest';

export interface CameraFocus {
  /** Position of the ball being followed (centre), if any. */
  ball: { x: number; y: number; z: number } | null;
  /** Position of the jack, if it is in play. */
  jack: { x: number; y: number; z: number } | null;
  /** Points the close-up must keep in view (jack, nearest boule...). Empty = use `jack` alone. */
  frame: { x: number; y: number; z: number }[];
}

export interface CameraRig {
  setMode(mode: CameraMode): void;
  getMode(): CameraMode;
  /** `dt` in real seconds. */
  update(dt: number, focus: CameraFocus): void;
  /** Jump straight to the current target (no smoothing). */
  snap(focus: CameraFocus): void;
}

/** In the close-up the subject sits a bit above screen centre (room for HUD cards below); metres at zoom 1. */
const REST_LOOK_TOWARD_CAMERA = 0.2;
/** Fraction of the visible half-extent the framed points may use. */
const FRAME_FILL_X = 0.8;
/** Same for depth (foreshortened by the downward viewing angle). */
const FRAME_FILL_Z = 0.5;

export function createCameraRig(camera: PerspectiveCamera, getConfig: () => GameConfig): CameraRig {
  let mode: CameraMode = 'aim';
  const pos = new Vector3();
  const look = new Vector3();
  const wantPos = new Vector3();
  const wantLook = new Vector3();
  let fov = -1;

  function target(focus: CameraFocus): void {
    const { camera: c, throw: t } = getConfig();
    if (mode === 'flight' && c.follow && focus.ball) {
      const b = focus.ball;
      wantPos.set(b.x, c.followHeight + b.y * 0.5, b.z + c.followBack);
      wantLook.set(b.x, b.y, b.z);
    } else if (mode === 'rest' && c.closeUpAfterRest && focus.jack) {
      const pts = focus.frame.length > 0 ? focus.frame : [focus.jack];
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
      const mx = (minX + maxX) / 2;
      const mz = (minZ + maxZ) / 2;
      // Back off along the same viewing direction until the points fit (limited by closeUpMaxZoomOut).
      const baseDist = Math.hypot(c.closeUpHeight, c.closeUpBack);
      const halfH = baseDist * Math.tan((c.fovDeg * Math.PI) / 360);
      const halfW = halfH * camera.aspect;
      const need = Math.max((maxX - minX) / 2 / (halfW * FRAME_FILL_X), (maxZ - minZ) / 2 / (halfH * FRAME_FILL_Z));
      const zoom = Math.min(Math.max(1, c.closeUpMaxZoomOut), Math.max(1, need));
      wantPos.set(mx, c.closeUpHeight * zoom, mz + c.closeUpBack * zoom);
      wantLook.set(mx, 0, mz + REST_LOOK_TOWARD_CAMERA * zoom);
    } else {
      wantPos.set(t.originX + c.aimSideOffset, c.height, t.originZ + c.back);
      wantLook.set(t.originX, 0, t.originZ - c.aimLookAhead);
    }
  }

  function apply(): void {
    const f = getConfig().camera.fovDeg;
    if (f !== fov) {
      fov = f;
      camera.fov = f;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(pos);
    camera.lookAt(look);
  }

  return {
    setMode(m) {
      mode = m;
    },
    getMode: () => mode,
    update(dt, focus) {
      target(focus);
      const lerp = Math.min(1, Math.max(0.001, getConfig().camera.followLerp));
      const alpha = 1 - Math.pow(1 - lerp, Math.max(0, dt) * 60);
      pos.lerp(wantPos, alpha);
      look.lerp(wantLook, alpha);
      apply();
    },
    snap(focus) {
      target(focus);
      pos.copy(wantPos);
      look.copy(wantLook);
      apply();
    },
  };
}
