/**
 * Every game-feel number lives here. The in-game panel edits a live copy of
 * GameConfig; code must read values from the live config each time it needs
 * them (never cache them in module constants).
 */
import type { BallSpec, PhysicsConfig } from '../engine/types';
import type { MatchRules } from '../games/petanque/matchTypes';

export type LoftPreset = 'roll' | 'half' | 'lob' | 'shoot';
export type ControlScheme = 'slingshot' | 'flick';

export interface GameConfig {
  physics: PhysicsConfig;
  balls: { boule: BallSpec; jack: BallSpec };
  throw: {
    /** Hand position at release. */
    originX: number;
    originY: number;
    originZ: number;
    /** Launch speed at power = 1 (m/s). */
    maxSpeed: number;
    /** Launch speed at power = 0 (m/s). */
    minSpeed: number;
    /** power -> speed curve exponent (>1 gives finer control at low power). */
    powerCurve: number;
    /** Elevation angle per loft preset (degrees). */
    loftRollDeg: number;
    loftHalfDeg: number;
    loftLobDeg: number;
    loftShootDeg: number;
    /** Backspin per loft preset (rad/s). */
    backspinRoll: number;
    backspinHalf: number;
    backspinLob: number;
    backspinShoot: number;
    /** Multiplies min/max launch speed for the 'shoot' loft (le tir). */
    shootSpeedMul: number;
    /** Random error, 1 standard deviation. */
    aimNoiseDeg: number;
    powerNoisePct: number;
  };
  controls: {
    scheme: ControlScheme;
    /** Slingshot: drag distance that gives power = 1, as a fraction of the viewport height. */
    fullPowerDragFrac: number;
    /** Max aim angle either side (degrees). */
    maxAimDeg: number;
    /** Multiplier from finger angle to aim angle (lower = finer aim). */
    aimSensitivity: number;
    /** Flick: finger speed (px/s) that gives power = 1. */
    flickFullPowerPxPerS: number;
    showLandingMarker: boolean;
    /** Fraction (0..1) of the predicted roll-out (landing -> rest point) drawn as a fading ground line; 0 hides it. */
    rollHintFrac: number;
    /** Left-edge power bar while dragging. */
    showPowerMeter: boolean;
    /** Vibrate on landings and ball hits (where the browser supports it). */
    haptics: boolean;
  };
  camera: {
    fovDeg: number;
    height: number;
    /** Distance behind the throwing circle. */
    back: number;
    /** Aim camera shifted sideways (m) so the flight arc is seen at an angle; still looks at the centre line. */
    aimSideOffset: number;
    /** Follow the thrown ball. */
    follow: boolean;
    /** 0..1 smoothing per frame toward the target (higher = snappier). */
    followLerp: number;
    /** After everything rests, show a close look around the jack. */
    closeUpAfterRest: boolean;
    /** Simulation speed multiplier for the visual playback (1 = real time). */
    playbackSpeed: number;
    /** Aim view looks at the ground this far ahead of the throwing circle (m). */
    aimLookAhead: number;
    /** Follow view: height above / distance behind the ball (m). */
    followHeight: number;
    followBack: number;
    /** Close-up view: height above / distance behind the jack (m). */
    closeUpHeight: number;
    closeUpBack: number;
    /** The close-up backs off by up to this factor to keep the jack and the nearest boule in view. */
    closeUpMaxZoomOut: number;
  };
  practice: {
    jackMinDist: number;
    jackMaxDist: number;
    boulesPerEnd: number;
  };
  /** Rules of a full match (see games/petanque/match.ts). */
  match: MatchRules;
}

