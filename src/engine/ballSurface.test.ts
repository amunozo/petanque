import { describe, expect, it } from 'vitest';
import { cloneWorld, createBody, intentToThrow, launch, simulateToRest, step } from './index';
import type { BallSpec, Body, PhysicsConfig, World } from './types';

// Same fixture as the pre-change snapshot below: do not edit the numbers.
const cfg: PhysicsConfig = {
  gravity: 9.81,
  airDrag: 0.02,
  fixedDt: 1 / 240,
  restSpeed: 0.03,
  surface: { impactRestitution: 0.15, impactFriction: 0.3, rollingResistance: 0.3, roughness: 0.01, roughnessScale: 0.4 },
  arena: { minX: -2, maxX: 2, minZ: -9.5, maxZ: 5.5, boardContact: 'dead', boardRestitution: 0.3, endBoardRestitution: 0.3, endBoards: true },
};
const throwCfg = {
  originX: 0, originY: 0.5, originZ: 5, maxSpeed: 11, minSpeed: 1, powerCurve: 1.3,
  loftRollDeg: 10, loftHalfDeg: 32, loftLobDeg: 52, backspinRoll: 0, backspinHalf: 20, backspinLob: 0, loftShootDeg: 20, backspinShoot: 0, shootSpeedMul: 1.35,
  aimNoiseDeg: 0.8, powerNoisePct: 1.5,
};
const boule: BallSpec = { radius: 0.0375, mass: 0.7, restitution: 0.6 };
const jack: BallSpec = { radius: 0.015, mass: 0.015, restitution: 0.5 };
const woodenJack: BallSpec = { ...jack, rollingResistanceMul: 1.6, roughnessMul: 3, impactRestitution: 0.28, impactFriction: 0.22, landingScatter: 10, landingScatterSpeed: 0.14 };
const noNoise = { aim: 0, power: 0 };
const origin = { x: 0, y: 0, z: 0 };

type Loft = 'roll' | 'half' | 'lob';
function throwOnto(spec: BallSpec, targets: Body[], loft: Loft, power: number, aim = 0.03, noise = noNoise): World {
  const p = intentToThrow({ aim, power, loft }, throwCfg, noise);
  const w: World = { time: 0, bodies: targets };
  return simulateToRest(launch(w, createBody('b', 'ball', spec, origin), p), cfg).world;
}
const restZ = (spec: BallSpec, loft: Loft, power: number, c: PhysicsConfig = cfg): number => {
  const p = intentToThrow({ aim: 0, power, loft }, throwCfg, noNoise);
  const w = simulateToRest(launch({ time: 0, bodies: [] }, createBody('b', 'ball', spec, origin), p), c).world;
  return w.bodies[0]!.pos.z;
};

