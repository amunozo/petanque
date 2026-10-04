/**
 * Fixed-step ball physics. See `step` for the model.
 *
 * Model summary
 *  - flying : gravity + linear air drag, semi-implicit Euler. On ground contact
 *      (centre y <= radius while descending) the landing rule applies:
 *        vy' = -impactRestitution * vy
 *        horizontal speed -= min(|vh|, impactFriction * (1 + e) * |vy|)
 *      so a steep lob lands and nearly stops while a flat roll keeps its speed.
 *      If the bounce speed e*|vy| is below gravity*fixedDt*BOUNCE_REST_STEPS the
 *      ball starts rolling, otherwise it hops again.
 *  - rolling: horizontal deceleration rollingResistance*gravity against the
 *      motion, plus slope acceleration -gravity*slope from the deterministic
 *      bumpiness field. Backspin (Body.spin, rad/s) acts as sliding friction:
 *      while spin > 0 the deceleration is increased by impactFriction*gravity
 *      and the spin decays at 2.5*impactFriction*gravity/radius rad/s^2 (solid
 *      sphere) until it is used up. Spin never reverses the ball (no "retro").
 *      A ball slower than restSpeed whose slope pull does not exceed rolling
 *      friction comes to rest.
 *  - collisions: see collisions.ts. Boards: see `applyBounds`.
 */
import { BOUNCE_REST_STEPS, resolveCollisions, substepCount } from './collisions';
import { groundSlope } from './ground';
import type { Body, PhysicsConfig, SimEvent, ThrowParams, World } from './types';
import type { Vec3 } from './vec3';
import { cloneWorld, createBody, isSettled, launch } from './world';

export { cloneWorld, createBody, isSettled, launch };

/** Landings softer than this (m/s) are not worth an event (micro hops). */
const LAND_EVENT_MIN_SPEED = 0.05;
/** Solid-sphere moment of inertia ratio: spin change per unit friction impulse. */
const SOLID_SPHERE_SPIN_FACTOR = 2.5;

function applyLanding(b: Body, cfg: PhysicsConfig, prev: Vec3, events: SimEvent[]): void {
  const r = b.spec.radius;
  const { surface, arena } = cfg;

  // Move back along the sub-step to the moment of contact (y == radius).
  const drop = prev.y - b.pos.y;
  const f = drop > 0 ? Math.min(1, Math.max(0, (prev.y - r) / drop)) : 0;
  b.pos.x = prev.x + (b.pos.x - prev.x) * f;
  b.pos.z = prev.z + (b.pos.z - prev.z) * f;
  b.pos.y = r;

  const impact = -b.vel.y;
  if (impact >= LAND_EVENT_MIN_SPEED) events.push({ type: 'land', id: b.id, speed: impact });

  // Landing outside the arena footprint: the ball is out.
  if (b.pos.x < arena.minX || b.pos.x > arena.maxX || b.pos.z < arena.minZ || b.pos.z > arena.maxZ) {
    b.vel.x = 0;
    b.vel.y = 0;
    b.vel.z = 0;
    b.state = 'out';
    events.push({ type: 'out', id: b.id });
    return;
  }

  const e = surface.impactRestitution;
  const horizontal = Math.hypot(b.vel.x, b.vel.z);
  if (horizontal > 0) {
    const cut = Math.min(horizontal, surface.impactFriction * (1 + e) * impact);
    const k = (horizontal - cut) / horizontal;
    b.vel.x *= k;
    b.vel.z *= k;
  }
  const bounce = e * impact;
  if (bounce < cfg.gravity * cfg.fixedDt * BOUNCE_REST_STEPS) {
    b.vel.y = 0;
    b.state = 'rolling';
  } else {
    b.vel.y = bounce;
  }
}

function stepFlying(b: Body, cfg: PhysicsConfig, h: number, events: SimEvent[]): void {
  const prevX = b.pos.x;
  const prevY = b.pos.y;
  const prevZ = b.pos.z;
  b.vel.y -= cfg.gravity * h;
  const drag = cfg.airDrag * h;
  b.vel.x -= b.vel.x * drag;
  b.vel.y -= b.vel.y * drag;
  b.vel.z -= b.vel.z * drag;
  b.pos.x += b.vel.x * h;
  b.pos.y += b.vel.y * h;
  b.pos.z += b.vel.z * h;
  if (b.vel.y < 0 && b.pos.y <= b.spec.radius) {
    applyLanding(b, cfg, { x: prevX, y: prevY, z: prevZ }, events);
  }
}

