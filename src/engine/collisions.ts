/** Sphere–sphere collision handling (impulse + positional separation). */
import type { Body, PhysicsConfig, SimEvent } from './types';

/** Treat contacts with a relative normal speed below this as non-events. */
const HIT_EVENT_MIN_SPEED = 1e-3;
/** Coincident centres: pick a fixed normal instead of dividing by zero. */
const MIN_DISTANCE = 1e-9;
/**
 * Sub-step so that two balls approach each other by at most this fraction of
 * the smaller radius per sub-step (numerical safeguard against tunnelling).
 */
const MAX_TRAVEL_FRACTION = 0.5;
/** Upper bound on sub-steps per fixed step (keeps cost bounded). */
const MAX_SUBSTEPS = 128;
/**
 * Vertical speeds below `gravity * fixedDt * BOUNCE_REST_STEPS` do not lift a ground
 * ball into the air (same threshold the landing code uses to stop bouncing).
 */
export const BOUNCE_REST_STEPS = 4;

const speedOf = (b: Body): number => Math.hypot(b.vel.x, b.vel.y, b.vel.z);

/**
 * Number of equal sub-steps needed this fixed step so no pair of balls that
 * could touch moves further than MAX_TRAVEL_FRACTION * min(radius) per sub-step.
 * Returns 1 when nothing is close (so a lone ball integrates exactly as in
 * `predictFlight`).
 */
export function substepCount(bodies: Body[], dt: number): number {
  let n = 1;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i] as Body;
    if (a.state === 'out') continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j] as Body;
      if (b.state === 'out') continue;
      if (a.state === 'resting' && b.state === 'resting') continue;
      const travel = (speedOf(a) + speedOf(b)) * dt;
      const gap = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z) - (a.spec.radius + b.spec.radius);
      if (gap > travel) continue;
      const need = Math.ceil(travel / (MAX_TRAVEL_FRACTION * Math.min(a.spec.radius, b.spec.radius)));
      if (need > n) n = need;
    }
  }
  return Math.min(n, MAX_SUBSTEPS);
}

/** After an impulse: a ground ball lifted fast enough flies, otherwise it rolls. */
function wake(b: Body, liftSpeed: number): void {
  if (b.state === 'flying') return;
  if (b.vel.y > liftSpeed) {
    b.state = 'flying';
  } else {
    b.vel.y = 0;
    b.state = 'rolling';
  }
}

/** Resolves every overlapping pair once. Mutates bodies, appends 'hit' events. */
export function resolveCollisions(bodies: Body[], cfg: PhysicsConfig, events: SimEvent[]): void {
  const liftSpeed = cfg.gravity * cfg.fixedDt * BOUNCE_REST_STEPS;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i] as Body;
    if (a.state === 'out') continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j] as Body;
      if (b.state === 'out') continue;
      if (a.state === 'resting' && b.state === 'resting') continue;

      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dz = b.pos.z - a.pos.z;
      const minDist = a.spec.radius + b.spec.radius;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq);
      let nx = 0;
      let ny = 0;
      let nz = 0;
      if (dist < MIN_DISTANCE) {
        nx = 1;
      } else {
        nx = dx / dist;
        ny = dy / dist;
        nz = dz / dist;
      }

      const invA = 1 / a.spec.mass;
      const invB = 1 / b.spec.mass;
      const invSum = invA + invB;

      // Positional separation, lighter body moves more.
      const overlap = minDist - dist;
      const moveA = (overlap * invA) / invSum;
      const moveB = (overlap * invB) / invSum;
      a.pos.x -= nx * moveA;
      a.pos.y -= ny * moveA;
      a.pos.z -= nz * moveA;
      b.pos.x += nx * moveB;
      b.pos.y += ny * moveB;
      b.pos.z += nz * moveB;

      // Impulse along the normal (only if approaching).
      const vn = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny + (b.vel.z - a.vel.z) * nz;
      if (vn < 0) {
        const e = Math.min(a.spec.restitution, b.spec.restitution);
        const jImpulse = (-(1 + e) * vn) / invSum;
        a.vel.x -= jImpulse * invA * nx;
        a.vel.y -= jImpulse * invA * ny;
        a.vel.z -= jImpulse * invA * nz;
        b.vel.x += jImpulse * invB * nx;
        b.vel.y += jImpulse * invB * ny;
        b.vel.z += jImpulse * invB * nz;
        wake(a, liftSpeed);
        wake(b, liftSpeed);
        if (-vn >= HIT_EVENT_MIN_SPEED) events.push({ type: 'hit', a: a.id, b: b.id, speed: -vn });
      }

      // Ground contact: ground balls stay on the ground, others never sink.
      for (const body of [a, b]) {
        if (body.state === 'flying') {
          if (body.pos.y < body.spec.radius) body.pos.y = body.spec.radius;
        } else {
          body.pos.y = body.spec.radius;
          if (body.vel.y < 0) body.vel.y = 0;
        }
      }
    }
  }
}
