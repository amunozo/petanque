/**
 * Shot analysis for the celebrations: was this throw a "tir réussi" (the targeted
 * opponent boule was knocked away) or even a "carreau" (it also took the target's
 * place)? Pure functions over the SimEvents collected during the throw plus the
 * bodies before / after it (no DOM, no randomness). The app turns the result into
 * sound, haptics and a visual; nothing here changes the rules.
 */
import type { Body, SimEvent, Vec3 } from '../../engine';
import { BOULE_KIND } from './practice';

export interface CarreauConfig {
  /** The target must end at least this far (m) from where it lay, or leave the pitch, to count as hit away. */
  minKnockDistance: number;
  /** Carreau: the shooter rests within this distance (m, centre to centre) of the target's original spot. */
  maxRestDistance: number;
  /** The first contact must be at least this fast (m/s): a gentle touch while pointing is not a shot. */
  minHitSpeed: number;
}

export const DEFAULT_CARREAU: CarreauConfig = { minKnockDistance: 0.5, maxRestDistance: 0.2, minHitSpeed: 1 };

export type ShotKind = 'carreau' | 'hit' | 'none';

export interface ShotInput {
  /** Body id of the boule thrown this turn. */
  thrownId: string;
  /** Team of a body id (`null` for the jack / unknown ids). */
  teamOf: (id: string) => string | null;
  /** Everything that happened during the throw, in order. */
  events: readonly SimEvent[];
  /** The resting bodies before the throw (the thrown boule is not among them). */
  before: readonly Body[];
  /** The bodies after the throw settled. */
  after: readonly Body[];
}

export interface ShotOutcome {
  kind: ShotKind;
  /** The opponent boule that was hit first (when kind is not 'none'). */
  targetId?: string;
  /** Where the target lay before the shot (the spot of impact for effects). */
  spot?: Vec3;
  /** How far the target was knocked (m); Infinity when it left the pitch. */
  knocked?: number;
}

const NONE: ShotOutcome = { kind: 'none' };
const planar = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * "Direct hit": the thrown boule's first contact with any ball is with an opponent
 * boule (not the jack, not its own team). "Tir réussi" if that boule ends >= minKnockDistance
 * away (or out); "carreau" if, on top of that, the thrown boule rests within
 * maxRestDistance of the spot the target left.
 */
export function analyseShot(input: ShotInput, cfg: CarreauConfig = DEFAULT_CARREAU): ShotOutcome {
  const { thrownId, events, before, after, teamOf } = input;
  const first = events.find((e) => e.type === 'hit' && (e.a === thrownId || e.b === thrownId));
  if (!first || first.type !== 'hit' || first.speed < cfg.minHitSpeed) return NONE;

  const targetId = first.a === thrownId ? first.b : first.a;
  const target = before.find((b) => b.id === targetId);
  const myTeam = teamOf(thrownId);
  const theirTeam = teamOf(targetId);
  if (!target || target.kind !== BOULE_KIND || target.state === 'out') return NONE;
  if (myTeam === null || theirTeam === null || myTeam === theirTeam) return NONE;

  const moved = after.find((b) => b.id === targetId);
  const knocked = !moved || moved.state === 'out' ? Infinity : planar(moved.pos, target.pos);
  if (knocked < cfg.minKnockDistance) return NONE;

  const spot = { ...target.pos };
  const shooter = after.find((b) => b.id === thrownId);
  const replaced = shooter !== undefined && shooter.state !== 'out' && planar(shooter.pos, target.pos) <= cfg.maxRestDistance;
  return { kind: replaced ? 'carreau' : 'hit', targetId, spot, knocked };
}
