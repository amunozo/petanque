/**
 * Every game-feel number lives here. The in-game panel edits a live copy of
 * GameConfig; code must read values from the live config each time it needs
 * them (never cache them in module constants).
 */
import type { BallSpec, PhysicsConfig } from '../engine/types';
import type { AiDifficulty, AiLevel } from '../games/petanque/aiTypes';
import type { MatchRules } from '../games/petanque/matchTypes';

export type LoftPreset = 'roll' | 'half' | 'lob' | 'shoot';
export type ControlScheme = 'slingshot' | 'flick';
/** Renderer tone mapping (src/render/lighting.ts). 'neutral' keeps colours the most saturated. */
export type ToneMappingChoice = 'neutral' | 'agx' | 'aces' | 'none';

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
    /**
     * 'shoot' aim ring sits this far (m) beyond the first ground contact: a boule
     * under the ring is struck squarely (in the air / first hop), not on its top.
     */
    shootRingAhead: number;
    /** Random error, 1 standard deviation. */
    aimNoiseDeg: number;
    powerNoisePct: number;
    /**
     * Per-loft multipliers on the random error (see engine/throwModel.ts): a high lob
     * is harder to judge (more error), a practised shot flies along a straight line.
     */
    aimNoiseMulRoll: number;
    aimNoiseMulHalf: number;
    aimNoiseMulLob: number;
    aimNoiseMulShoot: number;
    powerNoiseMulRoll: number;
    powerNoiseMulHalf: number;
    powerNoiseMulLob: number;
    powerNoiseMulShoot: number;
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
  /**
   * Scene look: sun colour / intensity, sky fill, baked-shadow and ambient-occlusion strength, colour
   * grade, exposure, haze. Read live by src/render/lighting.ts. The sun DIRECTION is not here: the
   * scenery's shadows are baked with it (art/lib/layout.py -> src/render/bakedLayout.ts).
   */
  look: {
    /** Tone-mapping curve. */
    toneMapping: ToneMappingChoice;
    /** Saturation of the scenery (1 = as modelled, >1 more vivid, 0 = grey). Balls and markers are not affected. */
    saturation: number;
    /** Sun colour temperature (K): ~3500 golden, ~5000 warm white, 6500 neutral white. */
    sunTempK: number;
    /** Directional light intensity. */
    sunIntensity: number;
    /** Tone-mapping exposure. */
    exposure: number;
    /** Exponential fog density (1/m): higher = hazier distance. */
    fogDensity: number;
    /** Sky/ground fill light (hemisphere) intensity: higher = lighter shade. */
    fillIntensity: number;
    /** How dark cast shadows are, baked and real-time (0 = none, 1 = full). */
    shadowStrength: number;
    /** Baked ambient occlusion (contact shade at wall feet, under trees, between boards): 0 = off, 1 = full. */
    aoStrength: number;
    /** Gravel grain on the ground (0 = smooth colour only). */
    groundGrain: number;
    /** Baked bounce light (sunlight reflected by the ground and walls into the shade): 0 = off, 1 = as baked. */
    bounceStrength: number;
  };
  /** Rules of a full match (see games/petanque/match.ts). */
  match: MatchRules;
  /** Computer opponent per difficulty (see games/petanque/ai.ts). */
  ai: Record<AiDifficulty, AiLevel>;
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
    arena: { minX: -2, maxX: 2, minZ: -9.5, maxZ: 5.5, boardContact: 'dead', boardRestitution: 0.3, endBoardRestitution: 0.3, endBoards: true },
  },
  balls: {
    // Steel boule: soft landings (roll, half-lob) roll true; a hard, steep landing
    // (high lob) digs into the gravel and is kicked unpredictably.
    boule: {
      radius: 0.0375,
      mass: 0.7,
      restitution: 0.6,
      landingScatter: 20,
      landingScatterSpeed: 0.1,
      landingScatterMinImpact: 5.2,
      landingScatterFullImpact: 9,
    },
    // The 30 mm wooden jack: sinks into the gravel (more rolling resistance), is
    // deflected more by small bumps, hops a little more on landing than a boule
    // and gets kicked sideways by the grit it lands on.
    jack: {
      radius: 0.015,
      mass: 0.015,
      restitution: 0.5,
      rollingResistanceMul: 1.6,
      roughnessMul: 3,
      impactRestitution: 0.28,
      impactFriction: 0.22,
      // Grit kick at each ground contact: unrepeatable placement (deterministic per contact point).
      landingScatter: 10,
      landingScatterSpeed: 0.14,
    },
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
    loftShootDeg: 26,
    backspinRoll: 0,
    backspinHalf: 0,
    backspinLob: 0,
    backspinShoot: 100,
    shootSpeedMul: 1.35,
    shootRingAhead: 0.1,
    aimNoiseDeg: 0.8,
    powerNoisePct: 1.5,
    aimNoiseMulRoll: 1,
    aimNoiseMulHalf: 1,
    aimNoiseMulLob: 1.3,
    aimNoiseMulShoot: 0.6,
    powerNoiseMulRoll: 1,
    powerNoiseMulHalf: 1,
    powerNoiseMulLob: 1.4,
    powerNoiseMulShoot: 0.5,
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
  look: {
    toneMapping: 'neutral',
    saturation: 1,
    sunTempK: 5200,
    sunIntensity: 4.3,
    exposure: 1.08,
    fogDensity: 0.006,
    fillIntensity: 1.6,
    shadowStrength: 0.86,
    aoStrength: 0.8,
    groundGrain: 0.5,
    bounceStrength: 1,
  },
  match: { pointsToWin: 13, boulesPerTeam: 3, jackMinDist: 6, jackMaxDist: 10, jackMinSideMargin: 0.5 },
  ai: {
    easy: { aimErrorDeg: 3, powerErrorPct: 8, canShoot: false, maxSimulations: 30 },
    medium: { aimErrorDeg: 1.5, powerErrorPct: 4, canShoot: true, maxSimulations: 80 },
    hard: { aimErrorDeg: 0.6, powerErrorPct: 1.5, canShoot: true, maxSimulations: 160 },
  },
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
      { path: 'throw.shootRingAhead', label: 'shoot ring ahead m', min: 0, max: 0.5, step: 0.01 },
      { path: 'throw.backspinRoll', label: 'roll backspin', min: 0, max: 100, step: 1 },
      { path: 'throw.backspinHalf', label: 'half backspin', min: 0, max: 100, step: 1 },
      { path: 'throw.backspinLob', label: 'lob backspin', min: 0, max: 100, step: 1 },
      { path: 'throw.backspinShoot', label: 'shoot backspin', min: 0, max: 100, step: 1 },
      { path: 'throw.aimNoiseDeg', label: 'aim error°', min: 0, max: 5, step: 0.1 },
      { path: 'throw.powerNoisePct', label: 'power error %', min: 0, max: 10, step: 0.1 },
      { path: 'throw.aimNoiseMulRoll', label: 'roll aim error ×', min: 0, max: 3, step: 0.05 },
      { path: 'throw.aimNoiseMulHalf', label: 'half aim error ×', min: 0, max: 3, step: 0.05 },
      { path: 'throw.aimNoiseMulLob', label: 'lob aim error ×', min: 0, max: 3, step: 0.05 },
      { path: 'throw.aimNoiseMulShoot', label: 'shoot aim error ×', min: 0, max: 3, step: 0.05 },
      { path: 'throw.powerNoiseMulRoll', label: 'roll power error ×', min: 0, max: 3, step: 0.05 },
      { path: 'throw.powerNoiseMulHalf', label: 'half power error ×', min: 0, max: 3, step: 0.05 },
      { path: 'throw.powerNoiseMulLob', label: 'lob power error ×', min: 0, max: 3, step: 0.05 },
      { path: 'throw.powerNoiseMulShoot', label: 'shoot power error ×', min: 0, max: 3, step: 0.05 },
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
      { path: 'physics.arena.boardContact', label: 'board contact', options: ['dead', 'bounce'] },
      { path: 'physics.arena.boardRestitution', label: 'board bounce', min: 0, max: 1, step: 0.01 },
      { path: 'physics.arena.endBoardRestitution', label: 'end board bounce', min: 0, max: 1, step: 0.01 },
      { path: 'physics.arena.endBoards', label: 'end boards', toggle: true },
    ],
  },
  {
    title: 'Balls & air',
    fields: [
      { path: 'physics.gravity', label: 'gravity', min: 2, max: 20, step: 0.1 },
      { path: 'physics.airDrag', label: 'air drag', min: 0, max: 0.5, step: 0.005 },
      { path: 'balls.boule.restitution', label: 'boule bounce', min: 0, max: 1, step: 0.01 },
      { path: 'balls.boule.mass', label: 'boule mass kg', min: 0.3, max: 1.5, step: 0.01 },
      { path: 'balls.boule.landingScatter', label: 'boule landing scatter°', min: 0, max: 45, step: 0.5 },
      { path: 'balls.boule.landingScatterSpeed', label: 'boule scatter speed', min: 0, max: 1, step: 0.01 },
      { path: 'balls.boule.landingScatterMinImpact', label: 'boule scatter from m/s', min: 0, max: 10, step: 0.1 },
      { path: 'balls.boule.landingScatterFullImpact', label: 'boule scatter full m/s', min: 0.5, max: 15, step: 0.1 },
      { path: 'balls.jack.restitution', label: 'jack bounce', min: 0, max: 1, step: 0.01 },
      { path: 'balls.jack.mass', label: 'jack mass kg', min: 0.005, max: 0.2, step: 0.005 },
      { path: 'balls.jack.rollingResistanceMul', label: 'jack rolling friction ×', min: 0.5, max: 3, step: 0.05 },
      { path: 'balls.jack.roughnessMul', label: 'jack bumpiness ×', min: 0, max: 10, step: 0.1 },
      { path: 'balls.jack.impactRestitution', label: 'jack landing bounce', min: 0, max: 0.8, step: 0.01 },
      { path: 'balls.jack.impactFriction', label: 'jack landing grip', min: 0, max: 1.5, step: 0.01 },
      { path: 'balls.jack.landingScatter', label: 'jack landing scatter°', min: 0, max: 30, step: 0.5 },
      { path: 'balls.jack.landingScatterSpeed', label: 'jack scatter speed', min: 0, max: 0.5, step: 0.01 },
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
    title: 'Look',
    fields: [
      { path: 'look.toneMapping', label: 'tone mapping', options: ['neutral', 'agx', 'aces', 'none'] },
      { path: 'look.saturation', label: 'saturation', min: 0, max: 2, step: 0.05 },
      { path: 'look.sunTempK', label: 'sun colour K', min: 2500, max: 8000, step: 100 },
      { path: 'look.sunIntensity', label: 'sun intensity', min: 0, max: 8, step: 0.1 },
      { path: 'look.exposure', label: 'exposure', min: 0.3, max: 2.5, step: 0.05 },
      { path: 'look.fogDensity', label: 'haze', min: 0, max: 0.08, step: 0.002 },
      { path: 'look.fillIntensity', label: 'shade fill', min: 0, max: 5, step: 0.05 },
      { path: 'look.shadowStrength', label: 'shadow darkness', min: 0, max: 1, step: 0.05 },
      { path: 'look.aoStrength', label: 'ambient occlusion', min: 0, max: 1, step: 0.05 },
      { path: 'look.groundGrain', label: 'ground grain', min: 0, max: 1.5, step: 0.05 },
      { path: 'look.bounceStrength', label: 'bounce light', min: 0, max: 3, step: 0.05 },
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
  {
    title: 'Computer',
    fields: [
      { path: 'ai.easy.aimErrorDeg', label: 'easy aim error°', min: 0, max: 10, step: 0.1 },
      { path: 'ai.easy.powerErrorPct', label: 'easy power error %', min: 0, max: 25, step: 0.5 },
      { path: 'ai.easy.canShoot', label: 'easy shoots', toggle: true },
      { path: 'ai.easy.maxSimulations', label: 'easy max sims', min: 5, max: 400, step: 5 },
      { path: 'ai.medium.aimErrorDeg', label: 'medium aim error°', min: 0, max: 10, step: 0.1 },
      { path: 'ai.medium.powerErrorPct', label: 'medium power error %', min: 0, max: 25, step: 0.5 },
      { path: 'ai.medium.canShoot', label: 'medium shoots', toggle: true },
      { path: 'ai.medium.maxSimulations', label: 'medium max sims', min: 5, max: 400, step: 5 },
      { path: 'ai.hard.aimErrorDeg', label: 'hard aim error°', min: 0, max: 10, step: 0.1 },
      { path: 'ai.hard.powerErrorPct', label: 'hard power error %', min: 0, max: 25, step: 0.5 },
      { path: 'ai.hard.canShoot', label: 'hard shoots', toggle: true },
      { path: 'ai.hard.maxSimulations', label: 'hard max sims', min: 5, max: 400, step: 5 },
    ],
  },
];
