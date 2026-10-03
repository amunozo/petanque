import { describe, expect, it } from 'vitest';
import type { AiDecision } from '../games/petanque/aiTypes';
import { createAiTurn } from './aiTurn';

const decision: AiDecision = { intent: { aim: 0.1, power: 0.5, loft: 'half' }, plan: 'point', simulations: 3 };
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function harness(delayMs = 0) {
  const log: string[] = [];
  const turn = createAiTurn(
    {
      request: () => {
        log.push('request');
        return new Promise((resolve) => setTimeout(() => resolve(decision), delayMs));
      },
      onAim: () => log.push('aim'),
      onFire: () => log.push('fire'),
    },
    { minThink: 0.8, showAim: 0.7 },
  );
  return { turn, log };
}

describe('createAiTurn', () => {
  it('thinks at least minThink, shows the aim, then fires', async () => {
    const { turn, log } = harness();
    turn.start();
    turn.tick(0.1, false);
    await flush();
    turn.tick(0.5, false);
    expect(log).toEqual(['request']); // 0.6 s: still thinking
    turn.tick(0.3, false);
    expect(log).toEqual(['request', 'aim']);
    turn.tick(0.5, false);
    expect(log).toEqual(['request', 'aim']);
    turn.tick(0.3, false);
    expect(log).toEqual(['request', 'aim', 'fire']);
    expect(turn.active()).toBe(false);
  });

  it('waits for a slow decision past the minimum', async () => {
    const { turn, log } = harness(20);
    turn.start();
    turn.tick(1, false);
    expect(log).toEqual(['request']);
    await new Promise((r) => setTimeout(r, 40));
    turn.tick(0.016, false);
    expect(log).toEqual(['request', 'aim']);
  });

  it('does nothing while blocked, not even the request', async () => {
    const { turn, log } = harness();
    turn.start();
    turn.tick(5, true);
    expect(log).toEqual([]);
    turn.tick(0.1, false);
    await flush();
    turn.tick(0.1, true); // panel opened mid-thinking: the clock stops
    turn.tick(0.5, true);
    turn.tick(0.5, false);
    expect(log).toEqual(['request']);
    turn.tick(0.3, false);
    expect(log).toEqual(['request', 'aim']);
  });

  it('cancel drops a late decision', async () => {
    const { turn, log } = harness(10);
    turn.start();
    turn.tick(0.1, false);
    turn.cancel();
    await new Promise((r) => setTimeout(r, 30));
    turn.tick(2, false);
    expect(log).toEqual(['request']);
    expect(turn.active()).toBe(false);
  });
});
