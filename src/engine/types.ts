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

/** Axis-aligned playing area on the XZ plane. */
export interface ArenaConfig {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Side boards (x = minX/maxX): restitution of a ball bouncing off them. */
  boardRestitution: number;
  /** Balls crossing minZ/maxZ, or touching the ground outside x bounds, become 'out'. */
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
