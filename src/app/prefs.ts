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

const CONTROLS_KEY = 'petanque.controls';

/** Throw controls: 'classic' = pick the loft, pull down and let go; 'landing' = mark the landing spot, pick the loft, swipe up. */
export type ControlsChoice = 'classic' | 'landing';
export const CONTROLS_CHOICES: readonly ControlsChoice[] = ['classic', 'landing'];
/** This experiment build (exp-landing) starts on the new controls so testers see them first. */
export const DEFAULT_CONTROLS: ControlsChoice = 'landing';

export const isControlsChoice = (v: unknown): v is ControlsChoice => typeof v === 'string' && (CONTROLS_CHOICES as readonly string[]).includes(v);

export function loadControls(): ControlsChoice {
  try {
    const v = localStorage.getItem(CONTROLS_KEY);
    return isControlsChoice(v) ? v : DEFAULT_CONTROLS;
  } catch {
    return DEFAULT_CONTROLS;
  }
}

export function saveControls(c: ControlsChoice): void {
  try {
    localStorage.setItem(CONTROLS_KEY, c);
  } catch {
    /* storage blocked */
  }
}
