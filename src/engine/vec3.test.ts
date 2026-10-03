import { describe, expect, it } from 'vitest';
import { add, dot, length, normalize, scale, sub, vec3 } from './vec3';

describe('vec3', () => {
  it('creates vectors with defaults', () => {
    expect(vec3()).toEqual({ x: 0, y: 0, z: 0 });
    expect(vec3(1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('adds and subtracts without mutating inputs', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
    expect(sub(b, a)).toEqual({ x: 3, y: 3, z: 3 });
    expect(a).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('scales', () => {
    expect(scale(vec3(1, -2, 3), 2)).toEqual({ x: 2, y: -4, z: 6 });
  });

  it('computes dot product and length', () => {
    expect(dot(vec3(1, 2, 3), vec3(4, -5, 6))).toBe(12);
    expect(length(vec3(3, 4, 0))).toBe(5);
  });

  it('normalizes, handling the zero vector', () => {
    const n = normalize(vec3(0, 0, -10));
    expect(n).toEqual({ x: 0, y: 0, z: -1 });
    expect(length(normalize(vec3(1, 2, 3)))).toBeCloseTo(1, 12);
    expect(normalize(vec3())).toEqual({ x: 0, y: 0, z: 0 });
  });
});
