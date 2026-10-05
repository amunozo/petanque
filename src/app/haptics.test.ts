import { describe, expect, it, vi } from 'vitest';
import { effectsConfig } from './effectsConfig';
import { createHaptics } from './haptics';

describe('haptics', () => {
  it('vibrates harder for hits than landings, respects the toggle and rate limit', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    let t = 0;
    let on = true;
    const h = createHaptics(() => on, () => t);
    h.handle([{ type: 'land', id: 'a', speed: 2 }]);
    expect(vibrate).toHaveBeenLastCalledWith(18);
    t = 10;
    h.handle([{ type: 'hit', a: 'a', b: 'b', speed: 3 }]); // within the 50 ms gap: skipped
    expect(vibrate).toHaveBeenCalledTimes(1);
    t = 100;
    h.handle([{ type: 'land', id: 'a', speed: 2 }, { type: 'hit', a: 'a', b: 'b', speed: 3 }]);
    expect(vibrate).toHaveBeenLastCalledWith(65);
    on = false;
    t = 200;
    h.handle([{ type: 'hit', a: 'a', b: 'b', speed: 3 }]);
    expect(vibrate).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('plays a pattern for good shots, only while haptics are on', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    let on = true;
    const h = createHaptics(() => on);
    h.celebrate('carreau');
    expect(vibrate).toHaveBeenLastCalledWith([...effectsConfig.haptics.carreau]);
    h.celebrate('hit');
    expect(vibrate).toHaveBeenLastCalledWith([...effectsConfig.haptics.hit]);
    expect(effectsConfig.haptics.carreau.reduce((a, b) => a + b, 0)).toBeGreaterThan(effectsConfig.haptics.hit.reduce((a, b) => a + b, 0));
    on = false;
    h.celebrate('carreau');
    expect(vibrate).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
