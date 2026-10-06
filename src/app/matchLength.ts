/** Match length choice (start menu). The presets themselves are pure rules data in games/petanque/matchLength.ts. */
import { t } from '../i18n';

export {
  DEFAULT_MATCH_LENGTH,
  MATCH_LENGTHS,
  QUICK_POINTS,
  isMatchLength,
  matchConfig,
  pointsFor,
  type MatchLength,
} from '../games/petanque/matchLength';

/** Menu subtitle of the "2 players" button. */
export const matchInfoText = (points: number): string => t('menu.match.sub', { points });
