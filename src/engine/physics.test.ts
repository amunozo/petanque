import { describe, expect, it } from 'vitest';
import {
  cloneWorld,
  createBody,
  isSettled,
  launch,
  predictFlight,
  simulateToRest,
  step,
} from './physics';
import { groundSlope } from './ground';
import { intentToThrow } from './throwModel';
import type { BallSpec, Body, PhysicsConfig, SimEvent, World } from './types';

const boule: BallSpec = { radius: 0.0375, mass: 0.7, restitution: 0.6 };
const jack: BallSpec = { radius: 0.015, mass: 0.015, restitution: 0.5 };

const cfg: PhysicsConfig = {
  gravity: 9.81,
  airDrag: 0.02,
  fixedDt: 1 / 240,
  restSpeed: 0.03,
  surface: { impactRestitution: 0.15, impactFriction: 0.5, rollingResistance: 0.12, roughness: 0.01, roughnessScale: 0.4 },
  arena: { minX: -2, maxX: 2, minZ: -9.5, maxZ: 5.5, boardRestitution: 0.3 },
};
const flat: PhysicsConfig = { ...cfg, surface: { ...cfg.surface, roughness: 0, rollingResistance: 0.1 } };
/** No friction at all: pure collision tests. */
const frictionless: PhysicsConfig = { ...flat, surface: { ...flat.surface, rollingResistance: 0 }, airDrag: 0 };

const throwCfg = {
  originX: 0, originY: 0.5, originZ: 5, maxSpeed: 11, minSpeed: 1, powerCurve: 1.3,
  loftRollDeg: 10, loftHalfDeg: 35, loftLobDeg: 60, backspinRoll: 0, backspinHalf: 0, backspinLob: 0,
  aimNoiseDeg: 0.8, powerNoisePct: 1.5,
};
const noNoise = { aim: 0, power: 0 };
const emptyWorld = (): World => ({ time: 0, bodies: [] });

function rolling(id: string, spec: BallSpec, x: number, z: number, vx: number, vz: number): Body {
  const b = createBody(id, 'ball', spec, { x, y: 0, z });
  b.state = 'rolling';
  b.vel = { x: vx, y: 0, z: vz };
  return b;
}
function runUntil(w: World, c: PhysicsConfig, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  const end = w.time + seconds;
  while (w.time < end) events.push(...step(w, c));
  return events;
}
const throwBoule = (power: number, loft: 'roll' | 'half' | 'lob', aim = 0) => {
  const t = intentToThrow({ aim, power, loft }, throwCfg, noNoise);
  return { t, world: launch(emptyWorld(), createBody('b', 'boule', boule, { x: 0, y: 0, z: 0 }), t) };
};

