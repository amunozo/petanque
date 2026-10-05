import { describe, expect, it, vi } from 'vitest';
import { playShotEffects } from './shotEffects';

describe('playShotEffects', () => {
  it('fires sound, haptics, nudge and a burst at the spot', () => {
    const deps = { audio: { celebrate: vi.fn() }, haptics: { celebrate: vi.fn() }, fx: { burst: vi.fn(), nudge: vi.fn() } };
    playShotEffects(deps, 'carreau', { x: 0.3, y: 0.04, z: -8 });
    expect(deps.audio.celebrate).toHaveBeenCalledWith('carreau');
    expect(deps.haptics.celebrate).toHaveBeenCalledWith('carreau');
    expect(deps.fx.nudge).toHaveBeenCalledWith('carreau');
    expect(deps.fx.burst).toHaveBeenCalledWith({ x: 0.3, y: 0, z: -8 }, 'carreau');
  });
  it('skips the burst without a spot', () => {
    const deps = { audio: { celebrate: vi.fn() }, haptics: { celebrate: vi.fn() }, fx: { burst: vi.fn(), nudge: vi.fn() } };
    playShotEffects(deps, 'hit', undefined);
    expect(deps.fx.burst).not.toHaveBeenCalled();
    expect(deps.audio.celebrate).toHaveBeenCalledWith('hit');
  });
});