function stepRolling(b: Body, cfg: PhysicsConfig, h: number, events: SimEvent[]): void {
  const { surface } = cfg;
  const g = cfg.gravity;
  const slope = groundSlope(b.pos.x, b.pos.z, surface);
  const ax = -g * slope.x;
  const az = -g * slope.z;
  b.vel.x += ax * h;
  b.vel.z += az * h;
  b.vel.y = 0;

  let spin = b.spin ?? 0;
  let decel = surface.rollingResistance * g;
  if (spin > 0) {
    decel += surface.impactFriction * g;
    spin = Math.max(0, spin - ((SOLID_SPHERE_SPIN_FACTOR * surface.impactFriction * g) / b.spec.radius) * h);
  }
  const speed = Math.hypot(b.vel.x, b.vel.z);
  if (speed > 0) {
    const k = Math.max(0, speed - decel * h) / speed;
    b.vel.x *= k;
    b.vel.z *= k;
  }
  if (speed - decel * h <= 0) spin = 0;
  if (b.spin !== undefined || spin > 0) b.spin = spin;

  b.pos.x += b.vel.x * h;
  b.pos.z += b.vel.z * h;
  b.pos.y = b.spec.radius;
  // axis * angle with axis = up x v/|v| and angle = |v| h / r.
  b.rot.x += (b.vel.z * h) / b.spec.radius;
  b.rot.z -= (b.vel.x * h) / b.spec.radius;

  if (Math.hypot(b.vel.x, b.vel.z) < cfg.restSpeed && Math.hypot(ax, az) <= surface.rollingResistance * g) {
    b.vel.x = 0;
    b.vel.y = 0;
    b.vel.z = 0;
    if (b.spin !== undefined) b.spin = 0;
    b.state = 'resting';
    events.push({ type: 'rest', id: b.id });
  }
}

/**
 * Reflects one axis of a ground ball against a board pair. `pos`/`vel` are the
 * axis components; returns the new [pos, vel] and the impact speed (0 = none).
 * The position is always clamped to the playing side of the board (so even a
 * very fast ball cannot pass through within one sub-step); the velocity only
 * reflects while the ball is rolling and moving into the board.
 */
function boardAxis(
  pos: number,
  vel: number,
  lo: number,
  hi: number,
  r: number,
  restitution: number,
  rolling: boolean,
): { pos: number; vel: number; hit: number } {
  if (pos - r < lo) {
    if (rolling && vel < 0) return { pos: lo + r, vel: -vel * restitution, hit: -vel };
    return { pos: lo + r, vel, hit: 0 };
  }
  if (pos + r > hi) {
    if (rolling && vel > 0) return { pos: hi - r, vel: -vel * restitution, hit: vel };
    return { pos: hi - r, vel, hit: 0 };
  }
  return { pos, vel, hit: 0 };
}

/**
 * Arena limits for balls on the ground. Side boards (x) and, when
 * `arena.endBoards`, end boards (z): rolling balls bounce (one 'board' event
 * per impact, the faster axis speed in a corner), flying balls pass over (they
 * are judged when they land). Without end boards, a ground ball whose centre
 * crosses minZ/maxZ turns 'out'.
 */
function applyBounds(b: Body, cfg: PhysicsConfig, events: SimEvent[]): void {
  if (b.state === 'out' || b.state === 'flying') return;
  const { arena } = cfg;
  const r = b.spec.radius;
  const isRolling = b.state === 'rolling';
  if (!arena.endBoards && (b.pos.z < arena.minZ || b.pos.z > arena.maxZ)) {
    b.vel.x = 0;
    b.vel.y = 0;
    b.vel.z = 0;
    b.state = 'out';
    events.push({ type: 'out', id: b.id });
    return;
  }
  const x = boardAxis(b.pos.x, b.vel.x, arena.minX, arena.maxX, r, arena.boardRestitution, isRolling);
  b.pos.x = x.pos;
  b.vel.x = x.vel;
  let hit = x.hit;
  if (arena.endBoards) {
    const z = boardAxis(b.pos.z, b.vel.z, arena.minZ, arena.maxZ, r, arena.endBoardRestitution, isRolling);
    b.pos.z = z.pos;
    b.vel.z = z.vel;
    if (z.hit > hit) hit = z.hit;
  }
  if (hit > 0) events.push({ type: 'board', id: b.id, speed: hit });
}