describe('world helpers', () => {
  it('createBody makes a resting ball on the ground', () => {
    const b = createBody('a', 'boule', boule, { x: 1, y: 99, z: -2 });
    expect(b.state).toBe('resting');
    expect(b.pos).toEqual({ x: 1, y: boule.radius, z: -2 });
  });

  it('launch is pure, replaces by id, and uses yaw/pitch conventions', () => {
    const w0 = emptyWorld();
    const b = createBody('a', 'boule', boule, { x: 0, y: 0, z: 0 });
    const t = { yaw: 0, pitch: 0, speed: 5, origin: { x: 0, y: 1, z: 5 } };
    const w1 = launch(w0, b, t);
    expect(w0.bodies).toHaveLength(0);
    expect(w1.bodies[0]?.state).toBe('flying');
    expect(w1.bodies[0]?.vel.z).toBeCloseTo(-5, 12);
    const w2 = launch(w1, b, { ...t, yaw: Math.PI / 6, pitch: Math.PI / 6 });
    expect(w2.bodies).toHaveLength(1);
    const v = w2.bodies[0]!.vel;
    expect(v.x).toBeLessThan(0); // positive yaw -> -X
    expect(v.y).toBeCloseTo(2.5, 12);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(5, 12);
  });

  it('cloneWorld is deep; World survives a JSON round trip and keeps simulating identically', () => {
    const { world } = throwBoule(0.6, 'half');
    step(world, cfg);
    const c = cloneWorld(world);
    c.bodies[0]!.pos.x = 123;
    expect(world.bodies[0]!.pos.x).not.toBe(123);
    const json = JSON.parse(JSON.stringify(world)) as World;
    expect(json).toEqual(world);
    const a = simulateToRest(world, cfg).world;
    const b = simulateToRest(json, cfg).world;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('isSettled: only resting/out bodies', () => {
    const w = emptyWorld();
    expect(isSettled(w)).toBe(true);
    w.bodies.push(createBody('a', 'x', boule, { x: 0, y: 0, z: 0 }));
    expect(isSettled(w)).toBe(true);
    w.bodies[0]!.state = 'rolling';
    expect(isSettled(w)).toBe(false);
    w.bodies[0]!.state = 'out';
    expect(isSettled(w)).toBe(true);
  });
});

describe('determinism', () => {
  it('same throw twice -> identical final world JSON (with another ball in play)', () => {
    const run = () => {
      let w = emptyWorld();
      w.bodies.push(createBody('jack', 'jack', jack, { x: 0.05, y: 0, z: -4 }));
      const t = intentToThrow({ aim: 0.01, power: 0.62, loft: 'half' }, throwCfg, { aim: 0.3, power: -0.2 });
      w = launch(w, createBody('b1', 'boule', boule, { x: 0, y: 0, z: 0 }), t);
      return JSON.stringify(simulateToRest(w, cfg));
    };
    expect(run()).toBe(run());
  });
});

describe('landing and rolling', () => {
  it('a roll throw travels further after landing than a lob landing at a similar distance', () => {
    // Pick powers so both land near the same distance.
    const landing = (p: number, loft: 'roll' | 'half' | 'lob') => {
      const { t } = throwBoule(p, loft);
      return 5 - predictFlight(t, cfg, boule.radius).landing.z;
    };
    const rollP = 1;
    const target = landing(rollP, 'roll');
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (landing(mid, 'lob') < target) lo = mid;
      else hi = mid;
    }
    const lobP = (lo + hi) / 2;
    expect(Math.abs(landing(lobP, 'lob') - target)).toBeLessThan(0.01);
    const after = (p: number, loft: 'roll' | 'lob') => {
      const { t, world } = throwBoule(p, loft);
      const b = simulateToRest(world, cfg).world.bodies[0]!;
      return Math.abs(b.pos.z - (t.origin.z - landing(p, loft)));
    };
    const rollAfter = after(rollP, 'roll');
    const lobAfter = after(lobP, 'lob');
    expect(lobAfter).toBeLessThan(0.6);
    expect(rollAfter).toBeGreaterThan(lobAfter + 3);
  });

  it('flat ground, no roughness: stops at v^2/(2 mu g) within a few percent', () => {
    const v0 = 4;
    const w = emptyWorld();
    w.bodies.push(rolling('r', boule, 0, 0, 0, -v0));
    const res = simulateToRest(w, flat);
    const b = res.world.bodies[0]!;
    const analytic = (v0 * v0 - flat.restSpeed ** 2) / (2 * flat.surface.rollingResistance * flat.gravity);
    expect(b.state).toBe('resting');
    expect(-b.pos.z).toBeGreaterThan(analytic * 0.97);
    expect(-b.pos.z).toBeLessThan(analytic * 1.03);
    expect(res.events.filter((e) => e.type === 'rest')).toHaveLength(1);
    expect(b.vel).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('emits land with impact speed and bounces little/keeps y at radius when rolling', () => {
    const { world } = throwBoule(0.5, 'half');
    const res = simulateToRest(world, cfg);
    const lands = res.events.filter((e) => e.type === 'land');
    expect(lands.length).toBeGreaterThanOrEqual(1);
    const first = lands[0];
    expect(first?.type === 'land' ? first.speed : 0).toBeGreaterThan(1);
    expect(res.world.bodies[0]!.pos.y).toBeCloseTo(boule.radius, 12);
  });

  it('backspin shortens the roll after landing', () => {
    const base = throwBoule(0.6, 'roll');
    const withSpin = launch(emptyWorld(), createBody('b', 'boule', boule, { x: 0, y: 0, z: 0 }), { ...base.t, backspin: 40 });
    const a = simulateToRest(base.world, flat).world.bodies[0]!;
    const b = simulateToRest(withSpin, flat).world.bodies[0]!;
    expect(b.pos.z).toBeGreaterThan(a.pos.z + 0.3); // stopped earlier (less negative z)
  });

  it('bumpiness field is deterministic, zero when roughness is 0, and bounded by roughness', () => {
    const s = { ...cfg.surface, roughness: 0.02 };
    expect(groundSlope(1.3, -2.7, s)).toEqual(groundSlope(1.3, -2.7, s));
    expect(groundSlope(1.3, -2.7, { ...s, roughness: 0 })).toEqual({ x: 0, z: 0 });
    let max = 0;
    for (let i = 0; i < 400; i++) {
      const g = groundSlope(i * 0.173, -i * 0.31, s);
      max = Math.max(max, Math.abs(g.x), Math.abs(g.z));
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(s.roughness * 4);
  });

  it('rolling rotation accumulates about up x velocity', () => {
    const w = emptyWorld();
    w.bodies.push(rolling('r', boule, 0, 0, 0, -2));
    runUntil(w, flat, 0.25);
    const b = w.bodies[0]!;
    expect(b.rot.x).toBeLessThan(0); // rolling toward -Z spins about -X
    expect(Math.abs(b.rot.z)).toBeLessThan(1e-9);
    expect(-b.rot.x * boule.radius).toBeCloseTo(-b.pos.z, 2);
  });
});

describe('collisions', () => {
  it('conserves momentum in a 2-ball collision (airborne, different masses)', () => {
    const w = emptyWorld();
    const a = createBody('a', 'boule', boule, { x: 0, y: 0, z: 0 });
    const b = createBody('b', 'jack', jack, { x: 0, y: 0, z: 0 });
    a.state = 'flying';
    b.state = 'flying';
    a.pos = { x: 0, y: 2, z: 0 };
    b.pos = { x: 0.06, y: 2, z: 0.08 }; // 0.1 m away along n = (0.6, 0, 0.8)
    a.vel = { x: 1.8, y: 0.5, z: 2.4 };
    b.vel = { x: -0.3, y: 0, z: -0.4 };
    w.bodies.push(a, b);
    const mom = () =>
      w.bodies.reduce((p, o) => ({ x: p.x + o.spec.mass * o.vel.x, y: p.y + o.spec.mass * o.vel.y, z: p.z + o.spec.mass * o.vel.z }), { x: 0, y: 0, z: 0 });
    const g0: PhysicsConfig = { ...cfg, gravity: 0, airDrag: 0 };
    const p0 = mom();
    const ev = runUntil(w, g0, 0.2);
    expect(ev.some((e) => e.type === 'hit')).toBe(true);
    const p1 = mom();
    expect(p1.x).toBeCloseTo(p0.x, 9);
    expect(p1.y).toBeCloseTo(p0.y, 9);
    expect(p1.z).toBeCloseTo(p0.z, 9);
  });

  it('head-on equal masses with restitution 1 swaps velocities', () => {
    const spec: BallSpec = { ...boule, restitution: 1 };
    const w = emptyWorld();
    w.bodies.push(rolling('a', spec, -0.3, 0, 2, 0), rolling('b', spec, 0.3, 0, -1, 0));
    const ev = runUntil(w, frictionless, 0.5);
    const [a, b] = w.bodies as [Body, Body];
    expect(a.vel.x).toBeCloseTo(-1, 6);
    expect(b.vel.x).toBeCloseTo(2, 6);
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.speed).toBeCloseTo(3, 6);
  });

  it('a boule hitting the jack barely slows; the jack flies off much faster', () => {
    const w = emptyWorld();
    w.bodies.push(createBody('jack', 'jack', jack, { x: 0, y: 0, z: -1 }));
    w.bodies.push(rolling('b', boule, 0, 0, 0, -3));
    runUntil(w, flat, 0.45);
    const j = w.bodies[0]!;
    const b = w.bodies[1]!;
    expect(j.state).not.toBe('resting');
    expect(Math.abs(j.vel.z) + Math.abs(j.pos.z + 1)).toBeGreaterThan(0.5);
    expect(-b.vel.z).toBeGreaterThan(2.3);
    expect(-j.vel.z).toBeGreaterThan(2.5);
    expect(-j.pos.z).toBeGreaterThan(-b.pos.z);
  });

  it('carreau: a head-on shooter mostly stops, the resting target is launched', () => {
    const w = emptyWorld();
    w.bodies.push(createBody('target', 'boule', boule, { x: 0, y: 0, z: -1 }));
    w.bodies.push(rolling('shooter', boule, 0, 0, 0, -5));
    const ev = runUntil(w, flat, 0.4);
    const [target, shooter] = w.bodies as [Body, Body];
    expect(ev.some((e) => e.type === 'hit')).toBe(true);
    expect(-target.vel.z).toBeGreaterThan(3);
    expect(-shooter.vel.z).toBeLessThan(1.5);
  });

  it('no tunnelling at 15 m/s (boule through boule, boule through jack, jack through boule)', () => {
    for (const [fast, slow, dir] of [
      [boule, boule, 1],
      [boule, jack, 1],
      [jack, boule, 1],
    ] as [BallSpec, BallSpec, number][]) {
      const w = emptyWorld();
      const target = createBody('t', 'slow', slow, { x: 0, y: 0, z: -3 });
      const shooter = rolling('s', fast, 0, 0, 0, -15 * dir);
      w.bodies.push(target, shooter);
      const ev = runUntil(w, frictionless, 0.5);
      expect(ev.some((e) => e.type === 'hit')).toBe(true);
      // The shooter must not end up beyond the target it was supposed to hit.
      expect(w.bodies[1]!.pos.z).toBeGreaterThan(w.bodies[0]!.pos.z);
    }
  });

  it('no tunnelling for a flying boule coming down fast onto a resting one', () => {
    const w = emptyWorld();
    w.bodies.push(createBody('t', 'boule', boule, { x: 0, y: 0, z: 0 }));
    const f = createBody('f', 'boule', boule, { x: 0, y: 0, z: 0 });
    f.state = 'flying';
    f.pos = { x: 0.01, y: 1, z: 0 };
    f.vel = { x: 0, y: -15, z: 0 };
    w.bodies.push(f);
    const ev = runUntil(w, cfg, 0.3);
    expect(ev.some((e) => e.type === 'hit')).toBe(true);
    expect(w.bodies[1]!.pos.y).toBeGreaterThanOrEqual(boule.radius - 1e-9);
  });

  it('wakes resting balls that get hit; ignores pairs where one is out', () => {
    const w = emptyWorld();
    w.bodies.push(createBody('t', 'boule', boule, { x: 0, y: 0, z: -1 }));
    w.bodies.push(rolling('s', boule, 0, 0, 0, -2));
    runUntil(w, flat, 0.6);
    expect(w.bodies[0]!.state).not.toBe('resting');
    const w2 = emptyWorld();
    const o = createBody('o', 'boule', boule, { x: 0, y: 0, z: -1 });
    o.state = 'out';
    w2.bodies.push(o, rolling('s', boule, 0, 0, 0, -2));
    const ev = runUntil(w2, flat, 0.6);
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
  });
});

describe('arena', () => {
  it('rolling ball bounces off a side board with boardRestitution and emits board', () => {
    const w = emptyWorld();
    w.bodies.push(rolling('r', boule, 1.5, 0, 3, 0));
    const ev = runUntil(w, frictionless, 0.5);
    const b = w.bodies[0]!;
    const board = ev.find((e) => e.type === 'board');
    expect(board && board.type === 'board' && board.speed).toBeCloseTo(3, 6);
    expect(b.vel.x).toBeCloseTo(-3 * flat.arena.boardRestitution, 6);
    expect(b.pos.x).toBeLessThanOrEqual(flat.arena.maxX - boule.radius + 1e-9);
  });

  it('a ball crossing minZ / maxZ goes out and stays put', () => {
    for (const vz of [-6, 6]) {
      const w = emptyWorld();
      w.bodies.push(rolling('r', boule, 0, vz < 0 ? -9 : 5, 0, vz));
      const ev = runUntil(w, flat, 1);
      const b = w.bodies[0]!;
      expect(b.state).toBe('out');
      expect(ev.filter((e) => e.type === 'out')).toHaveLength(1);
      const p = { ...b.pos };
      runUntil(w, flat, 0.2);
      expect(w.bodies[0]!.pos).toEqual(p);
      expect(isSettled(w)).toBe(true);
    }
  });

  it('a flying ball landing past the end is out; one landing outside the side boards is out', () => {
    const { world } = throwBoule(1, 'half');
    const res = simulateToRest(world, cfg);
    expect(res.world.bodies[0]!.state).toBe('out');
    const side = throwBoule(0.5, 'half', 0).world;
    side.bodies[0]!.vel.x = -8;
    const r2 = simulateToRest(side, cfg);
    expect(r2.world.bodies[0]!.state).toBe('out');
  });
});

describe('simulateToRest', () => {
  it('does not mutate the input and forces rest on timeout', () => {
    const w = emptyWorld();
    w.bodies.push(rolling('r', boule, 0, 0, 0, -3));
    const before = JSON.stringify(w);
    const res = simulateToRest(w, flat, 0.1);
    expect(JSON.stringify(w)).toBe(before);
    expect(res.world.bodies[0]!.state).toBe('resting');
    expect(res.world.bodies[0]!.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(res.events.some((e) => e.type === 'rest')).toBe(true);
  });
});

describe('predictFlight', () => {
  it('landing point matches the actual first land event within 2 cm', () => {
    for (const loft of ['roll', 'half', 'lob'] as const) {
      for (const p of [0.3, 0.6, 0.9]) {
        const { t, world } = throwBoule(p, loft, 0.05);
        const pred = predictFlight(t, cfg, boule.radius);
        const w = cloneWorld(world);
        let landed: { x: number; y: number; z: number } | undefined;
        while (!landed && w.time < 10) {
          const ev = step(w, cfg);
          if (ev.some((e) => e.type === 'land')) landed = { ...w.bodies[0]!.pos };
        }
        expect(landed).toBeDefined();
        expect(Math.hypot(landed!.x - pred.landing.x, landed!.z - pred.landing.z)).toBeLessThan(0.02);
        expect(pred.landing.y).toBeCloseTo(boule.radius, 12);
        expect(pred.points[0]).toEqual(t.origin);
        expect(pred.points.at(-1)).toEqual(pred.landing);
        expect(pred.points.length).toBeGreaterThan(2);
      }
    }
  });
});
