/** Jack-phase planning for the computer opponent: throw the jack to a legal, central-ish distance. */
import type { Loft, ThrowIntent } from '../../engine';
import type { Rng } from '../../engine';
import type { GameConfig } from '../../tuning/config';
import { simulateThrow, solvePower, type SimCtx } from './aiSim';
import { isValidJack } from './matchMeasure';

/** Keep the aimed jack this far inside the legal distance range (m). */
const RANGE_MARGIN = 0.7;
/** Jack stays this far inside the legal side-board margin (m). */
const SIDE_SLACK = 0.25;
/** Lateral spread of the aim (degrees, 1 sd). */
const AIM_SD_DEG = 1;
const DEG = Math.PI / 180;

/** Picks distance/aim/loft with the AI rng, solves the power on the lone jack and verifies it. */
export function planJack(ctx: SimCtx, cfg: GameConfig, rng: Rng): ThrowIntent {
  const { rules } = ctx.state;
  const arenaReach = cfg.throw.originZ - cfg.physics.arena.minZ - 0.5;
  const loD = Math.min(rules.jackMinDist + RANGE_MARGIN, arenaReach);
  const hiD = Math.max(loD, Math.min(rules.jackMaxDist - RANGE_MARGIN, arenaReach));
  const mid = (loD + hiD) / 2;

  let fallback: ThrowIntent = { aim: 0, power: 0.6, loft: 'half' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const dist = attempt === 0 ? loD + (hiD - loD) * rng.next() : attempt === 1 ? mid : mid + (rng.next() - 0.5) * 0.5;
    const loft: Loft = attempt === 0 ? (rng.next() < 0.5 ? 'half' : 'lob') : attempt === 1 ? 'lob' : 'half';
    const sideRoom = Math.max(0, Math.min(cfg.physics.arena.maxX - cfg.throw.originX, cfg.throw.originX - cfg.physics.arena.minX) - rules.jackMinSideMargin - SIDE_SLACK);
    const maxAim = Math.min(cfg.controls.maxAimDeg * DEG, Math.asin(Math.min(1, sideRoom / dist)));
    const aim = attempt === 0 ? Math.max(-maxAim, Math.min(maxAim, rng.normal() * AIM_SD_DEG * DEG)) : 0;
    const sol = solvePower(ctx, 'jack', loft, aim, dist, 0.12);
    if (!sol) break;
    const intent: ThrowIntent = { aim, power: sol.power, loft };
    if (attempt === 0) fallback = intent;
    const out = simulateThrow(ctx, intent);
    if (!out) return intent;
    if (isValidJack(out.thrown, rules, cfg)) return intent;
    fallback = intent;
  }
  return fallback;
}
