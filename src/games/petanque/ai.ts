/**
 * Computer opponent. `chooseThrow` looks at the match state and returns the
 * ThrowIntent a human would have produced, using the real engine to simulate
 * candidate throws (noise-free) and the match rules' measuring helpers to judge
 * them. Pure and deterministic for a given request (own seeded rng, never the
 * match rng); safe to run in a Web Worker.
 */
import { createRng, type ThrowIntent } from '../../engine';
import type { GameConfig } from '../../tuning/config';
import { planBoule } from './aiBoule';
import { planJack } from './aiJack';
import { makeCtx } from './aiSim';
import type { AiDecision, AiLevel, AiRequest } from './aiTypes';

const DEG = Math.PI / 180;
/** A jack only has to land in a wide legal band, so the level's execution error is halved for it. */
const JACK_ERROR_SCALE = 0.5;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Adds the level's human-like execution error to an intent (consumes 2 normals). */
function withExecutionError(intent: ThrowIntent, level: AiLevel, cfg: GameConfig, rng: { normal(): number }): ThrowIntent {
  const maxAim = cfg.controls.maxAimDeg * DEG;
  const aimNoise = rng.normal();
  const powerNoise = rng.normal();
  return {
    aim: clamp(intent.aim + aimNoise * level.aimErrorDeg * DEG, -maxAim, maxAim),
    power: clamp(intent.power * (1 + (powerNoise * level.powerErrorPct) / 100), 0, 1),
    loft: intent.loft,
  };
}

export function chooseThrow(req: AiRequest, cfg: GameConfig): AiDecision {
  const { state, team } = req;
  const level = cfg.ai[req.difficulty];
  if (!level) throw new Error(`chooseThrow: unknown difficulty '${String(req.difficulty)}'`);
  if (state.phase !== 'jack' && state.phase !== 'boule') throw new Error(`chooseThrow: nothing to throw in phase '${state.phase}'`);
  if (state.toThrow !== team) throw new Error(`chooseThrow: not team ${team}'s turn (team ${state.toThrow} throws)`);
  if (state.phase === 'boule' && state.boulesLeft[team] <= 0) throw new Error(`chooseThrow: team ${team} has no boules left`);

  const ctx = makeCtx(state, team, cfg, level.maxSimulations);
  const rng = createRng(req.seed);

  if (state.phase === 'jack') {
    const base = planJack(ctx, cfg, rng);
    const soft: AiLevel = { ...level, aimErrorDeg: level.aimErrorDeg * JACK_ERROR_SCALE, powerErrorPct: level.powerErrorPct * JACK_ERROR_SCALE };
    return { intent: withExecutionError(base, soft, cfg, rng), plan: 'jack', simulations: ctx.used };
  }

  const pick = planBoule(ctx, level, cfg);
  const decision: AiDecision = {
    intent: withExecutionError(pick.intent, level, cfg, rng),
    plan: pick.plan,
    simulations: ctx.used,
  };
  if (pick.targetId !== undefined) decision.targetId = pick.targetId;
  return decision;
}
