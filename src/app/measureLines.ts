/**
 * What the measuring overlay draws, as pure data: for each team its nearest boule's
 * gap to the jack (surface to surface, like the rules measure), with the end points
 * of the line on the ground. No DOM, so it can be unit-tested.
 */
import type { Body, Vec3 } from '../engine';
import { distances, type MatchState, type TeamId } from '../games/petanque';
import { formatNumber } from '../i18n';

export interface MeasureTarget {
  team: TeamId;
  id: string;
  /** Surface gap in metres. */
  distance: number;
  /** Jack surface point and boule surface point, on the ground. */
  from: Vec3;
  to: Vec3;
}

const GROUND_Y = 0.01;

const surfacePoint = (centre: Body, towards: Body): Vec3 => {
  const dx = towards.pos.x - centre.pos.x;
  const dz = towards.pos.z - centre.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const r = centre.spec.radius;
  return { x: centre.pos.x + (dx / len) * r, y: GROUND_Y, z: centre.pos.z + (dz / len) * r };
};

/** Each team's nearest in-play boule (those within `maxDistance` of the jack), A before B. Empty when the jack is out. */
export function measureTargets(state: MatchState, maxDistance = Infinity): MeasureTarget[] {
  const jack = state.bodies.find((b) => b.id === 'jack');
  if (!jack || jack.state === 'out') return [];
  const list = distances(state);
  const out: MeasureTarget[] = [];
  for (const team of ['A', 'B'] as const) {
    const best = list.find((d) => d.team === team);
    const body = best ? state.bodies.find((b) => b.id === best.id) : undefined;
    if (!best || !body || best.distance > maxDistance) continue;
    out.push({ team, id: best.id, distance: best.distance, from: surfacePoint(jack, body), to: surfacePoint(body, jack) });
  }
  return out;
}

/** "4,5 cm" under 10 cm, "23 cm" under a metre, "1,24 m" above; decimal comma where the language uses one. */
export function formatMeasure(metres: number): string {
  const cm = metres * 100;
  const text = cm < 10 ? `${formatNumber(Math.round(cm * 10) / 10, 1)} cm` : cm < 100 ? `${formatNumber(Math.round(cm), 0)} cm` : `${formatNumber(metres, 2)} m`;
  return text.replace(' ', ' ');
}

/** Both teams have a boule in play and their bests are within `gap` metres of each other (so the eye can't tell). */
export const isTight = (targets: readonly MeasureTarget[], gap: number): boolean => {
  const [a, b] = targets;
  return gap > 0 && targets.length === 2 && a !== undefined && b !== undefined && Math.abs(a.distance - b.distance) <= gap;
};