export const defaultConfig: GameConfig = {
  physics: {
    gravity: 9.81,
    airDrag: 0.02,
    fixedDt: 1 / 240,
    restSpeed: 0.03,
    surface: {
      impactRestitution: 0.15,
      impactFriction: 0.3,
      rollingResistance: 0.3,
      roughness: 0.01,
      roughnessScale: 0.4,
    },
    arena: { minX: -2, maxX: 2, minZ: -9.5, maxZ: 5.5, boardRestitution: 0.3 },
  },
  balls: {
    boule: { radius: 0.0375, mass: 0.7, restitution: 0.6 },
    jack: { radius: 0.015, mass: 0.015, restitution: 0.5 },
  },
  throw: {
    originX: 0,
    originY: 0.5,
    originZ: 5,
    maxSpeed: 11,
    minSpeed: 1,
    powerCurve: 1.3,
    loftRollDeg: 10,
    loftHalfDeg: 32,
    loftLobDeg: 52,
    loftShootDeg: 20,
    backspinRoll: 0,
    backspinHalf: 0,
    backspinLob: 0,
    backspinShoot: 0,
    shootSpeedMul: 1.35,
    aimNoiseDeg: 0.8,
    powerNoisePct: 1.5,
  },
  controls: {
    scheme: 'slingshot',
    fullPowerDragFrac: 0.3,
    maxAimDeg: 20,
    aimSensitivity: 0.6,
    flickFullPowerPxPerS: 2500,
    showLandingMarker: true,
    rollHintFrac: 0.5,
    showPowerMeter: false,
    haptics: true,
  },
  camera: {
    fovDeg: 58,
    height: 2.3,
    back: 2.0,
    aimSideOffset: 0,
    follow: true,
    followLerp: 0.08,
    closeUpAfterRest: true,
    playbackSpeed: 1,
    aimLookAhead: 3.4,
    followHeight: 0.9,
    followBack: 2.2,
    closeUpHeight: 1.5,
    closeUpBack: 1.2,
    closeUpMaxZoomOut: 5,
  },
  practice: { jackMinDist: 6, jackMaxDist: 10, boulesPerEnd: 3 },
  match: { pointsToWin: 13, boulesPerTeam: 3, jackMinDist: 6, jackMaxDist: 10, jackMinSideMargin: 0.5 },
};

/** UI metadata for the tuning panel. `path` is a dot path into GameConfig. */
export type TuningField =
  | { path: string; label: string; min: number; max: number; step: number }
  | { path: string; label: string; options: readonly string[] }
  | { path: string; label: string; toggle: true };

export interface TuningFolder {
  title: string;
  fields: TuningField[];
}

