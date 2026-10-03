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
