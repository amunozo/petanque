import { describe, expect, it } from 'vitest';
import { createRestDwell, dwellDone, returnsToAim, type DwellSettings } from './restDwell';

describe('returnsToAim', () => {
  it('glides back for a throw made from this device (player or computer), not for the remote player or after an end', () => {
    expect(returnsToAim('local')).toBe(true);
    expect(returnsToAim('computer')).toBe(true);
    expect(returnsToAim('remote')).toBe(false);
    expect(returnsToAim('none')).toBe(false);
  });
});

describe('dwellDone', () => {
  const s: DwellSettings = { dwellS: 2, auto: true };
  it('waits the dwell, or longer when something must stay readable', () => {
    expect(dwellDone(1.9, 0, s)).toBe(false);
    expect(dwellDone(2, 0, s)).toBe(true);
    expect(dwellDone(2.5, 3, s)).toBe(false);
    expect(dwellDone(3, 3, s)).toBe(true);
  });
  it('never ends on its own when the automatic return is off', () => {
    expect(dwellDone(100, 0, { dwellS: 2, auto: false })).toBe(false);
  });
});

describe('createRestDwell', () => {
  it('fires once after the dwell and then stays idle', () => {
    let settings: DwellSettings = { dwellS: 1.5, auto: true };
    const d = createRestDwell(() => settings);
    expect(d.active()).toBe(false);
    expect(d.tick(10)).toBe(false);
    d.start();
    expect(d.active()).toBe(true);
    expect(d.tick(1)).toBe(false);
    expect(d.tick(0.6)).toBe(true);
    expect(d.active()).toBe(false);
    expect(d.tick(1)).toBe(false);
    // Settings are read live (tuning panel).
    settings = { dwellS: 0.5, auto: true };
    d.start();
    expect(d.tick(0.5)).toBe(true);
  });
  it('honours a longer hold (measuring lines) and can be cleared', () => {
    const d = createRestDwell(() => ({ dwellS: 1, auto: true }));
    d.start(2.1);
    expect(d.tick(1.5)).toBe(false);
    expect(d.tick(0.7)).toBe(true);
    d.start();
    d.clear();
    expect(d.active()).toBe(false);
    expect(d.tick(5)).toBe(false);
  });
  it('restarts its clock on every settle', () => {
    const d = createRestDwell(() => ({ dwellS: 2, auto: true }));
    d.start();
    expect(d.tick(1.5)).toBe(false);
    d.start();
    expect(d.tick(1.5)).toBe(false);
    expect(d.tick(0.5)).toBe(true);
  });
  it('reports start and end once each', () => {
    const seen: boolean[] = [];
    const d = createRestDwell(() => ({ dwellS: 1, auto: true }), (r) => seen.push(r));
    d.start();
    d.start();
    d.tick(1);
    d.clear();
    d.start();
    d.clear();
    expect(seen).toEqual([true, false, true, false]);
  });
});