export const tuningSchema: TuningFolder[] = [
  {
    title: 'Throw',
    fields: [
      { path: 'throw.maxSpeed', label: 'max speed', min: 4, max: 20, step: 0.1 },
      { path: 'throw.minSpeed', label: 'min speed', min: 0, max: 5, step: 0.1 },
      { path: 'throw.powerCurve', label: 'power curve', min: 0.5, max: 3, step: 0.05 },
      { path: 'throw.loftRollDeg', label: 'roll angle°', min: 0, max: 30, step: 1 },
      { path: 'throw.loftHalfDeg', label: 'half angle°', min: 15, max: 55, step: 1 },
      { path: 'throw.loftLobDeg', label: 'lob angle°', min: 35, max: 80, step: 1 },
      { path: 'throw.loftShootDeg', label: 'shoot angle°', min: 0, max: 45, step: 1 },
      { path: 'throw.shootSpeedMul', label: 'shoot speed ×', min: 1, max: 2, step: 0.01 },
      { path: 'throw.backspinRoll', label: 'roll backspin', min: 0, max: 100, step: 1 },
      { path: 'throw.backspinHalf', label: 'half backspin', min: 0, max: 100, step: 1 },
      { path: 'throw.backspinLob', label: 'lob backspin', min: 0, max: 100, step: 1 },
      { path: 'throw.backspinShoot', label: 'shoot backspin', min: 0, max: 100, step: 1 },
      { path: 'throw.aimNoiseDeg', label: 'aim error°', min: 0, max: 5, step: 0.1 },
      { path: 'throw.powerNoisePct', label: 'power error %', min: 0, max: 10, step: 0.1 },
      { path: 'throw.originY', label: 'release height', min: 0.1, max: 1.2, step: 0.05 },
    ],
  },
  {
    title: 'Ground',
    fields: [
      { path: 'physics.surface.rollingResistance', label: 'rolling friction', min: 0.01, max: 0.5, step: 0.005 },
      { path: 'physics.surface.impactFriction', label: 'landing grip', min: 0, max: 1.5, step: 0.01 },
      { path: 'physics.surface.impactRestitution', label: 'landing bounce', min: 0, max: 0.8, step: 0.01 },
      { path: 'physics.surface.roughness', label: 'bumpiness', min: 0, max: 0.08, step: 0.001 },
      { path: 'physics.surface.roughnessScale', label: 'bump size m', min: 0.05, max: 2, step: 0.05 },
      { path: 'physics.arena.boardRestitution', label: 'board bounce', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Balls & air',
    fields: [
      { path: 'physics.gravity', label: 'gravity', min: 2, max: 20, step: 0.1 },
      { path: 'physics.airDrag', label: 'air drag', min: 0, max: 0.5, step: 0.005 },
      { path: 'balls.boule.restitution', label: 'boule bounce', min: 0, max: 1, step: 0.01 },
      { path: 'balls.boule.mass', label: 'boule mass kg', min: 0.3, max: 1.5, step: 0.01 },
      { path: 'balls.jack.restitution', label: 'jack bounce', min: 0, max: 1, step: 0.01 },
      { path: 'balls.jack.mass', label: 'jack mass kg', min: 0.005, max: 0.2, step: 0.005 },
      { path: 'physics.restSpeed', label: 'rest speed', min: 0.005, max: 0.2, step: 0.005 },
    ],
  },
  {
    title: 'Controls',
    fields: [
      { path: 'controls.scheme', label: 'scheme', options: ['slingshot', 'flick'] },
      { path: 'controls.fullPowerDragFrac', label: 'full power drag (screen)', min: 0.1, max: 0.6, step: 0.01 },
      { path: 'controls.flickFullPowerPxPerS', label: 'flick full power px/s', min: 500, max: 6000, step: 50 },
      { path: 'controls.maxAimDeg', label: 'max aim°', min: 5, max: 45, step: 1 },
      { path: 'controls.aimSensitivity', label: 'aim sensitivity', min: 0.1, max: 2, step: 0.05 },
      { path: 'controls.showLandingMarker', label: 'landing marker', toggle: true },
      { path: 'controls.rollHintFrac', label: 'roll hint', min: 0, max: 1, step: 0.05 },
      { path: 'controls.showPowerMeter', label: 'power meter', toggle: true },
      { path: 'controls.haptics', label: 'haptics', toggle: true },
    ],
  },
  {
    title: 'Camera',
    fields: [
      { path: 'camera.fovDeg', label: 'fov°', min: 30, max: 90, step: 1 },
      { path: 'camera.height', label: 'height', min: 0.5, max: 5, step: 0.05 },
      { path: 'camera.back', label: 'back', min: 0, max: 8, step: 0.1 },
      { path: 'camera.aimSideOffset', label: 'aim side offset m', min: -2, max: 2, step: 0.1 },
      { path: 'camera.follow', label: 'follow ball', toggle: true },
      { path: 'camera.followLerp', label: 'follow speed', min: 0.01, max: 1, step: 0.01 },
      { path: 'camera.closeUpAfterRest', label: 'close-up after rest', toggle: true },
      { path: 'camera.playbackSpeed', label: 'playback speed', min: 0.25, max: 3, step: 0.05 },
      { path: 'camera.aimLookAhead', label: 'aim look-ahead m', min: 2, max: 14, step: 0.5 },
      { path: 'camera.followHeight', label: 'follow height', min: 0.3, max: 4, step: 0.05 },
      { path: 'camera.followBack', label: 'follow back', min: 0.5, max: 8, step: 0.1 },
      { path: 'camera.closeUpHeight', label: 'close-up height', min: 0.4, max: 4, step: 0.05 },
      { path: 'camera.closeUpBack', label: 'close-up back', min: 0.3, max: 4, step: 0.05 },
      { path: 'camera.closeUpMaxZoomOut', label: 'close-up max zoom-out', min: 1, max: 6, step: 0.1 },
    ],
  },
  {
    title: 'Practice',
    fields: [
      { path: 'practice.jackMinDist', label: 'jack min m', min: 3, max: 12, step: 0.5 },
      { path: 'practice.jackMaxDist', label: 'jack max m', min: 4, max: 14, step: 0.5 },
      { path: 'practice.boulesPerEnd', label: 'boules', min: 1, max: 6, step: 1 },
    ],
  },
  {
    title: 'Match',
    fields: [
      { path: 'match.pointsToWin', label: 'points to win', min: 1, max: 13, step: 1 },
      { path: 'match.boulesPerTeam', label: 'boules per team', min: 1, max: 6, step: 1 },
      { path: 'match.jackMinDist', label: 'jack min m', min: 3, max: 12, step: 0.5 },
      { path: 'match.jackMaxDist', label: 'jack max m', min: 4, max: 14, step: 0.5 },
      { path: 'match.jackMinSideMargin', label: 'jack side margin m', min: 0, max: 1.5, step: 0.05 },
    ],
  },
];
