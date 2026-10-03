import { describe, expect, it } from 'vitest';
import { intentToThrow, type ThrowModelConfig } from './throwModel';

const cfg: ThrowModelConfig = {
  originX: 0.1,
  originY: 0.5,
  originZ: 5,
  maxSpeed: 11,
  minSpeed: 1,
  powerCurve: 2,
  loftRollDeg: 10,
  loftHalfDeg: 35,
  loftLobDeg: 60,
  loftShootDeg: 18,
  backspinRoll: 0,
  backspinHalf: 5,
  backspinLob: 20,
  backspinShoot: 3,
  shootSpeedMul: 1.5,
  aimNoiseDeg: 1,
  powerNoisePct: 2,
};
const none = { aim: 0, power: 0 };

describe('intentToThrow', () => {
  it('maps power through the curve between min and max speed', () => {
    expect(intentToThrow({ aim: 0, power: 0, loft: 'roll' }, cfg, none).speed).toBeCloseTo(1, 12);
    expect(intentToThrow({ aim: 0, power: 1, loft: 'roll' }, cfg, none).speed).toBeCloseTo(11, 12);
    expect(intentToThrow({ aim: 0, power: 0.5, loft: 'roll' }, cfg, none).speed).toBeCloseTo(1 + 10 * 0.25, 12);
  });

  it('clamps power to [0,1]', () => {
    expect(intentToThrow({ aim: 0, power: 3, loft: 'roll' }, cfg, none).speed).toBeCloseTo(11, 12);
    expect(intentToThrow({ aim: 0, power: -1, loft: 'roll' }, cfg, none).speed).toBeCloseTo(1, 12);
  });

  it('applies noise: speed scales by pct, yaw shifts by degrees', () => {
    const t = intentToThrow({ aim: 0.1, power: 1, loft: 'roll' }, cfg, { aim: 2, power: -1 });
    expect(t.speed).toBeCloseTo(11 * 0.98, 12);
    expect(t.yaw).toBeCloseTo(0.1 + (2 * Math.PI) / 180, 12);
  });

  it('picks pitch and backspin from the loft preset and origin from config', () => {
    const lob = intentToThrow({ aim: 0, power: 0.5, loft: 'lob' }, cfg, none);
    expect(lob.pitch).toBeCloseTo((60 * Math.PI) / 180, 12);
    expect(lob.backspin).toBe(20);
    expect(lob.origin).toEqual({ x: 0.1, y: 0.5, z: 5 });
    const half = intentToThrow({ aim: 0, power: 0.5, loft: 'half' }, cfg, none);
    expect(half.pitch).toBeCloseTo((35 * Math.PI) / 180, 12);
    expect(half.backspin).toBe(5);
    expect(intentToThrow({ aim: 0, power: 0.5, loft: 'roll' }, cfg, none).pitch).toBeCloseTo((10 * Math.PI) / 180, 12);
  });

  it('shoot loft: own angle and backspin, speeds scaled by shootSpeedMul', () => {
    const lo = intentToThrow({ aim: 0, power: 0, loft: 'shoot' }, cfg, none);
    const hi = intentToThrow({ aim: 0, power: 1, loft: 'shoot' }, cfg, none);
    expect(lo.speed).toBeCloseTo(1.5, 12);
    expect(hi.speed).toBeCloseTo(16.5, 12);
    expect(hi.pitch).toBeCloseTo((18 * Math.PI) / 180, 12);
    expect(hi.backspin).toBe(3);
    // other lofts are unaffected by the multiplier
    expect(intentToThrow({ aim: 0, power: 1, loft: 'half' }, cfg, none).speed).toBeCloseTo(11, 12);
    // noise still applies on top
    expect(intentToThrow({ aim: 0, power: 1, loft: 'shoot' }, cfg, { aim: 0, power: -1 }).speed).toBeCloseTo(16.5 * 0.98, 12);
  });

  it('never returns a negative speed', () => {
    expect(intentToThrow({ aim: 0, power: 0, loft: 'roll' }, cfg, { aim: 0, power: -1000 }).speed).toBe(0);
  });
});
