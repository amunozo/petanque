/**
 * Client-side replay of a refereed throw, for animation only. Pure.
 *
 * Given the match state the client held BEFORE the throw (seq - 1) and the
 * server's ThrowRecord, rebuilds the exact World the server simulated (same
 * resting bodies, same new body id/spec, same launch params incl. noise). The
 * client plays it back with the usual fixed-step playback; once it settles it
 * must SNAP to `throwResult.rest` (then `throwResult.match`), because float
 * results may differ slightly across devices/builds. Use `defaultConfig`
 * here (the server's config), never the player's live tuning.
 */
import { launch, type World } from '../engine';
import { beginThrow } from '../games/petanque/match';
import type { MatchConfig } from '../games/petanque/matchMeasure';
import type { MatchState, ThrowRecord } from '../games/petanque/matchTypes';

/** The World to animate, or null when `before` cannot be the state the throw was made from. */
export function replayThrowWorld(before: MatchState, record: ThrowRecord, cfg: MatchConfig): World | null {
  if ((before.phase !== 'jack' && before.phase !== 'boule') || before.toThrow !== record.team) return null;
  // beginThrow lays out the resting bodies and the new body exactly like the server;
  // its own noise (from the redacted rng) is then replaced by the server's launch params.
  const { world } = beginThrow(before, record.team, record.intent, cfg);
  const body = world.bodies.find((b) => b.id === record.id);
  if (!body) return null;
  return launch(world, body, record.params);
}
