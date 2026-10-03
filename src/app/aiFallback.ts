/** A trivial, always-valid decision: the last resort when the AI worker fails or times out, so a match never stalls. */
import type { AiDecision, AiRequest } from '../games/petanque/aiTypes';

export function safeDecision(req: AiRequest): AiDecision {
  const jack = req.state.phase === 'jack';
  return { intent: { aim: 0, power: jack ? 0.5 : 0.45, loft: 'half' }, plan: jack ? 'jack' : 'point', simulations: 0 };
}