describe('per-ball surface modifiers: backward compatibility', () => {
  it('a ball without modifiers behaves bit-identically to the pre-modifier engine (pinned snapshot, collisions included)', () => {
    const targets = (): Body[] => [
      createBody('c1', 'boule', boule, { x: -0.25, y: 0, z: -3.5 }),
      createBody('c2', 'boule', boule, { x: -0.2, y: 0, z: -4.6 }),
      createBody('c3', 'boule', boule, { x: -0.15, y: 0, z: -1.4 }),
    ];
    const rows: number[][] = [];
    for (const loft of ['roll', 'half', 'lob'] as const) {
      for (const power of [0.5, 0.7]) rows.push(throwOnto(boule, targets(), loft, power).bodies.flatMap((b) => [b.pos.x, b.pos.z]));
    }
    // Recorded with the engine before the modifiers existed.
    expect(rows).toEqual([
      [-0.25, -3.5, -0.2, -4.6, -0.15, -1.4, -0.1333824866100105, 0.2912055291539101],
      [-0.25, -3.5, -0.2, -4.6, 0.5708634326320751, -2.8545529728931918, -0.7361011357705167, -1.91955518656162],
      [-0.25, -3.5, -0.2, -4.6, -0.15, -1.4, -0.12464185559544394, 0.8239035735767902],
      [-0.25, -3.5, -0.2, -4.6, 0.39121887992220344, -2.067296374353835, -0.7860897931136616, -2.092549036515609],
      [-0.25, -3.5, -0.2, -4.6, -0.15, -1.4, -0.0939716542362765, 1.7928486494226348],
      [-0.25, -3.5, -0.2, -4.6, -0.1198243576010216, -1.4486565696112745, -0.21400053581801817, -1.365992902489687],
    ]);
  });

  it('neutral modifiers (1, 1 and the surface values) give exactly the same world as no modifiers', () => {
    const neutral: BallSpec = {
      ...jack,
      rollingResistanceMul: 1,
      roughnessMul: 1,
      impactRestitution: cfg.surface.impactRestitution,
      impactFriction: cfg.surface.impactFriction,
      landingScatter: 0,
      landingScatterSpeed: 0,
    };
    for (const loft of ['roll', 'half', 'lob'] as const) {
      const a = throwOnto(jack, [], loft, 0.65);
      const b = throwOnto(neutral, [], loft, 0.65);
      // Only the spec object differs; everything the simulation produced is equal.
      a.bodies[0]!.spec = b.bodies[0]!.spec;
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('specs stay minimal: no modifier keys appear unless set, and they survive clone / JSON', () => {
    const plain = createBody('p', 'ball', boule, origin);
    expect(Object.keys(plain.spec).sort()).toEqual(['mass', 'radius', 'restitution']);
    const w: World = { time: 0, bodies: [createBody('j', 'jack', woodenJack, origin), plain] };
    const copy = cloneWorld(w);
    expect(copy.bodies[0]!.spec).toEqual(woodenJack);
    expect(Object.keys(copy.bodies[1]!.spec).sort()).toEqual(['mass', 'radius', 'restitution']);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
    const launched = launch(w, createBody('j', 'jack', woodenJack, origin), intentToThrow({ aim: 0, power: 0.5, loft: 'half' }, throwCfg, noNoise));
    expect(launched.bodies[0]!.spec).toEqual(woodenJack);
  });
});

describe('per-ball surface modifiers: effects', () => {
  it('rollingResistanceMul > 1 stops a rolling ball sooner, in proportion', () => {
    const flat: PhysicsConfig = { ...cfg, surface: { ...cfg.surface, roughness: 0 } };
    const slide = (spec: BallSpec): number => {
      const b = createBody('r', 'ball', spec, { x: 0, y: 0, z: 0 });
      b.state = 'rolling';
      b.vel = { x: 0, y: 0, z: -3 };
      return simulateToRest({ time: 0, bodies: [b] }, flat).world.bodies[0]!.pos.z;
    };
    const base = slide(jack);
    const heavy = slide({ ...jack, rollingResistanceMul: 2 });
    expect(heavy).toBeGreaterThan(base); // z is negative: closer to the origin
    expect(Math.abs(heavy) / Math.abs(base)).toBeCloseTo(0.5, 1);
    expect(slide({ ...jack, rollingResistanceMul: 1 })).toBe(base);
  });

  it('a jack with the wooden defaults rolls out shorter than the same throw by a bare jack, a lob goes further', () => {
    expect(Math.abs(restZ(woodenJack, 'roll', 0.645))).toBeLessThan(Math.abs(restZ(jack, 'roll', 0.645)));
    expect(Math.abs(restZ(woodenJack, 'lob', 0.771))).toBeGreaterThan(Math.abs(restZ(jack, 'lob', 0.771)));
  });

  it('impactRestitution / impactFriction override the surface values on landing', () => {
    const land = (spec: BallSpec): { vy: number; vh: number } => {
      const b = createBody('l', 'ball', spec, origin);
      b.pos = { x: 0, y: 0.5, z: 0 };
      b.vel = { x: 0, y: -4, z: -3 };
      b.state = 'flying';
      const w: World = { time: 0, bodies: [b] };
      while (b.state === 'flying' && b.vel.y <= 0) step(w, cfg);
      return { vy: b.vel.y, vh: Math.hypot(b.vel.x, b.vel.z) };
    };
    const base = land(jack);
    const hoppy = land({ ...jack, impactRestitution: 0.3 });
    expect(hoppy.vy).toBeGreaterThan(base.vy + 0.5);
    const grippy = land({ ...jack, impactFriction: 0.6 });
    const slippy = land({ ...jack, impactFriction: 0.05 });
    expect(slippy.vh).toBeGreaterThan(base.vh);
    expect(grippy.vh).toBeLessThan(base.vh);
    // Absent override = surface value.
    expect(land({ ...jack, impactRestitution: cfg.surface.impactRestitution, impactFriction: cfg.surface.impactFriction })).toEqual(base);
  });

  it('roughnessMul scales the bump deflection of a rolling ball (0 = dead straight)', () => {
    const drift = (mul: number | undefined): number => {
      const b = createBody('d', 'ball', mul === undefined ? jack : { ...jack, roughnessMul: mul }, { x: 0.13, y: 0, z: -0.17 });
      b.state = 'rolling';
      b.vel = { x: 0, y: 0, z: -1.5 };
      return simulateToRest({ time: 0, bodies: [b] }, cfg).world.bodies[0]!.pos.x;
    };
    expect(drift(0)).toBe(0.13);
    expect(drift(1)).toBe(drift(undefined));
    expect(Math.abs(drift(4) - 0.13)).toBeGreaterThan(Math.abs(drift(1) - 0.13) * 2);
  });

  it('a wooden jack never rolls back toward the thrower and stays in the court on ordinary throws', () => {
    for (const loft of ['roll', 'half', 'lob'] as const) {
      for (const power of [0.3, 0.45, 0.6]) {
        const p = intentToThrow({ aim: 0, power, loft }, throwCfg, noNoise);
        const w = launch({ time: 0, bodies: [] }, createBody('j', 'jack', woodenJack, origin), p);
        const b = w.bodies[0]!;
        let lastZ = b.pos.z;
        while (b.state !== 'resting' && b.state !== 'out' && w.time < 20) {
          step(w, cfg);
          if (b.state === 'rolling') {
            expect(b.pos.z).toBeLessThanOrEqual(lastZ + 1e-9);
            expect(b.pos.y).toBeCloseTo(jack.radius, 12);
          }
          if (b.state !== 'flying') lastZ = b.pos.z;
        }
        expect(b.state).toBe('resting');
      }
    }
  });
});

describe('landing scatter', () => {
  /** Lands a ball at (x, 0.5 m up) falling at vy with horizontal speed 3 m/s toward -Z; returns the velocity right after impact. */
  const land = (spec: BallSpec, x: number, vy = -5): { x: number; z: number } => {
    const b = createBody('s', 'ball', spec, origin);
    b.pos = { x, y: spec.radius + 0.0005, z: -1 };
    b.vel = { x: 0, y: vy, z: -3 };
    b.state = 'flying';
    const w: World = { time: 0, bodies: [b] };
    step(w, cfg);
    return { x: b.vel.x, z: b.vel.z };
  };
  const angleDeg = (v: { x: number; z: number }): number => (Math.atan2(-v.x, -v.z) * 180) / Math.PI;
  const noScatter: BallSpec = { ...woodenJack, landingScatter: undefined, landingScatterSpeed: undefined };

  it('is deterministic and never exceeds the configured max deflection or turns the ball back', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.0097;
      const a = land(woodenJack, x);
      expect(land(woodenJack, x)).toEqual(a);
      expect(Math.abs(angleDeg(a))).toBeLessThanOrEqual(10 + 1e-9);
      expect(a.z).toBeLessThan(0);
      const speed = Math.hypot(a.x, a.z);
      const base = Math.hypot(land(noScatter, x).x, land(noScatter, x).z);
      expect(speed / base).toBeGreaterThanOrEqual(1 - 0.14 - 1e-9);
      expect(speed / base).toBeLessThanOrEqual(1 + 0.14 + 1e-9);
    }
  });

  it('decorrelates landing points a few cm apart', () => {
    const angles = Array.from({ length: 40 }, (_, i) => angleDeg(land(woodenJack, 0.02 + i * 0.03)));
    const mean = angles.reduce((s, v) => s + v, 0) / angles.length;
    const sd = Math.sqrt(angles.reduce((s, v) => s + (v - mean) ** 2, 0) / angles.length);
    expect(sd).toBeGreaterThan(3); // uniform on +-10 deg has sd 5.8
    expect(Math.abs(mean)).toBeLessThan(3);
    expect(new Set(angles.map((a) => a.toFixed(3))).size).toBeGreaterThan(30);
  });

  it('gentle touchdowns barely scatter (scaled by impact speed)', () => {
    let hard = 0;
    let soft = 0;
    for (let i = 0; i < 60; i++) {
      hard = Math.max(hard, Math.abs(angleDeg(land(woodenJack, i * 0.0211, -5))));
      soft = Math.max(soft, Math.abs(angleDeg(land(woodenJack, i * 0.0211, -0.3))));
    }
    expect(hard).toBeGreaterThan(5);
    expect(soft).toBeLessThan(1.2);
  });

  it('min/full impact: no kick below the min, full kick from the full speed, default ramp unchanged', () => {
    const steel: BallSpec = { ...boule, landingScatter: 20, landingScatterSpeed: 0.1, landingScatterMinImpact: 5, landingScatterFullImpact: 7 };
    const plain: BallSpec = { ...boule };
    let below = 0;
    let above = 0;
    for (let i = 0; i < 60; i++) {
      const x = i * 0.0211;
      const soft = land(steel, x, -4.5);
      expect(soft).toEqual(land(plain, x, -4.5));
      below = Math.max(below, Math.abs(angleDeg(soft)));
      above = Math.max(above, Math.abs(angleDeg(land(steel, x, -8))));
    }
    expect(below).toBe(0);
    expect(above).toBeGreaterThan(10);
    expect(above).toBeLessThanOrEqual(20 + 1e-9);
    // explicit defaults (0 and 3 m/s) reproduce the original jack kick exactly
    const explicit: BallSpec = { ...woodenJack, landingScatterMinImpact: 0, landingScatterFullImpact: 3 };
    for (const vy of [-0.5, -2, -5]) expect(land(explicit, 0.37, vy)).toEqual(land(woodenJack, 0.37, vy));
  });

  it('absent / zero fields leave the landing untouched, and scattered throws keep distinct rest points', () => {
    expect(land({ ...jack, landingScatter: 0, landingScatterSpeed: 0 }, 0.3)).toEqual(land(jack, 0.3));
    const noisy = (n: number): World =>
      throwOnto(woodenJack, [], 'half', 0.664, 0, { aim: n * 0.7, power: n * 0.5 });
    const rest = [0, 1, 2, 3, 4].map((n) => noisy(n).bodies[0]!.pos);
    expect(new Set(rest.map((p) => p.z.toFixed(3))).size).toBe(5);
  });
});

describe('per-ball surface modifiers: determinism', () => {
  it('same throw twice -> identical JSON, also after a JSON round trip mid-flight', () => {
    const run = (roundTrip: boolean): string => {
      const p = intentToThrow({ aim: 0.02, power: 0.7, loft: 'half' }, throwCfg, { aim: 0.4, power: -0.3 });
      let w = launch(
        { time: 0, bodies: [createBody('t', 'boule', boule, { x: -0.1, y: 0, z: -5 })] },
        createBody('j', 'jack', woodenJack, origin),
        p,
      );
      for (let i = 0; i < 90; i++) step(w, cfg);
      if (roundTrip) w = JSON.parse(JSON.stringify(w)) as World;
      return JSON.stringify(simulateToRest(w, cfg));
    };
    expect(run(false)).toBe(run(false));
    expect(run(true)).toBe(run(false));
  });
});
