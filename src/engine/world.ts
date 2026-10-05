/** World/body construction and queries. Pure data helpers, no stepping. */
import type { BallSpec, Body, ThrowParams, World } from './types';
import type { Vec3 } from './vec3';

/** Copies a spec, keeping the optional surface modifiers only when present (JSON stays minimal). */
export const cloneSpec = (s: BallSpec): BallSpec => {
  const c: BallSpec = { radius: s.radius, mass: s.mass, restitution: s.restitution };
  if (s.rollingResistanceMul !== undefined) c.rollingResistanceMul = s.rollingResistanceMul;
  if (s.roughnessMul !== undefined) c.roughnessMul = s.roughnessMul;
  if (s.impactRestitution !== undefined) c.impactRestitution = s.impactRestitution;
  if (s.impactFriction !== undefined) c.impactFriction = s.impactFriction;
  if (s.landingScatter !== undefined) c.landingScatter = s.landingScatter;
  if (s.landingScatterSpeed !== undefined) c.landingScatterSpeed = s.landingScatterSpeed;
  return c;
};

export const cloneBody = (b: Body): Body => {
  const c: Body = {
    id: b.id,
    kind: b.kind,
    spec: cloneSpec(b.spec),
    pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z },
    vel: { x: b.vel.x, y: b.vel.y, z: b.vel.z },
    rot: { x: b.rot.x, y: b.rot.y, z: b.rot.z },
    state: b.state,
  };
  if (b.spin !== undefined) c.spin = b.spin;
  return c;
};

/** Deep copy. The result shares no references with the input. */
export const cloneWorld = (w: World): World => ({ time: w.time, bodies: w.bodies.map(cloneBody) });

/**
 * A resting body placed on the ground at (pos.x, pos.z). pos.y is ignored:
 * a resting ball always sits at y = spec.radius.
 */
export function createBody(id: string, kind: string, spec: BallSpec, pos: Vec3): Body {
  return {
    id,
    kind,
    spec: cloneSpec(spec),
    pos: { x: pos.x, y: spec.radius, z: pos.z },
    vel: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0 },
    state: 'resting',
  };
}

/** True when every body is 'resting' or 'out' (an empty world is settled). */
export const isSettled = (w: World): boolean => w.bodies.every((b) => b.state === 'resting' || b.state === 'out');

/**
 * Returns a NEW world (the input is not modified) in which `body` — added, or
 * replacing the body with the same id — starts flying from params.origin.
 * yaw 0 -> -Z, positive yaw -> -X; pitch is elevation above horizontal.
 */
export function launch(world: World, body: Body, params: ThrowParams): World {
  const next = cloneWorld(world);
  const b = cloneBody(body);
  const horizontal = params.speed * Math.cos(params.pitch);
  b.pos = { x: params.origin.x, y: params.origin.y, z: params.origin.z };
  b.vel = {
    x: -Math.sin(params.yaw) * horizontal,
    y: params.speed * Math.sin(params.pitch),
    z: -Math.cos(params.yaw) * horizontal,
  };
  b.state = 'flying';
  b.spin = Math.max(0, params.backspin ?? 0);
  const i = next.bodies.findIndex((o) => o.id === b.id);
  if (i >= 0) next.bodies[i] = b;
  else next.bodies.push(b);
  return next;
}
