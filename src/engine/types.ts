/**
 * Public contract of the throwing engine. Game-agnostic: pétanque, bocce and
 * (later, via another backend) mölkky build on these types.
 *
 * Rules: pure TS, no DOM/three.js, no Math.random/Date. Fixed timestep.
 * All values are plain serializable data (JSON round-trip safe).
 * Units: metres, seconds, kilograms. Y up. Throws go toward -Z.
 */
import type { Vec3 } from './vec3';

/** Physical properties of one kind of ball (boule, jack, bocce ball...). */
export interface BallSpec {
  radius: number;
  mass: number;
  /** Coefficient of restitution used for ball–ball impacts (pair uses the min). */
  restitution: number;
  /**
   * Optional per-ball surface modifiers (omitted = 1 / the SurfaceConfig value,
   * so existing balls and games behave exactly as before). They let a light
   * small ball (a wooden jack) interact with the same ground differently from
   * a heavy steel one.
   */
  /** Multiplies SurfaceConfig.rollingResistance (small balls sink into gravel: > 1). */
  rollingResistanceMul?: number;
  /** Multiplies the bump slope (SurfaceConfig.roughness) felt by this ball (small balls are deflected more: > 1). */
  roughnessMul?: number;
  /** Replaces SurfaceConfig.impactRestitution for this ball's landings (wood hops more than steel). */
  impactRestitution?: number;
  /** Replaces SurfaceConfig.impactFriction for this ball's landings and backspin (sliding) friction. */
  impactFriction?: number;
  /**
   * Max deflection (degrees) of the horizontal velocity at each ground impact,
   * a deterministic kick from the unevenness at the exact contact point
   * (grit, stones). 0/absent = off. Scales with impact speed.
   */
  landingScatter?: number;
  /** Max fractional change of the horizontal speed at each ground impact (0.1 = ±10 %), same kick source as `landingScatter`. */
  landingScatterSpeed?: number;
}

export type BodyState = 'flying' | 'rolling' | 'resting' | 'out';

export interface Body {
  id: string;
  /** Game-defined tag, e.g. 'boule' | 'jack'. The engine never interprets it. */
  kind: string;
  spec: BallSpec;
  /** Centre of the ball. Resting on flat ground means pos.y === spec.radius. */
  pos: Vec3;
  vel: Vec3;
  /** Accumulated rolling rotation (axis * angle, radians) — for rendering only. */
  rot: Vec3;
  state: BodyState;
  /**
   * Backspin (rad/s, >= 0). Set by `launch` from ThrowParams.backspin; spent
   * as extra sliding friction once the ball rolls. Absent = 0.
   */
  spin?: number;
}

/** Ground material. Tunable live. */
export interface SurfaceConfig {
  /** Vertical bounce on landing (0 = dead stop, 1 = perfect bounce). */
  impactRestitution: number;
  /** Friction coefficient at landing: how much horizontal speed a landing eats. */
  impactFriction: number;
  /** Rolling deceleration = rollingResistance * gravity (m/s²). */
  rollingResistance: number;
  /** Amplitude of the deterministic bumpiness field (dimensionless slope). */
  roughness: number;
  /** Size of one bump cell in metres. */
  roughnessScale: number;
}

export type BoardContact = 'bounce' | 'dead';

/** Axis-aligned playing area on the XZ plane. */
export interface ArenaConfig {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /**
   * What a ground ball does when its surface touches a board.
   * 'dead'   = it is out (FIPJP art. 18: a boule that leaves the authorised
   *            area is dead, and on enclosed courts the boards are the limit).
   *            Parked at the contact point; emits 'board' then 'out'.
   * 'bounce' = it reflects using the restitution fields below.
   */
  boardContact: BoardContact;
  /** Side boards (x = minX/maxX), 'bounce' mode: restitution of a ball bouncing off them. */
  boardRestitution: number;
  /**
   * End boards (z = minZ/maxZ): restitution of a rolling ball bouncing off them.
   * 'bounce' mode only; board contact needs `endBoards` to be true.
   */
  endBoardRestitution: number;
  /**
   * true  = boards run all around: rolling balls touch/bounce off the end boards too.
   * false = open ends (bocce, open courts): a ground ball whose centre crosses
   *         minZ/maxZ becomes 'out'.
   * Either way a ball that FIRST touches the ground outside the rectangle (by
   * centre) is 'out', and a ball still airborne is never blocked by a board.
   */
  endBoards: boolean;
}

export interface PhysicsConfig {
  gravity: number;
  /** Linear air drag coefficient (1/s) applied while flying. Small. */
  airDrag: number;
  /** Simulation step in seconds (e.g. 1/240). */
  fixedDt: number;
  /** Below this speed (m/s) a rolling ball comes to rest. */
  restSpeed: number;
  surface: SurfaceConfig;
  arena: ArenaConfig;
}

/** What the player (or AI, or a network peer) decided. Fully serializable. */
export interface ThrowParams {
  /** Horizontal aim angle (radians). 0 = straight toward -Z, positive = toward -X (left). */
  yaw: number;
  /** Launch elevation angle (radians) above horizontal. */
  pitch: number;
  /** Launch speed (m/s). */
  speed: number;
  /** Where the ball leaves the hand. */
  origin: Vec3;
  /** Backspin (rad/s); > 0 makes the ball check/stop sooner after landing. Optional. */
  backspin?: number;
}

export interface World {
  /** Simulated time in seconds. */
  time: number;
  bodies: Body[];
}

/** Things that happened during a step — for sound, haptics, camera, scoring. */
export type SimEvent =
  | { type: 'land'; id: string; speed: number }
  | { type: 'hit'; a: string; b: string; speed: number }
  | { type: 'board'; id: string; speed: number }
  | { type: 'rest'; id: string }
  | { type: 'out'; id: string };
