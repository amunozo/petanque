/** Tiny localStorage helpers: best effort, the app must work without storage. */
import type { AiDifficulty } from '../games/petanque/aiTypes';
import { DEFAULT_MATCH_LENGTH, isMatchLength, type MatchLength } from './matchLength';

const DIFFICULTY_KEY = 'petanque.aiDifficulty';
export const DIFFICULTIES: readonly AiDifficulty[] = ['easy', 'medium', 'hard'];

export const isDifficulty = (v: unknown): v is AiDifficulty => typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v);

export function loadDifficulty(fallback: AiDifficulty = 'medium'): AiDifficulty {
  try {
    const v = localStorage.getItem(DIFFICULTY_KEY);
    return isDifficulty(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveDifficulty(d: AiDifficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, d);
  } catch {
    /* storage blocked */
  }
}

const MATCH_LENGTH_KEY = 'petanque.matchLength';

export function loadMatchLength(): MatchLength {
  try {
    const v = localStorage.getItem(MATCH_LENGTH_KEY);
    return isMatchLength(v) ? v : DEFAULT_MATCH_LENGTH;
  } catch {
    return DEFAULT_MATCH_LENGTH;
  }
}

export function saveMatchLength(l: MatchLength): void {
  try {
    localStorage.setItem(MATCH_LENGTH_KEY, l);
  } catch {
    /* storage blocked */
  }
}