/**
 * Advances ONE fixed step of `cfg.fixedDt`, MUTATING `world` in place
 * (use `cloneWorld` first to keep the old state). Returns the events that
 * occurred, in deterministic order.
 *
 * If any pair of balls is close enough to touch during the step, the step is
 * split into equal sub-steps so that no pair closes more than half the smaller
 * radius per sub-step — fast balls cannot tunnel through each other.
 */
export function step(world: World, cfg: PhysicsConfig): SimEvent[] {
  const events: SimEvent[] = [];
  const n = substepCount(world.bodies, cfg.fixedDt);
  const h = cfg.fixedDt / n;
  for (let k = 0; k < n; k++) {
    for (const b of world.bodies) {
      if (b.state === 'flying') stepFlying(b, cfg, h, events);
      else if (b.state === 'rolling') stepRolling(b, cfg, h, events);
    }
    resolveCollisions(world.bodies, cfg, events);
    for (const b of world.bodies) applyBounds(b, cfg, events);
  }
  world.time += cfg.fixedDt;
  return events;
}

/**
 * Runs `step` on a COPY of `world` until everything is resting/out or
 * `maxTime` simulated seconds pass. On timeout every remaining ball is forced
 * to rest where it is (a 'rest' event is emitted for each).
 */
export function simulateToRest(world: World, cfg: PhysicsConfig, maxTime = 30): { world: World; events: SimEvent[] } {
  const w = cloneWorld(world);
  const events: SimEvent[] = [];
  const end = w.time + maxTime;
  while (!isSettled(w) && w.time < end) {
    for (const e of step(w, cfg)) events.push(e);
  }
  for (const b of w.bodies) {
    if (b.state === 'resting' || b.state === 'out') continue;
    b.vel = { x: 0, y: 0, z: 0 };
    b.pos.y = b.spec.radius;
    b.state = 'resting';
    if (b.spin !== undefined) b.spin = 0;
    events.push({ type: 'rest', id: b.id });
  }
  return { world: w, events };
}

export interface FlightPrediction {
  /** Ball-centre positions along the airborne arc, from release to first ground contact (inclusive). */
  points: Vec3[];
  /** Ball-centre position at first ground contact (y === radius). */
  landing: Vec3;
  /** Flight time in seconds. */
  time: number;
}

/**
 * Samples the airborne arc of a throw until the first ground contact, using the
 * exact same integration as `step` for a lone ball (so the landing point equals
 * the real first 'land' position unless another ball interferes mid-air).
 * `sampleInterval` is the time between points (default 1/60 s).
 */
export function predictFlight(
  params: ThrowParams,
  cfg: PhysicsConfig,
  radius: number,
  sampleInterval = 1 / 60,
  maxTime = 10,
): FlightPrediction {
  const probe = createBody('predict', 'predict', { radius, mass: 1, restitution: 0 }, params.origin);
  const world = launch({ time: 0, bodies: [] }, probe, params);
  const body = world.bodies[0] as Body;
  const points: Vec3[] = [{ ...body.pos }];
  const every = Math.max(1, Math.round(sampleInterval / cfg.fixedDt));
  let i = 0;
  let landed = false;
  while (!landed && world.time < maxTime) {
    const events = step(world, cfg);
    i++;
    // First ground contact: a 'land' event, or the ball is no longer flying
    // (soft landings below the event threshold, or landing out of bounds).
    landed = body.state !== 'flying' || events.some((e) => e.type === 'land');
    if (landed || i % every === 0) points.push({ ...body.pos });
  }
  return { points, landing: { ...body.pos }, time: world.time };
}
