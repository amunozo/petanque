/** Tiny localStorage helpers: best effort, the app must work without storage. */
import type { AiDifficulty } from '../games/petanque/aiTypes';
import { isLang, type Lang } from '../i18n';
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

const LANG_KEY = 'petanque.lang';

/** The language the player picked, or null while they never did (then the browser's language applies). */
export function loadLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLang(l: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* storage blocked */
  }
}

const HOWTO_KEY = 'petanque.howtoSeen';

/** Has the player been offered "How to play" yet? (It is offered once, on first launch.) */
export function hasSeenHowTo(): boolean {
  try {
    return localStorage.getItem(HOWTO_KEY) === '1';
  } catch {
    return true; // no storage: never nag
  }
}

export function markHowToSeen(): void {
  try {
    localStorage.setItem(HOWTO_KEY, '1');
  } catch {
    /* storage blocked */
  }
}
