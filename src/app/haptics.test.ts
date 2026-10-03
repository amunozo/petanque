import { describe, expect, it, vi } from 'vitest';
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
});
