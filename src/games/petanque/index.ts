// Pétanque rules and state: pure TS, reducer-style serializable actions
export {
  BOULE_KIND,
  JACK_HALF_WIDTH,
  JACK_ID,
  JACK_KIND,
  beginThrow,
  boulesLeft,
  closestBoule,
  createPractice,
  distancesToJack,
  newEnd,
  predictRestPoint,
  previewThrow,
  settleThrow,
} from './practice';
export type {
  BouleDistance,
  JackDistances,
  PracticeConfig,
  PracticePhase,
  PracticeState,
  PracticeThrow,
} from './practice';

// Full match rules (Phase 2)
export { applyAction, beginThrow as beginMatchThrow, canThrow, createMatch, nextEnd, settle } from './match';
export {
  AUTO_JACK_HALF_WIDTH,
  TIE_EPSILON,
  distances,
  holdingTeam,
  isJackOut,
  isValidJack,
  nextThrower,
  otherTeam,
  placeJack,
  scoreEnd,
} from './matchMeasure';
export type { Holding, MatchBouleDistance, MatchConfig, MatchSettleConfig } from './matchMeasure';
export type {
  EndResult,
  MatchAction,
  MatchPhase,
  MatchRules,
  MatchState,
  TeamId,
  ThrowRecord,
} from './matchTypes';

// Shot analysis for the celebrations (tir réussi / carreau)
export { analyseShot, DEFAULT_CARREAU } from './carreau';
export type { CarreauConfig, ShotInput, ShotKind, ShotOutcome } from './carreau';
